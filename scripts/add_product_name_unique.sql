-- Product name uniqueness among active (non-deleted) rows only.
--
-- 1. idx_product_name must be a NON-UNIQUE index (for search). If it was
--    accidentally created as UNIQUE, drop and recreate it.
-- 2. active_name generated column + uq_product_active_name enforce uniqueness
--    case-insensitively for rows where deleted_at IS NULL.
--
-- If step 2 fails due to duplicate active names, resolve them first:
--   SELECT LOWER(TRIM(name)) AS n, COUNT(*) c
--   FROM product WHERE deleted_at IS NULL
--   GROUP BY LOWER(TRIM(name)) HAVING c > 1;

-- ---- Fix idx_product_name: must NOT be unique ----
SET @name_idx_non_unique = (
  SELECT NON_UNIQUE
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product'
    AND INDEX_NAME = 'idx_product_name'
  LIMIT 1
);

SET @sql = IF(
  @name_idx_non_unique = 0,
  'ALTER TABLE product DROP INDEX idx_product_name, ADD INDEX idx_product_name (name)',
  IF(
    @name_idx_non_unique IS NULL,
    'ALTER TABLE product ADD INDEX idx_product_name (name)',
    'SELECT ''idx_product_name already non-unique'' AS message'
  )
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---- active_name generated column ----
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product'
    AND COLUMN_NAME = 'active_name'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE product ADD COLUMN active_name VARCHAR(255) GENERATED ALWAYS AS (IF(deleted_at IS NULL, LOWER(TRIM(name)), NULL)) STORED AFTER deleted_at',
  'SELECT ''Column active_name already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---- unique index on active_name ----
SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product'
    AND INDEX_NAME = 'uq_product_active_name'
);

SET @sql = IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX uq_product_active_name ON product (active_name)',
  'SELECT ''Index uq_product_active_name already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
