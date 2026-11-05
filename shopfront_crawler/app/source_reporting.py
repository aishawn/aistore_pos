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


def merge_incremental_inventory_manifest(
    existing_ids: list[str], products: list[dict[str, Any]],
) -> list[str] | None:
    """Extend a complete manifest only when each delta carries inventory evidence."""
    merged = {str(value).strip() for value in existing_ids if str(value).strip()}
    for product in products:
        product_id = product.get("id") or product.get("ID")
        if not product_id or "inventory" not in product or not isinstance(product.get("inventory"), (list, dict, type(None))):
            return None
        merged.add(str(product_id).strip())
    return sorted(merged)


def inventory_snapshot_report_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    """Convert persisted GraphQL product/inventory pairs to report rows."""
    result: list[dict[str, Any]] = []
    for row in rows:
        product = row.get("product") if isinstance(row.get("product"), dict) else {}
        inventory_rows = row.get("inventory")
        if not isinstance(inventory_rows, list):
            return None
        case_quantity = _number(product, "caseQuantity", "case_quantity")
        if case_quantity is None or case_quantity <= 0:
            return None
        for inventory in inventory_rows:
            if not isinstance(inventory, dict):
                return None
            case_level = _number(inventory, "caseLevel", "case_level")
            item_level = _number(inventory, "singleLevel", "single_level")
            if case_level is None or item_level is None:
                return None
            result.append({
                "ID": product.get("id") or product.get("ID"),
                "Name": product.get("name") or product.get("Name") or "—",
                "Case Quantity": case_quantity,
                "Case Level": case_level,
                "Item Level": item_level,
                "Value (Inc) (Last)": inventory.get("valueLastCost", inventory.get("value")),
            })
    return result
