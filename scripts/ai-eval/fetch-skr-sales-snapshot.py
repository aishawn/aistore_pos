"""Fetch a read-only SKR/Odoo daily sales snapshot for forecast evaluation.

The script uses Odoo JSON-RPC search_read only. It never calls a write method.
Credentials are read from the repository's ignored .env file and are never
included in the snapshot.
"""
from __future__ import annotations

import json
import os
import sys
import time as time_module
import http.client
import urllib.error
import urllib.request
import http.cookiejar
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


def env_values() -> dict[str, str]:
    values: dict[str, str] = dict(os.environ)
    current = Path.cwd()
    while current != current.parent and not (current / ".env").exists():
        current = current.parent
    if (current / ".env").exists():
        for line in (current / ".env").read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return values


class Odoo:
    def __init__(self, base: str, database: str, username: str, password: str):
        self.base = base.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.context: dict = {}
        self.call("/web/session/authenticate", {"db": database, "login": username, "password": password})

    def call(self, path: str, params: dict) -> dict:
        payload = {"jsonrpc": "2.0", "method": "call", "params": params, "id": 1}
        request = urllib.request.Request(
            self.base + path, data=json.dumps(payload).encode(),
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
                time_module.sleep(0.5 * (2 ** attempt))
            except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError, json.JSONDecodeError):
                if attempt == 3:
                    raise
                time_module.sleep(0.5 * (2 ** attempt))
        if result.get("error"):
            error = result["error"].get("data", {})
            raise RuntimeError(error.get("message", "Odoo RPC failed"))
        return result.get("result") or {}

    def read(self, model: str, domain: list, fields: list[str], limit: int = 100000,
             offset: int = 0) -> list[dict]:
        return self.call(f"/web/dataset/call_kw/{model}/search_read", {
            "model": model, "method": "search_read", "args": [domain],
            "kwargs": {"fields": fields, "limit": limit, "offset": offset, "order": "id",
                       "context": self.context},
        })


def read_all(odoo: Odoo, model: str, domain: list, fields: list[str], page_size: int = 2000) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        page = odoo.read(model, domain, fields, page_size, offset)
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += len(page)


def move_delta(source_usage: str | None, destination_usage: str | None, quantity: float) -> float:
    """Return the change to internal stock for a completed stock move."""
    if source_usage == "internal" and destination_usage != "internal":
        return -abs(quantity)
    if source_usage != "internal" and destination_usage == "internal":
        return abs(quantity)
    return 0.0


def as_utc_odoo_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def business_date(value: str, timezone_name: str) -> date:
    return as_utc_odoo_datetime(value).astimezone(ZoneInfo(timezone_name)).date()


def business_day_end(day: date, timezone_name: str) -> datetime:
    local_end = datetime.combine(day + timedelta(days=1), time.min, ZoneInfo(timezone_name))
    return local_end.astimezone(timezone.utc)


