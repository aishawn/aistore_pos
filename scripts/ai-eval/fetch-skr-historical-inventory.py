"""Read historical Odoo on-hand quantities for an SKR sales snapshot.

Odoo's ``product.product.qty_available`` supports a ``to_date`` context.
This provides a read-only historical inventory series without waiting for
future snapshots. The result is marked research-only until it is calibrated
against native daily captures.
"""
from __future__ import annotations

import argparse
import http.client
import http.cookiejar
import json
import os
import time
import urllib.request
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


def env_values() -> dict[str, str]:
    values = dict(os.environ)
    current = Path.cwd()
    while current != current.parent and not (current / ".env").exists():
        current = current.parent
    env_file = current / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return values


class Odoo:
    def __init__(self, base: str, database: str, username: str, password: str):
        self.base = base.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        result = self.call("/web/session/authenticate", {
            "db": database, "login": username, "password": password,
        })
        if not result.get("uid"):
            raise RuntimeError("Odoo authentication did not return a user id")

    def call(self, path: str, params: dict[str, Any]) -> Any:
        body = json.dumps({"jsonrpc": "2.0", "method": "call", "params": params, "id": 1}).encode()
        request = urllib.request.Request(
            self.base + path, data=body,
            headers={"Content-Type": "application/json", "User-Agent": "orithos-ai-eval/1"},
        )
        for attempt in range(4):
            try:
                with self.opener.open(request, timeout=90) as response:
                    result = json.load(response)
                break
            except urllib.error.HTTPError as error:
                if error.code not in (429, 502, 503, 504) or attempt == 3:
                    raise
                time.sleep(0.5 * (2 ** attempt))
            except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError, json.JSONDecodeError):
                if attempt == 3:
                    raise
                time.sleep(0.5 * (2 ** attempt))
        if result.get("error"):
            error = result["error"].get("data", {})
            raise RuntimeError(error.get("message", "Odoo RPC failed"))
        return result.get("result")

    def read_at(self, product_ids: list[int], company_id: int, to_date: str) -> list[dict[str, Any]]:
        return self.call("/web/dataset/call_kw/product.product/search_read", {
            "model": "product.product", "method": "search_read",
            "args": [["&", ["id", "in", product_ids], ["company_id", "in", [False, company_id]]]],
            "kwargs": {
                "fields": ["id", "qty_available"], "limit": len(product_ids) + 1,
                "context": {
                    "allowed_company_ids": [company_id], "company_id": company_id,
                    "active_test": False, "to_date": to_date,
                },
            },
        })


def product_ids_from_snapshot(snapshot: dict[str, Any], max_products: int = 0) -> list[int]:
    ids = {
        int(row["productId"])
        for row in snapshot.get("series", [])
        if row.get("productId") is not None
    }
    if max_products > 0:
        ids = set(sorted(ids)[:max_products])
    return sorted(ids)


