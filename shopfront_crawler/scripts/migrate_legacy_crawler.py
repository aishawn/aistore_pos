from __future__ import annotations

import argparse
import os
import sys
import time
from collections.abc import Iterator
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx


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
    for rows, _ in page_rows(client, base_url, path, headers, size=size, extra=extra):
        for row in rows:
            key = key_fn(row)
            if key in result:
                raise RuntimeError(f"Duplicate source identity in {path}: {key}")
            result.add(key)
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
    for path in ("/api/sync/status", "/api/sync/runs"):
        params = {"store": "skr"} if path.endswith("status") else {"store": "skr", "page": 1, "size": 100}
        payload = api_request(client, "GET", f"{base_url}{path}", headers=headers, params=params)
        rows = payload.get("data", payload) if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            raise RuntimeError(f"Cannot verify source job state at {path}")
        active = [row for row in rows if str(row.get("status", "")).lower() in {"queued", "running"}]
        if active:
            jobs = ", ".join(f"{row.get('id')}:{row.get('status')}" for row in active[:10])
            raise RuntimeError(f"Legacy source has active work at {path}: {jobs}")


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
        "inventory": ("/api/inventory", lambda row: (str(row["shopfront_product_id"]), str(row.get("outlet_id") or ""), str(row.get("quantity"))), 500),
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
        if missing or extra:
            raise RuntimeError(f"Identity audit failed for {entity}: missing={len(missing)}, extra={len(extra)}")
        results[entity] = len(source_keys)
        print(f"verified {entity}: {len(source_keys)} identities", flush=True)
    return results


def main() -> int:
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
                    (str(row["shopfront_product_id"]), str(row.get("outlet_id") or "")): str(row.get("quantity"))
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
        sale_ids: set[str] = set()
        for rows, _ in page_rows(client, source, "/api/sales", source_headers, size=1000):
            sale_count += len(rows)
            for row in rows:
                source_id = str(row.get("shopfront_sale_id") or "")
                raw = row.get("raw_payload") if isinstance(row.get("raw_payload"), dict) else {}
                items = raw.get("items")
                if not isinstance(items, list):
                    raise RuntimeError(f"Sale {source_id} does not contain its source line items")
                if source_id in sale_ids:
                    raise RuntimeError(f"Duplicate legacy sale ID: {source_id}")
                sale_ids.add(source_id)
                sale_item_count += len(items)
            post_batches(client, target, target_headers, job_id, "sales", rows, batch_size=1000)
            print(f"sales: {sale_count}", flush=True)
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
        inventory_target = keyset(
            client, target, "/api/inventory", target_headers,
            lambda row: (str(row["shopfront_product_id"]), str(row.get("outlet_id") or ""), str(row.get("quantity"))),
            size=500,
        )
        if len(inventory_target) != len(inventory_identity_quantity):
            raise RuntimeError("Destination inventory row count differs from the source snapshot")
        target_coverage = read_coverage(client, target, source_headers)
        if int(target_coverage["sales"]["sale_items"]) != sale_item_count:
            raise RuntimeError("Destination sale line count differs from the source snapshot")
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
        print(f"migration failed: {exc}", file=sys.stderr, flush=True)
        raise
