-- Add outlet_id as SaaS tenant id on business tables. Safe to re-run.
-- Skips outlet (the tenant entity), permission (global catalog),
-- and junction tables whose PK already includes outlet_id.
--
-- Existing databases (Docker volume already initialized):
--   psql "$POSTGRESQL_URL" -f pos-api/src/main/resources/db/migration_outlet_id_tenant.sql
-- New Docker volumes: compose runs this as 03 after schema + seed.

SET NAMES utf8mb4;

-- Ensure at least one outlet exists for backfill.
INSERT INTO outlet (name)
SELECT 'Main Outlet' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM outlet LIMIT 1);

-- 1) Add nullable column where missing

-- vendor
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `vendor` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- settings
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `settings` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- contact
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `contact` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- tax_rate
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tax_rate');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tax_rate' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `tax_rate` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- payment_method
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_method');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_method' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `payment_method` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- register_payment_method
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_payment_method');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_payment_method' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `register_payment_method` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- receipt
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receipt');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receipt' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `receipt` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- statement
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'statement');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'statement' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `statement` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- transferee
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transferee');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transferee' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `transferee` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- role
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `role` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- role_permission
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role_permission');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role_permission' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `role_permission` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- app_user
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `app_user` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- brand
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brand');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brand' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `brand` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- category
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'category');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'category' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `category` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- family
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'family');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'family' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `family` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- tag
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tag');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tag' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `tag` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- price_set
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_set');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_set' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `price_set` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- barcode_template
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barcode_template');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barcode_template' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `barcode_template` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- supplier
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `supplier` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `product` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_tag
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_tag');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_tag' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `product_tag` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_price
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_price');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_price' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `product_price` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_supplier
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_supplier');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_supplier' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `product_supplier` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_barcode
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_barcode');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_barcode' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `product_barcode` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- future_price
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_price');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_price' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `future_price` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- price_list
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `price_list` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- price_list_item
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list_item');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list_item' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `price_list_item` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer_group
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `customer_group` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `customer` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer_email
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_email');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_email' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `customer_email` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer_revision
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_revision');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_revision' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `customer_revision` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer_group_revision
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group_revision');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group_revision' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `customer_group_revision` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer_payment
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `customer_payment` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sale
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `sale` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sale_item
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_item');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_item' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `sale_item` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sale_payment
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_payment');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_payment' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `sale_payment` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- purchase_order
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `purchase_order` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- order_product
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_product');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_product' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `order_product` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- gift_card_movement
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gift_card_movement');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gift_card_movement' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `gift_card_movement` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- promotion_category
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_category');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_category' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `promotion_category` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- promotion
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `promotion` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- promotion_criteria
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_criteria');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_criteria' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `promotion_criteria` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- promotion_customer_group
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_customer_group');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_customer_group' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `promotion_customer_group` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- stocktake_product
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stocktake_product');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stocktake_product' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `stocktake_product` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- register_closure
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `register_closure` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- register_closure_payment
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure_payment');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure_payment' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `register_closure_payment` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- notification
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `notification` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- mail_log
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mail_log');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mail_log' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `mail_log` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- vendor_connection
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor_connection');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor_connection' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `vendor_connection` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- trashed_item
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trashed_item');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trashed_item' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `trashed_item` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- future_cost
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_cost');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_cost' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `future_cost` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- integration
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'integration');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'integration' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `integration` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- webhook
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webhook');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webhook' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `webhook` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- push_device
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'push_device');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'push_device' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `push_device` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer_display
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_display');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_display' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `customer_display` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sale_keys
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_keys');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_keys' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `sale_keys` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- kitchen_screen
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kitchen_screen');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kitchen_screen' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `kitchen_screen` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ticket_template
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `ticket_template` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ticket_template_page
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template_page');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template_page' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `ticket_template_page` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- report
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `report` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- order_review
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_review');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_review' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `order_review` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- order_related
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_related');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_related' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `order_related` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer_payment_allocation
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment_allocation');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment_allocation' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `customer_payment_allocation` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_competition_price
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_competition_price');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_competition_price' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `product_competition_price` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- host_change
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_change');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_change' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `host_change` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- host_identifier
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_identifier');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_identifier' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `host_identifier` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- quick_menu_item
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quick_menu_item');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quick_menu_item' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `quick_menu_item` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- capped_price
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'capped_price');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'capped_price' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `capped_price` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- supplier_authentication
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_authentication');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_authentication' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `supplier_authentication` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- supplier_additional_contact
SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_additional_contact');
SET @col_exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_additional_contact' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_exists = 0,
  'ALTER TABLE `supplier_additional_contact` ADD COLUMN `outlet_id` BIGINT NULL COMMENT ''SaaS tenant (outlet) id''',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Prefer register/sale lineage over the default outlet.
