"""Build per-product native inventory history from immutable daily snapshots.

The output distinguishes observed stockouts (native ``availableQty <= 0``) from
historical stockouts inferred from stock moves.  Price changes are observable
when two snapshots contain different list prices; promotion state remains
unknown because a list-price snapshot does not prove a promotion.
"""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


def _capture_datetime(snapshot: dict[str, Any], path: Path) -> datetime:
    value = snapshot.get("capturedAt")
    if isinstance(value, str):
        try:
            captured_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if captured_at.tzinfo is not None and captured_at.utcoffset() is not None:
                return captured_at
        except ValueError:
            pass
    raise ValueError(f"snapshot requires a timezone-aware capturedAt event timestamp: {path}")


def _business_date(snapshot: dict[str, Any], captured_at: datetime,
                   default_timezone: str = "Australia/Adelaide") -> date:
    value = snapshot.get("businessDate")
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            pass
    timezone_name = snapshot.get("businessTimezone") or snapshot.get("timezone") or default_timezone
    return captured_at.astimezone(ZoneInfo(str(timezone_name))).date()


def load_snapshots(root: Path, default_timezone: str = "Australia/Adelaide") -> list[dict[str, Any]]:
    snapshots: list[tuple[datetime, date, Path, dict[str, Any]]] = []
    for path in root.rglob("inventory.json"):
        snapshot = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(snapshot, dict):
            raise ValueError(f"snapshot must be an object: {path}")
        if snapshot.get("source") != "odoo-readonly-jsonrpc":
            raise ValueError(f"snapshot source is not native Odoo: {path}")
        if snapshot.get("dataQuality") != "NATIVE_ODOO_CURRENT_QUANTITIES":
            raise ValueError(f"snapshot quantities are not native current observations: {path}")
        if snapshot.get("writeRequests", []) != []:
            raise ValueError(f"snapshot contains write requests: {path}")
        captured_at = _capture_datetime(snapshot, path)
        snapshots.append((captured_at, _business_date(snapshot, captured_at, default_timezone), path, snapshot))
    snapshots.sort(key=lambda item: item[0])
    if not snapshots:
        raise ValueError(f"no inventory.json snapshots found under {root}")
    # One observation per store business date. If a task was retried, keep the latest
    # capture for that date rather than double-counting a product-day.
    by_date: dict[str, tuple[datetime, date, Path, dict[str, Any]]] = {}
    for item in snapshots:
        by_date[item[1].isoformat()] = item
    return [item[3] for item in sorted(by_date.values(), key=lambda item: item[0])]


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build_history(snapshots: list[dict[str, Any]], default_timezone: str = "Australia/Adelaide") -> dict[str, Any]:
    dates = sorted({
        _business_date(snapshot, _capture_datetime(snapshot, Path(".")), default_timezone).isoformat()
        for snapshot in snapshots
    })
    parsed_dates = [date.fromisoformat(value) for value in dates if len(value) == 10]
    missing_dates: list[str] = []
    if parsed_dates:
        known = set(parsed_dates)
        cursor = min(parsed_dates)
        while cursor <= max(parsed_dates):
            if cursor not in known:
                missing_dates.append(cursor.isoformat())
            cursor += timedelta(days=1)
    grouped: dict[str, list[dict[str, Any]]] = {}
    for snapshot in snapshots:
        date_value = _business_date(snapshot, _capture_datetime(snapshot, Path(".")), default_timezone).isoformat()
        quality = str(snapshot.get("dataQuality") or "UNKNOWN")
        for product in snapshot.get("products", []):
            product_id = product.get("productId")
            if product_id is None:
                continue
            key = str(product_id)
            observation = {
                "date": date_value,
                "capturedAt": _capture_datetime(snapshot, Path(".")).isoformat(),
                "snapshotVersion": snapshot.get("snapshotVersion"),
                "dataQuality": quality,
                "warehouseId": product.get("warehouseId"),
                "warehouse": product.get("warehouse"),
                "availableQty": _number(product.get("availableQty")),
                "virtualAvailableQty": _number(product.get("virtualAvailableQty")),
                "incomingQty": _number(product.get("incomingQty")),
                "outgoingQty": _number(product.get("outgoingQty")),
                "leadTimeDays": _number(product.get("leadTimeDays")),
                "price": _number(product.get("price")),
                "cost": _number(product.get("cost")),
                "productType": product.get("productType"),
                "isStockable": bool(product.get("isStockable", True)),
                "isSellable": bool(product.get("isSellable", True)),
                "isPurchaseable": bool(product.get("isPurchaseable", False)),
                "isReplenishmentEligible": bool(product.get("isReplenishmentEligible", product.get("isStockable", True) and product.get("isPurchaseable", False))),
                "isStockout": _number(product.get("availableQty")) is not None and _number(product.get("availableQty")) <= 0,
                "promotionStatus": product.get("promotionStatus", "UNKNOWN"),
                "promotionDataQuality": product.get("promotionDataQuality", snapshot.get("promotionDataQuality", "NOT_CAPTURED")),
                "promotionRuleId": product.get("promotionRuleId"),
                "promotionDateStart": product.get("promotionDateStart"),
                "promotionDateEnd": product.get("promotionDateEnd"),
                "promotionComputePrice": product.get("promotionComputePrice"),
                "promotionFixedPrice": _number(product.get("promotionFixedPrice")),
                "promotionPercentPrice": _number(product.get("promotionPercentPrice")),
            }
            grouped.setdefault(key, []).append({"product": product, "observation": observation})

    products: list[dict[str, Any]] = []
    for entries in grouped.values():
        entries.sort(key=lambda entry: entry["observation"]["date"])
        first = entries[0]["product"]
        observations: list[dict[str, Any]] = []
        stockout_dates: list[str] = []
        price_changes: list[dict[str, Any]] = []
        promotion_changes: list[dict[str, Any]] = []
        previous_price: float | None = None
        previous_promotion: tuple[Any, Any] | None = None
        for entry in entries:
            current = entry["observation"]
            price = current["price"]
            current["priceChanged"] = previous_price is not None and price is not None and price != previous_price
            if current["priceChanged"]:
                current["priceChangeFrom"] = previous_price
                current["priceChangeTo"] = price
                price_changes.append({"date": current["date"], "from": previous_price, "to": price})
            else:
                current["priceChangeFrom"] = None
                current["priceChangeTo"] = None
            promotion = (current["promotionStatus"], current["promotionRuleId"])
            current["promotionChanged"] = previous_promotion is not None and promotion != previous_promotion
            if current["promotionChanged"]:
                promotion_changes.append({"date": current["date"], "from": previous_promotion[0], "to": current["promotionStatus"],
                                          "fromRuleId": previous_promotion[1], "toRuleId": current["promotionRuleId"]})
            if current["isStockout"]:
                stockout_dates.append(current["date"])
            observations.append(current)
            if price is not None:
                previous_price = price
            previous_promotion = promotion
        products.append({
            "productId": first.get("productId"),
            "templateId": first.get("templateId"),
            "name": first.get("name"),
            "category": first.get("category"),
            "brand": first.get("brand"),
            "priceBand": first.get("priceBand"),
            "productType": first.get("productType"),
            "isStockable": bool(first.get("isStockable", True)),
            "isSellable": bool(first.get("isSellable", True)),
            "isPurchaseable": bool(first.get("isPurchaseable", False)),
            "isReplenishmentEligible": bool(first.get("isReplenishmentEligible", first.get("isStockable", True) and first.get("isPurchaseable", False))),
            "observations": observations,
            "actualStockoutDates": stockout_dates,
            "priceChanges": price_changes,
            "promotionChanges": promotion_changes,
            "promotionDataQuality": observations[0]["promotionDataQuality"] if observations else "NOT_CAPTURED",
        })
    products.sort(key=lambda product: (str(product.get("name") or ""), int(product.get("productId") or 0)))
    return {
        "historyVersion": "native-odoo-inventory-history-v1",
        "source": "odoo-readonly-jsonrpc",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "latestCapturedAt": max(datetime.fromisoformat(str(snapshot["capturedAt"]).replace("Z", "+00:00")).astimezone(timezone.utc) for snapshot in snapshots).isoformat(),
        "businessTimezone": str(snapshots[-1].get("businessTimezone") or snapshots[-1].get("timezone") or default_timezone),
        "snapshotDates": dates,
        "snapshotCount": len(snapshots),
        "coverageDays": (max(parsed_dates) - min(parsed_dates)).days + 1 if parsed_dates else 0,
        "observedDays": len(parsed_dates),
        "missingSnapshotDates": missing_dates,
        "continuityStatus": "CONTIGUOUS" if not missing_dates else "GAPS_PRESENT",
        "dataQuality": "NATIVE_ODOO_DAILY_SNAPSHOTS",
        "backtestReadiness": "READY_FOR_NATIVE_STOCKOUT_BACKTEST" if len(snapshots) >= 28 else "INSUFFICIENT_HISTORY",
        "stockoutDefinition": "observed availableQty <= 0 at a native Odoo snapshot",
        "promotionDataQuality": str(snapshots[0].get("promotionDataQuality", "NOT_CAPTURED")),
        "products": products,
        "writeRequests": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True, help="directory containing dated inventory.json snapshots")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--require-days", type=int, default=0,
                        help="exit 2 when fewer than this many observed snapshot days exist")
    parser.add_argument("--timezone", default="Australia/Adelaide",
                        help="store timezone used for legacy snapshots without businessDate")
    args = parser.parse_args()
    history = build_history(load_snapshots(args.input, args.timezone), args.timezone)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(history, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "snapshots": history["snapshotCount"], "products": len(history["products"]), "dataQuality": history["dataQuality"]}))
    if args.require_days > 0 and history["observedDays"] < args.require_days:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
