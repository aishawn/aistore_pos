-- Renumber existing BIGINT primary keys to 1, 2, 3, ...
-- Updates all known FK columns. Run once on a backup first.
-- Requires PostgreSQL (ROW_NUMBER). Run after migration_auto_increment.sql.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Skipped (PK is not single column `id`; FK columns updated via parent tables): product_cost, product_inventory, product_tag, promotion_customer_group, promotion_outlet, register_payment_method, role_permission, supplier_authentication, user_reporting_outlet

-- tax_rate
DROP TEMPORARY TABLE IF EXISTS _map_tax_rate;
CREATE TEMPORARY TABLE _map_tax_rate (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_tax_rate (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `tax_rate`;
UPDATE `tax_rate` SET id = id + 9000000000000;
UPDATE `vendor` SET `default_tax_rate_id` = `default_tax_rate_id` + 9000000000000 WHERE `default_tax_rate_id` IS NOT NULL AND `default_tax_rate_id` > 0;
UPDATE `product` SET `tax_rate_id` = `tax_rate_id` + 9000000000000 WHERE `tax_rate_id` IS NOT NULL AND `tax_rate_id` > 0;
UPDATE `product` SET `cost_tax_rate_id` = `cost_tax_rate_id` + 9000000000000 WHERE `cost_tax_rate_id` IS NOT NULL AND `cost_tax_rate_id` > 0;
UPDATE `supplier` SET `freight_tax_id` = `freight_tax_id` + 9000000000000 WHERE `freight_tax_id` IS NOT NULL AND `freight_tax_id` > 0;
UPDATE `supplier` SET `fees_tax_id` = `fees_tax_id` + 9000000000000 WHERE `fees_tax_id` IS NOT NULL AND `fees_tax_id` > 0;
UPDATE `vendor` r INNER JOIN _map_tax_rate m ON r.`default_tax_rate_id` = m.old_id + 9000000000000 SET r.`default_tax_rate_id` = m.new_id;
UPDATE `product` r INNER JOIN _map_tax_rate m ON r.`tax_rate_id` = m.old_id + 9000000000000 SET r.`tax_rate_id` = m.new_id;
UPDATE `product` r INNER JOIN _map_tax_rate m ON r.`cost_tax_rate_id` = m.old_id + 9000000000000 SET r.`cost_tax_rate_id` = m.new_id;
UPDATE `supplier` r INNER JOIN _map_tax_rate m ON r.`freight_tax_id` = m.old_id + 9000000000000 SET r.`freight_tax_id` = m.new_id;
UPDATE `supplier` r INNER JOIN _map_tax_rate m ON r.`fees_tax_id` = m.old_id + 9000000000000 SET r.`fees_tax_id` = m.new_id;
UPDATE `tax_rate` t INNER JOIN _map_tax_rate m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `tax_rate`);
SET @sql = CONCAT('ALTER TABLE `tax_rate` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payment_method
DROP TEMPORARY TABLE IF EXISTS _map_payment_method;
CREATE TEMPORARY TABLE _map_payment_method (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_payment_method (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `payment_method`;
UPDATE `payment_method` SET id = id + 9000000000000;
UPDATE `register_payment_method` SET `payment_method_id` = `payment_method_id` + 9000000000000 WHERE `payment_method_id` IS NOT NULL AND `payment_method_id` > 0;
UPDATE `customer_payment` SET `payment_method_id` = `payment_method_id` + 9000000000000 WHERE `payment_method_id` IS NOT NULL AND `payment_method_id` > 0;
UPDATE `sale_payment` SET `payment_method_id` = `payment_method_id` + 9000000000000 WHERE `payment_method_id` IS NOT NULL AND `payment_method_id` > 0;
UPDATE `register_closure_payment` SET `payment_method_id` = `payment_method_id` + 9000000000000 WHERE `payment_method_id` IS NOT NULL AND `payment_method_id` > 0;
UPDATE `payment_method` SET `cashout_method_id` = `cashout_method_id` + 9000000000000 WHERE `cashout_method_id` IS NOT NULL AND `cashout_method_id` > 0;
UPDATE `register_payment_method` r INNER JOIN _map_payment_method m ON r.`payment_method_id` = m.old_id + 9000000000000 SET r.`payment_method_id` = m.new_id;
UPDATE `customer_payment` r INNER JOIN _map_payment_method m ON r.`payment_method_id` = m.old_id + 9000000000000 SET r.`payment_method_id` = m.new_id;
UPDATE `sale_payment` r INNER JOIN _map_payment_method m ON r.`payment_method_id` = m.old_id + 9000000000000 SET r.`payment_method_id` = m.new_id;
UPDATE `register_closure_payment` r INNER JOIN _map_payment_method m ON r.`payment_method_id` = m.old_id + 9000000000000 SET r.`payment_method_id` = m.new_id;
UPDATE `payment_method` r INNER JOIN _map_payment_method m ON r.`cashout_method_id` = m.old_id + 9000000000000 SET r.`cashout_method_id` = m.new_id;
UPDATE `payment_method` t INNER JOIN _map_payment_method m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `payment_method`);
SET @sql = CONCAT('ALTER TABLE `payment_method` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- receipt
DROP TEMPORARY TABLE IF EXISTS _map_receipt;
CREATE TEMPORARY TABLE _map_receipt (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_receipt (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `receipt`;
UPDATE `receipt` SET id = id + 9000000000000;
UPDATE `customer_group` SET `default_receipt_id` = `default_receipt_id` + 9000000000000 WHERE `default_receipt_id` IS NOT NULL AND `default_receipt_id` > 0;
UPDATE `customer_group` SET `email_receipt_id` = `email_receipt_id` + 9000000000000 WHERE `email_receipt_id` IS NOT NULL AND `email_receipt_id` > 0;
UPDATE `customer_group` SET `payment_receipt_id` = `payment_receipt_id` + 9000000000000 WHERE `payment_receipt_id` IS NOT NULL AND `payment_receipt_id` > 0;
UPDATE `customer_group` r INNER JOIN _map_receipt m ON r.`default_receipt_id` = m.old_id + 9000000000000 SET r.`default_receipt_id` = m.new_id;
UPDATE `customer_group` r INNER JOIN _map_receipt m ON r.`email_receipt_id` = m.old_id + 9000000000000 SET r.`email_receipt_id` = m.new_id;
UPDATE `customer_group` r INNER JOIN _map_receipt m ON r.`payment_receipt_id` = m.old_id + 9000000000000 SET r.`payment_receipt_id` = m.new_id;
UPDATE `receipt` t INNER JOIN _map_receipt m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `receipt`);
SET @sql = CONCAT('ALTER TABLE `receipt` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- statement
DROP TEMPORARY TABLE IF EXISTS _map_statement;
CREATE TEMPORARY TABLE _map_statement (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_statement (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `statement`;
UPDATE `statement` SET id = id + 9000000000000;
UPDATE `customer_group` SET `statement_template_id` = `statement_template_id` + 9000000000000 WHERE `statement_template_id` IS NOT NULL AND `statement_template_id` > 0;
UPDATE `customer_group` r INNER JOIN _map_statement m ON r.`statement_template_id` = m.old_id + 9000000000000 SET r.`statement_template_id` = m.new_id;
UPDATE `statement` t INNER JOIN _map_statement m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `statement`);
SET @sql = CONCAT('ALTER TABLE `statement` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- brand
DROP TEMPORARY TABLE IF EXISTS _map_brand;
CREATE TEMPORARY TABLE _map_brand (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_brand (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `brand`;
UPDATE `brand` SET id = id + 9000000000000;
UPDATE `product` SET `brand_id` = `brand_id` + 9000000000000 WHERE `brand_id` IS NOT NULL AND `brand_id` > 0;
UPDATE `product` r INNER JOIN _map_brand m ON r.`brand_id` = m.old_id + 9000000000000 SET r.`brand_id` = m.new_id;
UPDATE `brand` t INNER JOIN _map_brand m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `brand`);
SET @sql = CONCAT('ALTER TABLE `brand` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- category
DROP TEMPORARY TABLE IF EXISTS _map_category;
CREATE TEMPORARY TABLE _map_category (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_category (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `category`;
UPDATE `category` SET id = id + 9000000000000;
UPDATE `product` SET `category_id` = `category_id` + 9000000000000 WHERE `category_id` IS NOT NULL AND `category_id` > 0;
UPDATE `product` r INNER JOIN _map_category m ON r.`category_id` = m.old_id + 9000000000000 SET r.`category_id` = m.new_id;
UPDATE `category` t INNER JOIN _map_category m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `category`);
SET @sql = CONCAT('ALTER TABLE `category` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- family
DROP TEMPORARY TABLE IF EXISTS _map_family;
CREATE TEMPORARY TABLE _map_family (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_family (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `family`;
UPDATE `family` SET id = id + 9000000000000;
UPDATE `product` SET `family_id` = `family_id` + 9000000000000 WHERE `family_id` IS NOT NULL AND `family_id` > 0;
UPDATE `product` r INNER JOIN _map_family m ON r.`family_id` = m.old_id + 9000000000000 SET r.`family_id` = m.new_id;
UPDATE `family` t INNER JOIN _map_family m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `family`);
SET @sql = CONCAT('ALTER TABLE `family` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tag
DROP TEMPORARY TABLE IF EXISTS _map_tag;
CREATE TEMPORARY TABLE _map_tag (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_tag (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `tag`;
UPDATE `tag` SET id = id + 9000000000000;
UPDATE `product_tag` SET `tag_id` = `tag_id` + 9000000000000 WHERE `tag_id` IS NOT NULL AND `tag_id` > 0;
UPDATE `product_tag` r INNER JOIN _map_tag m ON r.`tag_id` = m.old_id + 9000000000000 SET r.`tag_id` = m.new_id;
UPDATE `tag` t INNER JOIN _map_tag m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `tag`);
SET @sql = CONCAT('ALTER TABLE `tag` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- price_set
DROP TEMPORARY TABLE IF EXISTS _map_price_set;
CREATE TEMPORARY TABLE _map_price_set (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_price_set (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `price_set`;
UPDATE `price_set` SET id = id + 9000000000000;
UPDATE `outlet` SET `ticketing_price_set_id` = `ticketing_price_set_id` + 9000000000000 WHERE `ticketing_price_set_id` IS NOT NULL AND `ticketing_price_set_id` > 0;
UPDATE `product_price` SET `price_set_id` = `price_set_id` + 9000000000000 WHERE `price_set_id` IS NOT NULL AND `price_set_id` > 0;
UPDATE `future_price` SET `price_set_id` = `price_set_id` + 9000000000000 WHERE `price_set_id` IS NOT NULL AND `price_set_id` > 0;
UPDATE `host_connection` SET `price_set_id` = `price_set_id` + 9000000000000 WHERE `price_set_id` IS NOT NULL AND `price_set_id` > 0;
UPDATE `price_set` SET `parent_id` = `parent_id` + 9000000000000 WHERE `parent_id` IS NOT NULL AND `parent_id` > 0;
UPDATE `outlet` r INNER JOIN _map_price_set m ON r.`ticketing_price_set_id` = m.old_id + 9000000000000 SET r.`ticketing_price_set_id` = m.new_id;
UPDATE `product_price` r INNER JOIN _map_price_set m ON r.`price_set_id` = m.old_id + 9000000000000 SET r.`price_set_id` = m.new_id;
UPDATE `future_price` r INNER JOIN _map_price_set m ON r.`price_set_id` = m.old_id + 9000000000000 SET r.`price_set_id` = m.new_id;
UPDATE `host_connection` r INNER JOIN _map_price_set m ON r.`price_set_id` = m.old_id + 9000000000000 SET r.`price_set_id` = m.new_id;
UPDATE `price_set` r INNER JOIN _map_price_set m ON r.`parent_id` = m.old_id + 9000000000000 SET r.`parent_id` = m.new_id;
UPDATE `price_set` t INNER JOIN _map_price_set m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `price_set`);
SET @sql = CONCAT('ALTER TABLE `price_set` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- price_list
DROP TEMPORARY TABLE IF EXISTS _map_price_list;
CREATE TEMPORARY TABLE _map_price_list (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_price_list (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `price_list`;
UPDATE `price_list` SET id = id + 9000000000000;
UPDATE `customer_group` SET `price_list_id` = `price_list_id` + 9000000000000 WHERE `price_list_id` IS NOT NULL AND `price_list_id` > 0;
UPDATE `customer` SET `price_list_id` = `price_list_id` + 9000000000000 WHERE `price_list_id` IS NOT NULL AND `price_list_id` > 0;
UPDATE `price_list_item` SET `price_list_id` = `price_list_id` + 9000000000000 WHERE `price_list_id` IS NOT NULL AND `price_list_id` > 0;
UPDATE `customer_group` r INNER JOIN _map_price_list m ON r.`price_list_id` = m.old_id + 9000000000000 SET r.`price_list_id` = m.new_id;
UPDATE `customer` r INNER JOIN _map_price_list m ON r.`price_list_id` = m.old_id + 9000000000000 SET r.`price_list_id` = m.new_id;
UPDATE `price_list_item` r INNER JOIN _map_price_list m ON r.`price_list_id` = m.old_id + 9000000000000 SET r.`price_list_id` = m.new_id;
UPDATE `price_list` t INNER JOIN _map_price_list m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `price_list`);
SET @sql = CONCAT('ALTER TABLE `price_list` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- barcode_template
DROP TEMPORARY TABLE IF EXISTS _map_barcode_template;
CREATE TEMPORARY TABLE _map_barcode_template (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_barcode_template (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `barcode_template`;
UPDATE `barcode_template` SET id = id + 9000000000000;
UPDATE `product_barcode` SET `template_id` = `template_id` + 9000000000000 WHERE `template_id` IS NOT NULL AND `template_id` > 0;
UPDATE `product_barcode` r INNER JOIN _map_barcode_template m ON r.`template_id` = m.old_id + 9000000000000 SET r.`template_id` = m.new_id;
UPDATE `barcode_template` t INNER JOIN _map_barcode_template m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `barcode_template`);
SET @sql = CONCAT('ALTER TABLE `barcode_template` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- role
DROP TEMPORARY TABLE IF EXISTS _map_role;
CREATE TEMPORARY TABLE _map_role (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_role (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `role`;
UPDATE `role` SET id = id + 9000000000000;
UPDATE `app_user` SET `role_id` = `role_id` + 9000000000000 WHERE `role_id` IS NOT NULL AND `role_id` > 0;
UPDATE `role_permission` SET `role_id` = `role_id` + 9000000000000 WHERE `role_id` IS NOT NULL AND `role_id` > 0;
UPDATE `app_user` r INNER JOIN _map_role m ON r.`role_id` = m.old_id + 9000000000000 SET r.`role_id` = m.new_id;
UPDATE `role_permission` r INNER JOIN _map_role m ON r.`role_id` = m.old_id + 9000000000000 SET r.`role_id` = m.new_id;
UPDATE `role` t INNER JOIN _map_role m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `role`);
SET @sql = CONCAT('ALTER TABLE `role` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- contact
DROP TEMPORARY TABLE IF EXISTS _map_contact;
CREATE TEMPORARY TABLE _map_contact (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_contact (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `contact`;
UPDATE `contact` SET id = id + 9000000000000;
UPDATE `outlet` SET `contact_id` = `contact_id` + 9000000000000 WHERE `contact_id` IS NOT NULL AND `contact_id` > 0;
UPDATE `supplier` SET `contact_id` = `contact_id` + 9000000000000 WHERE `contact_id` IS NOT NULL AND `contact_id` > 0;
UPDATE `transferee` SET `contact_id` = `contact_id` + 9000000000000 WHERE `contact_id` IS NOT NULL AND `contact_id` > 0;
UPDATE `customer` SET `billing_contact_id` = `billing_contact_id` + 9000000000000 WHERE `billing_contact_id` IS NOT NULL AND `billing_contact_id` > 0;
UPDATE `customer` SET `delivery_contact_id` = `delivery_contact_id` + 9000000000000 WHERE `delivery_contact_id` IS NOT NULL AND `delivery_contact_id` > 0;
UPDATE `outlet` r INNER JOIN _map_contact m ON r.`contact_id` = m.old_id + 9000000000000 SET r.`contact_id` = m.new_id;
UPDATE `supplier` r INNER JOIN _map_contact m ON r.`contact_id` = m.old_id + 9000000000000 SET r.`contact_id` = m.new_id;
UPDATE `transferee` r INNER JOIN _map_contact m ON r.`contact_id` = m.old_id + 9000000000000 SET r.`contact_id` = m.new_id;
UPDATE `customer` r INNER JOIN _map_contact m ON r.`billing_contact_id` = m.old_id + 9000000000000 SET r.`billing_contact_id` = m.new_id;
UPDATE `customer` r INNER JOIN _map_contact m ON r.`delivery_contact_id` = m.old_id + 9000000000000 SET r.`delivery_contact_id` = m.new_id;
UPDATE `contact` t INNER JOIN _map_contact m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `contact`);
SET @sql = CONCAT('ALTER TABLE `contact` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- customer_group
DROP TEMPORARY TABLE IF EXISTS _map_customer_group;
CREATE TEMPORARY TABLE _map_customer_group (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_customer_group (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `customer_group`;
UPDATE `customer_group` SET id = id + 9000000000000;
UPDATE `customer` SET `customer_group_id` = `customer_group_id` + 9000000000000 WHERE `customer_group_id` IS NOT NULL AND `customer_group_id` > 0;
UPDATE `promotion_customer_group` SET `customer_group_id` = `customer_group_id` + 9000000000000 WHERE `customer_group_id` IS NOT NULL AND `customer_group_id` > 0;
UPDATE `customer_group_revision` SET `customer_group_id` = `customer_group_id` + 9000000000000 WHERE `customer_group_id` IS NOT NULL AND `customer_group_id` > 0;
UPDATE `customer` r INNER JOIN _map_customer_group m ON r.`customer_group_id` = m.old_id + 9000000000000 SET r.`customer_group_id` = m.new_id;
UPDATE `promotion_customer_group` r INNER JOIN _map_customer_group m ON r.`customer_group_id` = m.old_id + 9000000000000 SET r.`customer_group_id` = m.new_id;
UPDATE `customer_group_revision` r INNER JOIN _map_customer_group m ON r.`customer_group_id` = m.old_id + 9000000000000 SET r.`customer_group_id` = m.new_id;
UPDATE `customer_group` t INNER JOIN _map_customer_group m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `customer_group`);
SET @sql = CONCAT('ALTER TABLE `customer_group` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- vendor
DROP TEMPORARY TABLE IF EXISTS _map_vendor;
CREATE TEMPORARY TABLE _map_vendor (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_vendor (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `vendor`;
UPDATE `vendor` SET id = id + 9000000000000;
UPDATE `vendor` t INNER JOIN _map_vendor m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `vendor`);
SET @sql = CONCAT('ALTER TABLE `vendor` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- outlet
DROP TEMPORARY TABLE IF EXISTS _map_outlet;
CREATE TEMPORARY TABLE _map_outlet (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_outlet (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `outlet`;
UPDATE `outlet` SET id = id + 9000000000000;
UPDATE `register` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `product_inventory` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `product_cost` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `stocktake` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `gift_card` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `promotion_outlet` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `user_reporting_outlet` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `security_event` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `shelf_ticket` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `external_stocktake` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `host_connection` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `buying_period` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `product_backorder` SET `outlet_id` = `outlet_id` + 9000000000000 WHERE `outlet_id` IS NOT NULL AND `outlet_id` > 0;
UPDATE `register` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `product_inventory` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `product_cost` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `stocktake` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `gift_card` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `promotion_outlet` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `user_reporting_outlet` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `security_event` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `shelf_ticket` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `external_stocktake` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `host_connection` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `buying_period` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `product_backorder` r INNER JOIN _map_outlet m ON r.`outlet_id` = m.old_id + 9000000000000 SET r.`outlet_id` = m.new_id;
UPDATE `outlet` t INNER JOIN _map_outlet m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `outlet`);
SET @sql = CONCAT('ALTER TABLE `outlet` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier
DROP TEMPORARY TABLE IF EXISTS _map_supplier;
CREATE TEMPORARY TABLE _map_supplier (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_supplier (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `supplier`;
UPDATE `supplier` SET id = id + 9000000000000;
UPDATE `product` SET `core_supplier_id` = `core_supplier_id` + 9000000000000 WHERE `core_supplier_id` IS NOT NULL AND `core_supplier_id` > 0;
UPDATE `product_supplier` SET `supplier_id` = `supplier_id` + 9000000000000 WHERE `supplier_id` IS NOT NULL AND `supplier_id` > 0;
UPDATE `buying_period` SET `supplier_id` = `supplier_id` + 9000000000000 WHERE `supplier_id` IS NOT NULL AND `supplier_id` > 0;
UPDATE `order_product` SET `supplier_id` = `supplier_id` + 9000000000000 WHERE `supplier_id` IS NOT NULL AND `supplier_id` > 0;
UPDATE `future_cost` SET `supplier_id` = `supplier_id` + 9000000000000 WHERE `supplier_id` IS NOT NULL AND `supplier_id` > 0;
UPDATE `supplier_additional_contact` SET `supplier_id` = `supplier_id` + 9000000000000 WHERE `supplier_id` IS NOT NULL AND `supplier_id` > 0;
UPDATE `supplier_authentication` SET `supplier_id` = `supplier_id` + 9000000000000 WHERE `supplier_id` IS NOT NULL AND `supplier_id` > 0;
UPDATE `product` r INNER JOIN _map_supplier m ON r.`core_supplier_id` = m.old_id + 9000000000000 SET r.`core_supplier_id` = m.new_id;
UPDATE `product_supplier` r INNER JOIN _map_supplier m ON r.`supplier_id` = m.old_id + 9000000000000 SET r.`supplier_id` = m.new_id;
UPDATE `buying_period` r INNER JOIN _map_supplier m ON r.`supplier_id` = m.old_id + 9000000000000 SET r.`supplier_id` = m.new_id;
UPDATE `order_product` r INNER JOIN _map_supplier m ON r.`supplier_id` = m.old_id + 9000000000000 SET r.`supplier_id` = m.new_id;
UPDATE `future_cost` r INNER JOIN _map_supplier m ON r.`supplier_id` = m.old_id + 9000000000000 SET r.`supplier_id` = m.new_id;
UPDATE `supplier_additional_contact` r INNER JOIN _map_supplier m ON r.`supplier_id` = m.old_id + 9000000000000 SET r.`supplier_id` = m.new_id;
UPDATE `supplier_authentication` r INNER JOIN _map_supplier m ON r.`supplier_id` = m.old_id + 9000000000000 SET r.`supplier_id` = m.new_id;
UPDATE `supplier` t INNER JOIN _map_supplier m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `supplier`);
SET @sql = CONCAT('ALTER TABLE `supplier` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- transferee
DROP TEMPORARY TABLE IF EXISTS _map_transferee;
CREATE TEMPORARY TABLE _map_transferee (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_transferee (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `transferee`;
UPDATE `transferee` SET id = id + 9000000000000;
UPDATE `transferee` t INNER JOIN _map_transferee m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `transferee`);
SET @sql = CONCAT('ALTER TABLE `transferee` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- app_user
DROP TEMPORARY TABLE IF EXISTS _map_app_user;
CREATE TEMPORARY TABLE _map_app_user (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_app_user (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `app_user`;
UPDATE `app_user` SET id = id + 9000000000000;
UPDATE `sale` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `customer_payment` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `register_closure` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `stocktake` SET `completed_by_id` = `completed_by_id` + 9000000000000 WHERE `completed_by_id` IS NOT NULL AND `completed_by_id` > 0;
UPDATE `purchase_order` SET `created_by_id` = `created_by_id` + 9000000000000 WHERE `created_by_id` IS NOT NULL AND `created_by_id` > 0;
UPDATE `purchase_order` SET `sent_by_id` = `sent_by_id` + 9000000000000 WHERE `sent_by_id` IS NOT NULL AND `sent_by_id` > 0;
UPDATE `purchase_order` SET `received_by_id` = `received_by_id` + 9000000000000 WHERE `received_by_id` IS NOT NULL AND `received_by_id` > 0;
UPDATE `customer_revision` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `customer_group_revision` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `security_event` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `shelf_ticket` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `external_stocktake` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `host_connection` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `future_price` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `future_cost` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `quick_menu_item` SET `user_id` = `user_id` + 9000000000000 WHERE `user_id` IS NOT NULL AND `user_id` > 0;
UPDATE `report` SET `owner_id` = `owner_id` + 9000000000000 WHERE `owner_id` IS NOT NULL AND `owner_id` > 0;
UPDATE `sale` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `customer_payment` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `register_closure` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `stocktake` r INNER JOIN _map_app_user m ON r.`completed_by_id` = m.old_id + 9000000000000 SET r.`completed_by_id` = m.new_id;
UPDATE `purchase_order` r INNER JOIN _map_app_user m ON r.`created_by_id` = m.old_id + 9000000000000 SET r.`created_by_id` = m.new_id;
UPDATE `purchase_order` r INNER JOIN _map_app_user m ON r.`sent_by_id` = m.old_id + 9000000000000 SET r.`sent_by_id` = m.new_id;
UPDATE `purchase_order` r INNER JOIN _map_app_user m ON r.`received_by_id` = m.old_id + 9000000000000 SET r.`received_by_id` = m.new_id;
UPDATE `customer_revision` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `customer_group_revision` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `security_event` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `shelf_ticket` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `external_stocktake` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `host_connection` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `future_price` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `future_cost` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `quick_menu_item` r INNER JOIN _map_app_user m ON r.`user_id` = m.old_id + 9000000000000 SET r.`user_id` = m.new_id;
UPDATE `report` r INNER JOIN _map_app_user m ON r.`owner_id` = m.old_id + 9000000000000 SET r.`owner_id` = m.new_id;
UPDATE `app_user` t INNER JOIN _map_app_user m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `app_user`);
SET @sql = CONCAT('ALTER TABLE `app_user` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- promotion_category
DROP TEMPORARY TABLE IF EXISTS _map_promotion_category;
CREATE TEMPORARY TABLE _map_promotion_category (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_promotion_category (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `promotion_category`;
UPDATE `promotion_category` SET id = id + 9000000000000;
UPDATE `promotion` SET `promotion_category_id` = `promotion_category_id` + 9000000000000 WHERE `promotion_category_id` IS NOT NULL AND `promotion_category_id` > 0;
UPDATE `promotion` r INNER JOIN _map_promotion_category m ON r.`promotion_category_id` = m.old_id + 9000000000000 SET r.`promotion_category_id` = m.new_id;
UPDATE `promotion_category` t INNER JOIN _map_promotion_category m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `promotion_category`);
SET @sql = CONCAT('ALTER TABLE `promotion_category` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- integration
DROP TEMPORARY TABLE IF EXISTS _map_integration;
CREATE TEMPORARY TABLE _map_integration (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_integration (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `integration`;
UPDATE `integration` SET id = id + 9000000000000;
UPDATE `webhook` SET `integration_id` = `integration_id` + 9000000000000 WHERE `integration_id` IS NOT NULL AND `integration_id` > 0;
UPDATE `webhook` r INNER JOIN _map_integration m ON r.`integration_id` = m.old_id + 9000000000000 SET r.`integration_id` = m.new_id;
UPDATE `integration` t INNER JOIN _map_integration m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `integration`);
SET @sql = CONCAT('ALTER TABLE `integration` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- product
DROP TEMPORARY TABLE IF EXISTS _map_product;
CREATE TEMPORARY TABLE _map_product (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_product (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `product`;
UPDATE `product` SET id = id + 9000000000000;
UPDATE `product_tag` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `product_price` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `product_inventory` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `product_cost` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `product_supplier` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `product_barcode` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `future_price` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `future_cost` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `sale_item` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `order_product` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `stocktake_product` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `capped_price` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `product_backorder` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `product_competition_price` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `shelf_ticket` SET `product_id` = `product_id` + 9000000000000 WHERE `product_id` IS NOT NULL AND `product_id` > 0;
UPDATE `buying_period` SET `item_id` = `item_id` + 9000000000000 WHERE `item_id` IS NOT NULL AND `item_id` > 0;
UPDATE `trashed_item` SET `item_id` = `item_id` + 9000000000000 WHERE `item_id` IS NOT NULL AND `item_id` > 0;
UPDATE `product_tag` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `product_price` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `product_inventory` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `product_cost` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `product_supplier` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `product_barcode` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `future_price` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `future_cost` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `sale_item` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `order_product` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `stocktake_product` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `capped_price` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `product_backorder` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `product_competition_price` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `shelf_ticket` r INNER JOIN _map_product m ON r.`product_id` = m.old_id + 9000000000000 SET r.`product_id` = m.new_id;
UPDATE `buying_period` r INNER JOIN _map_product m ON r.`item_id` = m.old_id + 9000000000000 SET r.`item_id` = m.new_id;
UPDATE `trashed_item` r INNER JOIN _map_product m ON r.`item_id` = m.old_id + 9000000000000 SET r.`item_id` = m.new_id;
UPDATE `product` t INNER JOIN _map_product m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `product`);
SET @sql = CONCAT('ALTER TABLE `product` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- customer
DROP TEMPORARY TABLE IF EXISTS _map_customer;
CREATE TEMPORARY TABLE _map_customer (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_customer (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `customer`;
UPDATE `customer` SET id = id + 9000000000000;
UPDATE `customer_email` SET `customer_id` = `customer_id` + 9000000000000 WHERE `customer_id` IS NOT NULL AND `customer_id` > 0;
UPDATE `customer_revision` SET `customer_id` = `customer_id` + 9000000000000 WHERE `customer_id` IS NOT NULL AND `customer_id` > 0;
UPDATE `customer_payment` SET `customer_id` = `customer_id` + 9000000000000 WHERE `customer_id` IS NOT NULL AND `customer_id` > 0;
UPDATE `sale` SET `customer_id` = `customer_id` + 9000000000000 WHERE `customer_id` IS NOT NULL AND `customer_id` > 0;
UPDATE `gift_card` SET `client_id` = `client_id` + 9000000000000 WHERE `client_id` IS NOT NULL AND `client_id` > 0;
UPDATE `product_backorder` SET `customer_id` = `customer_id` + 9000000000000 WHERE `customer_id` IS NOT NULL AND `customer_id` > 0;
UPDATE `vendor_connection` SET `customer_id` = `customer_id` + 9000000000000 WHERE `customer_id` IS NOT NULL AND `customer_id` > 0;
UPDATE `customer_email` r INNER JOIN _map_customer m ON r.`customer_id` = m.old_id + 9000000000000 SET r.`customer_id` = m.new_id;
UPDATE `customer_revision` r INNER JOIN _map_customer m ON r.`customer_id` = m.old_id + 9000000000000 SET r.`customer_id` = m.new_id;
UPDATE `customer_payment` r INNER JOIN _map_customer m ON r.`customer_id` = m.old_id + 9000000000000 SET r.`customer_id` = m.new_id;
UPDATE `sale` r INNER JOIN _map_customer m ON r.`customer_id` = m.old_id + 9000000000000 SET r.`customer_id` = m.new_id;
UPDATE `gift_card` r INNER JOIN _map_customer m ON r.`client_id` = m.old_id + 9000000000000 SET r.`client_id` = m.new_id;
UPDATE `product_backorder` r INNER JOIN _map_customer m ON r.`customer_id` = m.old_id + 9000000000000 SET r.`customer_id` = m.new_id;
UPDATE `vendor_connection` r INNER JOIN _map_customer m ON r.`customer_id` = m.old_id + 9000000000000 SET r.`customer_id` = m.new_id;
UPDATE `customer` t INNER JOIN _map_customer m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `customer`);
SET @sql = CONCAT('ALTER TABLE `customer` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- register
DROP TEMPORARY TABLE IF EXISTS _map_register;
CREATE TEMPORARY TABLE _map_register (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_register (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `register`;
UPDATE `register` SET id = id + 9000000000000;
UPDATE `sale` SET `register_id` = `register_id` + 9000000000000 WHERE `register_id` IS NOT NULL AND `register_id` > 0;
UPDATE `customer_payment` SET `register_id` = `register_id` + 9000000000000 WHERE `register_id` IS NOT NULL AND `register_id` > 0;
UPDATE `register_closure` SET `register_id` = `register_id` + 9000000000000 WHERE `register_id` IS NOT NULL AND `register_id` > 0;
UPDATE `sale_payment` SET `register_id` = `register_id` + 9000000000000 WHERE `register_id` IS NOT NULL AND `register_id` > 0;
UPDATE `gift_card_movement` SET `register_id` = `register_id` + 9000000000000 WHERE `register_id` IS NOT NULL AND `register_id` > 0;
UPDATE `security_event` SET `register_id` = `register_id` + 9000000000000 WHERE `register_id` IS NOT NULL AND `register_id` > 0;
UPDATE `register_payment_method` SET `register_id` = `register_id` + 9000000000000 WHERE `register_id` IS NOT NULL AND `register_id` > 0;
UPDATE `sale` r INNER JOIN _map_register m ON r.`register_id` = m.old_id + 9000000000000 SET r.`register_id` = m.new_id;
UPDATE `customer_payment` r INNER JOIN _map_register m ON r.`register_id` = m.old_id + 9000000000000 SET r.`register_id` = m.new_id;
UPDATE `register_closure` r INNER JOIN _map_register m ON r.`register_id` = m.old_id + 9000000000000 SET r.`register_id` = m.new_id;
UPDATE `sale_payment` r INNER JOIN _map_register m ON r.`register_id` = m.old_id + 9000000000000 SET r.`register_id` = m.new_id;
UPDATE `gift_card_movement` r INNER JOIN _map_register m ON r.`register_id` = m.old_id + 9000000000000 SET r.`register_id` = m.new_id;
UPDATE `security_event` r INNER JOIN _map_register m ON r.`register_id` = m.old_id + 9000000000000 SET r.`register_id` = m.new_id;
UPDATE `register_payment_method` r INNER JOIN _map_register m ON r.`register_id` = m.old_id + 9000000000000 SET r.`register_id` = m.new_id;
UPDATE `register` t INNER JOIN _map_register m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `register`);
SET @sql = CONCAT('ALTER TABLE `register` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- promotion
DROP TEMPORARY TABLE IF EXISTS _map_promotion;
CREATE TEMPORARY TABLE _map_promotion (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_promotion (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `promotion`;
UPDATE `promotion` SET id = id + 9000000000000;
UPDATE `promotion_criteria` SET `promotion_id` = `promotion_id` + 9000000000000 WHERE `promotion_id` IS NOT NULL AND `promotion_id` > 0;
UPDATE `promotion_customer_group` SET `promotion_id` = `promotion_id` + 9000000000000 WHERE `promotion_id` IS NOT NULL AND `promotion_id` > 0;
UPDATE `promotion_outlet` SET `promotion_id` = `promotion_id` + 9000000000000 WHERE `promotion_id` IS NOT NULL AND `promotion_id` > 0;
UPDATE `promotion_criteria` r INNER JOIN _map_promotion m ON r.`promotion_id` = m.old_id + 9000000000000 SET r.`promotion_id` = m.new_id;
UPDATE `promotion_customer_group` r INNER JOIN _map_promotion m ON r.`promotion_id` = m.old_id + 9000000000000 SET r.`promotion_id` = m.new_id;
UPDATE `promotion_outlet` r INNER JOIN _map_promotion m ON r.`promotion_id` = m.old_id + 9000000000000 SET r.`promotion_id` = m.new_id;
UPDATE `promotion` t INNER JOIN _map_promotion m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `promotion`);
SET @sql = CONCAT('ALTER TABLE `promotion` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ticket_template
DROP TEMPORARY TABLE IF EXISTS _map_ticket_template;
CREATE TEMPORARY TABLE _map_ticket_template (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_ticket_template (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `ticket_template`;
UPDATE `ticket_template` SET id = id + 9000000000000;
UPDATE `ticket_template_page` SET `ticket_template_id` = `ticket_template_id` + 9000000000000 WHERE `ticket_template_id` IS NOT NULL AND `ticket_template_id` > 0;
UPDATE `ticket_template_page` r INNER JOIN _map_ticket_template m ON r.`ticket_template_id` = m.old_id + 9000000000000 SET r.`ticket_template_id` = m.new_id;
UPDATE `ticket_template` t INNER JOIN _map_ticket_template m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `ticket_template`);
SET @sql = CONCAT('ALTER TABLE `ticket_template` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_additional_contact
DROP TEMPORARY TABLE IF EXISTS _map_supplier_additional_contact;
CREATE TEMPORARY TABLE _map_supplier_additional_contact (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_supplier_additional_contact (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `supplier_additional_contact`;
UPDATE `supplier_additional_contact` SET id = id + 9000000000000;
UPDATE `supplier_additional_contact` t INNER JOIN _map_supplier_additional_contact m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `supplier_additional_contact`);
SET @sql = CONCAT('ALTER TABLE `supplier_additional_contact` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_authentication (PK is not id — skipped)

-- customer_display
DROP TEMPORARY TABLE IF EXISTS _map_customer_display;
CREATE TEMPORARY TABLE _map_customer_display (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_customer_display (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `customer_display`;
UPDATE `customer_display` SET id = id + 9000000000000;
UPDATE `customer_display` t INNER JOIN _map_customer_display m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `customer_display`);
SET @sql = CONCAT('ALTER TABLE `customer_display` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- kitchen_screen
DROP TEMPORARY TABLE IF EXISTS _map_kitchen_screen;
CREATE TEMPORARY TABLE _map_kitchen_screen (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_kitchen_screen (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `kitchen_screen`;
UPDATE `kitchen_screen` SET id = id + 9000000000000;
UPDATE `kitchen_screen` t INNER JOIN _map_kitchen_screen m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `kitchen_screen`);
SET @sql = CONCAT('ALTER TABLE `kitchen_screen` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sale_keys
DROP TEMPORARY TABLE IF EXISTS _map_sale_keys;
CREATE TEMPORARY TABLE _map_sale_keys (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_sale_keys (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `sale_keys`;
UPDATE `sale_keys` SET id = id + 9000000000000;
UPDATE `sale_keys` t INNER JOIN _map_sale_keys m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `sale_keys`);
SET @sql = CONCAT('ALTER TABLE `sale_keys` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- push_device
DROP TEMPORARY TABLE IF EXISTS _map_push_device;
CREATE TEMPORARY TABLE _map_push_device (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_push_device (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `push_device`;
UPDATE `push_device` SET id = id + 9000000000000;
UPDATE `push_device` t INNER JOIN _map_push_device m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `push_device`);
SET @sql = CONCAT('ALTER TABLE `push_device` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- webhook
DROP TEMPORARY TABLE IF EXISTS _map_webhook;
CREATE TEMPORARY TABLE _map_webhook (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_webhook (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `webhook`;
UPDATE `webhook` SET id = id + 9000000000000;
UPDATE `webhook` t INNER JOIN _map_webhook m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `webhook`);
SET @sql = CONCAT('ALTER TABLE `webhook` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- report
DROP TEMPORARY TABLE IF EXISTS _map_report;
CREATE TEMPORARY TABLE _map_report (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_report (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `report`;
UPDATE `report` SET id = id + 9000000000000;
UPDATE `report` t INNER JOIN _map_report m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `report`);
SET @sql = CONCAT('ALTER TABLE `report` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- host_connection
DROP TEMPORARY TABLE IF EXISTS _map_host_connection;
CREATE TEMPORARY TABLE _map_host_connection (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_host_connection (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `host_connection`;
UPDATE `host_connection` SET id = id + 9000000000000;
UPDATE `host_change` SET `host_connection_id` = `host_connection_id` + 9000000000000 WHERE `host_connection_id` IS NOT NULL AND `host_connection_id` > 0;
UPDATE `host_identifier` SET `host_connection_id` = `host_connection_id` + 9000000000000 WHERE `host_connection_id` IS NOT NULL AND `host_connection_id` > 0;
UPDATE `host_change` r INNER JOIN _map_host_connection m ON r.`host_connection_id` = m.old_id + 9000000000000 SET r.`host_connection_id` = m.new_id;
UPDATE `host_identifier` r INNER JOIN _map_host_connection m ON r.`host_connection_id` = m.old_id + 9000000000000 SET r.`host_connection_id` = m.new_id;
UPDATE `host_connection` t INNER JOIN _map_host_connection m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `host_connection`);
SET @sql = CONCAT('ALTER TABLE `host_connection` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- vendor_connection
DROP TEMPORARY TABLE IF EXISTS _map_vendor_connection;
CREATE TEMPORARY TABLE _map_vendor_connection (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_vendor_connection (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `vendor_connection`;
UPDATE `vendor_connection` SET id = id + 9000000000000;
UPDATE `vendor_connection` t INNER JOIN _map_vendor_connection m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `vendor_connection`);
SET @sql = CONCAT('ALTER TABLE `vendor_connection` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- purchase_order
DROP TEMPORARY TABLE IF EXISTS _map_purchase_order;
CREATE TEMPORARY TABLE _map_purchase_order (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_purchase_order (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `purchase_order`;
UPDATE `purchase_order` SET id = id + 9000000000000;
UPDATE `order_product` SET `order_id` = `order_id` + 9000000000000 WHERE `order_id` IS NOT NULL AND `order_id` > 0;
UPDATE `order_review` SET `order_id` = `order_id` + 9000000000000 WHERE `order_id` IS NOT NULL AND `order_id` > 0;
UPDATE `order_related` SET `order_id` = `order_id` + 9000000000000 WHERE `order_id` IS NOT NULL AND `order_id` > 0;
UPDATE `order_related` SET `related_order_id` = `related_order_id` + 9000000000000 WHERE `related_order_id` IS NOT NULL AND `related_order_id` > 0;
UPDATE `purchase_order` SET `merged_into_id` = `merged_into_id` + 9000000000000 WHERE `merged_into_id` IS NOT NULL AND `merged_into_id` > 0;
UPDATE `product_backorder` SET `on_order_id` = `on_order_id` + 9000000000000 WHERE `on_order_id` IS NOT NULL AND `on_order_id` > 0;
UPDATE `order_product` r INNER JOIN _map_purchase_order m ON r.`order_id` = m.old_id + 9000000000000 SET r.`order_id` = m.new_id;
UPDATE `order_review` r INNER JOIN _map_purchase_order m ON r.`order_id` = m.old_id + 9000000000000 SET r.`order_id` = m.new_id;
UPDATE `order_related` r INNER JOIN _map_purchase_order m ON r.`order_id` = m.old_id + 9000000000000 SET r.`order_id` = m.new_id;
UPDATE `order_related` r INNER JOIN _map_purchase_order m ON r.`related_order_id` = m.old_id + 9000000000000 SET r.`related_order_id` = m.new_id;
UPDATE `purchase_order` r INNER JOIN _map_purchase_order m ON r.`merged_into_id` = m.old_id + 9000000000000 SET r.`merged_into_id` = m.new_id;
UPDATE `product_backorder` r INNER JOIN _map_purchase_order m ON r.`on_order_id` = m.old_id + 9000000000000 SET r.`on_order_id` = m.new_id;
UPDATE `purchase_order` t INNER JOIN _map_purchase_order m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `purchase_order`);
SET @sql = CONCAT('ALTER TABLE `purchase_order` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- stocktake
DROP TEMPORARY TABLE IF EXISTS _map_stocktake;
CREATE TEMPORARY TABLE _map_stocktake (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_stocktake (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `stocktake`;
UPDATE `stocktake` SET id = id + 9000000000000;
UPDATE `stocktake_product` SET `stocktake_id` = `stocktake_id` + 9000000000000 WHERE `stocktake_id` IS NOT NULL AND `stocktake_id` > 0;
UPDATE `stocktake_product` r INNER JOIN _map_stocktake m ON r.`stocktake_id` = m.old_id + 9000000000000 SET r.`stocktake_id` = m.new_id;
UPDATE `stocktake` t INNER JOIN _map_stocktake m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `stocktake`);
SET @sql = CONCAT('ALTER TABLE `stocktake` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- gift_card
DROP TEMPORARY TABLE IF EXISTS _map_gift_card;
CREATE TEMPORARY TABLE _map_gift_card (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_gift_card (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `gift_card`;
UPDATE `gift_card` SET id = id + 9000000000000;
UPDATE `gift_card_movement` SET `gift_card_id` = `gift_card_id` + 9000000000000 WHERE `gift_card_id` IS NOT NULL AND `gift_card_id` > 0;
UPDATE `gift_card_movement` r INNER JOIN _map_gift_card m ON r.`gift_card_id` = m.old_id + 9000000000000 SET r.`gift_card_id` = m.new_id;
UPDATE `gift_card` t INNER JOIN _map_gift_card m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `gift_card`);
SET @sql = CONCAT('ALTER TABLE `gift_card` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- customer_payment
DROP TEMPORARY TABLE IF EXISTS _map_customer_payment;
CREATE TEMPORARY TABLE _map_customer_payment (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_customer_payment (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `customer_payment`;
UPDATE `customer_payment` SET id = id + 9000000000000;
UPDATE `customer_payment_allocation` SET `payment_id` = `payment_id` + 9000000000000 WHERE `payment_id` IS NOT NULL AND `payment_id` > 0;
UPDATE `sale_payment` SET `customer_payment_id` = `customer_payment_id` + 9000000000000 WHERE `customer_payment_id` IS NOT NULL AND `customer_payment_id` > 0;
UPDATE `customer_payment` SET `relates_to_id` = `relates_to_id` + 9000000000000 WHERE `relates_to_id` IS NOT NULL AND `relates_to_id` > 0;
UPDATE `customer_payment_allocation` r INNER JOIN _map_customer_payment m ON r.`payment_id` = m.old_id + 9000000000000 SET r.`payment_id` = m.new_id;
UPDATE `sale_payment` r INNER JOIN _map_customer_payment m ON r.`customer_payment_id` = m.old_id + 9000000000000 SET r.`customer_payment_id` = m.new_id;
UPDATE `customer_payment` r INNER JOIN _map_customer_payment m ON r.`relates_to_id` = m.old_id + 9000000000000 SET r.`relates_to_id` = m.new_id;
UPDATE `customer_payment` t INNER JOIN _map_customer_payment m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `customer_payment`);
SET @sql = CONCAT('ALTER TABLE `customer_payment` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sale
DROP TEMPORARY TABLE IF EXISTS _map_sale;
CREATE TEMPORARY TABLE _map_sale (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_sale (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `sale`;
UPDATE `sale` SET id = id + 9000000000000;
UPDATE `sale_item` SET `sale_id` = `sale_id` + 9000000000000 WHERE `sale_id` IS NOT NULL AND `sale_id` > 0;
UPDATE `sale_payment` SET `sale_id` = `sale_id` + 9000000000000 WHERE `sale_id` IS NOT NULL AND `sale_id` > 0;
UPDATE `customer_payment_allocation` SET `sale_id` = `sale_id` + 9000000000000 WHERE `sale_id` IS NOT NULL AND `sale_id` > 0;
UPDATE `gift_card_movement` SET `sale_id` = `sale_id` + 9000000000000 WHERE `sale_id` IS NOT NULL AND `sale_id` > 0;
UPDATE `sale` SET `linked_sale_id` = `linked_sale_id` + 9000000000000 WHERE `linked_sale_id` IS NOT NULL AND `linked_sale_id` > 0;
UPDATE `sale_item` r INNER JOIN _map_sale m ON r.`sale_id` = m.old_id + 9000000000000 SET r.`sale_id` = m.new_id;
UPDATE `sale_payment` r INNER JOIN _map_sale m ON r.`sale_id` = m.old_id + 9000000000000 SET r.`sale_id` = m.new_id;
UPDATE `customer_payment_allocation` r INNER JOIN _map_sale m ON r.`sale_id` = m.old_id + 9000000000000 SET r.`sale_id` = m.new_id;
UPDATE `gift_card_movement` r INNER JOIN _map_sale m ON r.`sale_id` = m.old_id + 9000000000000 SET r.`sale_id` = m.new_id;
UPDATE `sale` r INNER JOIN _map_sale m ON r.`linked_sale_id` = m.old_id + 9000000000000 SET r.`linked_sale_id` = m.new_id;
UPDATE `sale` t INNER JOIN _map_sale m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `sale`);
SET @sql = CONCAT('ALTER TABLE `sale` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- register_closure
DROP TEMPORARY TABLE IF EXISTS _map_register_closure;
CREATE TEMPORARY TABLE _map_register_closure (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_register_closure (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `register_closure`;
UPDATE `register_closure` SET id = id + 9000000000000;
UPDATE `register_closure_payment` SET `closure_id` = `closure_id` + 9000000000000 WHERE `closure_id` IS NOT NULL AND `closure_id` > 0;
UPDATE `register_closure_payment` r INNER JOIN _map_register_closure m ON r.`closure_id` = m.old_id + 9000000000000 SET r.`closure_id` = m.new_id;
UPDATE `register_closure` t INNER JOIN _map_register_closure m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `register_closure`);
SET @sql = CONCAT('ALTER TABLE `register_closure` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- product_price
DROP TEMPORARY TABLE IF EXISTS _map_product_price;
CREATE TEMPORARY TABLE _map_product_price (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_product_price (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `product_price`;
UPDATE `product_price` SET id = id + 9000000000000;
UPDATE `product_price` t INNER JOIN _map_product_price m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `product_price`);
SET @sql = CONCAT('ALTER TABLE `product_price` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- product_barcode
DROP TEMPORARY TABLE IF EXISTS _map_product_barcode;
CREATE TEMPORARY TABLE _map_product_barcode (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_product_barcode (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `product_barcode`;
UPDATE `product_barcode` SET id = id + 9000000000000;
UPDATE `product_barcode` t INNER JOIN _map_product_barcode m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `product_barcode`);
SET @sql = CONCAT('ALTER TABLE `product_barcode` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- product_tag (PK is not id — skipped)

-- product_supplier
DROP TEMPORARY TABLE IF EXISTS _map_product_supplier;
CREATE TEMPORARY TABLE _map_product_supplier (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_product_supplier (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `product_supplier`;
UPDATE `product_supplier` SET id = id + 9000000000000;
UPDATE `product_supplier` t INNER JOIN _map_product_supplier m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `product_supplier`);
SET @sql = CONCAT('ALTER TABLE `product_supplier` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- product_inventory (PK is not id — skipped)

-- product_cost (PK is not id — skipped)

-- customer_email
DROP TEMPORARY TABLE IF EXISTS _map_customer_email;
CREATE TEMPORARY TABLE _map_customer_email (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_customer_email (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `customer_email`;
UPDATE `customer_email` SET id = id + 9000000000000;
UPDATE `customer_email` t INNER JOIN _map_customer_email m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `customer_email`);
SET @sql = CONCAT('ALTER TABLE `customer_email` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- customer_revision
DROP TEMPORARY TABLE IF EXISTS _map_customer_revision;
CREATE TEMPORARY TABLE _map_customer_revision (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_customer_revision (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `customer_revision`;
UPDATE `customer_revision` SET id = id + 9000000000000;
UPDATE `customer_revision` t INNER JOIN _map_customer_revision m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `customer_revision`);
SET @sql = CONCAT('ALTER TABLE `customer_revision` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- customer_group_revision
DROP TEMPORARY TABLE IF EXISTS _map_customer_group_revision;
CREATE TEMPORARY TABLE _map_customer_group_revision (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_customer_group_revision (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `customer_group_revision`;
UPDATE `customer_group_revision` SET id = id + 9000000000000;
UPDATE `customer_group_revision` t INNER JOIN _map_customer_group_revision m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `customer_group_revision`);
SET @sql = CONCAT('ALTER TABLE `customer_group_revision` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- price_list_item
DROP TEMPORARY TABLE IF EXISTS _map_price_list_item;
CREATE TEMPORARY TABLE _map_price_list_item (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_price_list_item (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `price_list_item`;
UPDATE `price_list_item` SET id = id + 9000000000000;
UPDATE `price_list_item` t INNER JOIN _map_price_list_item m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `price_list_item`);
SET @sql = CONCAT('ALTER TABLE `price_list_item` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- promotion_criteria
DROP TEMPORARY TABLE IF EXISTS _map_promotion_criteria;
CREATE TEMPORARY TABLE _map_promotion_criteria (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_promotion_criteria (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `promotion_criteria`;
UPDATE `promotion_criteria` SET id = id + 9000000000000;
UPDATE `promotion_criteria` t INNER JOIN _map_promotion_criteria m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `promotion_criteria`);
SET @sql = CONCAT('ALTER TABLE `promotion_criteria` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- promotion_customer_group (PK is not id — skipped)

-- promotion_outlet (PK is not id — skipped)

-- stocktake_product
DROP TEMPORARY TABLE IF EXISTS _map_stocktake_product;
CREATE TEMPORARY TABLE _map_stocktake_product (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_stocktake_product (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `stocktake_product`;
UPDATE `stocktake_product` SET id = id + 9000000000000;
UPDATE `stocktake_product` t INNER JOIN _map_stocktake_product m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `stocktake_product`);
SET @sql = CONCAT('ALTER TABLE `stocktake_product` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- order_product
DROP TEMPORARY TABLE IF EXISTS _map_order_product;
CREATE TEMPORARY TABLE _map_order_product (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_order_product (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `order_product`;
UPDATE `order_product` SET id = id + 9000000000000;
UPDATE `order_product` t INNER JOIN _map_order_product m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `order_product`);
SET @sql = CONCAT('ALTER TABLE `order_product` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- order_review
DROP TEMPORARY TABLE IF EXISTS _map_order_review;
CREATE TEMPORARY TABLE _map_order_review (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_order_review (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `order_review`;
UPDATE `order_review` SET id = id + 9000000000000;
UPDATE `order_review` t INNER JOIN _map_order_review m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `order_review`);
SET @sql = CONCAT('ALTER TABLE `order_review` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- order_related
DROP TEMPORARY TABLE IF EXISTS _map_order_related;
CREATE TEMPORARY TABLE _map_order_related (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_order_related (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `order_related`;
UPDATE `order_related` SET id = id + 9000000000000;
UPDATE `order_related` t INNER JOIN _map_order_related m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `order_related`);
SET @sql = CONCAT('ALTER TABLE `order_related` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sale_item
DROP TEMPORARY TABLE IF EXISTS _map_sale_item;
CREATE TEMPORARY TABLE _map_sale_item (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_sale_item (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `sale_item`;
UPDATE `sale_item` SET id = id + 9000000000000;
UPDATE `sale_item` t INNER JOIN _map_sale_item m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `sale_item`);
SET @sql = CONCAT('ALTER TABLE `sale_item` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sale_payment
DROP TEMPORARY TABLE IF EXISTS _map_sale_payment;
CREATE TEMPORARY TABLE _map_sale_payment (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_sale_payment (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `sale_payment`;
UPDATE `sale_payment` SET id = id + 9000000000000;
UPDATE `sale_payment` t INNER JOIN _map_sale_payment m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `sale_payment`);
SET @sql = CONCAT('ALTER TABLE `sale_payment` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- gift_card_movement
DROP TEMPORARY TABLE IF EXISTS _map_gift_card_movement;
CREATE TEMPORARY TABLE _map_gift_card_movement (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_gift_card_movement (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `gift_card_movement`;
UPDATE `gift_card_movement` SET id = id + 9000000000000;
UPDATE `gift_card_movement` t INNER JOIN _map_gift_card_movement m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `gift_card_movement`);
SET @sql = CONCAT('ALTER TABLE `gift_card_movement` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- customer_payment_allocation
DROP TEMPORARY TABLE IF EXISTS _map_customer_payment_allocation;
CREATE TEMPORARY TABLE _map_customer_payment_allocation (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_customer_payment_allocation (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `customer_payment_allocation`;
UPDATE `customer_payment_allocation` SET id = id + 9000000000000;
UPDATE `customer_payment_allocation` t INNER JOIN _map_customer_payment_allocation m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `customer_payment_allocation`);
SET @sql = CONCAT('ALTER TABLE `customer_payment_allocation` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- register_closure_payment
DROP TEMPORARY TABLE IF EXISTS _map_register_closure_payment;
CREATE TEMPORARY TABLE _map_register_closure_payment (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_register_closure_payment (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `register_closure_payment`;
UPDATE `register_closure_payment` SET id = id + 9000000000000;
UPDATE `register_closure_payment` t INNER JOIN _map_register_closure_payment m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `register_closure_payment`);
SET @sql = CONCAT('ALTER TABLE `register_closure_payment` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- register_payment_method (PK is not id — skipped)

-- user_reporting_outlet (PK is not id — skipped)

-- role_permission (PK is not id — skipped)

-- future_price
DROP TEMPORARY TABLE IF EXISTS _map_future_price;
CREATE TEMPORARY TABLE _map_future_price (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_future_price (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `future_price`;
UPDATE `future_price` SET id = id + 9000000000000;
UPDATE `future_price` t INNER JOIN _map_future_price m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `future_price`);
SET @sql = CONCAT('ALTER TABLE `future_price` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- future_cost
DROP TEMPORARY TABLE IF EXISTS _map_future_cost;
CREATE TEMPORARY TABLE _map_future_cost (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_future_cost (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `future_cost`;
UPDATE `future_cost` SET id = id + 9000000000000;
UPDATE `future_cost` t INNER JOIN _map_future_cost m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `future_cost`);
SET @sql = CONCAT('ALTER TABLE `future_cost` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- capped_price
DROP TEMPORARY TABLE IF EXISTS _map_capped_price;
CREATE TEMPORARY TABLE _map_capped_price (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_capped_price (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `capped_price`;
UPDATE `capped_price` SET id = id + 9000000000000;
UPDATE `capped_price` t INNER JOIN _map_capped_price m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `capped_price`);
SET @sql = CONCAT('ALTER TABLE `capped_price` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- product_backorder
DROP TEMPORARY TABLE IF EXISTS _map_product_backorder;
CREATE TEMPORARY TABLE _map_product_backorder (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_product_backorder (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `product_backorder`;
UPDATE `product_backorder` SET id = id + 9000000000000;
UPDATE `product_backorder` t INNER JOIN _map_product_backorder m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `product_backorder`);
SET @sql = CONCAT('ALTER TABLE `product_backorder` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- product_competition_price
DROP TEMPORARY TABLE IF EXISTS _map_product_competition_price;
CREATE TEMPORARY TABLE _map_product_competition_price (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_product_competition_price (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `product_competition_price`;
UPDATE `product_competition_price` SET id = id + 9000000000000;
UPDATE `product_competition_price` t INNER JOIN _map_product_competition_price m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `product_competition_price`);
SET @sql = CONCAT('ALTER TABLE `product_competition_price` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- shelf_ticket
DROP TEMPORARY TABLE IF EXISTS _map_shelf_ticket;
CREATE TEMPORARY TABLE _map_shelf_ticket (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_shelf_ticket (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `shelf_ticket`;
UPDATE `shelf_ticket` SET id = id + 9000000000000;
UPDATE `shelf_ticket` t INNER JOIN _map_shelf_ticket m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `shelf_ticket`);
SET @sql = CONCAT('ALTER TABLE `shelf_ticket` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ticket_template_page
DROP TEMPORARY TABLE IF EXISTS _map_ticket_template_page;
CREATE TEMPORARY TABLE _map_ticket_template_page (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_ticket_template_page (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `ticket_template_page`;
UPDATE `ticket_template_page` SET id = id + 9000000000000;
UPDATE `ticket_template_page` t INNER JOIN _map_ticket_template_page m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `ticket_template_page`);
SET @sql = CONCAT('ALTER TABLE `ticket_template_page` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- buying_period
DROP TEMPORARY TABLE IF EXISTS _map_buying_period;
CREATE TEMPORARY TABLE _map_buying_period (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_buying_period (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `buying_period`;
UPDATE `buying_period` SET id = id + 9000000000000;
UPDATE `buying_period` t INNER JOIN _map_buying_period m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `buying_period`);
SET @sql = CONCAT('ALTER TABLE `buying_period` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- external_stocktake
DROP TEMPORARY TABLE IF EXISTS _map_external_stocktake;
CREATE TEMPORARY TABLE _map_external_stocktake (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_external_stocktake (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `external_stocktake`;
UPDATE `external_stocktake` SET id = id + 9000000000000;
UPDATE `external_stocktake` t INNER JOIN _map_external_stocktake m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `external_stocktake`);
SET @sql = CONCAT('ALTER TABLE `external_stocktake` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- host_change
DROP TEMPORARY TABLE IF EXISTS _map_host_change;
CREATE TEMPORARY TABLE _map_host_change (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_host_change (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `host_change`;
UPDATE `host_change` SET id = id + 9000000000000;
UPDATE `host_change` t INNER JOIN _map_host_change m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `host_change`);
SET @sql = CONCAT('ALTER TABLE `host_change` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- host_identifier
DROP TEMPORARY TABLE IF EXISTS _map_host_identifier;
CREATE TEMPORARY TABLE _map_host_identifier (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_host_identifier (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `host_identifier`;
UPDATE `host_identifier` SET id = id + 9000000000000;
UPDATE `host_identifier` t INNER JOIN _map_host_identifier m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `host_identifier`);
SET @sql = CONCAT('ALTER TABLE `host_identifier` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- quick_menu_item
DROP TEMPORARY TABLE IF EXISTS _map_quick_menu_item;
CREATE TEMPORARY TABLE _map_quick_menu_item (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_quick_menu_item (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `quick_menu_item`;
UPDATE `quick_menu_item` SET id = id + 9000000000000;
UPDATE `quick_menu_item` t INNER JOIN _map_quick_menu_item m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `quick_menu_item`);
SET @sql = CONCAT('ALTER TABLE `quick_menu_item` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- security_event
DROP TEMPORARY TABLE IF EXISTS _map_security_event;
CREATE TEMPORARY TABLE _map_security_event (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_security_event (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `security_event`;
UPDATE `security_event` SET id = id + 9000000000000;
UPDATE `security_event` t INNER JOIN _map_security_event m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `security_event`);
SET @sql = CONCAT('ALTER TABLE `security_event` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- notification
DROP TEMPORARY TABLE IF EXISTS _map_notification;
CREATE TEMPORARY TABLE _map_notification (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_notification (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `notification`;
UPDATE `notification` SET id = id + 9000000000000;
UPDATE `notification` t INNER JOIN _map_notification m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `notification`);
SET @sql = CONCAT('ALTER TABLE `notification` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- mail_log
DROP TEMPORARY TABLE IF EXISTS _map_mail_log;
CREATE TEMPORARY TABLE _map_mail_log (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_mail_log (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `mail_log`;
UPDATE `mail_log` SET id = id + 9000000000000;
UPDATE `mail_log` t INNER JOIN _map_mail_log m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `mail_log`);
SET @sql = CONCAT('ALTER TABLE `mail_log` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- trashed_item
DROP TEMPORARY TABLE IF EXISTS _map_trashed_item;
CREATE TEMPORARY TABLE _map_trashed_item (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_trashed_item (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `trashed_item`;
UPDATE `trashed_item` SET id = id + 9000000000000;
UPDATE `trashed_item` t INNER JOIN _map_trashed_item m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `trashed_item`);
SET @sql = CONCAT('ALTER TABLE `trashed_item` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- settings
DROP TEMPORARY TABLE IF EXISTS _map_settings;
CREATE TEMPORARY TABLE _map_settings (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL);
INSERT INTO _map_settings (old_id, new_id)
SELECT id, ROW_NUMBER() OVER (ORDER BY id) FROM `settings`;
UPDATE `settings` SET id = id + 9000000000000;
UPDATE `settings` t INNER JOIN _map_settings m ON t.id = m.old_id + 9000000000000 SET t.id = m.new_id;
SET @ai = (SELECT COALESCE(MAX(id), 0) + 1 FROM `settings`);
SET @sql = CONCAT('ALTER TABLE `settings` AUTO_INCREMENT = ', @ai);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Polymorphic FK columns (scoped by type column)

-- settings.scope_id when scope_type='vendor' -> vendor
UPDATE `settings` SET `scope_id` = `scope_id` + 9000000000000 WHERE `scope_type` = 'vendor' AND `scope_id` IS NOT NULL AND `scope_id` > 0;
UPDATE `settings` r INNER JOIN _map_vendor m ON r.`scope_id` = m.old_id + 9000000000000 SET r.`scope_id` = m.new_id WHERE r.`scope_type` = 'vendor';

-- settings.scope_id when scope_type='outlet' -> outlet
UPDATE `settings` SET `scope_id` = `scope_id` + 9000000000000 WHERE `scope_type` = 'outlet' AND `scope_id` IS NOT NULL AND `scope_id` > 0;
UPDATE `settings` r INNER JOIN _map_outlet m ON r.`scope_id` = m.old_id + 9000000000000 SET r.`scope_id` = m.new_id WHERE r.`scope_type` = 'outlet';

-- settings.scope_id when scope_type='register' -> register
UPDATE `settings` SET `scope_id` = `scope_id` + 9000000000000 WHERE `scope_type` = 'register' AND `scope_id` IS NOT NULL AND `scope_id` > 0;
UPDATE `settings` r INNER JOIN _map_register m ON r.`scope_id` = m.old_id + 9000000000000 SET r.`scope_id` = m.new_id WHERE r.`scope_type` = 'register';

-- settings.scope_id when scope_type='user' -> app_user
UPDATE `settings` SET `scope_id` = `scope_id` + 9000000000000 WHERE `scope_type` = 'user' AND `scope_id` IS NOT NULL AND `scope_id` > 0;
UPDATE `settings` r INNER JOIN _map_app_user m ON r.`scope_id` = m.old_id + 9000000000000 SET r.`scope_id` = m.new_id WHERE r.`scope_type` = 'user';

-- price_list_item.item_id when classification_type='product' -> product
UPDATE `price_list_item` SET `item_id` = `item_id` + 9000000000000 WHERE `classification_type` = 'product' AND `item_id` IS NOT NULL AND `item_id` > 0;
UPDATE `price_list_item` r INNER JOIN _map_product m ON r.`item_id` = m.old_id + 9000000000000 SET r.`item_id` = m.new_id WHERE r.`classification_type` = 'product';

-- price_list_item.item_id when classification_type='brand' -> brand
UPDATE `price_list_item` SET `item_id` = `item_id` + 9000000000000 WHERE `classification_type` = 'brand' AND `item_id` IS NOT NULL AND `item_id` > 0;
UPDATE `price_list_item` r INNER JOIN _map_brand m ON r.`item_id` = m.old_id + 9000000000000 SET r.`item_id` = m.new_id WHERE r.`classification_type` = 'brand';

-- price_list_item.item_id when classification_type='category' -> category
UPDATE `price_list_item` SET `item_id` = `item_id` + 9000000000000 WHERE `classification_type` = 'category' AND `item_id` IS NOT NULL AND `item_id` > 0;
UPDATE `price_list_item` r INNER JOIN _map_category m ON r.`item_id` = m.old_id + 9000000000000 SET r.`item_id` = m.new_id WHERE r.`classification_type` = 'category';

-- price_list_item.item_id when classification_type='family' -> family
UPDATE `price_list_item` SET `item_id` = `item_id` + 9000000000000 WHERE `classification_type` = 'family' AND `item_id` IS NOT NULL AND `item_id` > 0;
UPDATE `price_list_item` r INNER JOIN _map_family m ON r.`item_id` = m.old_id + 9000000000000 SET r.`item_id` = m.new_id WHERE r.`classification_type` = 'family';

-- price_list_item.item_id when classification_type='tag' -> tag
UPDATE `price_list_item` SET `item_id` = `item_id` + 9000000000000 WHERE `classification_type` = 'tag' AND `item_id` IS NOT NULL AND `item_id` > 0;
UPDATE `price_list_item` r INNER JOIN _map_tag m ON r.`item_id` = m.old_id + 9000000000000 SET r.`item_id` = m.new_id WHERE r.`classification_type` = 'tag';

-- buying_period.item_id when item_type='product' -> product
UPDATE `buying_period` SET `item_id` = `item_id` + 9000000000000 WHERE `item_type` = 'product' AND `item_id` IS NOT NULL AND `item_id` > 0;
UPDATE `buying_period` r INNER JOIN _map_product m ON r.`item_id` = m.old_id + 9000000000000 SET r.`item_id` = m.new_id WHERE r.`item_type` = 'product';

-- purchase_order.from_id when type='ORDER' -> supplier
UPDATE `purchase_order` SET `from_id` = `from_id` + 9000000000000 WHERE `type` = 'ORDER' AND `from_id` IS NOT NULL AND `from_id` > 0;
UPDATE `purchase_order` r INNER JOIN _map_supplier m ON r.`from_id` = m.old_id + 9000000000000 SET r.`from_id` = m.new_id WHERE r.`type` = 'ORDER';

-- purchase_order.from_id when type='TRANSFER' -> outlet
UPDATE `purchase_order` SET `from_id` = `from_id` + 9000000000000 WHERE `type` = 'TRANSFER' AND `from_id` IS NOT NULL AND `from_id` > 0;
UPDATE `purchase_order` r INNER JOIN _map_outlet m ON r.`from_id` = m.old_id + 9000000000000 SET r.`from_id` = m.new_id WHERE r.`type` = 'TRANSFER';

-- purchase_order.to_id when type='ORDER' -> outlet
UPDATE `purchase_order` SET `to_id` = `to_id` + 9000000000000 WHERE `type` = 'ORDER' AND `to_id` IS NOT NULL AND `to_id` > 0;
UPDATE `purchase_order` r INNER JOIN _map_outlet m ON r.`to_id` = m.old_id + 9000000000000 SET r.`to_id` = m.new_id WHERE r.`type` = 'ORDER';

-- purchase_order.to_id when type='TRANSFER' -> outlet
UPDATE `purchase_order` SET `to_id` = `to_id` + 9000000000000 WHERE `type` = 'TRANSFER' AND `to_id` IS NOT NULL AND `to_id` > 0;
UPDATE `purchase_order` r INNER JOIN _map_outlet m ON r.`to_id` = m.old_id + 9000000000000 SET r.`to_id` = m.new_id WHERE r.`type` = 'TRANSFER';

-- purchase_order.to_id when type='CREDIT' -> outlet
UPDATE `purchase_order` SET `to_id` = `to_id` + 9000000000000 WHERE `type` = 'CREDIT' AND `to_id` IS NOT NULL AND `to_id` > 0;
UPDATE `purchase_order` r INNER JOIN _map_outlet m ON r.`to_id` = m.old_id + 9000000000000 SET r.`to_id` = m.new_id WHERE r.`type` = 'CREDIT';

SET FOREIGN_KEY_CHECKS = 1;

-- Verify: SELECT id FROM product ORDER BY id; — should start at 1
