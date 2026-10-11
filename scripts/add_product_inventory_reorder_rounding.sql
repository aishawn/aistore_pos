-- Add reorder_rounding to product_inventory for per-outlet reorder rounding settings.
-- Compatible with MySQL 5.7+ (does not use ADD COLUMN IF NOT EXISTS).

SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_inventory'
    AND COLUMN_NAME = 'reorder_rounding'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE product_inventory ADD COLUMN reorder_rounding VARCHAR(32) NULL DEFAULT ''NONE'' AFTER max_quantity',
  'SELECT ''Column reorder_rounding already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
