from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import os
import sys
import time
from collections.abc import Iterator
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

ACTIVE_MIGRATION: dict[str, Any] = {}


def api_request(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    **kwargs: Any,
) -> Any:
    last_error: Exception | None = None
    for attempt in range(5):
        try:
            response = client.request(method, url, headers=headers, **kwargs)
            if response.status_code in {502, 503, 504}:
                raise httpx.HTTPStatusError("temporary upstream failure", request=response.request, response=response)
            if response.is_error:
                detail = response.text[:1000].replace("\r", " ").replace("\n", " ")
                raise httpx.HTTPStatusError(
                    f"HTTP {response.status_code}: {detail}",
                    request=response.request,
                    response=response,
                )
            response.raise_for_status()
            return response.json() if response.content else None
        except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as exc:
            last_error = exc
            if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code not in {502, 503, 504}:
                raise
            if attempt < 4:
                time.sleep(min(20, 2**attempt))
    raise RuntimeError(f"Request failed after retries: {method} {url}: {last_error}")


def page_rows(
    client: httpx.Client,
    base_url: str,
    path: str,
    headers: dict[str, str],
    *,
    size: int,
    extra: dict[str, Any] | None = None,
) -> Iterator[tuple[list[dict[str, Any]], dict[str, Any]]]:
    page = 1
    snapshot_id: int | None = None
    expected_total: int | None = None
    while True:
        params = {"store": "skr", "page": page, "size": size, **(extra or {})}
        if snapshot_id is not None:
            params["snapshot_id"] = snapshot_id
        payload = api_request(client, "GET", f"{base_url}{path}", headers=headers, params=params)
        rows = payload.get("data")
        pagination = payload.get("pagination") or {}
        if not isinstance(rows, list) or not isinstance(pagination.get("total"), int):
            raise RuntimeError(f"Invalid paginated response from {path} page {page}")
        if expected_total is None:
            expected_total = pagination["total"]
            snapshot_id = pagination.get("snapshot_id")
        elif pagination["total"] != expected_total:
            raise RuntimeError(f"Source row count changed while reading {path}: {expected_total} -> {pagination['total']}")
        yield rows, payload
        if not rows or page * size >= expected_total:
            if page * size < expected_total:
                raise RuntimeError(f"Source pagination ended early for {path}: {page * size} of {expected_total}")
            break
        page += 1


