-- Enforce product.case_quantity: required and must be greater than zero.
--
-- If step 3 fails due to invalid rows, inspect them first:
--   SELECT id, name, case_quantity FROM product
--   WHERE case_quantity IS NULL OR case_quantity <= 0;

-- ---- Backfill invalid / missing values ----
UPDATE product
SET case_quantity = 1
WHERE case_quantity IS NULL OR case_quantity <= 0;

-- ---- NOT NULL column ----
SET @col_nullable = (
  SELECT IS_NULLABLE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product'
    AND COLUMN_NAME = 'case_quantity'
  LIMIT 1
);

SET @sql = IF(
  @col_nullable = 'YES',
  'ALTER TABLE product MODIFY case_quantity DECIMAL(14,4) NOT NULL COMMENT ''箱规（每箱数量，必须大于 0）''',
  'SELECT ''Column product.case_quantity already NOT NULL'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---- CHECK constraint ----
SET @chk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product'
    AND CONSTRAINT_NAME = 'chk_product_case_quantity_positive'
    AND CONSTRAINT_TYPE = 'CHECK'
);

SET @sql = IF(
  @chk_exists = 0,
  'ALTER TABLE product ADD CONSTRAINT chk_product_case_quantity_positive CHECK (case_quantity > 0)',
  'SELECT ''Constraint chk_product_case_quantity_positive already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
