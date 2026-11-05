from __future__ import annotations

import re
from typing import Any


def _number(row: dict[str, Any], *keys: str) -> float | None:
    value = next((row[key] for key in keys if row.get(key) is not None), None)
    if value is None:
        return None
    try:
        return float(re.sub(r"[^0-9.\-]", "", str(value)))
    except (TypeError, ValueError):
        return None


def inventory_report_totals(rows: list[dict[str, Any]]) -> dict[str, float]:
    sellable_units = 0.0
    negative_stock_products = 0
    complete = True
    for row in rows:
        cases = _number(row, "Case Level", "case_level")
        items = _number(row, "Item Level", "single_level")
        case_quantity = _number(row, "Case Quantity", "case_quantity")
        if cases is None or items is None or case_quantity is None or case_quantity <= 0:
            complete = False
            continue
        quantity = cases * case_quantity + items
        sellable_units += max(quantity, 0)
        if quantity < 0:
            negative_stock_products += 1
    return {
        "sellable_units": round(sellable_units, 3),
        "negative_stock_products": float(negative_stock_products),
        "inventory_metrics_complete": float(complete),
    }


def inventory_snapshot_totals(rows: list[dict[str, Any]]) -> dict[str, float]:
    """Convert persisted Shopfront inventory levels to item units."""
    sellable_units = 0.0
    negative_stock_products = 0
    complete = True
    for row in rows:
        inventory = row.get("inventory") if isinstance(row.get("inventory"), dict) else {}
        product = row.get("product") if isinstance(row.get("product"), dict) else {}
        cases = _number(inventory, "caseLevel", "case_level")
        items = _number(inventory, "singleLevel", "single_level")
        case_quantity = _number(product, "caseQuantity", "case_quantity")
        if cases is None or items is None or case_quantity is None or case_quantity <= 0:
            complete = False
            continue
        quantity = cases * case_quantity + items
        sellable_units += max(quantity, 0)
        if quantity < 0:
            negative_stock_products += 1
    return {
        "sellable_units": round(sellable_units, 3),
        "negative_stock_products": float(negative_stock_products),
        "inventory_metrics_complete": float(complete),
    }
