-- Enforce product_price.quantity: must be greater than zero.
--
-- If step 2 fails, inspect invalid rows first:
--   SELECT id, product_id, quantity FROM product_price WHERE quantity <= 0;

-- ---- Backfill invalid values ----
UPDATE product_price
SET quantity = 1
WHERE quantity IS NULL OR quantity <= 0;

-- ---- CHECK constraint ----
SET @chk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_price'
    AND CONSTRAINT_NAME = 'chk_product_price_quantity_positive'
    AND CONSTRAINT_TYPE = 'CHECK'
);

SET @sql = IF(
  @chk_exists = 0,
  'ALTER TABLE product_price ADD CONSTRAINT chk_product_price_quantity_positive CHECK (quantity > 0)',
  'SELECT ''Constraint chk_product_price_quantity_positive already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---- future_price (same rule) ----
UPDATE future_price
SET quantity = 1
WHERE quantity IS NULL OR quantity <= 0;

SET @chk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'future_price'
    AND CONSTRAINT_NAME = 'chk_future_price_quantity_positive'
    AND CONSTRAINT_TYPE = 'CHECK'
);

SET @sql = IF(
  @chk_exists = 0,
  'ALTER TABLE future_price ADD CONSTRAINT chk_future_price_quantity_positive CHECK (quantity > 0)',
  'SELECT ''Constraint chk_future_price_quantity_positive already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