UPDATE sale s
INNER JOIN register r ON r.id = s.register_id
SET s.outlet_id = r.outlet_id
WHERE s.outlet_id IS NULL AND r.outlet_id IS NOT NULL;

UPDATE sale_item si
INNER JOIN sale s ON s.id = si.sale_id
SET si.outlet_id = s.outlet_id
WHERE si.outlet_id IS NULL AND s.outlet_id IS NOT NULL;

UPDATE sale_payment sp
INNER JOIN sale s ON s.id = sp.sale_id
SET sp.outlet_id = s.outlet_id
WHERE sp.outlet_id IS NULL AND s.outlet_id IS NOT NULL;

UPDATE register_closure rc
INNER JOIN register r ON r.id = rc.register_id
SET rc.outlet_id = r.outlet_id
WHERE rc.outlet_id IS NULL AND r.outlet_id IS NOT NULL;

UPDATE register_closure_payment rcp
INNER JOIN register_closure rc ON rc.id = rcp.closure_id
SET rcp.outlet_id = rc.outlet_id
WHERE rcp.outlet_id IS NULL AND rc.outlet_id IS NOT NULL;

UPDATE register_payment_method rpm
INNER JOIN register r ON r.id = rpm.register_id
SET rpm.outlet_id = r.outlet_id
WHERE rpm.outlet_id IS NULL AND r.outlet_id IS NOT NULL;

UPDATE stocktake_product sp
INNER JOIN stocktake st ON st.id = sp.stocktake_id
SET sp.outlet_id = st.outlet_id
WHERE sp.outlet_id IS NULL AND st.outlet_id IS NOT NULL;

UPDATE gift_card_movement gcm
INNER JOIN gift_card gc ON gc.id = gcm.gift_card_id
SET gcm.outlet_id = gc.outlet_id
WHERE gcm.outlet_id IS NULL AND gc.outlet_id IS NOT NULL;

-- 3) Fill remaining NULLs with the first outlet (existing DBs: typically id=1).
SET @default_outlet := (SELECT id FROM outlet ORDER BY id ASC LIMIT 1);
UPDATE `vendor` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `settings` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `contact` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `tax_rate` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `payment_method` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `register_payment_method` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `receipt` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `statement` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `transferee` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `role` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `role_permission` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `app_user` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `brand` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `category` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `family` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `tag` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `price_set` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `barcode_template` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `supplier` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `product` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `product_tag` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `product_price` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `product_supplier` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `product_barcode` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `future_price` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `price_list` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `price_list_item` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `customer_group` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `customer` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `customer_email` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `customer_revision` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `customer_group_revision` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `customer_payment` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `sale` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `sale_item` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `sale_payment` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `purchase_order` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `order_product` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `gift_card_movement` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `promotion_category` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `promotion` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `promotion_criteria` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `promotion_customer_group` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `stocktake_product` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `register_closure` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `register_closure_payment` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `notification` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `mail_log` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `vendor_connection` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `trashed_item` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `future_cost` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `integration` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `webhook` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `push_device` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `customer_display` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `sale_keys` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `kitchen_screen` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `ticket_template` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `ticket_template_page` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `report` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `order_review` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `order_related` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `customer_payment_allocation` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `product_competition_price` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `host_change` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `host_identifier` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `quick_menu_item` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `capped_price` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `supplier_authentication` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `supplier_additional_contact` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `register` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `user_reporting_outlet` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `product_inventory` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `product_cost` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `gift_card` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `promotion_outlet` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `stocktake` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `security_event` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `shelf_ticket` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `buying_period` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `product_backorder` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `external_stocktake` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;
UPDATE `host_connection` SET outlet_id = @default_outlet WHERE outlet_id IS NULL;

