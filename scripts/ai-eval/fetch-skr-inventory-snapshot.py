"""Capture a read-only, native Odoo inventory snapshot for one store.

This is intentionally separate from the sales backtest snapshot.  A backtest
may infer historical stockouts from ``stock.move``; this job records the
native quantities Odoo exposes *at capture time* so future backtests can use a
real inventory history.  The script only uses ``search_read`` / ``search_count`` and never calls
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
    # Scheduled jobs and containers normally provide secrets through the
    # process environment; local runs may provide them through ignored .env.
    values: dict[str, str] = dict(os.environ)
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
        self.context: dict[str, Any] = {}
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
        rows: list[dict] = []
        page_size = min(limit, 2000)
        for offset in range(0, limit, page_size):
            page = self.call(f"/web/dataset/call_kw/{model}/search_read", {
                "model": model, "method": "search_read", "args": [domain],
                "kwargs": {"fields": fields, "limit": min(page_size, limit - offset),
                           "offset": offset, "order": "id asc", "context": self.context},
            })
            if not isinstance(page, list):
                raise RuntimeError("Inventory read returned incomplete data")
            rows.extend(page)
            if len(page) < page_size:
                return rows
        count = self.count(model, domain)
        if count != len(rows):
            raise RuntimeError("Inventory query truncated; snapshot not saved")
        return rows

    def count(self, model: str, domain: list) -> int:
        return self.call(f"/web/dataset/call_kw/{model}/search_count", {
            "model": model, "method": "search_count", "args": [domain],
            "kwargs": {"context": self.context},
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
                      warehouse: dict[str, Any] | None = None,
                      promotion: dict[str, Any] | None = None,
                      promotion_quality: str = "NOT_CAPTURED") -> dict[str, Any]:
    """Convert an Odoo product row into the stable snapshot contract."""
    product_type = row.get("type") or row.get("detailed_type")
    # Physical and consumable products are stockable. Purchase eligibility is
    # kept separate so services and non-purchasable virtual products cannot
    # create replenishment recommendations.
    is_stockable = product_type in ("product", "consu")
    is_purchaseable = bool(row.get("purchase_ok", False))
    return {
        "productId": row.get("id"),
        "templateId": many2one_id(row.get("product_tmpl_id")),
        "name": row.get("display_name"),
        "category": many2one_name(row.get("categ_id")),
        "brand": many2one_name(row.get("brand_id")),
        "priceBand": price_band(row.get("list_price")),
        "productType": product_type,
        "isStockable": is_stockable,
        "isSellable": bool(row.get("sale_ok", True)),
        "isPurchaseable": is_purchaseable,
        "isReplenishmentEligible": is_stockable and is_purchaseable,
        "warehouseId": warehouse.get("id") if warehouse else None,
        "warehouse": warehouse.get("name") if warehouse else None,
        "availableQty": float(row["qty_available"]) if row.get("qty_available") is not None else None,
        "virtualAvailableQty": float(row["virtual_available"]) if row.get("virtual_available") is not None else None,
        "incomingQty": float(row["incoming_qty"]) if row.get("incoming_qty") is not None else None,
        "outgoingQty": float(row["outgoing_qty"]) if row.get("outgoing_qty") is not None else None,
        "price": float(row.get("list_price") or 0),
        "cost": float(row.get("standard_price")) if row.get("standard_price") is not None else None,
        "leadTimeDays": lead_time_days,
        "promotionStatus": "ACTIVE_RULE" if promotion else "UNKNOWN",
        "promotionDataQuality": promotion_quality,
        "promotionRuleId": promotion.get("id") if promotion else None,
        "promotionDateStart": promotion.get("date_start") if promotion else None,
        "promotionDateEnd": promotion.get("date_end") if promotion else None,
        "promotionComputePrice": promotion.get("compute_price") if promotion else None,
        "promotionFixedPrice": promotion.get("fixed_price") if promotion else None,
        "promotionPercentPrice": promotion.get("percent_price") if promotion else None,
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
    root = Path(os.environ.get("SKR_INVENTORY_SNAPSHOT_ROOT", ".local/ai-eval/inventory-snapshots-scoped-v2"))
    if not username or not password:
        raise RuntimeError("ODOO service credentials are required")

    captured_at = datetime.now(timezone.utc).replace(microsecond=0)
    odoo = Odoo(base, database, username, password)
    odoo.context = {"allowed_company_ids": [company_id], "force_company": company_id}
    warehouses = odoo.read("stock.warehouse", [["company_id", "=", company_id]],
                           ["id", "name", "company_id"], 1000)
    # qty_available is company scoped and represents an aggregate when a
    # company has multiple warehouses. Keep that fact explicit.
    warehouse = warehouses[0] if len(warehouses) == 1 else None
    product_domain = [["active", "=", True], ["company_id", "=", company_id]]
    products = odoo.read("product.product", product_domain, [
        "id", "display_name", "product_tmpl_id", "categ_id", "qty_available",
        "virtual_available", "incoming_qty", "outgoing_qty", "list_price", "standard_price", "active",
        "type", "sale_ok", "purchase_ok",
    ])
    # Supplier lead time is optional in Odoo installations.  Missing rows are
    # represented as null and never guessed from a default.
    lead_times: dict[int, float] = {}
    try:
        suppliers = odoo.read("product.supplierinfo", [["product_tmpl_id", "in", [many2one_id(row.get("product_tmpl_id")) for row in products]]],
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

    promotion_by_product: dict[int, dict[str, Any]] = {}
    promotion_by_template: dict[int, dict[str, Any]] = {}
    promotion_quality = "ODOO_PRICELIST_RULES_READ"
    try:
        price_lists = odoo.read("product.pricelist", [
            ["company_id", "=", company_id], ["active", "=", True]
        ], ["id"], 1000)
        price_list_ids = [int(row.get("id")) for row in price_lists if row.get("id")]
        rules = odoo.read("product.pricelist.item", [["pricelist_id", "in", price_list_ids]], [
            "id", "product_id", "product_tmpl_id", "date_start", "date_end",
            "compute_price", "fixed_price", "percent_price"
        ], 100000) if price_list_ids else []
        today = captured_at.date().isoformat()
        for rule in rules if isinstance(rules, list) else []:
            start = str(rule.get("date_start") or "")[:10]
            end = str(rule.get("date_end") or "")[:10]
            if (start and today < start) or (end and today > end):
                continue
            product_id = many2one_id(rule.get("product_id"))
            template_id = many2one_id(rule.get("product_tmpl_id"))
            if product_id is not None:
                promotion_by_product.setdefault(product_id, rule)
            elif template_id is not None:
                promotion_by_template.setdefault(template_id, rule)
    except RuntimeError:
        promotion_quality = "ODOO_PRICELIST_RULES_UNAVAILABLE"

    snapshot_products = [
        normalise_product(
            row,
            lead_times.get(many2one_id(row.get("product_tmpl_id"))),
            warehouse,
            promotion_by_product.get(int(row.get("id")))
            or promotion_by_template.get(many2one_id(row.get("product_tmpl_id"))),
            promotion_quality,
        )
        for row in products
    ]
    expected_count = odoo.count("product.product", product_domain)
    if len(products) != expected_count:
        raise RuntimeError("Product catalogue changed during capture; retry without saving a partial snapshot")
    warehouse_inventory = []
    for item in warehouses:
        odoo.context["warehouse_id"] = item["id"]
        quantities = odoo.read("product.product", product_domain, ["id", "qty_available", "virtual_available", "incoming_qty", "outgoing_qty"])
        if {row["id"] for row in quantities} != {row["id"] for row in products}:
            raise RuntimeError("Warehouse coverage is incomplete; snapshot not saved")
        warehouse_inventory.append({"warehouseId": item["id"], "productCount": len(quantities), "quantities": quantities})
    odoo.context.pop("warehouse_id", None)
    snapshot = {
        "snapshotVersion": f"skr-odoo-native-inventory-{captured_at.date().isoformat()}",
        "source": "odoo-readonly-jsonrpc",
        "scopeVersion": 2,
        "companyScope": "EXPLICIT_COMPANY_PRODUCTS",
        "coverage": {"expectedProducts": expected_count, "capturedProducts": len(products),
                     "productCoverage": 1.0, "expectedWarehouses": len(warehouses),
                     "capturedWarehouses": len(warehouse_inventory),
                     "missingQuantityFields": sum(row.get(field) is None for row in products
                         for field in ("qty_available", "virtual_available", "incoming_qty", "outgoing_qty"))},
        "warehouseInventory": warehouse_inventory,
        "database": database,
        "companyId": company_id,
        "capturedAt": captured_at.isoformat(),
        "dataQuality": "NATIVE_ODOO_CURRENT_QUANTITIES",
        "promotionDataQuality": promotion_quality,
        "warehouseScope": "SINGLE_WAREHOUSE" if warehouse else "COMPANY_AGGREGATE",
        "warehouses": [{"id": row.get("id"), "name": row.get("name")} for row in warehouses],
        "fields": ["availableQty", "virtualAvailableQty", "incomingQty", "outgoingQty",
                   "price", "cost", "leadTimeDays", "promotionStatus",
                   "productType", "isStockable", "isSellable", "isPurchaseable",
                   "isReplenishmentEligible"],
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
