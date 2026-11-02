"""Build a read-only dead-stock and cash-occupancy report."""
from __future__ import annotations

import argparse
import importlib.util
import json
from collections import Counter
from datetime import date
from pathlib import Path


def load_odoo_client():
    source = Path(__file__).with_name("fetch-skr-historical-inventory.py")
    spec = importlib.util.spec_from_file_location("skr_inventory_fetch", source)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load read-only Odoo client")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.Odoo, module.env_values


def read_model(odoo, model: str, domain: list, fields: list[str], limit: int = 2000):
    return odoo.call(f"/web/dataset/call_kw/{model}/search_read", {
        "model": model, "method": "search_read", "args": [domain],
        "kwargs": {"fields": fields, "limit": limit, "order": "id"},
    }) or []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sales-snapshot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--company-id", type=int)
    args = parser.parse_args()
    sales = json.loads(args.sales_snapshot.read_text(encoding="utf-8"))
    snapshot_company_id = sales.get("companyId")
    if not isinstance(snapshot_company_id, int) or snapshot_company_id <= 0:
        raise ValueError("sales snapshot must contain a valid companyId")
    if args.company_id is not None and args.company_id != snapshot_company_id:
        raise ValueError(f"company ID {args.company_id} does not match sales snapshot companyId {snapshot_company_id}")
    company_id = snapshot_company_id
    series = {str(row["productId"]): row for row in sales.get("series", [])}
    product_ids = sorted(int(product_id) for product_id in series)
    Odoo, env_values = load_odoo_client()
    values = env_values()
    username = values.get("ODOO_SERVICE_USERNAME") or values.get("ODOO_USER")
    password = values.get("ODOO_SERVICE_PASSWORD") or values.get("ODOO_PASS")
    if not username or not password:
        raise RuntimeError("Odoo read-only credentials are required")
    odoo = Odoo(values.get("ODOO_BASE_URL", "https://odoo.orithos.com.au"),
                values.get("ODOO_DATABASE", "aipos_uat"), username, password)
    odoo.context = {"allowed_company_ids": [company_id],
                    "company_id": company_id, "active_test": False}
    metadata = []
    for offset in range(0, len(product_ids), 500):
        metadata.extend(read_model(odoo, "product.product", [
            ["id", "in", product_ids[offset:offset + 500]],
            ["company_id", "in", [False, company_id]],
        ], ["id", "display_name", "categ_id", "qty_available", "virtual_available",
            "standard_price", "list_price"], limit=500))
    metadata_by_id = {str(row["id"]): row for row in metadata}
    end_date = max((max(row.get("dates", [])) for row in series.values() if row.get("dates")),
                   default=date.today().isoformat())
    rows = []
    action_counts = Counter()
    for product_id, item in series.items():
        dates = item.get("dates", [])
        units = [max(0.0, float(value or 0)) for value in item.get("units", [])]
        last_sale_index = max((index for index, value in enumerate(units) if value > 0), default=None)
        days_since_sale = (len(dates) - 1 - last_sale_index) if last_sale_index is not None else len(dates)
        product = metadata_by_id.get(product_id, {})
        qty = product.get("qty_available")
        cost = product.get("standard_price")
        valid_cash_basis = qty is not None and cost is not None and float(qty) >= 0 and float(cost) >= 0
        cash_value = round(float(qty) * float(cost), 2) if valid_cash_basis else None
        if days_since_sale >= 90:
            bucket = "NO_SALE_90D"
        elif days_since_sale >= 60:
            bucket = "NO_SALE_60D"
        elif days_since_sale >= 30:
            bucket = "NO_SALE_30D"
        else:
            bucket = "ACTIVE_OR_RECENT"
        if not valid_cash_basis:
            action = "DATA_REPAIR_REQUIRED"
            action_reason = "cost_or_stock_missing_or_invalid"
        elif bucket == "NO_SALE_90D":
            action = "STOP_REPLENISHMENT_AND_CLEARANCE_REVIEW"
            action_reason = "no_sale_for_at_least_90_days"
        elif bucket in {"NO_SALE_60D", "NO_SALE_30D"}:
            action = "PROMOTION_OR_BUNDLE_REVIEW"
            action_reason = "no_sale_for_at_least_30_days"
        else:
            action = "MONITOR"
            action_reason = "recent_sales_observed"
        action_counts[action] += 1
        rows.append({
            "productId": int(product_id),
            "displayName": product.get("display_name"),
            "category": product.get("categ_id"),
            "daysSinceSale": days_since_sale,
            "bucket": bucket,
            "currentQty": qty,
            "standardCost": cost,
            "cashValue": cash_value,
            "dataQuality": "VALID_COST_AND_NONNEGATIVE_STOCK" if valid_cash_basis
                else "COST_OR_STOCK_INVALID",
            "recommendedAction": action,
            "actionReason": action_reason,
            "totalUnitsInSnapshot": round(sum(units), 4),
        })
    valid_rows = [row for row in rows if row["cashValue"] is not None]
    report = {
        "status": "PASS",
        "mode": "READ_ONLY_DEAD_STOCK_CASH_ANALYSIS",
        "companyId": company_id,
        "salesDateRange": [min((min(row.get("dates", [])) for row in series.values() if row.get("dates")),
                                default=None), end_date],
        "productCount": len(rows),
        "metadataFoundCount": len(metadata_by_id),
        "bucketCounts": dict(Counter(row["bucket"] for row in rows)),
        "recommendedActionCounts": dict(action_counts),
        "invalidCostOrStockCount": len(rows) - len(valid_rows),
        "validCashValueTotal": round(sum(row["cashValue"] for row in valid_rows), 2),
        "cashValueByBucket": {
            bucket: round(sum(row["cashValue"] for row in valid_rows if row["bucket"] == bucket), 2)
            for bucket in sorted({row["bucket"] for row in rows})
        },
        "rows": sorted(rows, key=lambda row: (row["cashValue"] is None, -(row["cashValue"] or 0))),
        "writeRequests": [],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output), "productCount": report["productCount"],
        "metadataFoundCount": report["metadataFoundCount"],
        "bucketCounts": report["bucketCounts"],
        "invalidCostOrStockCount": report["invalidCostOrStockCount"],
        "validCashValueTotal": report["validCashValueTotal"],
        "writeRequests": report["writeRequests"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
