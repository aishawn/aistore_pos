"""Validate one native Odoo inventory snapshot before it enters backtests.

The validator is deliberately read-only.  Structural failures return exit code
1; operational warnings (for example a large product-count change) are kept in
the JSON report and return 2 so a scheduler can alert without treating the
snapshot as usable data.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


REQUIRED_PRODUCT_FIELDS = {
    "productId", "availableQty", "virtualAvailableQty", "incomingQty",
    "outgoingQty", "price", "cost", "leadTimeDays", "warehouseId",
    "promotionStatus",
}


def validate(snapshot: dict[str, Any], previous_count: int | None = None) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    if snapshot.get("source") != "odoo-readonly-jsonrpc":
        errors.append("source is not native Odoo JSON-RPC")
    if not snapshot.get("snapshotVersion"):
        errors.append("snapshotVersion is missing")
    captured_at = snapshot.get("capturedAt")
    try:
        datetime.fromisoformat(str(captured_at).replace("Z", "+00:00"))
    except ValueError:
        errors.append("capturedAt is not an ISO timestamp")
    if snapshot.get("writeRequests", []) != []:
        errors.append("writeRequests is not empty")
    products = snapshot.get("products")
    if not isinstance(products, list) or not products:
        errors.append("products is empty or not a list")
        products = []
    ids = [p.get("productId") for p in products if isinstance(p, dict)]
    if len(ids) != len(set(ids)):
        errors.append("duplicate productId values")
    missing_fields = sorted({field for product in products if isinstance(product, dict)
                             for field in REQUIRED_PRODUCT_FIELDS if field not in product})
    if missing_fields:
        errors.append("required product fields missing: " + ", ".join(missing_fields))
    if previous_count and abs(len(products) - previous_count) / previous_count > 0.20:
        warnings.append(f"product count changed from {previous_count} to {len(products)} (>20%)")
    if snapshot.get("warehouseScope") not in {"SINGLE_WAREHOUSE", "COMPANY_AGGREGATE"}:
        warnings.append("warehouseScope is unknown")
    if snapshot.get("dataQuality") != "NATIVE_ODOO_CURRENT_QUANTITIES":
        warnings.append("dataQuality is not NATIVE_ODOO_CURRENT_QUANTITIES")
    status = "FAIL" if errors else "WARN" if warnings else "PASS"
    return {
        "status": status,
        "productCount": len(products),
        "errors": errors,
        "warnings": warnings,
        "writeRequests": snapshot.get("writeRequests", []),
        "snapshotVersion": snapshot.get("snapshotVersion"),
        "capturedAt": captured_at,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--previous-count", type=int)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    report = validate(snapshot, args.previous_count)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 1 if report["status"] == "FAIL" else 2 if report["status"] == "WARN" else 0


if __name__ == "__main__":
    sys.exit(main())
