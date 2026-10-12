-- Add product.show_shortcuts (default off). Safe to re-run.

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product'
    AND COLUMN_NAME = 'show_shortcuts'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `product` ADD COLUMN `show_shortcuts` tinyint(1) NOT NULL DEFAULT 0 COMMENT ''是否在收银屏显示快捷键'' AFTER `request_price`',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
