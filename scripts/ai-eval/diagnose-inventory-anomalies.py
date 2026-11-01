"""Read-only Odoo metadata probe for historical inventory anomalies."""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path


def load_odoo_class():
    source = Path(__file__).with_name("fetch-skr-historical-inventory.py")
    spec = importlib.util.spec_from_file_location("skr_inventory_fetch", source)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load Odoo read-only client")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.Odoo, module.env_values


def read_model(odoo, model: str, domain: list, fields: list[str], limit: int = 1000):
    return odoo.call(f"/web/dataset/call_kw/{model}/search_read", {
        "model": model,
        "method": "search_read",
        "args": [domain],
        "kwargs": {"fields": fields, "limit": limit, "order": "id"},
    }) or []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--company-id", type=int, default=5)
    args = parser.parse_args()
    queue = json.loads(args.queue.read_text(encoding="utf-8"))
    rows = [row for row in queue.get("rows", [])
            if row.get("severity") in {
                "CRITICAL_SCOPE_OR_UNIT_ERROR",
                "HIGH_NEGATIVE_STOCK",
                "HIGH_SELLING_WITH_NONPOSITIVE_STOCK",
            }]
    product_ids = sorted({int(row["productId"]) for row in rows})
    Odoo, env_values = load_odoo_class()
    values = env_values()
    username = values.get("ODOO_SERVICE_USERNAME") or values.get("ODOO_USER")
    password = values.get("ODOO_SERVICE_PASSWORD") or values.get("ODOO_PASS")
    if not username or not password:
        raise RuntimeError("Odoo read-only credentials are required")
    odoo = Odoo(values.get("ODOO_BASE_URL", "https://odoo.orithos.com.au"),
                values.get("ODOO_DATABASE", "aipos_uat"), username, password)
    odoo.context = {"allowed_company_ids": [args.company_id],
                    "company_id": args.company_id, "active_test": False}
    products = read_model(odoo, "product.product", [
        ["id", "in", product_ids],
        ["company_id", "in", [False, args.company_id]],
    ], ["id", "display_name", "default_code", "uom_id", "categ_id",
        "company_id", "qty_available", "virtual_available", "standard_price"])
    product_by_id = {int(row["id"]): row for row in products}
    quant_rows = []
    quant_error = None
    try:
        quant_rows = read_model(odoo, "stock.quant", [
            ["product_id", "in", product_ids],
            ["company_id", "in", [False, args.company_id]],
        ], ["id", "product_id", "location_id", "quantity", "reserved_quantity",
            "company_id"], limit=10000)
    except Exception as error:  # Metadata access can be disabled by Odoo ACLs.
        quant_error = type(error).__name__
    quant_by_product = {}
    for row in quant_rows:
        product = row.get("product_id")
        product_id = product[0] if isinstance(product, list) and product else None
        if product_id is None:
            continue
        bucket = quant_by_product.setdefault(str(product_id), {
            "quantRows": 0, "quantity": 0.0, "reservedQuantity": 0.0,
            "locations": set(),
            "byLocation": {},
        })
        bucket["quantRows"] += 1
        bucket["quantity"] += float(row.get("quantity") or 0)
        bucket["reservedQuantity"] += float(row.get("reserved_quantity") or 0)
        location = row.get("location_id")
        if isinstance(location, list) and location:
            location_id = int(location[0])
            bucket["locations"].add(location_id)
            location_bucket = bucket["byLocation"].setdefault(str(location_id), {
                "quantity": 0.0, "reservedQuantity": 0.0, "rows": 0,
            })
            location_bucket["quantity"] += float(row.get("quantity") or 0)
            location_bucket["reservedQuantity"] += float(row.get("reserved_quantity") or 0)
            location_bucket["rows"] += 1
    location_ids = sorted({location_id for bucket in quant_by_product.values()
                           for location_id in bucket["locations"]})
    location_by_id = {}
    if location_ids:
        try:
            locations = read_model(odoo, "stock.location", [["id", "in", location_ids]],
                                   ["id", "complete_name", "usage", "company_id"], limit=1000)
            location_by_id = {int(row["id"]): row for row in locations}
        except Exception:
            location_by_id = {}
    result_rows = []
    for row in rows:
        product_id = int(row["productId"])
        product = product_by_id.get(product_id, {})
        quants = quant_by_product.get(str(product_id), {})
        by_location = quants.get("byLocation", {})
        internal_qty = 0.0
        customer_qty = 0.0
        for location_id, values in by_location.items():
            location = location_by_id.get(int(location_id), {})
            if location.get("usage") == "internal":
                internal_qty += values["quantity"]
            elif location.get("usage") == "customer":
                customer_qty += values["quantity"]
        if internal_qty < 0 and abs(customer_qty + internal_qty) <= max(1.0, abs(internal_qty) * 0.01):
            root_cause = "CUSTOMER_OFFSET_INTERNAL_NEGATIVE"
        elif internal_qty < 0:
            root_cause = "INTERNAL_NEGATIVE_UNBALANCED"
        else:
            root_cause = "REVIEW_STOCK_HISTORY"
        result_rows.append({
            **row,
            "metadataFound": bool(product),
            "displayName": product.get("display_name"),
            "defaultCode": product.get("default_code"),
            "uom": product.get("uom_id"),
            "category": product.get("categ_id"),
            "company": product.get("company_id"),
            "currentQtyAvailable": product.get("qty_available"),
            "currentVirtualAvailable": product.get("virtual_available"),
            "standardPricePresent": product.get("standard_price") is not None,
            "diagnosticRootCause": root_cause,
            "internalQuantity": round(internal_qty, 4),
            "customerQuantity": round(customer_qty, 4),
            "quantSummary": {
                "quantRows": quants.get("quantRows", 0),
                "quantity": round(quants.get("quantity", 0.0), 4),
                "reservedQuantity": round(quants.get("reservedQuantity", 0.0), 4),
                "locationCount": len(quants.get("locations", set())),
                "locations": [location_by_id.get(location_id, {"id": location_id})
                              for location_id in sorted(quants.get("locations", set()))],
                "byLocation": {
                    location_id: {
                        **values,
                        "quantity": round(values["quantity"], 4),
                        "reservedQuantity": round(values["reservedQuantity"], 4),
                    }
                    for location_id, values in quants.get("byLocation", {}).items()
                },
            },
        })
    report = {
        "status": "PASS",
        "mode": "READ_ONLY_ODDO_METADATA_DIAGNOSTIC",
        "companyId": args.company_id,
        "requestedProductCount": len(product_ids),
        "metadataFoundCount": len(product_by_id),
        "stockQuantStatus": "AVAILABLE" if quant_error is None else "BLOCKED_ACL",
        "stockQuantErrorType": quant_error,
        "rows": result_rows,
        "writeRequests": [],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, default=list), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "requestedProductCount": report["requestedProductCount"],
        "metadataFoundCount": report["metadataFoundCount"],
        "stockQuantStatus": report["stockQuantStatus"],
        "writeRequests": report["writeRequests"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
