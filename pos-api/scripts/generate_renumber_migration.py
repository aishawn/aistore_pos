#!/usr/bin/env python3
"""
Generate migration_renumber_ids.sql — renumber all BIGINT PK tables from 1,
updating FK references. Run after migration_auto_increment.sql (AUTO_INCREMENT columns).
"""

from pathlib import Path
import re

BIG = 9_000_000_000_000  # temporary id offset

# (table, [(ref_table, ref_column), ...]) — process in order; skip permission (fixed seed ids)
TABLES: list[tuple[str, list[tuple[str, str]]]] = [
    ("tax_rate", [
        ("vendor", "default_tax_rate_id"),
        ("product", "tax_rate_id"),
        ("product", "cost_tax_rate_id"),
        ("supplier", "freight_tax_id"),
        ("supplier", "fees_tax_id"),
    ]),
    ("payment_method", [
        ("register_payment_method", "payment_method_id"),
        ("customer_payment", "payment_method_id"),
        ("sale_payment", "payment_method_id"),
        ("register_closure_payment", "payment_method_id"),
        ("payment_method", "cashout_method_id"),
    ]),
    ("receipt", [
        ("customer_group", "default_receipt_id"),
        ("customer_group", "email_receipt_id"),
        ("customer_group", "payment_receipt_id"),
    ]),
    ("statement", [
        ("customer_group", "statement_template_id"),
    ]),
    ("brand", [
        ("product", "brand_id"),
    ]),
    ("category", [
        ("product", "category_id"),
    ]),
    ("family", [
        ("product", "family_id"),
    ]),
    ("tag", [
        ("product_tag", "tag_id"),
    ]),
    ("price_set", [
        ("outlet", "ticketing_price_set_id"),
        ("product_price", "price_set_id"),
        ("future_price", "price_set_id"),
        ("host_connection", "price_set_id"),
        ("price_set", "parent_id"),
    ]),
    ("price_list", [
        ("customer_group", "price_list_id"),
        ("customer", "price_list_id"),
        ("price_list_item", "price_list_id"),
    ]),
    ("barcode_template", [
        ("product_barcode", "template_id"),
    ]),
    ("role", [
        ("app_user", "role_id"),
        ("role_permission", "role_id"),
    ]),
    ("contact", [
        ("outlet", "contact_id"),
        ("supplier", "contact_id"),
        ("transferee", "contact_id"),
        ("customer", "billing_contact_id"),
        ("customer", "delivery_contact_id"),
    ]),
    ("customer_group", [
        ("customer", "customer_group_id"),
        ("promotion_customer_group", "customer_group_id"),
        ("customer_group_revision", "customer_group_id"),
    ]),
    ("vendor", []),
    ("outlet", [
        ("register", "outlet_id"),
        ("product_inventory", "outlet_id"),
        ("product_cost", "outlet_id"),
        ("stocktake", "outlet_id"),
        ("gift_card", "outlet_id"),
        ("promotion_outlet", "outlet_id"),
        ("user_reporting_outlet", "outlet_id"),
        ("security_event", "outlet_id"),
        ("shelf_ticket", "outlet_id"),
        ("external_stocktake", "outlet_id"),
        ("host_connection", "outlet_id"),
        ("buying_period", "outlet_id"),
        ("product_backorder", "outlet_id"),
    ]),
    ("supplier", [
        ("product", "core_supplier_id"),
        ("product_supplier", "supplier_id"),
        ("buying_period", "supplier_id"),
        ("order_product", "supplier_id"),
        ("future_cost", "supplier_id"),
        ("supplier_additional_contact", "supplier_id"),
        ("supplier_authentication", "supplier_id"),
    ]),
    ("transferee", []),
    ("app_user", [
        ("sale", "user_id"),
        ("customer_payment", "user_id"),
        ("register_closure", "user_id"),
        ("stocktake", "completed_by_id"),
        ("purchase_order", "created_by_id"),
        ("purchase_order", "sent_by_id"),
        ("purchase_order", "received_by_id"),
        ("customer_revision", "user_id"),
        ("customer_group_revision", "user_id"),
        ("security_event", "user_id"),
        ("shelf_ticket", "user_id"),
        ("external_stocktake", "user_id"),
        ("host_connection", "user_id"),
        ("future_price", "user_id"),
        ("future_cost", "user_id"),
        ("quick_menu_item", "user_id"),
        ("report", "owner_id"),
    ]),
    ("promotion_category", [
        ("promotion", "promotion_category_id"),
    ]),
    ("integration", [
        ("webhook", "integration_id"),
    ]),
    ("product", [
        ("product_tag", "product_id"),
        ("product_price", "product_id"),
        ("product_inventory", "product_id"),
        ("product_cost", "product_id"),
        ("product_supplier", "product_id"),
        ("product_barcode", "product_id"),
        ("future_price", "product_id"),
        ("future_cost", "product_id"),
        ("sale_item", "product_id"),
        ("order_product", "product_id"),
        ("stocktake_product", "product_id"),
        ("capped_price", "product_id"),
        ("product_backorder", "product_id"),
        ("product_competition_price", "product_id"),
        ("shelf_ticket", "product_id"),
        ("buying_period", "item_id"),
        ("trashed_item", "item_id"),
    ]),
    ("customer", [
        ("customer_email", "customer_id"),
        ("customer_revision", "customer_id"),
        ("customer_payment", "customer_id"),
        ("sale", "customer_id"),
        ("gift_card", "client_id"),
        ("product_backorder", "customer_id"),
        ("vendor_connection", "customer_id"),
    ]),
    ("register", [
        ("sale", "register_id"),
        ("customer_payment", "register_id"),
        ("register_closure", "register_id"),
        ("sale_payment", "register_id"),
        ("gift_card_movement", "register_id"),
        ("security_event", "register_id"),
        ("register_payment_method", "register_id"),
    ]),
    ("promotion", [
        ("promotion_criteria", "promotion_id"),
        ("promotion_customer_group", "promotion_id"),
        ("promotion_outlet", "promotion_id"),
    ]),
    ("ticket_template", [
        ("ticket_template_page", "ticket_template_id"),
    ]),
    ("supplier_additional_contact", []),
    ("supplier_authentication", []),
    ("customer_display", []),
    ("kitchen_screen", []),
    ("sale_keys", []),
    ("push_device", []),
    ("webhook", []),
    ("report", []),
    ("host_connection", [
        ("host_change", "host_connection_id"),
        ("host_identifier", "host_connection_id"),
    ]),
    ("vendor_connection", []),
    ("purchase_order", [
        ("order_product", "order_id"),
        ("order_review", "order_id"),
        ("order_related", "order_id"),
        ("order_related", "related_order_id"),
        ("purchase_order", "merged_into_id"),
        ("product_backorder", "on_order_id"),
    ]),
    ("stocktake", [
        ("stocktake_product", "stocktake_id"),
    ]),
    ("gift_card", [
        ("gift_card_movement", "gift_card_id"),
    ]),
    ("customer_payment", [
        ("customer_payment_allocation", "payment_id"),
        ("sale_payment", "customer_payment_id"),
        ("customer_payment", "relates_to_id"),
    ]),
    ("sale", [
        ("sale_item", "sale_id"),
        ("sale_payment", "sale_id"),
        ("customer_payment_allocation", "sale_id"),
        ("gift_card_movement", "sale_id"),
        ("sale", "linked_sale_id"),
    ]),
    ("register_closure", [
        ("register_closure_payment", "closure_id"),
    ]),
    ("product_price", []),
    ("product_barcode", []),
    ("product_tag", []),
    ("product_supplier", []),
    ("product_inventory", []),
    ("product_cost", []),
    ("customer_email", []),
    ("customer_revision", []),
    ("customer_group_revision", []),
    ("price_list_item", []),
    ("promotion_criteria", []),
    ("promotion_customer_group", []),
    ("promotion_outlet", []),
    ("stocktake_product", []),
    ("order_product", []),
    ("order_review", []),
    ("order_related", []),
    ("sale_item", []),
    ("sale_payment", []),
    ("gift_card_movement", []),
    ("customer_payment_allocation", []),
    ("register_closure_payment", []),
    ("register_payment_method", []),
    ("user_reporting_outlet", []),
    ("role_permission", []),
    ("future_price", []),
    ("future_cost", []),
    ("capped_price", []),
    ("product_backorder", []),
    ("product_competition_price", []),
    ("shelf_ticket", []),
    ("ticket_template_page", []),
    ("buying_period", []),
    ("external_stocktake", []),
    ("host_change", []),
    ("host_identifier", []),
    ("quick_menu_item", []),
    ("security_event", []),
    ("notification", []),
    ("mail_log", []),
    ("trashed_item", []),
    ("settings", []),
]

