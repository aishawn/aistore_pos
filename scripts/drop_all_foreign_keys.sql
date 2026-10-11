-- Drop all physical foreign keys; keep indexes for logical FK lookups.
-- Idempotent: skips constraints that are already removed.
-- Run against the target database (USE orithos; or select schema in client).

SET FOREIGN_KEY_CHECKS = 0;

-- register.fk_register_outlet
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'register'
     AND CONSTRAINT_NAME = 'fk_register_outlet'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE register DROP FOREIGN KEY fk_register_outlet',
  'SELECT ''fk_register_outlet already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- register_payment_method.fk_rpm_register
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'register_payment_method'
     AND CONSTRAINT_NAME = 'fk_rpm_register'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE register_payment_method DROP FOREIGN KEY fk_rpm_register',
  'SELECT ''fk_rpm_register already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- register_payment_method.fk_rpm_pm
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'register_payment_method'
     AND CONSTRAINT_NAME = 'fk_rpm_pm'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE register_payment_method DROP FOREIGN KEY fk_rpm_pm',
  'SELECT ''fk_rpm_pm already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- role_permission.fk_rp_role
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'role_permission'
     AND CONSTRAINT_NAME = 'fk_rp_role'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE role_permission DROP FOREIGN KEY fk_rp_role',
  'SELECT ''fk_rp_role already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- role_permission.fk_rp_perm
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'role_permission'
     AND CONSTRAINT_NAME = 'fk_rp_perm'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE role_permission DROP FOREIGN KEY fk_rp_perm',
  'SELECT ''fk_rp_perm already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- app_user.fk_user_role
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'app_user'
     AND CONSTRAINT_NAME = 'fk_user_role'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE app_user DROP FOREIGN KEY fk_user_role',
  'SELECT ''fk_user_role already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product.fk_product_category
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product'
     AND CONSTRAINT_NAME = 'fk_product_category'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product DROP FOREIGN KEY fk_product_category',
  'SELECT ''fk_product_category already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product.fk_product_brand
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product'
     AND CONSTRAINT_NAME = 'fk_product_brand'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product DROP FOREIGN KEY fk_product_brand',
  'SELECT ''fk_product_brand already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product.fk_product_family
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product'
     AND CONSTRAINT_NAME = 'fk_product_family'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product DROP FOREIGN KEY fk_product_family',
  'SELECT ''fk_product_family already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product.fk_product_tax
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product'
     AND CONSTRAINT_NAME = 'fk_product_tax'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product DROP FOREIGN KEY fk_product_tax',
  'SELECT ''fk_product_tax already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_tag.fk_pt_product
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product_tag'
     AND CONSTRAINT_NAME = 'fk_pt_product'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product_tag DROP FOREIGN KEY fk_pt_product',
  'SELECT ''fk_pt_product already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_tag.fk_pt_tag
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product_tag'
     AND CONSTRAINT_NAME = 'fk_pt_tag'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product_tag DROP FOREIGN KEY fk_pt_tag',
  'SELECT ''fk_pt_tag already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_price.fk_pp_product
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product_price'
     AND CONSTRAINT_NAME = 'fk_pp_product'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product_price DROP FOREIGN KEY fk_pp_product',
  'SELECT ''fk_pp_product already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_inventory.fk_pi_product
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product_inventory'
     AND CONSTRAINT_NAME = 'fk_pi_product'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product_inventory DROP FOREIGN KEY fk_pi_product',
  'SELECT ''fk_pi_product already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_inventory.fk_pi_outlet
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product_inventory'
     AND CONSTRAINT_NAME = 'fk_pi_outlet'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product_inventory DROP FOREIGN KEY fk_pi_outlet',
  'SELECT ''fk_pi_outlet already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_cost.fk_pc_product
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product_cost'
     AND CONSTRAINT_NAME = 'fk_pc_product'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product_cost DROP FOREIGN KEY fk_pc_product',
  'SELECT ''fk_pc_product already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_supplier.fk_ps_product
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product_supplier'
     AND CONSTRAINT_NAME = 'fk_ps_product'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product_supplier DROP FOREIGN KEY fk_ps_product',
  'SELECT ''fk_ps_product already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_supplier.fk_ps_supplier
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product_supplier'
     AND CONSTRAINT_NAME = 'fk_ps_supplier'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product_supplier DROP FOREIGN KEY fk_ps_supplier',
  'SELECT ''fk_ps_supplier already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- product_barcode.fk_barcode_product
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'product_barcode'
     AND CONSTRAINT_NAME = 'fk_barcode_product'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE product_barcode DROP FOREIGN KEY fk_barcode_product',
  'SELECT ''fk_barcode_product already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- price_list_item.fk_pli_list
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'price_list_item'
     AND CONSTRAINT_NAME = 'fk_pli_list'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE price_list_item DROP FOREIGN KEY fk_pli_list',
  'SELECT ''fk_pli_list already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer_group.fk_cg_pricelist
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'customer_group'
     AND CONSTRAINT_NAME = 'fk_cg_pricelist'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE customer_group DROP FOREIGN KEY fk_cg_pricelist',
  'SELECT ''fk_cg_pricelist already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer.fk_customer_group
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'customer'
     AND CONSTRAINT_NAME = 'fk_customer_group'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE customer DROP FOREIGN KEY fk_customer_group',
  'SELECT ''fk_customer_group already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer_email.fk_customer_email_customer
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'customer_email'
     AND CONSTRAINT_NAME = 'fk_customer_email_customer'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE customer_email DROP FOREIGN KEY fk_customer_email_customer',
  'SELECT ''fk_customer_email_customer already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer_payment.fk_cp_customer
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'customer_payment'
     AND CONSTRAINT_NAME = 'fk_cp_customer'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE customer_payment DROP FOREIGN KEY fk_cp_customer',
  'SELECT ''fk_cp_customer already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- customer_revision.fk_cr_customer
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'customer_revision'
     AND CONSTRAINT_NAME = 'fk_cr_customer'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE customer_revision DROP FOREIGN KEY fk_cr_customer',
  'SELECT ''fk_cr_customer already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sale.fk_sale_register
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'sale'
     AND CONSTRAINT_NAME = 'fk_sale_register'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE sale DROP FOREIGN KEY fk_sale_register',
  'SELECT ''fk_sale_register already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sale.fk_sale_user
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'sale'
     AND CONSTRAINT_NAME = 'fk_sale_user'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE sale DROP FOREIGN KEY fk_sale_user',
  'SELECT ''fk_sale_user already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sale.fk_sale_customer
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'sale'
     AND CONSTRAINT_NAME = 'fk_sale_customer'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE sale DROP FOREIGN KEY fk_sale_customer',
  'SELECT ''fk_sale_customer already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sale_item.fk_si_sale
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'sale_item'
     AND CONSTRAINT_NAME = 'fk_si_sale'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE sale_item DROP FOREIGN KEY fk_si_sale',
  'SELECT ''fk_si_sale already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sale_item.fk_si_product
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'sale_item'
     AND CONSTRAINT_NAME = 'fk_si_product'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE sale_item DROP FOREIGN KEY fk_si_product',
  'SELECT ''fk_si_product already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sale_payment.fk_spay_sale
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'sale_payment'
     AND CONSTRAINT_NAME = 'fk_spay_sale'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE sale_payment DROP FOREIGN KEY fk_spay_sale',
  'SELECT ''fk_spay_sale already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- order_product.fk_op_order
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'order_product'
     AND CONSTRAINT_NAME = 'fk_op_order'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE order_product DROP FOREIGN KEY fk_op_order',
  'SELECT ''fk_op_order already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- gift_card_movement.fk_gcm_card
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'gift_card_movement'
     AND CONSTRAINT_NAME = 'fk_gcm_card'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE gift_card_movement DROP FOREIGN KEY fk_gcm_card',
  'SELECT ''fk_gcm_card already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- promotion.fk_promo_category
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'promotion'
     AND CONSTRAINT_NAME = 'fk_promo_category'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE promotion DROP FOREIGN KEY fk_promo_category',
  'SELECT ''fk_promo_category already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- promotion_criteria.fk_pcrit_promo
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'promotion_criteria'
     AND CONSTRAINT_NAME = 'fk_pcrit_promo'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE promotion_criteria DROP FOREIGN KEY fk_pcrit_promo',
  'SELECT ''fk_pcrit_promo already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- stocktake_product.fk_stp_stocktake
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'stocktake_product'
     AND CONSTRAINT_NAME = 'fk_stp_stocktake'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE stocktake_product DROP FOREIGN KEY fk_stp_stocktake',
  'SELECT ''fk_stp_stocktake already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- register_closure.fk_rc_register
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'register_closure'
     AND CONSTRAINT_NAME = 'fk_rc_register'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE register_closure DROP FOREIGN KEY fk_rc_register',
  'SELECT ''fk_rc_register already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- register_closure_payment.fk_rcp_closure
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'register_closure_payment'
     AND CONSTRAINT_NAME = 'fk_rcp_closure'
     AND CONSTRAINT_TYPE = 'FOREIGN KEY') > 0,
  'ALTER TABLE register_closure_payment DROP FOREIGN KEY fk_rcp_closure',
  'SELECT ''fk_rcp_closure already dropped'' AS message'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS = 1;
