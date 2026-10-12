from pathlib import Path

add_tables = """
vendor settings contact tax_rate payment_method register_payment_method receipt statement transferee role role_permission app_user brand category family tag price_set barcode_template supplier product product_tag product_price product_supplier product_barcode future_price price_list price_list_item customer_group customer customer_email customer_revision customer_group_revision customer_payment sale sale_item sale_payment purchase_order order_product gift_card_movement promotion_category promotion promotion_criteria promotion_customer_group stocktake_product register_closure register_closure_payment notification mail_log vendor_connection trashed_item future_cost integration webhook push_device customer_display sale_keys kitchen_screen ticket_template ticket_template_page report order_review order_related customer_payment_allocation product_competition_price host_change host_identifier quick_menu_item capped_price supplier_authentication supplier_additional_contact
""".split()

existing = """
register user_reporting_outlet product_inventory product_cost gift_card promotion_outlet stocktake security_event shelf_ticket buying_period product_backorder external_stocktake host_connection
""".split()

all_backfill = add_tables + existing

skip_modify = {
    "user_reporting_outlet",
    "promotion_outlet",
    "product_inventory",
    "product_cost",
    "register",
}

skip_index = {
    "user_reporting_outlet",
    "promotion_outlet",
    "product_inventory",
    "product_cost",
}


def add_block(t: str) -> str:
    return f"""
-- {t}
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{t}');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{t}' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `{t}` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
"""


def idx_block(t: str) -> str:
    idx = f"idx_{t}_outlet"[:64]
    return f"""
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{t}');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{t}' AND INDEX_NAME = '{idx}');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `{t}` ADD INDEX `{idx}` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
"""


parts: list[str] = []
parts.append(
    """-- Add outlet_id as SaaS tenant id on business tables. Safe to re-run.
-- Skips outlet (the tenant entity), permission (global catalog),
-- and junction tables whose PK already includes outlet_id.

SET NAMES utf8mb4;

-- Ensure at least one outlet exists for backfill.
INSERT INTO outlet (name)
SELECT 'Main Outlet' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM outlet LIMIT 1);

"""
)
parts.append("-- 1) Add nullable column where missing\n")
for t in add_tables:
    parts.append(add_block(t))

parts.append(
    """
-- 2) Prefer register/sale lineage over the default outlet.
UPDATE sale s
INNER JOIN register r ON r.id = s.register_id
SET s.outlet_id = r.outlet_id
WHERE s.outlet_id IS NULL AND r.outlet_id IS NOT NULL;

UPDATE sale_item si
INNER JOIN sale s ON s.id = si.sale_id
SET si.outlet_id = s.outlet_id
WHERE si.outlet_id IS NULL AND s.outlet_id IS NOT NULL;

UPDATE sale_payment sp
INNER JOIN sale s ON s.id = sp.sale_id
SET sp.outlet_id = s.outlet_id
WHERE sp.outlet_id IS NULL AND s.outlet_id IS NOT NULL;

UPDATE register_closure rc
INNER JOIN register r ON r.id = rc.register_id
SET rc.outlet_id = r.outlet_id
WHERE rc.outlet_id IS NULL AND r.outlet_id IS NOT NULL;

UPDATE register_closure_payment rcp
INNER JOIN register_closure rc ON rc.id = rcp.closure_id
SET rcp.outlet_id = rc.outlet_id
WHERE rcp.outlet_id IS NULL AND rc.outlet_id IS NOT NULL;

UPDATE register_payment_method rpm
INNER JOIN register r ON r.id = rpm.register_id
SET rpm.outlet_id = r.outlet_id
WHERE rpm.outlet_id IS NULL AND r.outlet_id IS NOT NULL;

UPDATE stocktake_product sp
INNER JOIN stocktake st ON st.id = sp.stocktake_id
SET sp.outlet_id = st.outlet_id
WHERE sp.outlet_id IS NULL AND st.outlet_id IS NOT NULL;

UPDATE gift_card_movement gcm
INNER JOIN gift_card gc ON gc.id = gcm.gift_card_id
SET gcm.outlet_id = gc.outlet_id
WHERE gcm.outlet_id IS NULL AND gc.outlet_id IS NOT NULL;

-- 3) Fill remaining NULLs with the first outlet (existing DBs: typically id=1).
SET @default_outlet := (SELECT id FROM outlet ORDER BY id ASC LIMIT 1);
"""
)
for t in all_backfill:
    parts.append(f"UPDATE `{t}` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;\n")

parts.append(
    """
-- 4) Tighten to NOT NULL DEFAULT 1 for future inserts that omit the column.
"""
)
for t in add_tables + existing:
    if t in skip_modify:
        continue
    parts.append(
        f"""
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{t}');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{t}' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `{t}` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
"""
    )

parts.append("\n-- 5) Indexes\n")
for t in add_tables + existing:
    if t in skip_index:
        continue
    parts.append(idx_block(t))

path = Path(__file__).resolve().parents[1] / "src/main/resources/db/migration_outlet_id_tenant.sql"
path.write_text("".join(parts), encoding="utf-8")
print("wrote", path, "bytes", path.stat().st_size, "add", len(add_tables), "existing", len(existing))