def sales_page_rows(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    *,
    size: int,
    partition: tuple[date, date] | None = None,
) -> Iterator[tuple[list[dict[str, Any]], dict[str, Any]]]:
    start_year = max(1970, int(os.getenv("LEGACY_MIGRATION_SALES_START_YEAR", "2010")))
    today = date.today() + timedelta(days=1)
    month_start = date(start_year, 1, 1)
    if month_start > today:
        raise RuntimeError("Legacy sales scan start year is in the future")

    first_page = api_request(
        client,
        "GET",
        f"{base_url}/api/sales",
        headers=headers,
        params={"store": "skr", "page": 1, "size": 1},
    )
    pagination = first_page.get("pagination") or {}
    if not isinstance(pagination.get("total"), int) or not isinstance(pagination.get("snapshot_id"), int):
        raise RuntimeError("Invalid global sales snapshot metadata")
    expected_total = pagination["total"]
    snapshot_id = pagination["snapshot_id"]
    if expected_total == 0:
        return
    scanned = 0

    if partition is not None:
        if partition[0].day != 1 or partition[1] < partition[0]:
            raise ValueError("Sales partition must start on the first day of a month")
        month_start = partition[0]
        today = partition[1]

    while month_start <= today:
        next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        month_end = min(today, next_month - timedelta(days=1))
        extra = {
            "from": month_start.isoformat(),
            "to": month_end.isoformat(),
            "snapshot_id": snapshot_id,
        }
        def fetch_page(page: int, expected_total: int | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
            payload = api_request(
                client,
                "GET",
                f"{base_url}/api/sales",
                headers=headers,
                params={"store": "skr", "page": page, "size": size, **extra},
            )
            rows = payload.get("data")
            page_info = payload.get("pagination") or {}
            page_total = page_info.get("total")
            expected_rows = min(size, page_total - (page - 1) * size) if isinstance(page_total, int) else -1
            if (
                not isinstance(rows, list)
                or not isinstance(page_total, int)
                or (expected_total is not None and page_total != expected_total)
                or page_info.get("snapshot_id") != snapshot_id
                or len(rows) != expected_rows
            ):
                raise RuntimeError(f"Inconsistent sales partition pagination for {month_start} page {page}")
            return rows, payload

        first_rows, first_payload = fetch_page(1)
        partition_total = int(first_payload["pagination"]["total"])
        if partition_total:
            scanned += len(first_rows)
            yield first_rows, first_payload
            total_pages = (partition_total + size - 1) // size

            def fetch_followup(page: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
                return fetch_page(page, partition_total)

            with ThreadPoolExecutor(max_workers=8) as pool:
                for rows, payload in pool.map(fetch_followup, range(2, total_pages + 1)):
                    scanned += len(rows)
                    yield rows, payload
        month_start = next_month

    if partition is None and scanned != expected_total:
        raise RuntimeError(
            f"Partitioned sales scan found {scanned} of {expected_total} rows; "
            f"check LEGACY_MIGRATION_SALES_START_YEAR (currently {start_year})"
        )


def sales_month_partitions(*, through: date | None = None) -> Iterator[tuple[date, date]]:
    start_year = max(1970, int(os.getenv("LEGACY_MIGRATION_SALES_START_YEAR", "2010")))
    last_day = through or (date.today() + timedelta(days=1))
    month_start = date(start_year, 1, 1)
    if month_start > last_day:
        raise RuntimeError("Legacy sales scan start year is in the future")
    while month_start <= last_day:
        next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        yield month_start, min(last_day, next_month - timedelta(days=1))
        month_start = next_month


def collect_rows(*args: Any, **kwargs: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    last_payload: dict[str, Any] = {}
    expected_total = 0
    for batch, payload in page_rows(*args, **kwargs):
        rows.extend(batch)
        last_payload = payload
        expected_total = int(payload["pagination"]["total"])
    if len(rows) != expected_total:
        raise RuntimeError(f"Collected {len(rows)} rows; source reported {expected_total}")
    return rows, last_payload


def post_batches(
    client: httpx.Client,
    target: str,
    headers: dict[str, str],
    job_id: int,
    entity: str,
    rows: list[dict[str, Any]],
    *,
    batch_size: int,
    snapshot_at: str | None = None,
    inventory_product_ids: list[str] | None = None,
    summary_keys: list[list[str | None]] | None = None,
) -> None:
    endpoint = f"{target}/api/legacy-import/skr/{job_id}/{entity}"
    chunks = [rows[i : i + batch_size] for i in range(0, len(rows), batch_size)]
    if not chunks and entity == "daily-summaries":
        chunks = [[]]
    for index, chunk in enumerate(chunks):
        body: dict[str, Any] = {"items": chunk}
        if snapshot_at:
            body["snapshot_at"] = snapshot_at
        if entity == "inventory" and index == len(chunks) - 1:
            body["complete_inventory_snapshot"] = True
            body["source_product_ids"] = inventory_product_ids
        if entity == "daily-summaries" and index == len(chunks) - 1:
            body["complete_daily_summary_snapshot"] = True
            body["source_summary_keys"] = summary_keys
        result = api_request(client, "POST", endpoint, headers=headers, json=body)
        if result.get("status") != "running":
            raise RuntimeError(f"Unexpected importer response for {entity}: {result}")
        print(f"{entity}: {min((index + 1) * batch_size, len(rows))}/{len(rows)}", flush=True)


def keyset(
    client: httpx.Client,
    base_url: str,
    path: str,
    headers: dict[str, str],
    key_fn,
    *,
    size: int,
    extra: dict[str, Any] | None = None,
) -> set[Any]:
    result: set[Any] = set()
    if path == "/api/sales":
        for rows, _ in sales_page_rows(client, base_url, headers, size=size):
            for row in rows:
                key = key_fn(row)
                if key in result:
                    raise RuntimeError(f"Duplicate source identity in {path}: {key}")
                result.add(key)
        return result

    pages = page_rows(client, base_url, path, headers, size=size, extra=extra)
    try:
        first_rows, first_payload = next(pages)
    except StopIteration:
        return result

    pagination = first_payload["pagination"]
    expected_total = int(pagination["total"])
    snapshot_id = pagination.get("snapshot_id")
    total_pages = (expected_total + size - 1) // size
    if len(first_rows) != min(size, expected_total):
        raise RuntimeError(f"Incomplete first page while reading {path}")

    def add_rows(rows: list[dict[str, Any]]) -> None:
        for row in rows:
            key = key_fn(row)
            if key in result:
                raise RuntimeError(f"Duplicate source identity in {path}: {key}")
            result.add(key)

    add_rows(first_rows)
    if total_pages <= 1:
        return result

    def fetch_page(page: int) -> list[dict[str, Any]]:
        params = {"store": "skr", "page": page, "size": size, **(extra or {})}
        if snapshot_id is not None:
            params["snapshot_id"] = snapshot_id
        payload = api_request(client, "GET", f"{base_url}{path}", headers=headers, params=params)
        rows = payload.get("data")
        page_info = payload.get("pagination") or {}
        expected_rows = min(size, expected_total - (page - 1) * size)
        if (
            not isinstance(rows, list)
            or page_info.get("total") != expected_total
            or (snapshot_id is not None and page_info.get("snapshot_id") != snapshot_id)
            or len(rows) != expected_rows
        ):
            raise RuntimeError(f"Inconsistent pagination while reading {path} page {page}")
        return rows

    with ThreadPoolExecutor(max_workers=8) as pool:
        for page, rows in enumerate(pool.map(fetch_page, range(2, total_pages + 1)), start=2):
            add_rows(rows)
            if page % 100 == 0 or page == total_pages:
                print(f"identity scan {path}: page {page}/{total_pages}", flush=True)
    if len(result) != expected_total:
        raise RuntimeError(f"Read {len(result)} identities from {path}; expected {expected_total}")
    return result


def source_sale_line_ids(items: list[Any]) -> set[str]:
    line_ids: list[str] = []
    seen: set[str] = set()
    for index, source_item in enumerate(items):
        if not isinstance(source_item, dict):
            base_key = f"legacy-index-{index}"
            line_key = base_key
            suffix = 0
            while line_key in seen:
                suffix += 1
                line_key = f"{base_key}-{suffix}"
        else:
            item_id = source_item.get("id")
            if item_id is None:
                item_id = source_item.get("ID")
            line_key = str(item_id) if item_id is not None else f"legacy-index-{index}"
            if line_key in seen:
                line_key = f"{line_key}-{index}"
        if line_key in seen:
            raise RuntimeError("Source sale contains duplicate line identities")
        seen.add(line_key)
        line_ids.append(line_key)
    return set(line_ids)


def destination_sale_line_ids(
    client: httpx.Client,
    base_url: str,
    headers: dict[str, str],
    *,
    partition: tuple[date, date] | None = None,
) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for rows, _ in sales_page_rows(client, base_url, headers, size=200, partition=partition):
        for row in rows:
            sale_id = str(row.get("shopfront_sale_id") or "")
            line_ids = row.get("sale_item_ids")
            if not sale_id or not isinstance(line_ids, list) or any(not isinstance(value, str) for value in line_ids):
                raise RuntimeError("Destination sales endpoint does not provide valid sale item identities")
            if sale_id in result:
                raise RuntimeError(f"Duplicate destination sale ID: {sale_id}")
            result[sale_id] = set(line_ids)
    return result


def read_coverage(client: httpx.Client, base_url: str, headers: dict[str, str]) -> dict[str, Any]:
    payload = api_request(client, "GET", f"{base_url}/api/sync/coverage", headers=headers, params={"store": "skr"})
    return payload["data"]


def trend_rows(client: httpx.Client, base_url: str, headers: dict[str, str], to_day: str) -> list[dict[str, Any]]:
    payload = api_request(
        client,
        "GET",
        f"{base_url}/api/reports/sales-trend",
        headers=headers,
        params={"store": "skr", "from": "2010-01-01", "to": to_day},
    )
    rows = payload.get("data")
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise RuntimeError("Sales trend endpoint returned an invalid snapshot")
    return rows


def normalized_trend(rows: list[dict[str, Any]], *, date_key: str) -> dict[tuple[str, str | None], tuple[Any, ...]]:
    result: dict[tuple[str, str | None], tuple[Any, ...]] = {}
    fields = ("revenue", "cost", "profit", "tax", "discount")
    for row in rows:
        business_date = str(row.get(date_key) or "")
        outlet_value = row.get("outlet")
        outlet = str(outlet_value) if outlet_value is not None else None
        if not business_date:
            raise RuntimeError("Sales trend row has no date")
        key = (business_date, outlet)
        values: list[Any] = []
        for field in fields:
            value = row.get(field)
            if value is None:
                values.append(None)
                continue
            try:
                values.append(Decimal(str(value)).quantize(Decimal("0.0001")))
            except InvalidOperation as exc:
                raise RuntimeError(f"Invalid sales trend value for {field}") from exc
        count = row.get("transaction_count")
        values.append(int(count) if count is not None else None)
        normalized = tuple(values)
        if key in result and result[key] != normalized:
            raise RuntimeError(f"Conflicting sales trend rows for date/outlet: {key}")
        result[key] = normalized
    return result


def unique_trend_rows(rows: list[dict[str, Any]], *, date_key: str) -> list[dict[str, Any]]:
    normalized_trend(rows, date_key=date_key)
    result: list[dict[str, Any]] = []
    seen: set[tuple[str, str | None]] = set()
    for row in rows:
        business_date = str(row.get(date_key) or "")
        outlet_value = row.get("outlet")
        key = (business_date, str(outlet_value) if outlet_value is not None else None)
        if key not in seen:
            seen.add(key)
            result.append(row)
    return result


def ensure_source_idle(client: httpx.Client, base_url: str, headers: dict[str, str]) -> None:
    timeout_seconds = max(60, int(os.getenv("LEGACY_SOURCE_IDLE_TIMEOUT_SECONDS", "21600")))
    poll_seconds = max(5, int(os.getenv("LEGACY_SOURCE_IDLE_POLL_SECONDS", "30")))
    deadline = time.monotonic() + timeout_seconds
    last_report = 0.0
    while True:
        active_jobs: list[tuple[str, dict[str, Any]]] = []
        for path in ("/api/sync/status", "/api/sync/runs"):
            params = {"store": "skr"} if path.endswith("status") else {"store": "skr", "page": 1, "size": 100}
            payload = api_request(client, "GET", f"{base_url}{path}", headers=headers, params=params)
            rows = payload.get("data", payload) if isinstance(payload, dict) else payload
            if not isinstance(rows, list):
                raise RuntimeError(f"Cannot verify source job state at {path}")
            active_jobs.extend(
                (path, row)
                for row in rows
                if str(row.get("status", "")).lower() in {"queued", "running"}
            )
        if not active_jobs:
            print("legacy source is idle", flush=True)
            return

        now = time.monotonic()
        details = "; ".join(
            f"{path.rsplit('/', 1)[-1]} {row.get('id')}:{row.get('type')}:{row.get('phase')}:{row.get('status')} heartbeat={row.get('heartbeat_at')}"
            for path, row in active_jobs[:10]
        )
        if now >= deadline:
            raise RuntimeError(f"Legacy source remained busy after {timeout_seconds}s: {details}")
        if last_report == 0 or now - last_report >= 60:
            print(f"waiting for legacy source jobs to finish: {details}", flush=True)
            last_report = now
        time.sleep(min(poll_seconds, max(1, deadline - now)))


def active_migration_job(client: httpx.Client, base_url: str, headers: dict[str, str]) -> dict[str, Any] | None:
    payload = api_request(
        client,
        "GET",
        f"{base_url}/api/sync/status",
        headers=headers,
        params={"store": "skr"},
    )
    rows = payload.get("data", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise RuntimeError("Cannot verify destination migration state")
    active = [row for row in rows if str(row.get("status", "")).lower() in {"queued", "running"}]
    migrations = [row for row in active if row.get("type") == "legacy_migration"]
    other_jobs = [row for row in active if row.get("type") != "legacy_migration"]
    if other_jobs:
        jobs = ", ".join(f"{row.get('id')}:{row.get('type')}:{row.get('status')}" for row in other_jobs[:10])
        raise RuntimeError(f"Destination has other active work: {jobs}")
    if len(migrations) > 1:
        raise RuntimeError("Destination has multiple active legacy migration jobs")
    return migrations[0] if migrations else None


def verify_identities(
    client: httpx.Client,
    source: str,
    target: str,
    source_headers: dict[str, str],
    target_headers: dict[str, str],
) -> dict[str, int]:
    checks = {
        "products": ("/api/products", lambda row: str(row["shopfront_product_id"]), 500),
        "inventory": ("/api/inventory", lambda row: (str(row["shopfront_product_id"]), str(row.get("outlet_id") or "")), 500),
        "sales": ("/api/sales", lambda row: str(row["shopfront_sale_id"]), 200),
        "suppliers": ("/api/suppliers", lambda row: str(row["source_id"]), 500),
        "purchase-orders": ("/api/purchase-orders", lambda row: str(row["source_id"]), 500),
        "customers": ("/api/customers", lambda row: str(row["source_id"]), 500),
        "extended-records": ("/api/extended-records", lambda row: (str(row["entity_type"]), str(row["source_id"])), 500),
    }
    results: dict[str, int] = {}
    for entity, (path, identity, size) in checks.items():
        source_keys = keyset(client, source, path, source_headers, identity, size=size)
        target_keys = keyset(client, target, path, target_headers, identity, size=size)
        missing = source_keys - target_keys
        extra = target_keys - source_keys
        if missing or (extra and entity != "sales"):
            raise RuntimeError(f"Identity audit failed for {entity}: missing={len(missing)}, extra={len(extra)}")
        if entity == "sales" and extra:
            print(
                f"destination contains {len(extra)} sales outside the legacy source snapshot; preserving destination-only sales",
                flush=True,
            )
        results[entity] = len(source_keys)
        print(f"verified {entity}: {len(source_keys)} identities", flush=True)
    return results


def main() -> int:
    global ACTIVE_MIGRATION
    parser = argparse.ArgumentParser(description="Copy a stable legacy Shopfront crawler snapshot into the standalone crawler.")
    parser.add_argument("--source", default=os.getenv("LEGACY_CRAWLER_URL", "https://shopfront.orithos.com.au"))
    parser.add_argument("--target", default=os.getenv("NEW_CRAWLER_URL", "https://crawler.orithos.com.au"))
    args = parser.parse_args()
    integration_token = os.getenv("SHOPFRONT_INTEGRATION_TOKEN", "").strip()
    migration_token = os.getenv("LEGACY_MIGRATION_TOKEN", "").strip()
    if not integration_token or not migration_token:
        raise SystemExit("Set SHOPFRONT_INTEGRATION_TOKEN and LEGACY_MIGRATION_TOKEN in the environment.")
    source = args.source.rstrip("/")
    target = args.target.rstrip("/")
    source_headers = {"Authorization": f"Bearer {integration_token}"}
    target_headers = {
        "Authorization": f"Bearer {integration_token}",
        "X-Legacy-Migration-Token": migration_token,
    }

    with httpx.Client(timeout=httpx.Timeout(120, connect=20)) as client:
        ensure_source_idle(client, source, source_headers)
        source_coverage = read_coverage(client, source, source_headers)
        if not source_coverage.get("inventory", {}).get("complete"):
            raise RuntimeError("Legacy source inventory snapshot is not complete")
        print("source snapshot:", {
            name: source_coverage.get(name, {}).get("total", source_coverage.get(name, {}).get("records"))
            for name in ("products", "inventory", "sales", "customers", "extended_data")
        }, flush=True)

        existing_job = active_migration_job(client, target, source_headers)
        if existing_job:
            job_id = int(existing_job["id"])
            resume_counts = existing_job.get("payload", {}).get("counts", {})
            print(f"resuming destination migration job: {job_id} at {existing_job.get('phase')}", flush=True)
        else:
            started = api_request(client, "POST", f"{target}/api/legacy-import/skr/start", headers=target_headers)
            job_id = int(started["job_id"])
            resume_counts = {}
            print(f"destination migration job: {job_id}", flush=True)
        ACTIVE_MIGRATION = {
            "job_id": job_id,
            "target": target,
            "headers": target_headers,
            "secrets": (integration_token, migration_token),
        }

        simple_entities = [
            ("products", "/api/products", 500, 250),
            ("inventory", "/api/inventory", 500, 250),
            ("suppliers", "/api/suppliers", 500, 250),
            ("purchase-orders", "/api/purchase-orders", 500, 100),
            ("customers", "/api/customers", 500, 100),
            ("extended-records", "/api/extended-records", 500, 100),
        ]
        source_counts: dict[str, int] = {}
        inventory_ids: list[str] = []
        inventory_snapshot_at: str | None = None
        inventory_identity_quantity: dict[tuple[str, str], str] = {}

        for entity, path, source_size, target_batch_size in simple_entities:
            rows, last_payload = collect_rows(client, source, path, source_headers, size=source_size)
            source_counts[entity] = len(rows)
            if entity == "inventory":
                snapshot = last_payload.get("snapshot") or {}
                inventory_snapshot_at = snapshot.get("snapshot_at")
                inventory_ids = sorted({str(row["shopfront_product_id"]) for row in rows})
                if not inventory_ids:
                    raise RuntimeError("Legacy inventory snapshot is empty")
                inventory_identity_quantity = {
                    (str(row["shopfront_product_id"]), str(row.get("outlet_id") or "")): Decimal(str(row.get("quantity"))).normalize()
                    for row in rows
                }
                if len(inventory_identity_quantity) != len(rows):
                    raise RuntimeError("Legacy inventory contains duplicate product/outlet identities")
            if int(resume_counts.get(entity, -1)) == len(rows) and (
                entity != "inventory" or int(resume_counts.get("inventory_snapshot_complete", 0)) == 1
            ):
                print(f"{entity}: already imported ({len(rows)} rows)", flush=True)
                continue
            post_batches(
                client, target, target_headers, job_id, entity, rows,
                batch_size=target_batch_size,
                snapshot_at=inventory_snapshot_at if entity == "inventory" else None,
                inventory_product_ids=inventory_ids if entity == "inventory" else None,
            )

        summary_to_day = date.today().isoformat()
        source_trend = unique_trend_rows(
            trend_rows(client, source, source_headers, summary_to_day),
            date_key="date",
        )
        source_trend_map = normalized_trend(source_trend, date_key="date")
        summary_rows = [{
            "business_date": row.get("date"),
            "outlet": row.get("outlet"),
            "revenue": row.get("revenue"),
            "cost": row.get("cost"),
            "profit": row.get("profit"),
            "tax": row.get("tax"),
            "discount": row.get("discount"),
            "transaction_count": row.get("transaction_count"),
        } for row in source_trend]
        summary_keys = [[row["business_date"], row["outlet"]] for row in summary_rows]
        source_counts["daily-summaries"] = len(summary_rows)
        post_batches(
            client, target, target_headers, job_id, "daily-summaries", summary_rows,
            batch_size=250, summary_keys=summary_keys,
        )

        sale_count = 0
        sale_item_count = 0
        malformed_sale_item_count = 0
        sales_to_refresh = 0
        for month_start, month_end in sales_month_partitions():
            month = (month_start, month_end)
            target_sale_lines = destination_sale_line_ids(
                client, target, target_headers, partition=month
            )
            month_source_lines: dict[str, set[str]] = {}
            pending_sales: list[dict[str, Any]] = []
            for rows, _ in sales_page_rows(
                client, source, source_headers, size=200, partition=month
            ):
                sale_count += len(rows)
                for row in rows:
                    source_id = str(row.get("shopfront_sale_id") or "")
                    raw = row.get("raw_payload") if isinstance(row.get("raw_payload"), dict) else {}
                    items = raw.get("items")
                    if not isinstance(items, list):
                        raise RuntimeError(f"Sale {source_id} does not contain its source line items")
                    if not source_id or source_id in month_source_lines:
                        raise RuntimeError(f"Missing or duplicate legacy sale ID: {source_id}")
                    sale_item_count += len(items)
                    malformed_sale_item_count += sum(not isinstance(source_item, dict) for source_item in items)
                    expected_line_ids = source_sale_line_ids(items)
                    month_source_lines[source_id] = expected_line_ids
                    if target_sale_lines.get(source_id) != expected_line_ids:
                        pending_sales.append(row)
                if len(pending_sales) >= 1000:
                    post_batches(client, target, target_headers, job_id, "sales", pending_sales, batch_size=1000)
                    sales_to_refresh += len(pending_sales)
                    pending_sales.clear()
            if pending_sales:
                post_batches(client, target, target_headers, job_id, "sales", pending_sales, batch_size=1000)
                sales_to_refresh += len(pending_sales)
            verified_month_lines = destination_sale_line_ids(
                client, target, target_headers, partition=month
            )
            mismatched_sales = [
                sale_id for sale_id, line_ids in month_source_lines.items()
                if verified_month_lines.get(sale_id) != line_ids
            ]
            if mismatched_sales:
                raise RuntimeError(
                    f"Destination sale line identities differ for {len(mismatched_sales)} sales "
                    f"in {month_start:%Y-%m}; examples={mismatched_sales[:5]}"
                )
            print(
                f"sales verified through {month_end}: {sale_count}; "
                f"reimported incomplete or missing: {sales_to_refresh}",
                flush=True,
            )
        print(f"sales scanned: {sale_count}; reimported incomplete or missing: {sales_to_refresh}", flush=True)
        print(
            f"source sale lines: {sale_item_count}; non-object source lines: {malformed_sale_item_count}",
            flush=True,
        )
        source_counts["sales"] = sale_count
        source_counts["sale_items"] = sale_item_count
        reported_counts = {
            "products": int(source_coverage["products"]["total"]),
            "inventory": int(source_coverage["inventory"]["records"]),
            "sales": int(source_coverage["sales"]["total"]),
            "sale_items": int(source_coverage["sales"]["sale_items"]),
            "customers": int(source_coverage.get("customers", {}).get("total", 0)),
            "extended-records": sum(int(value) for value in source_coverage.get("extended_data", {}).values()),
        }
        observed_counts = {
            "products": source_counts["products"],
            "inventory": source_counts["inventory"],
            "sales": sale_count,
            "sale_items": sale_item_count,
            "customers": source_counts["customers"],
            "extended-records": source_counts["extended-records"],
        }
        if reported_counts != observed_counts:
            raise RuntimeError(f"Paged source counts do not match coverage: coverage={reported_counts}, pages={observed_counts}")

        expected_counts = {
            "products": source_counts["products"],
            "inventory": len(inventory_ids),
            "sales": sale_count,
            "sale_items": sale_item_count,
            "suppliers": source_counts["suppliers"],
            "purchase-orders": source_counts["purchase-orders"],
            "customers": source_counts["customers"],
            "extended-records": source_counts["extended-records"],
            "daily-summaries": source_counts["daily-summaries"],
        }
        results = verify_identities(client, source, target, source_headers, target_headers)
        target_trend = trend_rows(client, target, source_headers, summary_to_day)
        target_trend_map = normalized_trend(target_trend, date_key="date")
        if source_trend_map != target_trend_map:
            raise RuntimeError(
                f"Daily summary audit failed: source={len(source_trend_map)} rows, destination={len(target_trend_map)} rows"
            )
        results["daily-summaries"] = len(source_trend_map)
        target_coverage = read_coverage(client, target, source_headers)
        inventory_coverage = target_coverage.get("inventory", {})
        if not inventory_coverage.get("complete") or not inventory_coverage.get("snapshot_complete"):
            raise RuntimeError("Destination inventory snapshot is not complete")
        target_inventory_quantity: dict[tuple[str, str], Decimal] = {}
        for rows, _ in page_rows(client, target, "/api/inventory", target_headers, size=500):
            for row in rows:
                key = (str(row["shopfront_product_id"]), str(row.get("outlet_id") or ""))
                if key in target_inventory_quantity:
                    raise RuntimeError(f"Duplicate destination inventory identity: {key}")
                try:
                    target_inventory_quantity[key] = Decimal(str(row.get("quantity"))).normalize()
                except InvalidOperation as exc:
                    raise RuntimeError("Destination inventory contains an invalid quantity") from exc
        source_inventory_ids = set(inventory_identity_quantity)
        target_inventory_ids = set(target_inventory_quantity)
        missing_inventory = source_inventory_ids - target_inventory_ids
        extra_inventory = target_inventory_ids - source_inventory_ids
        if missing_inventory or extra_inventory:
            raise RuntimeError(
                f"Inventory identity audit failed: missing={len(missing_inventory)}, extra={len(extra_inventory)}"
            )
        quantity_mismatches = [
            (key, inventory_identity_quantity[key], target_inventory_quantity[key])
            for key in sorted(source_inventory_ids)
            if inventory_identity_quantity[key] != target_inventory_quantity[key]
        ]
        quantity_differences = len(quantity_mismatches)
        print(
            f"verified inventory: {len(source_inventory_ids)} identities; "
            f"{quantity_differences} quantities differ from the legacy snapshot; "
            f"source snapshot_at={inventory_snapshot_at}; "
            f"destination snapshot_at={inventory_coverage.get('snapshot_at')}; "
            f"samples={quantity_mismatches[:10]}",
            flush=True,
        )
        if quantity_differences:
            raise RuntimeError(f"Inventory quantity audit failed: {quantity_differences} values differ")
        print(
            f"verified sales: {sale_count} source sales and {sale_item_count} source lines; "
            "destination-only sales are preserved",
            flush=True,
        )
        finished = api_request(
            client,
            "POST",
            f"{target}/api/legacy-import/skr/{job_id}/finish",
            headers=target_headers,
            json={"expected_counts": expected_counts},
        )
        if finished.get("status") != "completed":
            raise RuntimeError(f"Destination did not confirm a complete migration: {finished}")
        print("migration complete:", {"job_id": job_id, "counts": finished.get("counts"), "identity_counts": results}, flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        message = str(exc)
        for secret in ACTIVE_MIGRATION.get("secrets", ()):
            if secret:
                message = message.replace(secret, "<redacted>")
        job_id = ACTIVE_MIGRATION.get("job_id")
        if job_id:
            try:
                with httpx.Client(timeout=httpx.Timeout(30, connect=10)) as failure_client:
                    api_request(
                        failure_client,
                        "POST",
                        f"{ACTIVE_MIGRATION['target']}/api/legacy-import/skr/{job_id}/fail",
                        headers=ACTIVE_MIGRATION["headers"],
                        json={"error": f"{type(exc).__name__}: {message}"[:2000]},
                    )
                print(f"destination migration job {job_id} marked failed", file=sys.stderr, flush=True)
            except Exception as report_error:
                print(
                    f"could not mark destination migration job failed: {type(report_error).__name__}",
                    file=sys.stderr,
                    flush=True,
                )
        print(f"migration failed: {type(exc).__name__}: {message}", file=sys.stderr, flush=True)
        raise
