-- =====================================================================
-- Orithos POS — MySQL 8.0 schema (reverse-engineered from the live
-- GraphQL API at sea.onorithos.com).
--
-- Derived from the introspected GraphQL types (see graphql-schema-full.json
-- and entity-fields.txt). This is a faithful relational model of the domain
-- for a Spring Boot 3 + MyBatis backend — not the vendor's actual schema.
--
-- Conventions:
--   * Entity IDs are BIGINT AUTO_INCREMENT in MySQL; useGeneratedKeys on insert.
--   * Money/costs            -> DECIMAL(14,4); printed totals DECIMAL(14,2).
--   * Enums                  -> VARCHAR with a comment listing allowed values
--                               (avoids ALTER pain; validate in the app layer).
--   * Rich/dynamic blobs     -> JSON (MySQL 8.0 native).
--   * Soft delete            -> deleted_at DATETIME NULL.
--   * Referential integrity   -> logical FK columns + app JOINs; no MySQL FOREIGN KEY constraints.
--   * Engine/charset         -> InnoDB / utf8mb4.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Company / configuration
-- ---------------------------------------------------------------------
CREATE TABLE vendor (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name            VARCHAR(255) NOT NULL,
  subdomain       VARCHAR(63)  NOT NULL COMMENT 'Public store slug → {subdomain}.orithos.com.au',
  status          VARCHAR(16)  NOT NULL DEFAULT 'active' COMMENT 'trial|active|suspended|expired',
  url             VARCHAR(255) NULL,
  business_type   VARCHAR(32)  NULL COMMENT 'BusinessTypeEnum',
  contact_name    VARCHAR(255) NULL,
  default_tax_rate_id BIGINT NULL,
  trial_ends_at   DATETIME     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'Legacy default outlet id',
  odoo_company_id BIGINT NULL COMMENT 'res.company id in shared Odoo DB',
  odoo_pos_config_id BIGINT NULL COMMENT 'pos.config id',
  odoo_warehouse_id BIGINT NULL COMMENT 'stock.warehouse id',
  odoo_stock_location_id BIGINT NULL COMMENT 'stock.location id (stock)',
  odoo_provision_status VARCHAR(16) NOT NULL DEFAULT 'unmapped' COMMENT 'unmapped|pending|ready|failed',
  odoo_provision_error VARCHAR(512) NULL,
  r2_prefix VARCHAR(128) NULL COMMENT 'e.g. shopfront/{subdomain}/',

  PRIMARY KEY (id),
  UNIQUE KEY uq_vendor_subdomain (subdomain),
  KEY idx_vendor_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Key/value settings, scoped to vendor | outlet | register | user
CREATE TABLE settings (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  scope_type  VARCHAR(16)  NOT NULL COMMENT 'vendor|outlet|register|user',
  scope_id BIGINT NULL,
  name        VARCHAR(128) NOT NULL,
  value       TEXT         NULL,
  datatype    VARCHAR(32)  NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_settings_outlet (outlet_id),
  UNIQUE KEY uq_settings (scope_type, scope_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reusable address/contact block (referenced by customer, supplier, outlet…)
CREATE TABLE contact (
  id BIGINT NOT NULL AUTO_INCREMENT,
  address_street1 VARCHAR(255) NULL,
  address_street2 VARCHAR(255) NULL,
  address_suburb  VARCHAR(128) NULL,
  address_city    VARCHAR(128) NULL,
  address_postcode VARCHAR(16) NULL,
  address_region  VARCHAR(128) NULL,
  address_country VARCHAR(128) NULL,
  email           VARCHAR(255) NULL,
  fax             VARCHAR(64)  NULL,
  phone           VARCHAR(64)  NULL,
  mobile          VARCHAR(64)  NULL,
  website         VARCHAR(255) NULL,
  twitter         VARCHAR(255) NULL,
  facebook        VARCHAR(255) NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_contact_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE outlet (
  id BIGINT NOT NULL AUTO_INCREMENT,
  vendor_id BIGINT NOT NULL DEFAULT 1 COMMENT 'Owning SaaS vendor',
  name             VARCHAR(255) NOT NULL,
  contact_id BIGINT NULL,
  logo             VARCHAR(512) NULL,
  business_number  VARCHAR(64)  NULL,
  loyalty_enabled  TINYINT(1)   NOT NULL DEFAULT 0,
  loyalty_name     VARCHAR(128) NULL,
  loyalty_earn_rate   DECIMAL(14,4) NULL,
  loyalty_redeem_rate DECIMAL(14,4) NULL,
  has_kitchen_screen TINYINT(1) NOT NULL DEFAULT 0,
  ticketing_price_set_id BIGINT NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at       DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_outlet_vendor (vendor_id),
  KEY idx_outlet_contact (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tax_rate (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name       VARCHAR(128)  NOT NULL,
  amount     DECIMAL(8,4)  NOT NULL COMMENT 'rate %, e.g. 10.0000',
  mdb_id     INT           NULL,
  is_default TINYINT(1)    NOT NULL DEFAULT 0,
  deleted_at DATETIME      NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_tax_rate_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payment_method (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name          VARCHAR(128) NOT NULL,
  type          VARCHAR(32)  NOT NULL COMMENT 'PaymentMethodTypeEnum: CASH,EFTPOS,CHEQUE,...',
  surcharge     DECIMAL(8,4) NULL,
  always_open_drawer TINYINT(1) NOT NULL DEFAULT 0,
  always_print  TINYINT(1)   NOT NULL DEFAULT 0,
  use_rounding  TINYINT(1)   NOT NULL DEFAULT 0,
  default_pay_exact TINYINT(1) NOT NULL DEFAULT 0,
  cashout_method_id BIGINT NULL,
  gateway_url   VARCHAR(512) NULL,
  background_colour VARCHAR(16) NULL,
  text_colour   VARCHAR(16)  NULL,
  deleted_at    DATETIME     NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_payment_method_outlet (outlet_id),
  KEY idx_pm_cashout (cashout_method_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE register (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name           VARCHAR(128) NOT NULL,
  outlet_id BIGINT NOT NULL,
  invoice_number VARCHAR(64)  NULL,
  open_time      DATETIME     NULL,
  closed         TINYINT(1)   NOT NULL DEFAULT 0,
  surcharging    JSON         NULL COMMENT 'register surcharging config',
  deleted_at     DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_register_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Registers <-> accepted payment methods (M:N)
CREATE TABLE register_payment_method (
  register_id BIGINT NOT NULL,
  payment_method_id BIGINT NOT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (register_id, payment_method_id),
  KEY idx_register_payment_method_outlet (outlet_id),
  KEY fk_rpm_pm (payment_method_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE receipt (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name           VARCHAR(128) NOT NULL,
  type           VARCHAR(32)  NULL COMMENT 'ReceiptTypeEnum',
  components     JSON         NULL,
  receipt_width  INT          NULL,
  account_receipt TINYINT(1)  NOT NULL DEFAULT 0,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_receipt_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE statement (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name       VARCHAR(128) NOT NULL,
  components JSON         NULL,
  signature  TEXT         NULL,
  reply_to   VARCHAR(255) NULL,
  subject    VARCHAR(255) NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_statement_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE transferee (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name          VARCHAR(255) NOT NULL,
  contact_id BIGINT NULL,
  order_automatic_email TINYINT(1) NOT NULL DEFAULT 0,
  email_format  VARCHAR(32)  NULL COMMENT 'EmailFormatEnum',
  send_orders_to_accounts_flow TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at    DATETIME     NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_transferee_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Users, roles & permissions  (back JWT auth)
-- ---------------------------------------------------------------------
CREATE TABLE role (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name       VARCHAR(128) NOT NULL,
  managed_id VARCHAR(64)  NULL COMMENT 'ManagedRoleIdTypeEnum',
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_role_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE permission (
  id        INT          NOT NULL,
  name      VARCHAR(128) NOT NULL,
  safe_name VARCHAR(128) NULL,
  section   VARCHAR(128) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE role_permission (
  role_id BIGINT NOT NULL,
  permission_id INT      NOT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (role_id, permission_id),
  KEY idx_role_permission_outlet (outlet_id),
  KEY fk_rp_perm (permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE app_user (
  id BIGINT NOT NULL AUTO_INCREMENT,
  vendor_id BIGINT NOT NULL DEFAULT 1 COMMENT 'Owning SaaS vendor',
  name          VARCHAR(255) NOT NULL,
  username      VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL COMMENT 'BCrypt — never store plaintext',
  email         VARCHAR(255) NULL,
  phone         VARCHAR(64)  NULL,
  image         VARCHAR(512) NULL,
  role_id BIGINT NULL,
  is_admin      TINYINT(1)   NOT NULL DEFAULT 0,
  is_api_user   TINYINT(1)   NOT NULL DEFAULT 0,
  dark_mode     VARCHAR(16)  NOT NULL DEFAULT 'default' COMMENT 'UserDarkModeEnum',
  dashboard     JSON         NULL,
  pending_password_reset TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at    DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_app_user_outlet (outlet_id),
  KEY idx_app_user_vendor (vendor_id),
  UNIQUE KEY uq_user_vendor_username (vendor_id, username),
  KEY idx_user_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reporting access: user <-> outlet (M:N)
CREATE TABLE user_reporting_outlet (
  user_id BIGINT NOT NULL,
  outlet_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Product classifications
-- ---------------------------------------------------------------------
CREATE TABLE brand (
  id BIGINT NOT NULL AUTO_INCREMENT, name VARCHAR(255) NOT NULL, mdb_id INT NULL,
  deleted_at DATETIME NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',
  PRIMARY KEY (id),
  KEY idx_brand_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE category (
  id BIGINT NOT NULL AUTO_INCREMENT, name VARCHAR(255) NOT NULL, mdb_id INT NULL,
  metcash_msc VARCHAR(64) NULL, deleted_at DATETIME NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',
  PRIMARY KEY (id),
  KEY idx_category_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE family (
  id BIGINT NOT NULL AUTO_INCREMENT, name VARCHAR(255) NOT NULL, mdb_id INT NULL,
  deleted_at DATETIME NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',
  PRIMARY KEY (id),
  KEY idx_family_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tag (
  id BIGINT NOT NULL AUTO_INCREMENT, name VARCHAR(255) NOT NULL, mdb_id INT NULL,
  deleted_at DATETIME NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',
  PRIMARY KEY (id),
  KEY idx_tag_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE price_set (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name      VARCHAR(128) NOT NULL,
  parent_id BIGINT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_price_set_outlet (outlet_id),
  KEY idx_priceset_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE barcode_template (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  template TEXT      NULL,
  recalculate_quantity TINYINT(1) NOT NULL DEFAULT 0,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_barcode_template_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------
CREATE TABLE supplier (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name            VARCHAR(255) NOT NULL,
  mdb_id          INT          NULL,
  status          VARCHAR(32)  NULL COMMENT 'SupplierStatusEnum',
  contact_id BIGINT NULL,
  business_number VARCHAR(64)  NULL,
  account_number  VARCHAR(64)  NULL,
  order_notes     TEXT         NULL,
  internal_order_notes TEXT    NULL,
  order_automatic_email TINYINT(1) NOT NULL DEFAULT 0,
  default_order_tax VARCHAR(32) NULL COMMENT 'DefaultOrderTaxEnum',
  email_format    VARCHAR(32)  NULL COMMENT 'EmailFormatEnum',
  comments        TEXT         NULL,
  fee_amount      DECIMAL(14,4) NULL,
  distribute_fees VARCHAR(32)  NULL COMMENT 'DistributeFeesEnum',
  distribute_freight VARCHAR(32) NULL COMMENT 'DistributeFreightEnum',
  freight_included_on_invoices TINYINT(1) NOT NULL DEFAULT 1,
  freight_tax_id BIGINT NULL,
  fees_tax_id BIGINT NULL,
  allow_order_below_minimum TINYINT(1) NOT NULL DEFAULT 0,
  minimum_order_value DECIMAL(14,2) NULL,
  maximum_order_value DECIMAL(14,2) NULL,
  default_days_until_due INT    NULL,
  freight_fixed_cost_per_case DECIMAL(14,4) NULL,
  deleted_at      DATETIME     NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_supplier_outlet (outlet_id),
  KEY idx_supplier_contact (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Products + their per-outlet / per-set child rows
-- ---------------------------------------------------------------------
CREATE TABLE product (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name            VARCHAR(255) NOT NULL,
  mdb_id          INT          NULL,
  type            VARCHAR(32)  NOT NULL COMMENT 'ProductTypeEnum',
  status          VARCHAR(32)  NOT NULL COMMENT 'ProductStatusEnum: ACTIVE,INACTIVE,...',
  description     TEXT         NULL,
  category_id BIGINT NULL,
  brand_id BIGINT NULL,
  family_id BIGINT NULL,
  align_family    TINYINT(1)   NOT NULL DEFAULT 0,
  core_supplier_id BIGINT NULL,
  tax_rate_id BIGINT NULL,
  cost_tax_rate_id BIGINT NULL,
  cost            DECIMAL(14,4) NULL,
  case_quantity   DECIMAL(14,4) NOT NULL COMMENT '箱规（每箱数量，必须大于 0）',
  cost_percentage TINYINT(1)   NOT NULL DEFAULT 0,
  track_inventory TINYINT(1)   NOT NULL DEFAULT 1,
  use_scales      TINYINT(1)   NOT NULL DEFAULT 0,
  use_barcode_templates TINYINT(1) NOT NULL DEFAULT 0,
  use_price_label TINYINT(1)   NOT NULL DEFAULT 0,
  prevent_manual_discounts TINYINT(1) NOT NULL DEFAULT 0,
  request_quantity TINYINT(1)  NOT NULL DEFAULT 0,
  request_price   TINYINT(1)   NOT NULL DEFAULT 0,
  show_shortcuts  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否在收银屏显示快捷键',
  abv             DECIMAL(5,2) NULL COMMENT 'Alcohol by volume percent; required for liquor',
  volume_ml       INT          NULL COMMENT 'Container size in millilitres',
  region          VARCHAR(128) NULL COMMENT 'Wine region or place of origin',
  vintage         VARCHAR(16)  NULL COMMENT 'Vintage year or NV',
  order_notes     TEXT         NULL,
  invoice_notes   TEXT         NULL,
  ticket_information JSON      NULL,
  image           VARCHAR(512) NULL,
  alternate_images JSON        NULL,
  metcash_msc     VARCHAR(64)  NULL,
  temp_product    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME     NULL,
  active_name     VARCHAR(255) GENERATED ALWAYS AS (IF(deleted_at IS NULL, LOWER(TRIM(name)), NULL)) STORED,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_product_outlet (outlet_id),
  KEY idx_product_category (category_id),
  KEY idx_product_brand (brand_id),
  KEY idx_product_family (family_id),
  KEY idx_product_name (name),
  UNIQUE KEY uq_product_active_name (active_name),
  KEY fk_product_tax (tax_rate_id),
  CONSTRAINT chk_product_case_quantity_positive CHECK (case_quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_tag (
  product_id BIGINT NOT NULL,
  tag_id BIGINT NOT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (product_id, tag_id),
  KEY idx_product_tag_outlet (outlet_id),
  KEY fk_pt_tag (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_price (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  price_set_id BIGINT NULL,
  quantity    DECIMAL(14,4) NOT NULL DEFAULT 1 COMMENT '价格数量档位（必须大于 0）',
  price       DECIMAL(14,4) NOT NULL,
  price_ex    DECIMAL(14,4) NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_product_price_outlet (outlet_id),
  KEY idx_pp_product (product_id),
  CONSTRAINT chk_product_price_quantity_positive CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_inventory (
  product_id BIGINT NOT NULL,
  outlet_id BIGINT NOT NULL,
  quantity       DECIMAL(14,4) NOT NULL DEFAULT 0,
  reorder_level  DECIMAL(14,4) NULL,
  reorder_amount DECIMAL(14,4) NULL,
  reorder_limit  DECIMAL(14,4) NULL,
  max_quantity   DECIMAL(14,4) NULL,
  reorder_rounding VARCHAR(32) NULL DEFAULT 'NONE',
  on_order       DECIMAL(14,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, outlet_id),
  KEY fk_pi_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_cost (
  product_id BIGINT NOT NULL,
  outlet_id BIGINT NOT NULL,
  cost         DECIMAL(14,4) NULL,
  last_cost    DECIMAL(14,4) NULL,
  average_cost DECIMAL(14,4) NULL,
  PRIMARY KEY (product_id, outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_supplier (
  id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  product_id  BIGINT       NOT NULL COMMENT '商品 ID，关联 product.id',
  supplier_id BIGINT       NOT NULL COMMENT '供应商 ID，关联 supplier.id',
  code        VARCHAR(128) NULL COMMENT '供应商商品编码（SKU）',
  minimum_order_quantity INT NULL COMMENT '该供应商最小订货量',
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_product_supplier_outlet (outlet_id),
  KEY idx_ps_product (product_id),
  KEY idx_ps_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_barcode (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  code         VARCHAR(128) NOT NULL,
  quantity     DECIMAL(14,4) NOT NULL DEFAULT 1,
  template_id BIGINT NULL,
  promotion_price DECIMAL(14,4) NULL,
  last_sold_at DATETIME     NULL,
  last_stocktaked_at DATETIME NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_product_barcode_outlet (outlet_id),
  UNIQUE KEY uq_barcode_code (code),
  KEY idx_barcode_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE future_price (
  id BIGINT NOT NULL AUTO_INCREMENT,
  product_id BIGINT NULL,
  price_set_id BIGINT NULL,
  quantity     DECIMAL(14,4) NOT NULL DEFAULT 1 COMMENT '价格数量档位（必须大于 0）',
  price        DECIMAL(14,4) NOT NULL,
  price_ex     DECIMAL(14,4) NULL,
  user_id BIGINT NULL,
  effective_time DATETIME   NOT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_future_price_outlet (outlet_id),
  KEY idx_fp_product (product_id),
  CONSTRAINT chk_future_price_quantity_positive CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Customers & pricing
-- ---------------------------------------------------------------------
CREATE TABLE price_list (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name      VARCHAR(128) NOT NULL,
  allow_higher_price TINYINT(1) NOT NULL DEFAULT 0,
  allow_discounting_promotions TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_price_list_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE price_list_item (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  price_list_id BIGINT NOT NULL,
  classification_type VARCHAR(32) NULL COMMENT 'ProductClassificationTypeEnum',
  item_id BIGINT NULL COMMENT 'product/brand/category/family/tag id',
  exclude       TINYINT(1)   NOT NULL DEFAULT 0,
  rule          VARCHAR(32)  NULL COMMENT 'PriceListRuleEnum',
  amount        DECIMAL(14,4) NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_price_list_item_outlet (outlet_id),
  KEY idx_pli_list (price_list_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customer_group (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name            VARCHAR(255) NOT NULL,
  default_receipt_id BIGINT NULL,
  email_receipt_id BIGINT NULL,
  payment_receipt_id BIGINT NULL,
  statement_template_id BIGINT NULL,
  price_list_id BIGINT NULL,
  loyalty_enabled TINYINT(1)   NOT NULL DEFAULT 0,
  loyalty_rate    DECIMAL(14,4) NULL,
  disable_promotions TINYINT(1) NOT NULL DEFAULT 0,
  allow_account_sales TINYINT(1) NOT NULL DEFAULT 0,
  account_limit   DECIMAL(14,2) NULL,
  auto_print_receipt TINYINT(1) NOT NULL DEFAULT 0,
  auto_print_parked_receipt TINYINT(1) NOT NULL DEFAULT 0,
  auto_email_receipt TINYINT(1) NOT NULL DEFAULT 0,
  auto_print_payment_receipt TINYINT(1) NOT NULL DEFAULT 0,
  require_order_reference TINYINT(1) NOT NULL DEFAULT 0,
  credit_terms    VARCHAR(32)  NULL COMMENT 'TimePeriod, e.g. 30 days',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME     NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_customer_group_outlet (outlet_id),
  KEY fk_cg_pricelist (price_list_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customer (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name             VARCHAR(255) NULL,
  first_name       VARCHAR(128) NULL,
  last_name        VARCHAR(128) NULL,
  code             VARCHAR(64)  NULL,
  company          VARCHAR(255) NULL,
  business_number  VARCHAR(64)  NULL,
  birthday         DATE         NULL,
  gender           VARCHAR(32)  NULL,
  billing_contact_id BIGINT NULL,
  delivery_contact_id BIGINT NULL,
  email            VARCHAR(255) NULL,
  phone            VARCHAR(64)  NULL,
  mobile           VARCHAR(64)  NULL,
  fax              VARCHAR(64)  NULL,
  allow_marketing_emails TINYINT(1) NOT NULL DEFAULT 1,
  invoice_message  TEXT         NULL,
  comments         TEXT         NULL,
  customer_group_id BIGINT NULL,
  override_customer_group TINYINT(1) NOT NULL DEFAULT 0,
  loyalty_enabled  TINYINT(1)   NOT NULL DEFAULT 0,
  loyalty_rate     DECIMAL(14,4) NULL,
  loyalty_points   DECIMAL(14,4) NOT NULL DEFAULT 0,
  disable_promotions TINYINT(1) NOT NULL DEFAULT 0,
  price_list_id BIGINT NULL,
  require_order_reference TINYINT(1) NOT NULL DEFAULT 0,
  account_limit    DECIMAL(14,2) NULL,
  current_owing    DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at       DATETIME     NULL,
  active_code      VARCHAR(64) GENERATED ALWAYS AS (IF(deleted_at IS NULL, LOWER(TRIM(code)), NULL)) STORED,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_customer_outlet (outlet_id),
  KEY idx_customer_group (customer_group_id),
  KEY idx_customer_name (name),
  UNIQUE KEY uq_customer_active_code (active_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customer_email (
  id BIGINT NOT NULL AUTO_INCREMENT,
  customer_id BIGINT NOT NULL,
  email       VARCHAR(255) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  customer_deleted_at DATETIME NULL,
  active_email VARCHAR(255) GENERATED ALWAYS AS (IF(customer_deleted_at IS NULL, LOWER(TRIM(email)), NULL)) STORED,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_customer_email_outlet (outlet_id),
  KEY idx_customer_email_customer (customer_id),
  UNIQUE KEY uq_customer_email_active (active_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_revision (
  id BIGINT NOT NULL AUTO_INCREMENT,
  customer_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  action VARCHAR(32) NOT NULL,
  field_name VARCHAR(128) NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  summary VARCHAR(512) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_customer_revision_outlet (outlet_id),
  KEY idx_cr_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_group_revision (
  id BIGINT NOT NULL AUTO_INCREMENT,
  customer_group_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  action VARCHAR(32) NOT NULL,
  field_name VARCHAR(128) NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  summary VARCHAR(512) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_customer_group_revision_outlet (outlet_id),
  KEY idx_cgr_group (customer_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_revision (
  id BIGINT NOT NULL AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  action VARCHAR(32) NOT NULL,
  field_name VARCHAR(128) NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  summary VARCHAR(512) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_product_revision_outlet (outlet_id),
  KEY idx_pr_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customer_payment (
  id BIGINT NOT NULL AUTO_INCREMENT,
  customer_id BIGINT NOT NULL,
  payment_method_id BIGINT NULL,
  user_id BIGINT NULL,
  register_id BIGINT NULL,
  reference       VARCHAR(128) NULL,
  status          VARCHAR(32)  NULL COMMENT 'CustomerPaymentStatusEnum',
  start_balance   DECIMAL(14,2) NULL,
  amount          DECIMAL(14,2) NOT NULL,
  rounding        DECIMAL(14,4) NULL,
  timestamp       DATETIME     NOT NULL,
  relates_to_id BIGINT NULL,
  cancelled_at    DATETIME     NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_customer_payment_outlet (outlet_id),
  KEY idx_cp_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------
CREATE TABLE sale (
  id BIGINT NOT NULL AUTO_INCREMENT,
  client_id     VARCHAR(64)  NULL,
  linked_sale_id BIGINT NULL,
  register_id BIGINT NULL,
  user_id BIGINT NULL,
  customer_id BIGINT NULL,
  status        VARCHAR(32)  NOT NULL COMMENT 'SaleStatusEnum: COMPLETED,VOIDED,PARKED,...',
  account_sale  TINYINT(1)   NOT NULL DEFAULT 0,
  invoice_id    VARCHAR(64)  NULL,
  note          TEXT         NULL,
  internal_note TEXT         NULL,
  order_reference VARCHAR(128) NULL,
  discount_amount VARCHAR(32) NULL COMMENT 'SaleDiscount.amount (value or %)',
  discount_reason VARCHAR(255) NULL,
  loyalty_value DECIMAL(14,4) NULL,
  total_quantity INT         NOT NULL DEFAULT 0,
  total_cost    DECIMAL(14,4) NULL,
  total_savings DECIMAL(14,2) NULL,
  total_discount DECIMAL(14,2) NULL,
  total_tax     DECIMAL(14,2) NULL,
  cashout       DECIMAL(14,2) NULL,
  total_change  DECIMAL(14,2) NULL,
  total_rounding DECIMAL(14,4) NULL,
  total_price   DECIMAL(14,2) NOT NULL DEFAULT 0,
  outstanding   DECIMAL(14,2) NOT NULL DEFAULT 0,
  refund_reason VARCHAR(255) NULL,
  meta_data     JSON         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  business_date DATE         NULL COMMENT 'Australia/Sydney civil date of the sale',
  local_sold_at DATETIME     NULL COMMENT 'Australia/Sydney wall time of the sale',
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  uploaded_at   DATETIME     NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_sale_outlet (outlet_id),
  KEY idx_sale_business_date (outlet_id, business_date),
  KEY idx_sale_register (register_id),
  KEY idx_sale_customer (customer_id),
  KEY idx_sale_invoice (invoice_id),
  KEY idx_sale_created (created_at),
  KEY fk_sale_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sale_item (
  id BIGINT NOT NULL AUTO_INCREMENT,
  sale_id BIGINT NOT NULL,
  product_id BIGINT NULL,
  quantity    DECIMAL(14,4) NOT NULL,
  case_quantity DECIMAL(14,4) NULL,
  cost        DECIMAL(14,4) NULL,
  base_price  DECIMAL(14,4) NULL,
  total_price DECIMAL(14,2) NULL,
  savings     DECIMAL(14,2) NULL,
  tax         DECIMAL(14,2) NULL,
  tax_rate_id BIGINT NULL,
  discount_amount VARCHAR(32) NULL,
  discount_reason VARCHAR(255) NULL,
  note        VARCHAR(255) NULL,
  loyalty_value DECIMAL(14,4) NULL,
  meta_data   JSON         NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_sale_item_outlet (outlet_id),
  KEY idx_si_sale (sale_id),
  KEY idx_si_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sale_payment (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  sale_id BIGINT NOT NULL,
  payment_method_id BIGINT NULL,
  subtype     VARCHAR(64)  NULL,
  register_id BIGINT NULL,
  status      VARCHAR(32)  NULL COMMENT 'PaymentStatusEnum',
  amount      DECIMAL(14,2) NOT NULL,
  rounding    DECIMAL(14,4) NULL,
  cashout     DECIMAL(14,2) NULL,
  process_time DATETIME    NULL,
  receipt     TEXT         NULL,
  customer_payment_id BIGINT NULL,
  cancelled_at DATETIME    NULL,
  meta_data   JSON         NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_sale_payment_outlet (outlet_id),
  KEY idx_spay_sale (sale_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Purchase / transfer orders  (GraphQL "Order"; ORDER is reserved in SQL)
-- ---------------------------------------------------------------------
CREATE TABLE purchase_order (
  id BIGINT NOT NULL AUTO_INCREMENT,
  type          VARCHAR(32)  NOT NULL COMMENT 'OrderTypeEnum: ORDER,TRANSFER,CREDIT,...',
  status        VARCHAR(32)  NOT NULL COMMENT 'OrderStatusEnum: OPEN,SENT,RECEIVED,CANCELLED,...',
  from_id BIGINT NULL COMMENT 'supplier/outlet id',
  to_id BIGINT NULL COMMENT 'outlet/transferee id',
  order_date    DATE         NULL,
  due_date      DATE         NULL,
  entered_as    VARCHAR(32)  NULL COMMENT 'DefaultOrderTaxEnum',
  invoice_number VARCHAR(64) NULL,
  reference     VARCHAR(128) NULL,
  notes         TEXT         NULL,
  internal_notes TEXT        NULL,
  include_freight TINYINT(1) NOT NULL DEFAULT 0,
  total_cost    DECIMAL(14,2) NULL,
  expected_total DECIMAL(14,2) NULL,
  fee_percentage DECIMAL(8,4) NULL,
  line_count    INT          NOT NULL DEFAULT 0,
  created_by_id BIGINT NULL,
  sent_by_id BIGINT NULL,
  received_by_id BIGINT NULL,
  merged_into_id BIGINT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at       DATETIME     NULL,
  received_at   DATETIME     NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_purchase_order_outlet (outlet_id),
  KEY idx_po_status (status),
  KEY idx_po_invoice (invoice_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE order_product (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  product_id BIGINT NULL,
  supplier_id BIGINT NULL,
  supplier_code VARCHAR(128) NULL,
  case_quantity DECIMAL(14,4) NULL,
  ordered_quantity DECIMAL(14,4) NULL,
  received_quantity DECIMAL(14,4) NULL,
  base_cost   DECIMAL(14,4) NULL,
  ordered_cost DECIMAL(14,4) NULL,
  fees        DECIMAL(14,4) NULL,
  freight     DECIMAL(14,4) NULL,
  rebate      DECIMAL(14,4) NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_order_product_outlet (outlet_id),
  KEY idx_op_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Gift cards
-- ---------------------------------------------------------------------
CREATE TABLE gift_card (
  id BIGINT NOT NULL AUTO_INCREMENT,
  client_id       VARCHAR(64)  NULL,
  outlet_id BIGINT NULL,
  code            VARCHAR(64)  NOT NULL,
  original_amount DECIMAL(14,2) NOT NULL,
  current_amount  DECIMAL(14,2) NOT NULL,
  expiry          DATETIME     NULL,
  status          VARCHAR(32)  NOT NULL COMMENT 'GiftCardStatusEnum',
  PRIMARY KEY (id),
  UNIQUE KEY uq_giftcard_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE gift_card_movement (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  gift_card_id BIGINT NOT NULL,
  sale_id BIGINT NULL,
  register_id BIGINT NULL,
  amount       DECIMAL(14,2) NOT NULL,
  action       VARCHAR(32)  NOT NULL COMMENT 'GiftCardMovementActionEnum: SOLD,REDEEMED',
  timestamp    DATETIME     NOT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_gift_card_movement_outlet (outlet_id),
  KEY idx_gcm_card (gift_card_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------
CREATE TABLE promotion_category (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name      VARCHAR(255) NOT NULL,
  mdb_id    INT          NULL,
  show_on_order TINYINT(1) NOT NULL DEFAULT 0,
  include_in_integrations TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME    NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_promotion_category_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE promotion (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name          VARCHAR(255) NOT NULL,
  mdb_id        INT          NULL,
  client_id     VARCHAR(64)  NULL,
  promotion_category_id BIGINT NULL,
  start         DATETIME     NULL,
  end           DATETIME     NULL,
  express       TINYINT(1)   NOT NULL DEFAULT 0,
  mix_criteria  TINYINT(1)   NOT NULL DEFAULT 0,
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  sale_max_application_count INT NULL,
  deleted_at    DATETIME     NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_promotion_outlet (outlet_id),
  KEY idx_promo_category (promotion_category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE promotion_criteria (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  promotion_id BIGINT NOT NULL,
  type         VARCHAR(32)  NULL COMMENT 'PromotionTypeEnum',
  buy_amount   DECIMAL(14,4) NULL,
  buy_amount_max DECIMAL(14,4) NULL,
  buy_amount_type VARCHAR(32) NULL COMMENT 'PromotionBuyAmountTypeEnum',
  discount_amount DECIMAL(14,4) NULL,
  min_quantity DECIMAL(14,4) NULL,
  quantity_type VARCHAR(32) NULL COMMENT 'PromotionQuantityTypeEnum',
  mixed_only   TINYINT(1)   NOT NULL DEFAULT 0,
  optional     TINYINT(1)   NOT NULL DEFAULT 0,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_promotion_criteria_outlet (outlet_id),
  KEY idx_pcrit_promo (promotion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Promotion <-> customer groups / outlets (M:N)
CREATE TABLE promotion_customer_group (
  promotion_id BIGINT NOT NULL, customer_group_id BIGINT NOT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (promotion_id, customer_group_id),
  KEY idx_promotion_customer_group_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE promotion_outlet (
  promotion_id BIGINT NOT NULL, outlet_id BIGINT NOT NULL,
  PRIMARY KEY (promotion_id, outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Stocktake
-- ---------------------------------------------------------------------
CREATE TABLE stocktake (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(32)  NULL COMMENT 'StocktakeTypeEnum',
  outlet_id BIGINT NULL,
  status        VARCHAR(32)  NOT NULL COMMENT 'StocktakeStatusEnum',
  display_expected TINYINT(1) NOT NULL DEFAULT 1,
  applied       TINYINT(1)   NOT NULL DEFAULT 0,
  completed_by_id BIGINT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at  DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_stocktake_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stocktake_product (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  stocktake_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  cost         DECIMAL(14,4) NULL,
  case_quantity DECIMAL(14,4) NULL,
  scanned      TINYINT(1)   NOT NULL DEFAULT 0,
  expected_count DECIMAL(14,4) NULL,
  expected_value DECIMAL(14,2) NULL,
  actual_count DECIMAL(14,4) NULL,
  actual_value DECIMAL(14,2) NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_stocktake_product_outlet (outlet_id),
  KEY idx_stp_stocktake (stocktake_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Register closures
-- ---------------------------------------------------------------------
CREATE TABLE register_closure (
  id BIGINT NOT NULL AUTO_INCREMENT,
  register_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  movement      DECIMAL(14,2) NULL,
  total_expected DECIMAL(14,2) NULL,
  total_received DECIMAL(14,2) NULL,
  total_transactions INT     NULL,
  total_surcharge DECIMAL(14,2) NULL,
  opened_at     DATETIME     NULL,
  closed_at     DATETIME     NULL,
  note          TEXT         NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_register_closure_outlet (outlet_id),
  KEY idx_rc_register (register_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE register_closure_payment (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  closure_id BIGINT NOT NULL,
  payment_method_id BIGINT NULL,
  expected     DECIMAL(14,2) NULL,
  received     DECIMAL(14,2) NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_register_closure_payment_outlet (outlet_id),
  KEY idx_rcp_closure (closure_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Misc / utilities
-- ---------------------------------------------------------------------
CREATE TABLE notification (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  notifiable_type VARCHAR(32) NULL COMMENT 'NotifiableTypeEnum',
  notifiable_id BIGINT NULL,
  data        JSON         NULL,
  read_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_notification_outlet (outlet_id),
  KEY idx_notif_target (notifiable_type, notifiable_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE security_event (
  id BIGINT NOT NULL AUTO_INCREMENT,
  outlet_id BIGINT NULL,
  register_id BIGINT NULL,
  user_id BIGINT NULL,
  device_id   VARCHAR(64)  NULL,
  event       VARCHAR(64)  NOT NULL COMMENT 'SecurityEventEnum: LOGIN,LOCATION_CHANGE,...',
  meta_data   JSON         NULL,
  ipv4        VARCHAR(15)  NULL,
  ipv6        VARCHAR(45)  NULL,
  user_agent  VARCHAR(512) NULL,
  timestamp   DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sec_event (event),
  KEY idx_sec_time (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mail_log (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  recipient  VARCHAR(255) NOT NULL,
  subject    VARCHAR(512) NULL,
  status     VARCHAR(32)  NULL COMMENT 'DELIVERED,BOUNCED,PENDING',
  sent_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_mail_log_outlet (outlet_id),
  KEY idx_mail_recipient (recipient)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vendor_connection (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL,
  sender_code VARCHAR(64)  NULL,
  customer_id BIGINT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_vendor_connection_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Soft-deleted recoverable items (Trashed Items page)
CREATE TABLE trashed_item (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  item_type   VARCHAR(32)  NOT NULL COMMENT 'RecoverableTrashTypeEnum: PRODUCT,CUSTOMER,SUPPLIER,...',
  item_id BIGINT NOT NULL,
  name        VARCHAR(255) NULL,
  deleted_at  DATETIME     NOT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_trashed_item_outlet (outlet_id),
  KEY idx_trash_type (item_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- NOT a DB table — these live in Redis 7.0 (your chosen cache layer):
--   * JWT denylist / refresh tokens      -> key: jwt:blacklist:<jti>  (TTL = token exp)
--   * Report cache (POST /reports)        -> key: report:<cache.id>   (see API.md DSL)
--     the live API returns cache { id, expiry } — mirror with Redis TTL.
--   * GraphQL/global rate-limit counters  -> x-ratelimit-* (limit 300) -> INCR + EXPIRE
--   * Session / "register in use" lock     -> lockResource/unlockResource mutations
-- =====================================================================

-- Added for the Utilities /api/future-costs endpoints (mirrors future_price).
CREATE TABLE IF NOT EXISTS future_cost (
  id BIGINT NOT NULL AUTO_INCREMENT,
  product_id BIGINT NULL,
  supplier_id BIGINT NULL,
  quantity     DECIMAL(14,4) NOT NULL DEFAULT 1,
  cost         DECIMAL(14,4) NOT NULL,
  cost_ex      DECIMAL(14,4) NULL,
  user_id BIGINT NULL,
  effective_time DATETIME   NOT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_future_cost_outlet (outlet_id),
  KEY idx_fc_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- Config / integration / ticketing domains (added to round out the API).
-- Self-contained (no cross-FK constraints) so init order is irrelevant.
-- Field sets mirror the live GraphQL types.
-- =====================================================================

CREATE TABLE IF NOT EXISTS integration (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255) NULL,
  type        VARCHAR(64)  NULL,
  enabled     TINYINT(1)   NOT NULL DEFAULT 0,
  config      JSON         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_integration_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS webhook (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name          VARCHAR(255) NULL,
  url           VARCHAR(512) NULL,
  events        VARCHAR(64)  NULL COMMENT 'WebhookEventEnum',
  signature_key VARCHAR(255) NULL,
  integration_id BIGINT NULL,
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_webhook_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS push_device (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name          VARCHAR(255) NULL,
  endpoint      VARCHAR(512) NULL,
  notifications JSON         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_push_device_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_display (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name        VARCHAR(255) NULL,
  main_colour VARCHAR(32)  NULL,
  text_colour VARCHAR(32)  NULL,
  idle        JSON         NULL,
  sale        JSON         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_customer_display_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sale_keys (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name       VARCHAR(255) NULL,
  sale_keys  JSON         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_sale_keys_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kitchen_screen (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name       VARCHAR(255) NULL,
  rules      JSON         NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_kitchen_screen_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shelf_ticket (
  id BIGINT NOT NULL AUTO_INCREMENT,
  product_id BIGINT NULL,
  outlet_id BIGINT NULL,
  user_id BIGINT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_shelf_ticket_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_template (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(255) NULL,
  styles                TEXT         NULL,
  transformation_script TEXT         NULL,
  width                 DECIMAL(14,4) NULL,
  height                DECIMAL(14,4) NULL,
  fonts                 VARCHAR(512) NULL,
  fields_tracked        TEXT         NULL,
  options               JSON         NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_ticket_template_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_template_page (
  id BIGINT NOT NULL AUTO_INCREMENT,
  ticket_template_id BIGINT NULL,
  name                     VARCHAR(255) NULL,
  horizontal_panels        INT          NULL,
  vertical_panels          INT          NULL,
  page_width               DECIMAL(14,4) NULL,
  page_height              DECIMAL(14,4) NULL,
  page_margin              VARCHAR(64)  NULL,
  horizontal_panel_spacing DECIMAL(14,4) NULL,
  vertical_panel_spacing   DECIMAL(14,4) NULL,
  cutting_width            DECIMAL(14,4) NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_ticket_template_page_outlet (outlet_id),
  KEY idx_ttp_template (ticket_template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS buying_period (
  id BIGINT NOT NULL AUTO_INCREMENT,
  item_id BIGINT NULL,
  item_type   VARCHAR(32)  NULL,
  outlet_id BIGINT NULL,
  supplier_id BIGINT NULL,
  start       DATETIME     NULL,
  end         DATETIME     NULL,
  quantity    DECIMAL(14,4) NULL,
  cost        DECIMAL(14,4) NULL,
  PRIMARY KEY (id),
  KEY idx_bp_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_backorder (
  id BIGINT NOT NULL AUTO_INCREMENT,
  product_id BIGINT NULL,
  customer_id BIGINT NULL,
  outlet_id BIGINT NULL,
  on_order_id BIGINT NULL,
  quantity        DECIMAL(14,4) NULL,
  recurring_period VARCHAR(32) NULL COMMENT 'TimePeriod',
  next_due_date   DATETIME     NULL,
  notes           TEXT         NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_backorder_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS external_stocktake (
  id BIGINT NOT NULL AUTO_INCREMENT,
  outlet_id BIGINT NULL,
  user_id BIGINT NULL,
  completed_id BIGINT NULL,
  zero_stock    TINYINT(1)   NOT NULL DEFAULT 0,
  override_stock TINYINT(1)  NOT NULL DEFAULT 0,
  status        VARCHAR(32)  NULL COMMENT 'ExternalStocktakeStatusEnum',
  timestamp     DATETIME     NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS host_connection (
  id BIGINT NOT NULL AUTO_INCREMENT,
  type         VARCHAR(32)  NULL COMMENT 'HostConnectionTypeEnum',
  outlet_id BIGINT NULL,
  price_set_id BIGINT NULL,
  user_id BIGINT NULL,
  metadata     JSON         NULL,
  settings     JSON         NULL,
  credentials  JSON         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- Remaining feature tables (reports, order review/relations, payment
-- allocation, competition prices, host-sync, quick menu). Self-contained.
-- =====================================================================

CREATE TABLE IF NOT EXISTS report (
  id BIGINT NOT NULL AUTO_INCREMENT,
  name           VARCHAR(255) NULL,
  type           VARCHAR(64)  NULL,
  query          TEXT         NULL,
  special        TINYINT(1)   NOT NULL DEFAULT 0,
  email_settings JSON         NULL,
  filter         JSON         NULL,
  owner_id BIGINT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_report_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_review (
  id BIGINT NOT NULL AUTO_INCREMENT,
  order_id BIGINT NULL,
  status      VARCHAR(32)  NULL,
  notes       TEXT         NULL,
  data        JSON         NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_order_review_outlet (outlet_id),
  KEY idx_order_review_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_related (
  id BIGINT NOT NULL AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  related_order_id BIGINT NOT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_order_related_outlet (outlet_id),
  KEY idx_order_related_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_payment_allocation (
  id BIGINT NOT NULL AUTO_INCREMENT,
  payment_id BIGINT NOT NULL,
  sale_id BIGINT NULL,
  amount     DECIMAL(14,2) NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_customer_payment_allocation_outlet (outlet_id),
  KEY idx_cpa_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_competition_price (
  id BIGINT NOT NULL AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  competitor VARCHAR(255) NULL,
  price      DECIMAL(14,4) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_product_competition_price_outlet (outlet_id),
  KEY idx_pcp_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS host_change (
  id BIGINT NOT NULL AUTO_INCREMENT,
  host_connection_id BIGINT NULL,
  type               VARCHAR(64)  NULL,
  status             VARCHAR(32)  NULL,
  data               JSON         NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_host_change_outlet (outlet_id),
  KEY idx_host_change_conn (host_connection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS host_identifier (
  id BIGINT NOT NULL AUTO_INCREMENT,
  host_connection_id BIGINT NULL,
  local_id BIGINT NULL,
  host_id            VARCHAR(128) NULL,
  type               VARCHAR(64)  NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_host_identifier_outlet (outlet_id),
  KEY idx_host_ident_conn (host_connection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS quick_menu_item (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NULL,
  name     VARCHAR(255) NULL,
  url      VARCHAR(512) NULL,
  external TINYINT(1)   NOT NULL DEFAULT 0,
  position INT          NOT NULL DEFAULT 0,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_quick_menu_item_outlet (outlet_id),
  KEY idx_quick_menu_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS capped_price (
  id BIGINT NOT NULL AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  source         VARCHAR(255) NOT NULL,
  source_type    VARCHAR(32)  NOT NULL COMMENT 'PROVIDED or IMPORTED',
  price_set_name VARCHAR(255) NULL,
  start_date     DATE         NULL,
  end_date       DATE         NULL,
  quantity       DECIMAL(14,4) NOT NULL DEFAULT 1,
  capped_price   DECIMAL(14,4) NOT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_capped_price_outlet (outlet_id),
  KEY idx_capped_price_product (product_id),
  KEY idx_capped_price_type (source_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_authentication (
  supplier_id BIGINT NOT NULL,
  account_number VARCHAR(64) NULL,
  username VARCHAR(128) NULL,
  password_hash VARCHAR(255) NULL COMMENT 'BCrypt — never store plaintext',
  additional_auth TEXT NULL,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (supplier_id),
  KEY idx_supplier_authentication_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_additional_contact (
  id BIGINT NOT NULL AUTO_INCREMENT,
  supplier_id BIGINT NOT NULL,
  name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  outlet_id BIGINT NOT NULL DEFAULT 1 COMMENT 'SaaS tenant (outlet) id',

  PRIMARY KEY (id),
  KEY idx_supplier_additional_contact_outlet (outlet_id),
  KEY idx_sac_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_wine_profile (
  product_id   BIGINT       NOT NULL,
  wine_type    VARCHAR(32)  NOT NULL,
  dryness      DECIMAL(6,4) NULL,
  body         DECIMAL(6,4) NULL,
  fruitiness   DECIMAL(6,4) NULL,
  oak          DECIMAL(6,4) NULL,
  tannin       DECIMAL(6,4) NULL,
  varietal     VARCHAR(128) NULL,
  region       VARCHAR(128) NULL,
  vintage      VARCHAR(16)  NULL,
  abv          DECIMAL(5,2) NULL COMMENT 'Alcohol by volume percent',
  aroma_tags   JSON         NULL,
  palate_tags  JSON         NULL,
  food_tags    JSON         NULL,
  finish_note  VARCHAR(255) NULL,
  source       VARCHAR(32)  NOT NULL DEFAULT 'inferred',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  outlet_id    BIGINT       NOT NULL DEFAULT 1,
  PRIMARY KEY (product_id),
  KEY idx_wine_profile_outlet (outlet_id),
  KEY idx_wine_profile_type (wine_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_sommelier_feedback (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  outlet_id    BIGINT       NULL,
  user_id      BIGINT       NULL,
  product_id   BIGINT       NOT NULL,
  reaction     VARCHAR(32)  NOT NULL,
  profile_json JSON         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sommelier_feedback_outlet (outlet_id),
  KEY idx_sommelier_feedback_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- AI Supply Chain (weekly purchase plan)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sc_supplier_price (
  id            BIGINT        NOT NULL AUTO_INCREMENT,
  outlet_id     BIGINT        NOT NULL,
  product_id    BIGINT        NOT NULL,
  supplier_id   BIGINT        NOT NULL,
  supplier_sku  VARCHAR(128)  NULL,
  base_price    DECIMAL(14,4) NOT NULL COMMENT 'Price per case',
  case_size     DECIMAL(14,4) NOT NULL DEFAULT 1,
  currency      VARCHAR(8)    NOT NULL DEFAULT 'AUD',
  effective_from DATE         NOT NULL,
  effective_to  DATE          NULL,
  source        VARCHAR(32)   NOT NULL DEFAULT 'MANUAL',
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sc_price_lookup (outlet_id, product_id, supplier_id, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sc_supplier_deal (
  id                BIGINT        NOT NULL AUTO_INCREMENT,
  outlet_id         BIGINT        NOT NULL,
  supplier_id       BIGINT        NOT NULL,
  name              VARCHAR(255)  NOT NULL,
  deal_type         VARCHAR(32)   NOT NULL COMMENT 'BUY_X_GET_Y, PERCENT, AMOUNT_OFF',
  buy_quantity      INT           NOT NULL DEFAULT 0 COMMENT 'Cases required',
  free_quantity     INT           NOT NULL DEFAULT 0,
  discount_percent  DECIMAL(8,4)  NULL COMMENT 'Percent points, 5 = 5%',
  discount_amount   DECIMAL(14,4) NULL COMMENT 'Amount off per case',
  eligible_products VARCHAR(2000) NULL COMMENT 'Comma-separated product ids; empty = all',
  requires_rep      TINYINT(1)    NOT NULL DEFAULT 0,
  mix_match         TINYINT(1)    NOT NULL DEFAULT 0,
  valid_from        DATE          NULL,
  valid_to          DATE          NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sc_deal_supplier (outlet_id, supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sc_store_preference (
  id                BIGINT        NOT NULL AUTO_INCREMENT,
  outlet_id         BIGINT        NOT NULL,
  supplier_id       BIGINT        NOT NULL,
  priority          INT           NOT NULL DEFAULT 100,
  switch_threshold  DECIMAL(14,4) NULL COMMENT 'Switch away when saving per case reaches this amount',
  channel           VARCHAR(16)   NOT NULL DEFAULT 'API' COMMENT 'API, EMAIL, OTHER',
  PRIMARY KEY (id),
  UNIQUE KEY uq_sc_pref (outlet_id, supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sc_product_rule (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  outlet_id     BIGINT       NOT NULL,
  product_id    BIGINT       NOT NULL,
  supplier_mode VARCHAR(32)  NOT NULL COMMENT 'LOCKED or OPTIMIZE',
  supplier_id   BIGINT       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sc_rule (outlet_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sc_calendar_event (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  outlet_id          BIGINT        NOT NULL,
  event_date         DATE          NOT NULL,
  name               VARCHAR(255)  NOT NULL,
  demand_adjustment  DECIMAL(8,4)  NOT NULL DEFAULT 0 COMMENT 'Fraction, 0.15 = +15%',
  PRIMARY KEY (id),
  KEY idx_sc_event_date (outlet_id, event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sc_purchase_plan (
  id               BIGINT        NOT NULL AUTO_INCREMENT,
  outlet_id        BIGINT        NOT NULL,
  week_start       DATE          NOT NULL,
  week_end         DATE          NOT NULL,
  status           VARCHAR(32)   NOT NULL,
  product_count    INT           NOT NULL DEFAULT 0,
  total_units      DECIMAL(14,4) NOT NULL DEFAULT 0,
  estimated_spend  DECIMAL(14,2) NOT NULL DEFAULT 0,
  estimated_saving DECIMAL(14,2) NOT NULL DEFAULT 0,
  holiday_note     VARCHAR(255)  NULL,
  generated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sc_plan_week (outlet_id, week_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sc_purchase_line (
  id                BIGINT        NOT NULL AUTO_INCREMENT,
  plan_id           BIGINT        NOT NULL,
  outlet_id         BIGINT        NOT NULL,
  product_id        BIGINT        NOT NULL,
  product_name      VARCHAR(255)  NOT NULL,
  supplier_id       BIGINT        NULL,
  supplier_name     VARCHAR(255)  NULL,
  supplier_sku      VARCHAR(128)  NULL,
  channel           VARCHAR(16)   NOT NULL,
  last_week_sales   DECIMAL(14,4) NOT NULL DEFAULT 0,
  current_stock     DECIMAL(14,4) NOT NULL DEFAULT 0,
  incoming_stock    DECIMAL(14,4) NOT NULL DEFAULT 0,
  expected_demand   DECIMAL(14,4) NOT NULL DEFAULT 0,
  safety_stock      DECIMAL(14,4) NOT NULL DEFAULT 0,
  order_qty         DECIMAL(14,4) NOT NULL DEFAULT 0,
  case_qty          DECIMAL(14,4) NOT NULL DEFAULT 0,
  case_size         DECIMAL(14,4) NOT NULL DEFAULT 1,
  unit_cost         DECIMAL(14,4) NULL COMMENT 'Effective cost per case',
  line_cost         DECIMAL(14,2) NULL,
  saving            DECIMAL(14,2) NULL,
  confidence        INT           NOT NULL DEFAULT 0,
  unusual           TINYINT(1)    NOT NULL DEFAULT 0,
  reason            VARCHAR(255)  NULL,
  decision          VARCHAR(512)  NULL,
  comparison_json   TEXT          NULL,
  status            VARCHAR(32)   NOT NULL,
  order_id          BIGINT        NULL,
  PRIMARY KEY (id),
  KEY idx_sc_line_plan (plan_id),
  KEY idx_sc_line_supplier (plan_id, supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sc_email_draft (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  plan_id       BIGINT       NOT NULL,
  outlet_id     BIGINT       NOT NULL,
  supplier_id   BIGINT       NULL,
  supplier_name VARCHAR(255) NULL,
  to_email      VARCHAR(255) NULL,
  subject       VARCHAR(255) NOT NULL,
  body          TEXT         NOT NULL,
  status        VARCHAR(32)  NOT NULL,
  sku_count     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_sc_draft_plan (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