def business_day_end_utc(day: date, timezone_name: str) -> str:
    local_midnight = datetime.combine(day + timedelta(days=1), time.min, ZoneInfo(timezone_name))
    return local_midnight.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def build_history(product_ids: list[int], dates: list[date], rows_by_date: dict[str, dict[int, float]],
                  *, company_id: int, timezone_name: str) -> dict[str, Any]:
    products = []
    missing_observations = 0
    for product_id in product_ids:
        observations = []
        for day in dates:
            key = day.isoformat()
            quantity = rows_by_date.get(key, {}).get(product_id)
            if quantity is None:
                missing_observations += 1
            observations.append({
                "date": key,
                "availableQty": quantity,
                "isStockout": quantity <= 0 if quantity is not None else None,
                "dataQuality": "ODOO_QTY_AVAILABLE_TO_DATE" if quantity is not None else "MISSING",
            })
        products.append({"productId": product_id, "observations": observations})
    complete = bool(product_ids and dates) and missing_observations == 0
    return {
        "historyVersion": "skr-odoo-qty-available-to-date-v1",
        "source": "odoo-readonly-jsonrpc-product-qty-available-to-date",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "companyId": company_id,
        "businessTimezone": timezone_name,
        "asOfMethod": "product.product.qty_available with Odoo to_date context at local business-day end",
        "snapshotDates": [day.isoformat() for day in dates],
        "snapshotCount": len(dates),
        "coverageDays": len(dates),
        "observedDays": len(dates),
        "missingSnapshotDates": [],
        "continuityStatus": "CONTIGUOUS" if dates else "NO_DATES",
        "dataQuality": "ODOO_HISTORICAL_QTY_AVAILABLE_TO_DATE",
        "backtestReadiness": "READY_FOR_RESEARCH_BACKTEST" if complete else "INCOMPLETE_HISTORICAL_QUERY",
        "nativeSnapshotAcceptanceReadiness": "INSUFFICIENT_NATIVE_DAILY_SNAPSHOTS",
        "missingObservationCount": missing_observations,
        "products": products,
        "writeRequests": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sales-snapshot", type=Path, required=True,
                        help="read-only sales snapshot containing product series")
    parser.add_argument("--output", type=Path, default=Path(".local/ai-eval/skr-historical-inventory.json"))
    parser.add_argument("--days", type=int, default=0, help="default: SKR_HISTORY_DAYS or 90")
    parser.add_argument("--company-id", type=int, default=0, help="default: SKR_ODOO_COMPANY_ID or 5")
    parser.add_argument("--max-products", type=int, default=0, help="optional product cap for a sample run")
    parser.add_argument("--batch-size", type=int, default=2000)
    args = parser.parse_args()
    if args.batch_size < 1 or args.batch_size > 5000:
        parser.error("--batch-size must be between 1 and 5000")

    values = env_values()
    username = values.get("ODOO_SERVICE_USERNAME") or values.get("ODOO_USER")
    password = values.get("ODOO_SERVICE_PASSWORD") or values.get("ODOO_PASS")
    if not username or not password:
        raise RuntimeError("Odoo read-only credentials are required")
    company_id = args.company_id or int(values.get("SKR_ODOO_COMPANY_ID", "5"))
    days = args.days or int(values.get("SKR_HISTORY_DAYS", "90"))
    timezone_name = values.get("SKR_BUSINESS_TIMEZONE", "Australia/Adelaide")
    business_tz = ZoneInfo(timezone_name)

    snapshot = json.loads(args.sales_snapshot.read_text(encoding="utf-8"))
    product_ids = product_ids_from_snapshot(snapshot, args.max_products)
    if not product_ids:
        raise RuntimeError("Sales snapshot contains no product series")
    snapshot_dates = [date.fromisoformat(value) for series in snapshot.get("series", [])
                      for value in series.get("dates", [])]
    end_day = min(max(snapshot_dates), datetime.now(business_tz).date() - timedelta(days=1)) if snapshot_dates else datetime.now(business_tz).date() - timedelta(days=1)
    start_day = end_day - timedelta(days=max(1, days) - 1)
    dates = [start_day + timedelta(days=index) for index in range((end_day - start_day).days + 1)]
    odoo = Odoo(values.get("ODOO_BASE_URL", "https://odoo.orithos.com.au"),
                values.get("ODOO_DATABASE", "aipos_uat"), username, password)

    checkpoint_path = args.output.with_suffix(args.output.suffix + ".partial.json")
    query_identity = {"companyId": company_id, "timezone": timezone_name,
                      "productIds": product_ids, "dates": [day.isoformat() for day in dates]}
    rows_by_date: dict[str, dict[int, float]] = {}
    if checkpoint_path.exists():
        checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        if checkpoint.get("queryIdentity") != query_identity:
            raise RuntimeError(f"checkpoint does not match this query: {checkpoint_path}")
        rows_by_date = {
            day: {int(product_id): float(quantity) for product_id, quantity in rows.items()}
            for day, rows in checkpoint.get("rowsByDate", {}).items()
        }

    pending_dates = [day for day in dates if day.isoformat() not in rows_by_date]
    for index, day in enumerate(pending_dates, start=1):
        quantities: dict[int, float] = {}
        to_date = business_day_end_utc(day, timezone_name)
        for offset in range(0, len(product_ids), args.batch_size):
            batch = product_ids[offset:offset + args.batch_size]
            rows = odoo.read_at(batch, company_id, to_date)
            for row in rows:
                if row.get("id") is not None and row.get("qty_available") is not None:
                    quantities[int(row["id"])] = float(row["qty_available"])
        rows_by_date[day.isoformat()] = quantities
        print(json.dumps({"date": day.isoformat(), "requestedProducts": len(product_ids),
                          "observedProducts": len(quantities), "method": "odoo_to_date_read_only"}), flush=True)
        if index % 5 == 0 or index == len(pending_dates):
            checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
            checkpoint_path.write_text(json.dumps({"queryIdentity": query_identity,
                                                   "rowsByDate": rows_by_date}), encoding="utf-8")

    history = build_history(product_ids, dates, rows_by_date,
                            company_id=company_id, timezone_name=timezone_name)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(history, indent=2), encoding="utf-8")
    checkpoint_path.unlink(missing_ok=True)
    print(json.dumps({"output": str(args.output), "dates": len(dates), "products": len(product_ids),
                      "dataQuality": history["dataQuality"],
                      "backtestReadiness": history["backtestReadiness"],
                      "nativeSnapshotAcceptanceReadiness": history["nativeSnapshotAcceptanceReadiness"],
                      "missingObservationCount": history["missingObservationCount"],
                      "writeRequests": history["writeRequests"]}))
    return 0 if history["backtestReadiness"] == "READY_FOR_RESEARCH_BACKTEST" else 2


if __name__ == "__main__":
    raise SystemExit(main())