# Deduplicate while preserving order
seen: set[str] = set()
ordered: list[tuple[str, list[tuple[str, str]]]] = []
for table, refs in TABLES:
    if table in seen:
        continue
    seen.add(table)
    ordered.append((table, refs))

# Polymorphic FK: (table, column, scope_column, scope_value)
POLYMORPHIC: list[tuple[str, str, str, str, str]] = [
    # settings.scope_id depends on scope_type
    ("settings", "scope_id", "scope_type", "vendor", "vendor"),
    ("settings", "scope_id", "scope_type", "outlet", "outlet"),
    ("settings", "scope_id", "scope_type", "register", "register"),
    ("settings", "scope_id", "scope_type", "user", "app_user"),
    # price_list_item.item_id depends on classification_type
    ("price_list_item", "item_id", "classification_type", "product", "product"),
    ("price_list_item", "item_id", "classification_type", "brand", "brand"),
    ("price_list_item", "item_id", "classification_type", "category", "category"),
    ("price_list_item", "item_id", "classification_type", "family", "family"),
    ("price_list_item", "item_id", "classification_type", "tag", "tag"),
    # buying_period.item_id — assume product when item_type is product-like
    ("buying_period", "item_id", "item_type", "product", "product"),
    # purchase_order.from_id / to_id depend on order type
    ("purchase_order", "from_id", "type", "ORDER", "supplier"),
    ("purchase_order", "from_id", "type", "TRANSFER", "outlet"),
    ("purchase_order", "to_id", "type", "ORDER", "outlet"),
    ("purchase_order", "to_id", "type", "TRANSFER", "outlet"),
    ("purchase_order", "to_id", "type", "CREDIT", "outlet"),
]


