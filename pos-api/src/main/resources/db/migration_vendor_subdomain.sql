-- Vendor subdomain multi-tenant (idempotent where practical).
-- Adds vendor.subdomain/status, outlet.vendor_id, app_user.vendor_id.

-- Ensure a default vendor row exists for legacy single-tenant data.
INSERT INTO vendor (id, name, subdomain, status, created_at, updated_at, outlet_id)
SELECT 1, 'Default', 'default', 'active', NOW(), NOW(), 1
WHERE NOT EXISTS (SELECT 1 FROM vendor WHERE id = 1);

-- vendor.subdomain
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor' AND COLUMN_NAME = 'subdomain');
SET @sql := IF(@col = 0,
  'ALTER TABLE `vendor` ADD COLUMN `subdomain` VARCHAR(63) NULL COMMENT ''Public store slug'' AFTER `name`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- vendor.status
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor' AND COLUMN_NAME = 'status');
SET @sql := IF(@col = 0,
  'ALTER TABLE `vendor` ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT ''active'' COMMENT ''trial|active|suspended|expired'' AFTER `subdomain`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE vendor SET subdomain = 'default' WHERE id = 1 AND (subdomain IS NULL OR subdomain = '');
UPDATE vendor SET status = 'active' WHERE id = 1 AND (status IS NULL OR status = '');

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor' AND INDEX_NAME = 'uq_vendor_subdomain');
SET @sql := IF(@idx = 0,
  'ALTER TABLE `vendor` ADD UNIQUE KEY `uq_vendor_subdomain` (`subdomain`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- outlet.vendor_id
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet' AND COLUMN_NAME = 'vendor_id');
SET @sql := IF(@col = 0,
  'ALTER TABLE `outlet` ADD COLUMN `vendor_id` BIGINT NULL COMMENT ''Owning SaaS vendor'' AFTER `id`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE outlet SET vendor_id = 1 WHERE vendor_id IS NULL;

SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet' AND COLUMN_NAME = 'vendor_id');
SET @sql := IF(@col_null = 'YES',
  'ALTER TABLE `outlet` MODIFY COLUMN `vendor_id` BIGINT NOT NULL DEFAULT 1 COMMENT ''Owning SaaS vendor''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet' AND INDEX_NAME = 'idx_outlet_vendor');
SET @sql := IF(@idx = 0,
  'ALTER TABLE `outlet` ADD INDEX `idx_outlet_vendor` (`vendor_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- app_user.vendor_id
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND COLUMN_NAME = 'vendor_id');
SET @sql := IF(@col = 0,
  'ALTER TABLE `app_user` ADD COLUMN `vendor_id` BIGINT NULL COMMENT ''Owning SaaS vendor'' AFTER `id`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE app_user SET vendor_id = 1 WHERE vendor_id IS NULL;

SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND COLUMN_NAME = 'vendor_id');
SET @sql := IF(@col_null = 'YES',
  'ALTER TABLE `app_user` MODIFY COLUMN `vendor_id` BIGINT NOT NULL DEFAULT 1 COMMENT ''Owning SaaS vendor''',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND INDEX_NAME = 'uq_user_username');
SET @sql := IF(@idx > 0,
  'ALTER TABLE `app_user` DROP INDEX `uq_user_username`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND INDEX_NAME = 'uq_user_vendor_username');
SET @sql := IF(@idx = 0,
  'ALTER TABLE `app_user` ADD UNIQUE KEY `uq_user_vendor_username` (`vendor_id`, `username`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND INDEX_NAME = 'idx_app_user_vendor');
SET @sql := IF(@idx = 0,
  'ALTER TABLE `app_user` ADD INDEX `idx_app_user_vendor` (`vendor_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