-- 4) Tighten to NOT NULL DEFAULT 1 for future inserts that omit the column.

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `vendor` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `settings` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `contact` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tax_rate');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tax_rate' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `tax_rate` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_method');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_method' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `payment_method` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_payment_method');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_payment_method' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `register_payment_method` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receipt');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receipt' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `receipt` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'statement');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'statement' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `statement` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transferee');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transferee' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `transferee` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `role` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role_permission');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role_permission' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `role_permission` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `app_user` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brand');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brand' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `brand` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'category');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'category' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `category` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'family');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'family' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `family` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tag');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tag' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `tag` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_set');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_set' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `price_set` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barcode_template');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barcode_template' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `barcode_template` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `supplier` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `product` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_tag');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_tag' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `product_tag` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_price');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_price' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `product_price` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_supplier');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_supplier' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `product_supplier` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_barcode');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_barcode' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `product_barcode` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_price');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_price' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `future_price` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `price_list` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list_item');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list_item' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `price_list_item` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `customer_group` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `customer` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_email');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_email' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `customer_email` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_revision');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_revision' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `customer_revision` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group_revision');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group_revision' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `customer_group_revision` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `customer_payment` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `sale` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_item');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_item' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `sale_item` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_payment');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_payment' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `sale_payment` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `purchase_order` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_product');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_product' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `order_product` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gift_card_movement');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gift_card_movement' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `gift_card_movement` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_category');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_category' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `promotion_category` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `promotion` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_criteria');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_criteria' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `promotion_criteria` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_customer_group');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_customer_group' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `promotion_customer_group` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stocktake_product');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stocktake_product' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `stocktake_product` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `register_closure` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure_payment');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure_payment' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `register_closure_payment` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `notification` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mail_log');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mail_log' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `mail_log` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor_connection');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor_connection' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `vendor_connection` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trashed_item');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trashed_item' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `trashed_item` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_cost');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_cost' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `future_cost` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'integration');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'integration' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `integration` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webhook');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webhook' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `webhook` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'push_device');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'push_device' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `push_device` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_display');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_display' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `customer_display` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_keys');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_keys' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `sale_keys` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kitchen_screen');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kitchen_screen' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `kitchen_screen` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `ticket_template` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template_page');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template_page' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `ticket_template_page` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `report` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_review');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_review' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `order_review` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_related');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_related' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `order_related` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment_allocation');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment_allocation' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `customer_payment_allocation` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_competition_price');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_competition_price' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `product_competition_price` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_change');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_change' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `host_change` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_identifier');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_identifier' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `host_identifier` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quick_menu_item');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quick_menu_item' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `quick_menu_item` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'capped_price');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'capped_price' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `capped_price` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_authentication');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_authentication' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `supplier_authentication` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_additional_contact');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_additional_contact' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `supplier_additional_contact` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gift_card');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gift_card' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `gift_card` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stocktake');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stocktake' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `stocktake` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'security_event');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'security_event' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `security_event` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shelf_ticket');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shelf_ticket' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `shelf_ticket` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buying_period');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buying_period' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `buying_period` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_backorder');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_backorder' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `product_backorder` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'external_stocktake');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'external_stocktake' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `external_stocktake` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_connection');
SET @col_null := (SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_connection' AND COLUMN_NAME = 'outlet_id');
SET @sql := IF(@tbl_exists > 0 AND @col_null = 'YES',
  CONCAT('ALTER TABLE `host_connection` MODIFY COLUMN `outlet_id` BIGINT NOT NULL DEFAULT ', IFNULL(@default_outlet, 1), ' COMMENT ''SaaS tenant (outlet) id'''),
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5) Indexes

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor' AND INDEX_NAME = 'idx_vendor_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `vendor` ADD INDEX `idx_vendor_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND INDEX_NAME = 'idx_settings_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `settings` ADD INDEX `idx_settings_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact' AND INDEX_NAME = 'idx_contact_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `contact` ADD INDEX `idx_contact_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tax_rate');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tax_rate' AND INDEX_NAME = 'idx_tax_rate_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `tax_rate` ADD INDEX `idx_tax_rate_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_method');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_method' AND INDEX_NAME = 'idx_payment_method_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `payment_method` ADD INDEX `idx_payment_method_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_payment_method');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_payment_method' AND INDEX_NAME = 'idx_register_payment_method_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `register_payment_method` ADD INDEX `idx_register_payment_method_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receipt');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receipt' AND INDEX_NAME = 'idx_receipt_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `receipt` ADD INDEX `idx_receipt_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'statement');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'statement' AND INDEX_NAME = 'idx_statement_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `statement` ADD INDEX `idx_statement_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transferee');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transferee' AND INDEX_NAME = 'idx_transferee_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `transferee` ADD INDEX `idx_transferee_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role' AND INDEX_NAME = 'idx_role_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `role` ADD INDEX `idx_role_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role_permission');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'role_permission' AND INDEX_NAME = 'idx_role_permission_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `role_permission` ADD INDEX `idx_role_permission_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_user' AND INDEX_NAME = 'idx_app_user_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `app_user` ADD INDEX `idx_app_user_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brand');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'brand' AND INDEX_NAME = 'idx_brand_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `brand` ADD INDEX `idx_brand_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'category');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'category' AND INDEX_NAME = 'idx_category_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `category` ADD INDEX `idx_category_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'family');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'family' AND INDEX_NAME = 'idx_family_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `family` ADD INDEX `idx_family_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tag');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tag' AND INDEX_NAME = 'idx_tag_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `tag` ADD INDEX `idx_tag_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_set');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_set' AND INDEX_NAME = 'idx_price_set_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `price_set` ADD INDEX `idx_price_set_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barcode_template');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'barcode_template' AND INDEX_NAME = 'idx_barcode_template_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `barcode_template` ADD INDEX `idx_barcode_template_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier' AND INDEX_NAME = 'idx_supplier_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `supplier` ADD INDEX `idx_supplier_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product' AND INDEX_NAME = 'idx_product_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `product` ADD INDEX `idx_product_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_tag');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_tag' AND INDEX_NAME = 'idx_product_tag_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `product_tag` ADD INDEX `idx_product_tag_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_price');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_price' AND INDEX_NAME = 'idx_product_price_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `product_price` ADD INDEX `idx_product_price_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_supplier');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_supplier' AND INDEX_NAME = 'idx_product_supplier_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `product_supplier` ADD INDEX `idx_product_supplier_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_barcode');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_barcode' AND INDEX_NAME = 'idx_product_barcode_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `product_barcode` ADD INDEX `idx_product_barcode_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_price');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_price' AND INDEX_NAME = 'idx_future_price_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `future_price` ADD INDEX `idx_future_price_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list' AND INDEX_NAME = 'idx_price_list_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `price_list` ADD INDEX `idx_price_list_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list_item');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'price_list_item' AND INDEX_NAME = 'idx_price_list_item_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `price_list_item` ADD INDEX `idx_price_list_item_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group' AND INDEX_NAME = 'idx_customer_group_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `customer_group` ADD INDEX `idx_customer_group_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer' AND INDEX_NAME = 'idx_customer_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `customer` ADD INDEX `idx_customer_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_email');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_email' AND INDEX_NAME = 'idx_customer_email_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `customer_email` ADD INDEX `idx_customer_email_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_revision');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_revision' AND INDEX_NAME = 'idx_customer_revision_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `customer_revision` ADD INDEX `idx_customer_revision_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group_revision');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_group_revision' AND INDEX_NAME = 'idx_customer_group_revision_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `customer_group_revision` ADD INDEX `idx_customer_group_revision_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment' AND INDEX_NAME = 'idx_customer_payment_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `customer_payment` ADD INDEX `idx_customer_payment_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale' AND INDEX_NAME = 'idx_sale_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `sale` ADD INDEX `idx_sale_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_item');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_item' AND INDEX_NAME = 'idx_sale_item_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `sale_item` ADD INDEX `idx_sale_item_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_payment');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_payment' AND INDEX_NAME = 'idx_sale_payment_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `sale_payment` ADD INDEX `idx_sale_payment_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order' AND INDEX_NAME = 'idx_purchase_order_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `purchase_order` ADD INDEX `idx_purchase_order_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_product');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_product' AND INDEX_NAME = 'idx_order_product_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `order_product` ADD INDEX `idx_order_product_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gift_card_movement');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gift_card_movement' AND INDEX_NAME = 'idx_gift_card_movement_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `gift_card_movement` ADD INDEX `idx_gift_card_movement_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_category');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_category' AND INDEX_NAME = 'idx_promotion_category_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `promotion_category` ADD INDEX `idx_promotion_category_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion' AND INDEX_NAME = 'idx_promotion_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `promotion` ADD INDEX `idx_promotion_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_criteria');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_criteria' AND INDEX_NAME = 'idx_promotion_criteria_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `promotion_criteria` ADD INDEX `idx_promotion_criteria_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_customer_group');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'promotion_customer_group' AND INDEX_NAME = 'idx_promotion_customer_group_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `promotion_customer_group` ADD INDEX `idx_promotion_customer_group_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stocktake_product');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stocktake_product' AND INDEX_NAME = 'idx_stocktake_product_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `stocktake_product` ADD INDEX `idx_stocktake_product_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure' AND INDEX_NAME = 'idx_register_closure_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `register_closure` ADD INDEX `idx_register_closure_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure_payment');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register_closure_payment' AND INDEX_NAME = 'idx_register_closure_payment_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `register_closure_payment` ADD INDEX `idx_register_closure_payment_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification' AND INDEX_NAME = 'idx_notification_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `notification` ADD INDEX `idx_notification_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mail_log');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mail_log' AND INDEX_NAME = 'idx_mail_log_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `mail_log` ADD INDEX `idx_mail_log_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor_connection');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor_connection' AND INDEX_NAME = 'idx_vendor_connection_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `vendor_connection` ADD INDEX `idx_vendor_connection_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trashed_item');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trashed_item' AND INDEX_NAME = 'idx_trashed_item_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `trashed_item` ADD INDEX `idx_trashed_item_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_cost');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'future_cost' AND INDEX_NAME = 'idx_future_cost_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `future_cost` ADD INDEX `idx_future_cost_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'integration');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'integration' AND INDEX_NAME = 'idx_integration_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `integration` ADD INDEX `idx_integration_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webhook');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webhook' AND INDEX_NAME = 'idx_webhook_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `webhook` ADD INDEX `idx_webhook_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'push_device');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'push_device' AND INDEX_NAME = 'idx_push_device_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `push_device` ADD INDEX `idx_push_device_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_display');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_display' AND INDEX_NAME = 'idx_customer_display_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `customer_display` ADD INDEX `idx_customer_display_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_keys');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sale_keys' AND INDEX_NAME = 'idx_sale_keys_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `sale_keys` ADD INDEX `idx_sale_keys_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kitchen_screen');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kitchen_screen' AND INDEX_NAME = 'idx_kitchen_screen_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `kitchen_screen` ADD INDEX `idx_kitchen_screen_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template' AND INDEX_NAME = 'idx_ticket_template_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `ticket_template` ADD INDEX `idx_ticket_template_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template_page');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket_template_page' AND INDEX_NAME = 'idx_ticket_template_page_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `ticket_template_page` ADD INDEX `idx_ticket_template_page_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report' AND INDEX_NAME = 'idx_report_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `report` ADD INDEX `idx_report_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_review');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_review' AND INDEX_NAME = 'idx_order_review_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `order_review` ADD INDEX `idx_order_review_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_related');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_related' AND INDEX_NAME = 'idx_order_related_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `order_related` ADD INDEX `idx_order_related_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment_allocation');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customer_payment_allocation' AND INDEX_NAME = 'idx_customer_payment_allocation_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `customer_payment_allocation` ADD INDEX `idx_customer_payment_allocation_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_competition_price');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_competition_price' AND INDEX_NAME = 'idx_product_competition_price_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `product_competition_price` ADD INDEX `idx_product_competition_price_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_change');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_change' AND INDEX_NAME = 'idx_host_change_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `host_change` ADD INDEX `idx_host_change_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_identifier');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_identifier' AND INDEX_NAME = 'idx_host_identifier_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `host_identifier` ADD INDEX `idx_host_identifier_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quick_menu_item');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quick_menu_item' AND INDEX_NAME = 'idx_quick_menu_item_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `quick_menu_item` ADD INDEX `idx_quick_menu_item_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'capped_price');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'capped_price' AND INDEX_NAME = 'idx_capped_price_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `capped_price` ADD INDEX `idx_capped_price_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_authentication');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_authentication' AND INDEX_NAME = 'idx_supplier_authentication_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `supplier_authentication` ADD INDEX `idx_supplier_authentication_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_additional_contact');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_additional_contact' AND INDEX_NAME = 'idx_supplier_additional_contact_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `supplier_additional_contact` ADD INDEX `idx_supplier_additional_contact_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'register' AND INDEX_NAME = 'idx_register_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `register` ADD INDEX `idx_register_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gift_card');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gift_card' AND INDEX_NAME = 'idx_gift_card_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `gift_card` ADD INDEX `idx_gift_card_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stocktake');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stocktake' AND INDEX_NAME = 'idx_stocktake_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `stocktake` ADD INDEX `idx_stocktake_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'security_event');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'security_event' AND INDEX_NAME = 'idx_security_event_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `security_event` ADD INDEX `idx_security_event_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shelf_ticket');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shelf_ticket' AND INDEX_NAME = 'idx_shelf_ticket_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `shelf_ticket` ADD INDEX `idx_shelf_ticket_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buying_period');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buying_period' AND INDEX_NAME = 'idx_buying_period_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `buying_period` ADD INDEX `idx_buying_period_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_backorder');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_backorder' AND INDEX_NAME = 'idx_product_backorder_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `product_backorder` ADD INDEX `idx_product_backorder_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'external_stocktake');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'external_stocktake' AND INDEX_NAME = 'idx_external_stocktake_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `external_stocktake` ADD INDEX `idx_external_stocktake_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_connection');
SET @idx_exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'host_connection' AND INDEX_NAME = 'idx_host_connection_outlet');
SET @sql := IF(@tbl_exists > 0 AND @idx_exists = 0,
  'ALTER TABLE `host_connection` ADD INDEX `idx_host_connection_outlet` (`outlet_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
