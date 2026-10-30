"""Fetch a read-only SKR/Odoo daily sales snapshot for forecast evaluation.

The script uses Odoo JSON-RPC search_read only. It never calls a write method.
Credentials are read from the repository's ignored .env file and are never
included in the snapshot.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import http.cookiejar
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path


def env_values() -> dict[str, str]:
    current = Path.cwd()
    while current != current.parent and not (current / ".env").exists():
        current = current.parent
    values: dict[str, str] = {}
    if (current / ".env").exists():
        for line in (current / ".env").read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


class Odoo:
    def __init__(self, base: str, database: str, username: str, password: str):
        self.base = base.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.call("/web/session/authenticate", {"db": database, "login": username, "password": password})

    def call(self, path: str, params: dict) -> dict:
        payload = {"jsonrpc": "2.0", "method": "call", "params": params, "id": 1}
        request = urllib.request.Request(
            self.base + path, data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "User-Agent": "orithos-ai-eval/1"},
        )
        with self.opener.open(request, timeout=90) as response:
            result = json.load(response)
        if result.get("error"):
            error = result["error"].get("data", {})
            raise RuntimeError(error.get("message", "Odoo RPC failed"))
        return result.get("result") or {}

    def read(self, model: str, domain: list, fields: list[str], limit: int = 100000) -> list[dict]:
        return self.call(f"/web/dataset/call_kw/{model}/search_read", {
            "model": model, "method": "search_read", "args": [domain],
            "kwargs": {"fields": fields, "limit": limit},
        })


def main() -> int:
    values = env_values()
    base = values.get("ODOO_BASE_URL", "https://odoo.orithos.com.au")
    database = values.get("ODOO_DATABASE", "aipos_uat")
    username = values.get("ODOO_SERVICE_USERNAME") or values.get("ODOO_USER")
    password = values.get("ODOO_SERVICE_PASSWORD") or values.get("ODOO_PASS")
    company_id = int(os.environ.get("SKR_ODOO_COMPANY_ID", "5"))
    history_days = max(28, min(180, int(os.environ.get("SKR_HISTORY_DAYS", "60"))))
    output = Path(os.environ.get("SKR_SALES_SNAPSHOT_OUTPUT", "data/ai-eval/skr-sales-snapshot.json"))
    if not username or not password:
        raise RuntimeError("ODOO service credentials are required")

    end = date.today() + timedelta(days=1)
    start = end - timedelta(days=history_days)
    odoo = Odoo(base, database, username, password)
    orders = odoo.read("pos.order", [
        ["company_id", "=", company_id], ["date_order", ">=", f"{start} 00:00:00"],
        ["state", "in", ["paid", "done", "invoiced"]],
    ], ["id", "date_order"], 100000)
    order_dates = {row["id"]: str(row["date_order"])[:10] for row in orders}
    lines: list[dict] = []
    order_ids = list(order_dates)
    for offset in range(0, len(order_ids), 500):
        lines.extend(odoo.read("pos.order.line", [["order_id", "in", order_ids[offset:offset + 500]]],
                               ["order_id", "product_id", "qty"], 100000))

    product_ids = sorted({row["product_id"][0] for row in lines if row.get("product_id")})
    products: dict[int, dict] = {}
    for offset in range(0, len(product_ids), 500):
        rows = odoo.read("product.product", [["id", "in", product_ids[offset:offset + 500]]],
                         ["id", "display_name", "categ_id", "qty_available", "virtual_available"], 100000)
        products.update({row["id"]: row for row in rows})

    daily: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for row in lines:
        order_id = row.get("order_id", [None])[0]
        product_id = row.get("product_id", [None])[0]
        if order_id in order_dates and product_id in products:
            daily[product_id][order_dates[order_id]] += float(row.get("qty") or 0)

    dates = [start + timedelta(days=index) for index in range(history_days)]
    candidate_ids = sorted(daily, key=lambda product_id: sum(daily[product_id].values()), reverse=True)[:2000]
    location_rows = odoo.read("stock.location", [], ["id", "usage"], 100000)
    usages = {row["id"]: row.get("usage") for row in location_rows}
    moves: list[dict] = []
    for offset in range(0, len(candidate_ids), 500):
        moves.extend(odoo.read("stock.move", [
            ["company_id", "=", company_id], ["product_id", "in", candidate_ids[offset:offset + 500]],
            ["date", ">=", f"{start} 00:00:00"], ["state", "=", "done"],
        ], ["product_id", "date", "quantity", "location_id", "location_dest_id"], 100000))
    moves_by_product: dict[int, list[tuple[date, float]]] = defaultdict(list)
    for move in moves:
        product_id = (move.get("product_id") or [None])[0]
        source = usages.get((move.get("location_id") or [None])[0])
        destination = usages.get((move.get("location_dest_id") or [None])[0])
        quantity = float(move.get("quantity") or 0)
        if not product_id or not quantity or not move.get("date"):
            continue
        delta = -quantity if source == "internal" and destination != "internal" else \
                quantity if source != "internal" and destination == "internal" else 0.0
        if delta:
            moves_by_product[product_id].append((date.fromisoformat(str(move["date"])[:10]), delta))
    series = []
    for product_id in candidate_ids:
        product = products[product_id]
        by_day = daily[product_id]
        units = [round(by_day.get(str(day), 0.0), 4) for day in dates]
        if sum(units) <= 0:
            continue
        current_stock = float(product.get("qty_available") or 0)
        product_moves = moves_by_product.get(product_id, [])
        stockout_flags = []
        for day in dates:
            after_day = sum(delta for move_day, delta in product_moves if move_day > day)
            stockout_flags.append(current_stock - after_day <= 0)
        series.append({
            "productId": product_id, "category": (product.get("categ_id") or [None, None])[1],
            "dates": [str(day) for day in dates], "units": units,
            "stockoutFlags": stockout_flags,
            "stockoutDataQuality": "INFERRED_FROM_STOCK_MOVES",
        })
    series.sort(key=lambda item: sum(item["units"]), reverse=True)
    inferred_flag_days = sum(sum(1 for flag in item["stockoutFlags"] if flag) for item in series)
    snapshot = {
        "snapshotVersion": f"skr-odoo-readonly-{date.today().isoformat()}",
        "source": "odoo-readonly-jsonrpc",
        "companyId": company_id, "generatedAt": date.today().isoformat(),
        "historyDays": history_days, "orders": len(orders), "orderLines": len(lines),
        "series": series[:2000],
        "stockoutDataQuality": "INFERRED_FROM_STOCK_MOVES",
        "stockoutInference": {
            "doneMoveRows": len(moves), "locationRows": len(location_rows),
            "productsWithInferredStockout": sum(any(item["stockoutFlags"]) for item in series),
            "inferredStockoutDays": inferred_flag_days,
        },
        "writeRequests": [],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "orders": len(orders), "orderLines": len(lines),
                      "series": len(snapshot["series"]), "historyDays": history_days,
                      "stockoutDataQuality": snapshot["stockoutDataQuality"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
