-- Add receipt print flags for customer groups (run on existing databases).
-- Safe to re-run: skips columns that already exist.

SET @db = DATABASE();

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'customer_group' AND COLUMN_NAME = 'auto_print_parked_receipt') = 0,
  'ALTER TABLE customer_group ADD COLUMN auto_print_parked_receipt TINYINT(1) NOT NULL DEFAULT 0 AFTER auto_print_receipt',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'customer_group' AND COLUMN_NAME = 'auto_print_payment_receipt') = 0,
  'ALTER TABLE customer_group ADD COLUMN auto_print_payment_receipt TINYINT(1) NOT NULL DEFAULT 0 AFTER auto_email_receipt',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
