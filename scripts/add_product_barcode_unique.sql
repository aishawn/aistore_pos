-- Ensure product_barcode.code has a unique index (global barcode uniqueness).
--
-- If this fails due to duplicate codes, resolve them first:
--   SELECT code, COUNT(*) c FROM product_barcode GROUP BY code HAVING c > 1;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_barcode'
    AND INDEX_NAME = 'uq_barcode_code'
);

SET @sql = IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX uq_barcode_code ON product_barcode (code)',
  'SELECT ''Index uq_barcode_code already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
