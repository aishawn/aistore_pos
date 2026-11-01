"""Reconstruct research-only historical stock from a current balance and done moves.

This is an offline transform of the read-only SKR forecast snapshot. It does not
call Odoo and does not claim to be a native inventory observation.
"""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


def _datetime(value: Any, fallback: datetime | None = None) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return fallback
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return fallback
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result == result and abs(result) != float("inf") else None


def _move_delta(move: dict[str, Any]) -> float:
    if move.get("state") != "done":
        return 0.0
    quantity = _number(move.get("quantity"))
    if quantity is None:
        quantity = _number(move.get("movedQuantity"))
    if quantity is None or quantity == 0:
        return 0.0
    source = move.get("sourceUsage")
    destination = move.get("destinationUsage")
    if source == "internal" and destination != "internal":
        return -abs(quantity)
    if source != "internal" and destination == "internal":
        return abs(quantity)
    return 0.0


def _business_day_end(day: date, timezone_name: str) -> datetime:
    local_end = datetime.combine(day + timedelta(days=1), time.min,
                                 ZoneInfo(timezone_name))
    return local_end.astimezone(timezone.utc)


def build_history(snapshot: dict[str, Any]) -> dict[str, Any]:
    quality = snapshot.get("dataQuality") or {}
    if quality.get("inventoryHistory") != "AVAILABLE":
        raise ValueError("snapshot does not contain complete inventory move history")
    if (quality.get("orderPaginationComplete") is not True or quality.get("orderLimitReached")
            or quality.get("detailFailures", 0) != 0):
        raise ValueError("sales snapshot is incomplete; refusing to build historical labels")

    series_by_product = {
        str(row.get("productId")): row
        for row in snapshot.get("series", [])
        if row.get("productId") is not None
    }
    if not series_by_product:
        raise ValueError("sales snapshot has no product series")
    current = {
        str(row.get("productId")): _number(row.get("stock"))
        for row in snapshot.get("inventoryCurrent", [])
        if row.get("productId") is not None
    }
    current_as_of = _datetime(snapshot.get("inventoryCurrentAsOf"))
    timestamp_quality = "CAPTURE_WINDOW_END_ESTIMATE"
    if current_as_of is None:
        current_as_of = _datetime(snapshot.get("generatedAt"))
        timestamp_quality = "APPROXIMATED_FROM_SNAPSHOT_GENERATED_AT"
    if current_as_of is None:
        raise ValueError("current inventory baseline has no usable timestamp")

    all_dates = sorted({
        date.fromisoformat(str(value))
        for row in series_by_product.values()
        for value in row.get("dates", [])
    })
    if not all_dates:
        raise ValueError("sales snapshot has no dated observations")
    timezone_name = str(snapshot.get("timezone") or "Australia/Adelaide")
    move_start = _datetime(quality.get("inventoryHistoryFrom"))
    move_end = _datetime(quality.get("inventoryHistoryTo")) or current_as_of
    first_day_end = _business_day_end(all_dates[0], timezone_name)
    last_day_end = _business_day_end(all_dates[-1], timezone_name)
    if move_start is None or move_start > first_day_end:
        raise ValueError("inventory moves do not cover the first requested business day")
    if move_end < current_as_of:
        raise ValueError("inventory moves do not reach the current stock baseline")
    if last_day_end > current_as_of:
        raise ValueError("sales history includes a business day not yet closed at the stock baseline")

    moves_by_product: dict[str, list[tuple[datetime, float]]] = {}
    for move in snapshot.get("inventoryMoves", []):
        product_id = move.get("productId")
        moved_at = _datetime(move.get("date"))
        delta = _move_delta(move)
        if product_id is None or moved_at is None or not delta:
            continue
        if moved_at > current_as_of:
            continue
        moves_by_product.setdefault(str(product_id), []).append((moved_at, delta))
    for events in moves_by_product.values():
        events.sort(key=lambda item: item[0], reverse=True)

    sales_by_product: dict[str, dict[str, float]] = {}
    for row in snapshot.get("salesDaily", []):
        product_id = row.get("productId")
        if product_id is not None:
            sales_by_product.setdefault(str(product_id), {})[str(row.get("date"))] = (
                sales_by_product.get(str(product_id), {}).get(str(row.get("date")), 0.0)
                + float(row.get("units") or 0)
            )

    products = []
    warnings = []
    missing_baselines = 0
    for product_id, series in series_by_product.items():
        baseline = current.get(product_id)
        if baseline is None:
            missing_baselines += 1
            continue
        events = moves_by_product.get(product_id, [])
        event_index = 0
        reversed_delta = 0.0
        observations = []
        ordered_dates = [date.fromisoformat(str(value)) for value in series.get("dates", [])]
        for day in reversed(ordered_dates):
            cutoff = _business_day_end(day, timezone_name)
            while event_index < len(events) and events[event_index][0] > cutoff:
                reversed_delta += events[event_index][1]
                event_index += 1
            historical_qty = baseline - reversed_delta
            observations.append({
                "date": day.isoformat(),
                "availableQty": round(historical_qty, 6),
                "isStockout": historical_qty <= 0,
                "dataQuality": "RECONSTRUCTED_FROM_CURRENT_STOCK_AND_DONE_MOVES",
            })
        observations.reverse()
        nonpositive_days = sum(item["availableQty"] <= 0 for item in observations)
        selling_days = sum(value > 0 for value in sales_by_product.get(product_id, {}).values())
        if len(observations) >= 28 and nonpositive_days == len(observations) and selling_days >= 14:
            warnings.append({
                "code": "PERSISTENT_NONPOSITIVE_STOCK_WITH_REPEATED_SALES",
                "productId": series.get("productId"),
                "observedDays": len(observations),
                "nonpositiveStockDays": nonpositive_days,
                "sellingDays": selling_days,
            })
        products.append({"productId": series.get("productId"), "observations": observations})

    if missing_baselines:
        raise ValueError(f"current inventory baseline missing for {missing_baselines} sales products")
    return {
        "historyVersion": "skr-reconstructed-inventory-history-v1",
        "source": "skr-readonly-current-stock-and-complete-done-stock-moves",
        "dataQuality": "RECONSTRUCTED_FROM_CURRENT_STOCK_AND_DONE_MOVES",
        "researchOnly": True,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "currentInventoryAsOf": current_as_of.isoformat(),
        "baselineTimestampQuality": timestamp_quality,
        "baselineSemantics": "current product quantities were paged before this capture-window end; point-in-time precision is approximate",
        "businessTimezone": timezone_name,
        "snapshotDates": [day.isoformat() for day in all_dates],
        "snapshotCount": len(all_dates),
        "observedDays": len(all_dates),
        "backtestReadiness": "READY_FOR_RESEARCH_BACKTEST",
        "nativeSnapshotAcceptanceReadiness": "INSUFFICIENT_NATIVE_DAILY_SNAPSHOTS",
        "inventoryConsistencyStatus": "SUSPECT" if warnings else "NO_CONTRADICTION_DETECTED",
        "researchBacktestReadiness": "READY_WITH_PRODUCT_EXCLUSIONS" if warnings else "READY",
        "qualityWarnings": warnings,
        "stockoutDefinition": "reconstructed availableQty <= 0 at local business-day end; not a native count",
        "movementCount": len(snapshot.get("inventoryMoves", [])),
        "writeRequests": [],
        "products": products,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sales-snapshot", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    snapshot = json.loads(args.sales_snapshot.read_text(encoding="utf-8"))
    history = build_history(snapshot)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(history, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(args.output), "dates": history["observedDays"],
        "products": len(history["products"]), "dataQuality": history["dataQuality"],
        "researchBacktestReadiness": history["researchBacktestReadiness"],
        "excludedProducts": len(history["qualityWarnings"]), "writeRequests": [],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
