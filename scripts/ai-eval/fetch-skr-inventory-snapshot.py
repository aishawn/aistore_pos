"""Capture a read-only, native Odoo inventory snapshot for one store.

This is intentionally separate from the sales backtest snapshot.  A backtest
may infer historical stockouts from ``stock.move``; this job records the
native quantities Odoo exposes *at capture time* so future backtests can use a
real inventory history.  The script only uses ``search_read`` and never calls
an Odoo write method.
"""
from __future__ import annotations

import json
import os
import http.cookiejar
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def env_values() -> dict[str, str]:
    current = Path.cwd()
    while current != current.parent and not (current / ".env").exists():
        current = current.parent
    values: dict[str, str] = {}
    env_file = current / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


class Odoo:
    def __init__(self, base: str, database: str, username: str, password: str):
        self.base = base.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.call("/web/session/authenticate", {
            "db": database, "login": username, "password": password,
        })

    def call(self, path: str, params: dict[str, Any]) -> Any:
        payload = {"jsonrpc": "2.0", "method": "call", "params": params, "id": 1}
        request = urllib.request.Request(
            self.base + path, data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "User-Agent": "orithos-ai-inventory/1"},
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


def many2one_id(value: Any) -> int | None:
    return value[0] if isinstance(value, list) and value and isinstance(value[0], int) else None


def many2one_name(value: Any) -> str | None:
    return value[1] if isinstance(value, list) and len(value) > 1 else None


def price_band(value: Any) -> str | None:
    """Stable coarse price band for cold-start similarity; GST-inclusive list price."""
    if value is None:
        return None
    price = float(value)
    return "LOW_LE_15" if price <= 15 else "MID_15_30" if price <= 30 else "HIGH_GT_30"


def normalise_product(row: dict[str, Any], lead_time_days: float | None,
                      warehouse: dict[str, Any] | None = None) -> dict[str, Any]:
    """Convert an Odoo product row into the stable snapshot contract."""
    return {
        "productId": row.get("id"),
        "templateId": many2one_id(row.get("product_tmpl_id")),
        "name": row.get("display_name"),
        "category": many2one_name(row.get("categ_id")),
        "brand": many2one_name(row.get("brand_id")),
        "priceBand": price_band(row.get("list_price")),
        "warehouseId": warehouse.get("id") if warehouse else None,
        "warehouse": warehouse.get("name") if warehouse else None,
        "availableQty": float(row.get("qty_available") or 0),
        "virtualAvailableQty": float(row.get("virtual_available") or 0),
        "incomingQty": float(row.get("incoming_qty") or 0),
        "outgoingQty": float(row.get("outgoing_qty") or 0),
        "price": float(row.get("list_price") or 0),
        "leadTimeDays": lead_time_days,
        "active": bool(row.get("active", True)),
    }


def output_path(root: Path, captured_at: datetime) -> Path:
    return root / captured_at.date().isoformat() / "inventory.json"


def main() -> int:
    values = env_values()
    base = values.get("ODOO_BASE_URL", "https://odoo.orithos.com.au")
    database = values.get("ODOO_DATABASE", "aipos_uat")
    username = values.get("ODOO_SERVICE_USERNAME") or values.get("ODOO_USER")
    password = values.get("ODOO_SERVICE_PASSWORD") or values.get("ODOO_PASS")
    company_id = int(os.environ.get("SKR_ODOO_COMPANY_ID", "5"))
    root = Path(os.environ.get("SKR_INVENTORY_SNAPSHOT_ROOT", "data/ai-eval/inventory-snapshots"))
    if not username or not password:
        raise RuntimeError("ODOO service credentials are required")

    captured_at = datetime.now(timezone.utc).replace(microsecond=0)
    odoo = Odoo(base, database, username, password)
    warehouses = odoo.read("stock.warehouse", [["company_id", "=", company_id]],
                           ["id", "name", "company_id"], 1000)
    # qty_available is company scoped and represents an aggregate when a
    # company has multiple warehouses. Keep that fact explicit.
    warehouse = warehouses[0] if len(warehouses) == 1 else None
    products = odoo.read("product.product", [["active", "=", True]], [
        "id", "display_name", "product_tmpl_id", "categ_id", "qty_available",
        "virtual_available", "incoming_qty", "outgoing_qty", "list_price", "active",
    ])
    # Supplier lead time is optional in Odoo installations.  Missing rows are
    # represented as null and never guessed from a default.
    lead_times: dict[int, float] = {}
    try:
        suppliers = odoo.read("product.supplierinfo", [["product_tmpl_id", "!=", False]],
                              ["product_tmpl_id", "delay", "sequence"], 100000)
        for row in suppliers:
            template_id = many2one_id(row.get("product_tmpl_id"))
            delay = row.get("delay")
            if template_id is not None and delay is not None:
                value = float(delay)
                if template_id not in lead_times or value < lead_times[template_id]:
                    lead_times[template_id] = value
    except RuntimeError:
        # Enterprise/community variants can omit supplierinfo access.  Keep
        # the inventory capture useful and expose the missing value as null.
        pass

    snapshot_products = [
        normalise_product(row, lead_times.get(many2one_id(row.get("product_tmpl_id"))), warehouse)
        for row in products
    ]
    snapshot = {
        "snapshotVersion": f"skr-odoo-native-inventory-{captured_at.date().isoformat()}",
        "source": "odoo-readonly-jsonrpc",
        "database": database,
        "companyId": company_id,
        "capturedAt": captured_at.isoformat(),
        "dataQuality": "NATIVE_ODOO_CURRENT_QUANTITIES",
        "warehouseScope": "SINGLE_WAREHOUSE" if warehouse else "COMPANY_AGGREGATE",
        "warehouses": [{"id": row.get("id"), "name": row.get("name")} for row in warehouses],
        "fields": ["availableQty", "virtualAvailableQty", "incomingQty", "outgoingQty",
                   "price", "leadTimeDays"],
        "products": snapshot_products,
        "writeRequests": [],
    }
    destination = output_path(root, captured_at)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(destination), "products": len(snapshot_products),
                      "capturedAt": snapshot["capturedAt"], "dataQuality": snapshot["dataQuality"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
