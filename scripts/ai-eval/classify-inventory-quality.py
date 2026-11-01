"""Classify historical inventory warnings without changing Odoo or snapshots.

This turns a broad ``BLOCKED_DATA_QUALITY`` result into a repair queue.  It
deliberately treats historical qty_available as diagnostic evidence only.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path


def classify(inventory: dict, sales: dict) -> dict:
    products = {str(item["productId"]): item for item in inventory.get("products", [])}
    sales_by_id = {str(item["productId"]): item for item in sales.get("series", [])}
    rows = []
    for warning in inventory.get("qualityWarnings", []):
        product_id = warning.get("productId")
        if product_id is None:
            continue
        product = products.get(str(product_id), {})
        observations = product.get("observations", [])
        quantities = [float(item.get("availableQty", 0) or 0) for item in observations]
        sales_series = sales_by_id.get(str(product_id), {})
        metadata_status = "PRESENT" if sales_series else "MISSING_SALES_SERIES"
        units = [max(0.0, float(value or 0)) for value in sales_series.get("units", [])]
        nonpositive = sum(value <= 0 for value in quantities)
        negative = sum(value < 0 for value in quantities)
        mean_negative = (
            sum(abs(value) for value in quantities if value < 0) / negative
            if negative else 0.0
        )
        total_units = sum(units)
        selling_days = sum(value > 0 for value in units)
        if negative and mean_negative >= 1000:
            severity = "CRITICAL_SCOPE_OR_UNIT_ERROR"
        elif negative and mean_negative >= 100:
            severity = "HIGH_NEGATIVE_STOCK"
        elif selling_days >= 60:
            severity = "HIGH_SELLING_WITH_NONPOSITIVE_STOCK"
        else:
            severity = "REVIEW"
        rows.append({
            "productId": int(product_id),
            "category": sales_series.get("category"),
            "metadataStatus": metadata_status,
            "severity": severity,
            "observedDays": len(quantities),
            "nonpositiveStockDays": nonpositive,
            "negativeStockDays": negative,
            "meanNegativeQty": round(mean_negative, 3),
            "sellingDays": selling_days,
            "totalUnits": round(total_units, 3),
            "warningCode": warning.get("code"),
        })
    rows.sort(key=lambda row: (
        ["CRITICAL_SCOPE_OR_UNIT_ERROR", "HIGH_NEGATIVE_STOCK",
         "HIGH_SELLING_WITH_NONPOSITIVE_STOCK", "REVIEW"].index(row["severity"]),
        -row["totalUnits"],
    ))
    return {
        "status": "PASS" if rows else "NO_WARNINGS",
        "sourceDataQuality": inventory.get("dataQuality"),
        "researchOnly": True,
        "warningCount": len(rows),
        "severityCounts": dict(Counter(row["severity"] for row in rows)),
        "categoryCounts": dict(Counter(row.get("category") or "UNKNOWN" for row in rows)),
        "metadataStatusCounts": dict(Counter(row["metadataStatus"] for row in rows)),
        "repairOrder": [
            "CRITICAL_SCOPE_OR_UNIT_ERROR",
            "HIGH_NEGATIVE_STOCK",
            "HIGH_SELLING_WITH_NONPOSITIVE_STOCK",
            "REVIEW",
        ],
        "rows": rows,
        "writeRequests": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--sales", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    sales = json.loads(args.sales.read_text(encoding="utf-8"))
    report = classify(inventory, sales)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output),
        "status": report["status"],
        "warningCount": report["warningCount"],
        "severityCounts": report["severityCounts"],
        "writeRequests": report["writeRequests"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
