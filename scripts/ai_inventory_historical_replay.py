"""Run an inventory forecast replay against fixed, read-only sales/inventory snapshots.

This is a development evaluation tool.  It deliberately uses historical dates
after an information origin as labels only; it never sends them to the
forecaster as inputs.  No Odoo or SKR connection is made by this script.

Example:
  python scripts/ai_inventory_historical_replay.py \
    --sales .local/ai-eval/skr-sales-snapshot-180d-20261101.json \
    --inventory .local/ai-eval/skr-historical-inventory-180d-20261101.json \
    --origin-date 2026-08-31 --horizon 28 --limit 200 \
    --out .local/ai-eval/inventory-replay-2026-08-31.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "forecast-service"))

from app.forecast_engine import backtest_inventory  # noqa: E402
from app.schemas import InventoryBacktestRequest, InventoryBacktestSeries  # noqa: E402


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_series(sales_path: Path, inventory_path: Path, limit: int) -> list[InventoryBacktestSeries]:
    sales = json.loads(sales_path.read_text(encoding="utf-8"))
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    if sales.get("writeRequests", []) or inventory.get("writeRequests", []):
        raise ValueError("input snapshots contain write requests")

    warnings = {
        str(row.get("productId"))
        for row in inventory.get("qualityWarnings", [])
        if row.get("productId") is not None
    }
    inventory_by_id = {str(row["productId"]): row for row in inventory.get("products", [])}
    sales_by_id = {str(row["productId"]): row for row in sales.get("series", [])}
    rows: list[InventoryBacktestSeries] = []
    for product_id, history in inventory_by_id.items():
        if product_id in warnings or product_id not in sales_by_id:
            continue
        observations = history.get("observations", [])
        sales_row = sales_by_id[product_id]
        if len(observations) != len(sales_row.get("dates", [])):
            continue
        quantities = [float(row.get("availableQty", 0)) for row in observations]
        if any(quantity < 0 for quantity in quantities):
            continue
        try:
            rows.append(InventoryBacktestSeries(
                productId=int(product_id),
                dates=[date.fromisoformat(value) for value in sales_row["dates"]],
                units=sales_row["units"],
                onHand=quantities,
                stockoutFlags=[bool(row.get("isStockout")) for row in observations],
            ))
        except (KeyError, TypeError, ValueError):
            continue
        if len(rows) >= limit:
            break
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sales", type=Path, required=True)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--origin-date", type=date.fromisoformat, required=True)
    parser.add_argument("--horizon", type=int, choices=(7, 14, 28), default=14)
    parser.add_argument("--min-history", type=int, default=56)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be positive")

    series = load_series(args.sales, args.inventory, args.limit)
    result = backtest_inventory(InventoryBacktestRequest(
        vendorId=1,
        outletId=1,
        horizonDays=args.horizon,
        minHistoryDays=args.min_history,
        originDate=args.origin_date,
        series=series,
    ))
    passed = sum(item.status == "PASS" for item in result.items)
    blocked = sum(item.status == "BLOCKED" for item in result.items)
    errors = [item.inventoryMae for item in result.items if item.inventoryMae is not None]
    recalls = [item.stockoutRecall for item in result.items if item.stockoutRecall is not None]
    report = {
        "status": "PASS" if result.items and blocked == 0 else "BLOCKED",
        "evaluationMode": result.evaluationMode,
        "futureObservationsUsedAsInput": result.futureObservationsUsedAsInput,
        "originDate": args.origin_date.isoformat(),
        "horizonDays": args.horizon,
        "eligibleProducts": len(series),
        "passedProducts": passed,
        "blockedProducts": blocked,
        "meanInventoryMae": sum(errors) / len(errors) if errors else None,
        "meanStockoutRecall": sum(recalls) / len(recalls) if recalls else None,
        "salesSnapshotSha256": sha256(args.sales),
        "inventorySnapshotSha256": sha256(args.inventory),
        "writeRequests": [],
        "items": [item.model_dump(mode="json") for item in result.items],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in (
        "status", "originDate", "horizonDays", "eligibleProducts", "passedProducts",
        "blockedProducts", "meanInventoryMae", "meanStockoutRecall",
        "futureObservationsUsedAsInput", "writeRequests",
    )}))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