def emit_polymorphic() -> list[str]:
    lines: list[str] = ["-- Polymorphic FK columns (scoped by type column)", ""]
    for ref_table, col, scope_col, scope_val, target_table in POLYMORPHIC:
        map_name = f"_map_{target_table}"
        lines.extend([
            f"-- {ref_table}.{col} when {scope_col}='{scope_val}' -> {target_table}",
            f"UPDATE `{ref_table}` SET `{col}` = `{col}` + {BIG} "
            f"WHERE `{scope_col}` = '{scope_val}' AND `{col}` IS NOT NULL AND `{col}` > 0;",
            f"UPDATE `{ref_table}` r INNER JOIN {map_name} m "
            f"ON r.`{col}` = m.old_id + {BIG} "
            f"SET r.`{col}` = m.new_id WHERE r.`{scope_col}` = '{scope_val}';",
            "",
        ])
    return lines


def tables_without_id(schema_path: Path, table_names: list[str]) -> set[str]:
    """Tables whose PK is not a single `id` column — skip id renumbering."""
    text = schema_path.read_text(encoding="utf-8")
    skip: set[str] = set()
    for table in table_names:
        m = re.search(rf"CREATE TABLE `{table}`\s*\((.*?)\)\s*ENGINE", text, re.S)
        if not m:
            skip.add(table)
            continue
        pk_m = re.search(r"PRIMARY KEY \(([^)]+)\)", m.group(1))
        if not pk_m:
            skip.add(table)
            continue
        pk_cols = [c.strip().strip("`") for c in pk_m.group(1).split(",")]
        if pk_cols != ["id"]:
            skip.add(table)
    return skip


def emit_renumber(table: str, refs: list[tuple[str, str]]) -> list[str]:
    map_name = f"_map_{table}"
    lines = [
        f"-- {table}",
        f"DROP TEMPORARY TABLE IF EXISTS {map_name};",
        f"CREATE TEMPORARY TABLE {map_name} (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);",
        f"INSERT INTO {map_name} (old_id, new_id)",
        f"SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `{table}`;",
        f"UPDATE `{table}` SET id = id + {BIG};",
    ]
    for ref_table, col in refs:
        lines.append(
            f"UPDATE `{ref_table}` SET `{col}` = `{col}` + {BIG} "
            f"WHERE `{col}` IS NOT NULL AND `{col}` > 0;"
        )
    for ref_table, col in refs:
        lines.append(
            f"UPDATE `{ref_table}` r INNER JOIN {map_name} m "
            f"ON r.`{col}` = m.old_id + {BIG} SET r.`{col}` = m.new_id;"
        )
    lines.append(
        f"UPDATE `{table}` t INNER JOIN {map_name} m "
        f"ON t.id = m.old_id + {BIG} SET t.id = m.new_id;"
    )
    lines.append(
        f"SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `{table}`);"
    )
    lines.append(f"SET @sql = CONCAT('ALTER TABLE `{table}` AUTO_INCREMENT = ', @ai);")
    lines.append("PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;")
    lines.append("")
    return lines


def main():
    schema_path = Path(__file__).resolve().parents[1] / "src/main/resources/db/orithos.sql"
    skip_renumber = tables_without_id(schema_path, [t for t, _ in ordered])

    out: list[str] = [
        "-- Renumber existing BIGINT primary keys to 1, 2, 3, ...",
        "-- Updates all known FK columns. Run once on a backup first.",
        "-- Requires PostgreSQL (ROW_NUMBER). Run after migration_auto_increment.sql.",
        "",
        "SET NAMES utf8mb4;",
        "SET FOREIGN_KEY_CHECKS = 0;",
        "",
    ]
    if skip_renumber:
        out.append(
            "-- Skipped (PK is not single column `id`; FK columns updated via parent tables): "
            + ", ".join(sorted(skip_renumber))
        )
        out.append("")
    processed: set[str] = set()
    for table, refs in ordered:
        if table in processed:
            continue
        processed.add(table)
        if table in skip_renumber:
            out.extend([
                f"-- {table} (PK is not id — skipped)",
                "",
            ])
            continue
        out.extend(emit_renumber(table, refs))

    out.extend(emit_polymorphic())

    out.extend([
        "SET FOREIGN_KEY_CHECKS = 1;",
        "",
        "-- Verify: SELECT id FROM product ORDER BY id; — should start at 1",
    ])

    path = Path(__file__).resolve().parents[1] / "src/main/resources/db/migration_renumber_ids.sql"
    path.write_text("\n".join(out), encoding="utf-8")
    print(f"Wrote {path} ({len(out)} lines, {len(processed)} tables)")


if __name__ == "__main__":
    main()
