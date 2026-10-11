-- Customer code uniqueness among active (non-deleted) rows only.
--
-- active_code generated column + uq_customer_active_code enforce uniqueness
-- case-insensitively for rows where deleted_at IS NULL.
--
-- If step 2 fails due to duplicate active codes, resolve them first:
--   SELECT LOWER(TRIM(code)) AS c, COUNT(*) cnt
--   FROM customer WHERE deleted_at IS NULL AND code IS NOT NULL AND TRIM(code) <> ''
--   GROUP BY LOWER(TRIM(code)) HAVING cnt > 1;

SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'customer'
    AND COLUMN_NAME = 'active_code'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE customer ADD COLUMN active_code VARCHAR(64) GENERATED ALWAYS AS (IF(deleted_at IS NULL, LOWER(TRIM(code)), NULL)) STORED AFTER deleted_at',
  'SELECT ''Column active_code already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'customer'
    AND INDEX_NAME = 'uq_customer_active_code'
);

SET @sql = IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX uq_customer_active_code ON customer (active_code)',
  'SELECT ''Index uq_customer_active_code already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
