-- Customer email uniqueness among active (non-deleted) customers only.
--
-- customer_deleted_at mirrors customer.deleted_at so active_email can be NULL
-- for soft-deleted customers, allowing email reuse.
--
-- If the unique index step fails due to duplicate active emails, resolve them first:
--   SELECT LOWER(TRIM(ce.email)) AS e, COUNT(DISTINCT ce.customer_id) cnt
--   FROM customer_email ce
--   INNER JOIN customer c ON c.id = ce.customer_id AND c.deleted_at IS NULL
--   GROUP BY LOWER(TRIM(ce.email))
--   HAVING cnt > 1;

SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'customer_email'
    AND COLUMN_NAME = 'customer_deleted_at'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE customer_email ADD COLUMN customer_deleted_at DATETIME NULL AFTER sort_order',
  'SELECT ''Column customer_deleted_at already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE customer_email ce
INNER JOIN customer c ON c.id = ce.customer_id
SET ce.customer_deleted_at = c.deleted_at
WHERE ce.customer_deleted_at IS NULL OR ce.customer_deleted_at <> c.deleted_at;

SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'customer_email'
    AND COLUMN_NAME = 'active_email'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE customer_email ADD COLUMN active_email VARCHAR(255) GENERATED ALWAYS AS (IF(customer_deleted_at IS NULL, LOWER(TRIM(email)), NULL)) STORED AFTER customer_deleted_at',
  'SELECT ''Column active_email already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'customer_email'
    AND INDEX_NAME = 'uq_customer_email_active'
);

SET @sql = IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX uq_customer_email_active ON customer_email (active_email)',
  'SELECT ''Index uq_customer_email_active already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