def odoo_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def main() -> int:
    values = env_values()
    base = values.get("ODOO_BASE_URL", "https://odoo.orithos.com.au")
    database = values.get("ODOO_DATABASE", "aipos_uat")
    username = values.get("ODOO_SERVICE_USERNAME") or values.get("ODOO_USER")
    password = values.get("ODOO_SERVICE_PASSWORD") or values.get("ODOO_PASS")
    company_id = int(os.environ.get("SKR_ODOO_COMPANY_ID", "5"))
    history_days = max(28, min(180, int(os.environ.get("SKR_HISTORY_DAYS", "60"))))
    timezone_name = values.get("SKR_BUSINESS_TIMEZONE", "Australia/Adelaide")
    business_tz = ZoneInfo(timezone_name)
    output = Path(os.environ.get("SKR_SALES_SNAPSHOT_OUTPUT", "data/ai-eval/skr-sales-snapshot.json"))
    if not username or not password:
        raise RuntimeError("ODOO service credentials are required")

    end = datetime.now(business_tz).date()
    start = end - timedelta(days=history_days)
    start_utc = datetime.combine(start, time.min, business_tz).astimezone(timezone.utc)
    end_utc = datetime.combine(end, time.min, business_tz).astimezone(timezone.utc)
    odoo = Odoo(base, database, username, password)
    odoo.context = {"allowed_company_ids": [company_id], "force_company": company_id,
                    "company_id": company_id}
    orders = read_all(odoo, "pos.order", [
        ["company_id", "=", company_id], ["date_order", ">=", odoo_datetime(start_utc)],
        ["date_order", "<", odoo_datetime(end_utc)],
        ["state", "in", ["paid", "done", "invoiced"]],
    ], ["id", "date_order"], page_size=5000)
    order_dates = {row["id"]: business_date(str(row["date_order"]), timezone_name).isoformat()
                   for row in orders}
    lines: list[dict] = []
    order_ids = list(order_dates)
    for offset in range(0, len(order_ids), 500):
        lines.extend(read_all(odoo, "pos.order.line", [["order_id", "in", order_ids[offset:offset + 500]]],
                              ["order_id", "product_id", "qty"], page_size=5000))

    product_ids = sorted({row["product_id"][0] for row in lines if row.get("product_id")})
    products: dict[int, dict] = {}
    for offset in range(0, len(product_ids), 500):
        rows = odoo.read("product.product", [["id", "in", product_ids[offset:offset + 500]],
                                              ["company_id", "in", [False, company_id]]],
                         ["id", "display_name", "categ_id", "qty_available", "virtual_available"], 100000)
        products.update({row["id"]: row for row in rows})
    missing_stock_baseline_ids = sorted(set(product_ids) - set(products))
    current_inventory_as_of = datetime.now(timezone.utc).replace(microsecond=0)

    daily: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for row in lines:
        order_id = row.get("order_id", [None])[0]
        product_id = row.get("product_id", [None])[0]
        if order_id in order_dates and product_id in products:
            daily[product_id][order_dates[order_id]] += float(row.get("qty") or 0)

    dates = [start + timedelta(days=index) for index in range(history_days)]
    candidate_ids = sorted(daily, key=lambda product_id: sum(daily[product_id].values()), reverse=True)[:2000]
    series = []
    for product_id in candidate_ids:
        product = products[product_id]
        by_day = daily[product_id]
        units = [round(by_day.get(str(day), 0.0), 4) for day in dates]
        if sum(units) <= 0:
            continue
        if product.get("qty_available") is None:
            raise RuntimeError(f"Current stock is unavailable for product {product_id}")
        current_stock = float(product["qty_available"])
        series.append({
            "productId": product_id, "category": (product.get("categ_id") or [None, None])[1],
            "dates": [str(day) for day in dates], "units": units,
            "stockoutFlags": [],
            "stockoutDataQuality": "AWAITING_READ_ONLY_MOVE_HISTORY",
        })
    series.sort(key=lambda item: sum(item["units"]), reverse=True)
    snapshot = {
        "snapshotVersion": f"skr-odoo-readonly-{date.today().isoformat()}",
        "source": "skr-odoo-readonly-sales-and-inventory-moves",
        "companyId": company_id,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "inventoryCurrentAsOf": current_inventory_as_of.isoformat(),
        "timezone": timezone_name,
        "historyDays": history_days, "orders": len(orders), "orderLines": len(lines),
        "series": series[:2000],
        "salesDaily": [{"productId": product_id, "date": day, "units": round(units, 4)}
                       for product_id, daily_rows in daily.items()
                       for day, units in daily_rows.items()],
        "inventoryCurrent": [{"productId": product_id,
                              "stock": (float(product["qty_available"])
                                        if product.get("qty_available") is not None else None)}
                             for product_id, product in products.items() if product_id in candidate_ids],
        "inventoryMoves": [],
        "dataQuality": {
            "status": "SALES_AND_CURRENT_STOCK",
            "orderPaginationComplete": True,
            "orderLimitReached": False,
            "detailFailures": 0,
            "zeroSalesDays": "ZERO_FILLED_FROM_COMPLETE_ORDER_QUERY",
            "inventoryHistory": "PENDING_READ_ONLY_CAPTURE",
            "inventoryHistoryMoveCount": 0,
            "inventoryHistoryFrom": odoo_datetime(start_utc),
            "inventoryHistoryTo": odoo_datetime(current_inventory_as_of),
            "productsWithoutCurrentBaseline": len(missing_stock_baseline_ids),
            "salesProductIdsWithoutCurrentBaseline": missing_stock_baseline_ids,
        },
        "stockoutDataQuality": "PENDING_READ_ONLY_MOVE_HISTORY",
        "writeRequests": [],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "orders": len(orders), "orderLines": len(lines),
                      "series": len(snapshot["series"]), "historyDays": history_days,
                      "stockoutDataQuality": snapshot["stockoutDataQuality"],
                      "productsWithoutCurrentBaseline": len(missing_stock_baseline_ids),
                      "writeRequests": snapshot["writeRequests"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
