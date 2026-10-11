-- =====================================================================
-- Orithos POS — MySQL 8.0 schema (reverse-engineered from the live
-- GraphQL API at sea.onorithos.com).
--
-- Derived from the introspected GraphQL types (see graphql-schema-full.json
-- and entity-fields.txt). This is a faithful relational model of the domain
-- for a Spring Boot 3 + MyBatis backend — not the vendor's actual schema.
--
-- Conventions:
--   * Entity IDs are 32-char hex in the API  -> CHAR(32).
--     (Use BINARY(16)/UUID if you prefer; CHAR(32) keeps it copy-paste simple.)
--   * Money/costs            -> DECIMAL(14,4); printed totals DECIMAL(14,2).
--   * Enums                  -> VARCHAR with a comment listing allowed values
--                               (avoids ALTER pain; validate in the app layer).
--   * Rich/dynamic blobs     -> JSON (MySQL 8.0 native).
--   * Soft delete            -> deleted_at DATETIME NULL.
--   * Engine/charset         -> InnoDB / utf8mb4.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Company / configuration
-- ---------------------------------------------------------------------
CREATE TABLE vendor (
  id              CHAR(32)     NOT NULL,
  name            VARCHAR(255) NOT NULL,
  url             VARCHAR(255) NULL,
  business_type   VARCHAR(32)  NULL COMMENT 'BusinessTypeEnum',
  contact_name    VARCHAR(255) NULL,
  default_tax_rate_id CHAR(32) NULL,
  trial_ends_at   DATETIME     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Key/value settings, scoped to vendor | outlet | register | user
CREATE TABLE settings (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  scope_type  VARCHAR(16)  NOT NULL COMMENT 'vendor|outlet|register|user',
  scope_id    CHAR(32)     NULL,
  name        VARCHAR(128) NOT NULL,
  value       TEXT         NULL,
  datatype    VARCHAR(32)  NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settings (scope_type, scope_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reusable address/contact block (referenced by customer, supplier, outlet…)
CREATE TABLE contact (
  id              CHAR(32)     NOT NULL,
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
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE outlet (
  id               CHAR(32)     NOT NULL,
  name             VARCHAR(255) NOT NULL,
  contact_id       CHAR(32)     NULL,
  logo             VARCHAR(512) NULL,
  business_number  VARCHAR(64)  NULL,
  loyalty_enabled  TINYINT(1)   NOT NULL DEFAULT 0,
  loyalty_name     VARCHAR(128) NULL,
  loyalty_earn_rate   DECIMAL(14,4) NULL,
  loyalty_redeem_rate DECIMAL(14,4) NULL,
  has_kitchen_screen TINYINT(1) NOT NULL DEFAULT 0,
  ticketing_price_set_id CHAR(32) NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at       DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_outlet_contact (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tax_rate (
  id         CHAR(32)      NOT NULL,
  name       VARCHAR(128)  NOT NULL,
  amount     DECIMAL(8,4)  NOT NULL COMMENT 'rate %, e.g. 10.0000',
  mdb_id     INT           NULL,
  is_default TINYINT(1)    NOT NULL DEFAULT 0,
  deleted_at DATETIME      NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE payment_method (
  id            CHAR(32)     NOT NULL,
  name          VARCHAR(128) NOT NULL,
  type          VARCHAR(32)  NOT NULL COMMENT 'PaymentMethodTypeEnum: CASH,EFTPOS,CHEQUE,...',
  surcharge     DECIMAL(8,4) NULL,
  always_open_drawer TINYINT(1) NOT NULL DEFAULT 0,
  always_print  TINYINT(1)   NOT NULL DEFAULT 0,
  use_rounding  TINYINT(1)   NOT NULL DEFAULT 0,
  default_pay_exact TINYINT(1) NOT NULL DEFAULT 0,
  cashout_method_id CHAR(32) NULL,
  gateway_url   VARCHAR(512) NULL,
  background_colour VARCHAR(16) NULL,
  text_colour   VARCHAR(16)  NULL,
  deleted_at    DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_pm_cashout (cashout_method_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE register (
  id             CHAR(32)     NOT NULL,
  name           VARCHAR(128) NOT NULL,
  outlet_id      CHAR(32)     NOT NULL,
  invoice_number VARCHAR(64)  NULL,
  open_time      DATETIME     NULL,
  closed         TINYINT(1)   NOT NULL DEFAULT 0,
  deleted_at     DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_register_outlet (outlet_id),
  CONSTRAINT fk_register_outlet FOREIGN KEY (outlet_id) REFERENCES outlet (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Registers <-> accepted payment methods (M:N)
CREATE TABLE register_payment_method (
  register_id       CHAR(32) NOT NULL,
  payment_method_id CHAR(32) NOT NULL,
  PRIMARY KEY (register_id, payment_method_id),
  CONSTRAINT fk_rpm_register FOREIGN KEY (register_id) REFERENCES register (id),
  CONSTRAINT fk_rpm_pm FOREIGN KEY (payment_method_id) REFERENCES payment_method (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE receipt (
  id             CHAR(32)     NOT NULL,
  name           VARCHAR(128) NOT NULL,
  type           VARCHAR(32)  NULL COMMENT 'ReceiptTypeEnum',
  components     JSON         NULL,
  receipt_width  INT          NULL,
  account_receipt TINYINT(1)  NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE statement (
  id         CHAR(32)     NOT NULL,
  name       VARCHAR(128) NOT NULL,
  components JSON         NULL,
  signature  TEXT         NULL,
  reply_to   VARCHAR(255) NULL,
  subject    VARCHAR(255) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE transferee (
  id            CHAR(32)     NOT NULL,
  name          VARCHAR(255) NOT NULL,
  contact_id    CHAR(32)     NULL,
  order_automatic_email TINYINT(1) NOT NULL DEFAULT 0,
  email_format  VARCHAR(32)  NULL COMMENT 'EmailFormatEnum',
  send_orders_to_accounts_flow TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at    DATETIME     NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Users, roles & permissions  (back JWT auth)
-- ---------------------------------------------------------------------
CREATE TABLE role (
  id         CHAR(32)     NOT NULL,
  name       VARCHAR(128) NOT NULL,
  managed_id VARCHAR(64)  NULL COMMENT 'ManagedRoleIdTypeEnum',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE permission (
  id        INT          NOT NULL,
  name      VARCHAR(128) NOT NULL,
  safe_name VARCHAR(128) NULL,
  section   VARCHAR(128) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE role_permission (
  role_id       CHAR(32) NOT NULL,
  permission_id INT      NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES role (id),
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permission (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE app_user (
  id            CHAR(32)     NOT NULL,
  name          VARCHAR(255) NOT NULL,
  username      VARCHAR(128) NOT NULL,
  password_hash VARCHAR(255) NOT NULL COMMENT 'BCrypt — never store plaintext',
  email         VARCHAR(255) NULL,
  phone         VARCHAR(64)  NULL,
  image         VARCHAR(512) NULL,
  role_id       CHAR(32)     NULL,
  is_admin      TINYINT(1)   NOT NULL DEFAULT 0,
  is_api_user   TINYINT(1)   NOT NULL DEFAULT 0,
  dark_mode     VARCHAR(16)  NOT NULL DEFAULT 'default' COMMENT 'UserDarkModeEnum',
  dashboard     JSON         NULL,
  pending_password_reset TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at    DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_username (username),
  KEY idx_user_role (role_id),
  CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES role (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reporting access: user <-> outlet (M:N)
CREATE TABLE user_reporting_outlet (
  user_id   CHAR(32) NOT NULL,
  outlet_id CHAR(32) NOT NULL,
  PRIMARY KEY (user_id, outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Product classifications
-- ---------------------------------------------------------------------
CREATE TABLE brand (
  id CHAR(32) NOT NULL, name VARCHAR(255) NOT NULL, mdb_id INT NULL,
  deleted_at DATETIME NULL, PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE category (
  id CHAR(32) NOT NULL, name VARCHAR(255) NOT NULL, mdb_id INT NULL,
  metcash_msc VARCHAR(64) NULL, deleted_at DATETIME NULL, PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE family (
  id CHAR(32) NOT NULL, name VARCHAR(255) NOT NULL, mdb_id INT NULL,
  deleted_at DATETIME NULL, PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tag (
  id CHAR(32) NOT NULL, name VARCHAR(255) NOT NULL, mdb_id INT NULL,
  deleted_at DATETIME NULL, PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE price_set (
  id        CHAR(32)     NOT NULL,
  name      VARCHAR(128) NOT NULL,
  parent_id CHAR(32)     NULL,
  PRIMARY KEY (id),
  KEY idx_priceset_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE barcode_template (
  id   CHAR(32)     NOT NULL,
  name VARCHAR(128) NOT NULL,
  template TEXT      NULL,
  recalculate_quantity TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------
CREATE TABLE supplier (
  id              CHAR(32)     NOT NULL,
  name            VARCHAR(255) NOT NULL,
  mdb_id          INT          NULL,
  status          VARCHAR(32)  NULL COMMENT 'SupplierStatusEnum',
  contact_id      CHAR(32)     NULL,
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
  freight_included_on_invoices TINYINT(1) NOT NULL DEFAULT 0,
  freight_tax_id  CHAR(32)     NULL,
  fees_tax_id     CHAR(32)     NULL,
  allow_order_below_minimum TINYINT(1) NOT NULL DEFAULT 0,
  minimum_order_value DECIMAL(14,2) NULL,
  maximum_order_value DECIMAL(14,2) NULL,
  default_days_until_due INT    NULL,
  freight_fixed_cost_per_case DECIMAL(14,4) NULL,
  deleted_at      DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_supplier_contact (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Products + their per-outlet / per-set child rows
-- ---------------------------------------------------------------------
CREATE TABLE product (
  id              CHAR(32)     NOT NULL,
  name            VARCHAR(255) NOT NULL,
  mdb_id          INT          NULL,
  type            VARCHAR(32)  NOT NULL COMMENT 'ProductTypeEnum',
  status          VARCHAR(32)  NOT NULL COMMENT 'ProductStatusEnum: ACTIVE,INACTIVE,...',
  description     TEXT         NULL,
  category_id     CHAR(32)     NULL,
  brand_id        CHAR(32)     NULL,
  family_id       CHAR(32)     NULL,
  align_family    TINYINT(1)   NOT NULL DEFAULT 0,
  core_supplier_id CHAR(32)    NULL,
  tax_rate_id     CHAR(32)     NULL,
  cost_tax_rate_id CHAR(32)    NULL,
  cost            DECIMAL(14,4) NULL,
  case_quantity   DECIMAL(14,4) NULL,
  cost_percentage TINYINT(1)   NOT NULL DEFAULT 0,
  track_inventory TINYINT(1)   NOT NULL DEFAULT 1,
  use_scales      TINYINT(1)   NOT NULL DEFAULT 0,
  use_barcode_templates TINYINT(1) NOT NULL DEFAULT 0,
  use_price_label TINYINT(1)   NOT NULL DEFAULT 0,
  prevent_manual_discounts TINYINT(1) NOT NULL DEFAULT 0,
  request_quantity TINYINT(1)  NOT NULL DEFAULT 0,
  request_price   TINYINT(1)   NOT NULL DEFAULT 0,
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
  PRIMARY KEY (id),
  KEY idx_product_category (category_id),
  KEY idx_product_brand (brand_id),
  KEY idx_product_family (family_id),
  KEY idx_product_name (name),
  CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES category (id),
  CONSTRAINT fk_product_brand FOREIGN KEY (brand_id) REFERENCES brand (id),
  CONSTRAINT fk_product_family FOREIGN KEY (family_id) REFERENCES family (id),
  CONSTRAINT fk_product_tax FOREIGN KEY (tax_rate_id) REFERENCES tax_rate (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_tag (
  product_id CHAR(32) NOT NULL,
  tag_id     CHAR(32) NOT NULL,
  PRIMARY KEY (product_id, tag_id),
  CONSTRAINT fk_pt_product FOREIGN KEY (product_id) REFERENCES product (id),
  CONSTRAINT fk_pt_tag FOREIGN KEY (tag_id) REFERENCES tag (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_price (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  product_id  CHAR(32)     NOT NULL,
  price_set_id CHAR(32)    NULL,
  quantity    DECIMAL(14,4) NOT NULL DEFAULT 1,
  price       DECIMAL(14,4) NOT NULL,
  price_ex    DECIMAL(14,4) NULL,
  PRIMARY KEY (id),
  KEY idx_pp_product (product_id),
  CONSTRAINT fk_pp_product FOREIGN KEY (product_id) REFERENCES product (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_inventory (
  product_id     CHAR(32)     NOT NULL,
  outlet_id      CHAR(32)     NOT NULL,
  quantity       DECIMAL(14,4) NOT NULL DEFAULT 0,
  reorder_level  DECIMAL(14,4) NULL,
  reorder_amount DECIMAL(14,4) NULL,
  reorder_limit  DECIMAL(14,4) NULL,
  max_quantity   DECIMAL(14,4) NULL,
  on_order       DECIMAL(14,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, outlet_id),
  CONSTRAINT fk_pi_product FOREIGN KEY (product_id) REFERENCES product (id),
  CONSTRAINT fk_pi_outlet FOREIGN KEY (outlet_id) REFERENCES outlet (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_cost (
  product_id   CHAR(32)     NOT NULL,
  outlet_id    CHAR(32)     NOT NULL,
  cost         DECIMAL(14,4) NULL,
  last_cost    DECIMAL(14,4) NULL,
  average_cost DECIMAL(14,4) NULL,
  PRIMARY KEY (product_id, outlet_id),
  CONSTRAINT fk_pc_product FOREIGN KEY (product_id) REFERENCES product (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_supplier (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  product_id  CHAR(32)     NOT NULL,
  supplier_id CHAR(32)     NOT NULL,
  code        VARCHAR(128) NULL,
  minimum_order_quantity INT NULL,
  PRIMARY KEY (id),
  KEY idx_ps_product (product_id),
  KEY idx_ps_supplier (supplier_id),
  CONSTRAINT fk_ps_product FOREIGN KEY (product_id) REFERENCES product (id),
  CONSTRAINT fk_ps_supplier FOREIGN KEY (supplier_id) REFERENCES supplier (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE product_barcode (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  product_id   CHAR(32)     NOT NULL,
  code         VARCHAR(128) NOT NULL,
  quantity     DECIMAL(14,4) NOT NULL DEFAULT 1,
  template_id  CHAR(32)     NULL,
  promotion_price DECIMAL(14,4) NULL,
  last_sold_at DATETIME     NULL,
  last_stocktaked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_barcode_code (code),
  KEY idx_barcode_product (product_id),
  CONSTRAINT fk_barcode_product FOREIGN KEY (product_id) REFERENCES product (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE future_price (
  id           CHAR(32)     NOT NULL,
  product_id   CHAR(32)     NULL,
  price_set_id CHAR(32)     NULL,
  quantity     DECIMAL(14,4) NOT NULL DEFAULT 1,
  price        DECIMAL(14,4) NOT NULL,
  price_ex     DECIMAL(14,4) NULL,
  user_id      CHAR(32)     NULL,
  effective_time DATETIME   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_fp_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Customers & pricing
-- ---------------------------------------------------------------------
CREATE TABLE price_list (
  id        CHAR(32)     NOT NULL,
  name      VARCHAR(128) NOT NULL,
  allow_higher_price TINYINT(1) NOT NULL DEFAULT 0,
  allow_discounting_promotions TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE price_list_item (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  price_list_id CHAR(32)     NOT NULL,
  classification_type VARCHAR(32) NULL COMMENT 'ProductClassificationTypeEnum',
  item_id       CHAR(32)     NULL COMMENT 'product/brand/category/family/tag id',
  exclude       TINYINT(1)   NOT NULL DEFAULT 0,
  rule          VARCHAR(32)  NULL COMMENT 'PriceListRuleEnum',
  amount        DECIMAL(14,4) NULL,
  PRIMARY KEY (id),
  KEY idx_pli_list (price_list_id),
  CONSTRAINT fk_pli_list FOREIGN KEY (price_list_id) REFERENCES price_list (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customer_group (
  id              CHAR(32)     NOT NULL,
  name            VARCHAR(255) NOT NULL,
  default_receipt_id CHAR(32)  NULL,
  email_receipt_id   CHAR(32)  NULL,
  payment_receipt_id CHAR(32)  NULL,
  statement_template_id CHAR(32) NULL,
  price_list_id   CHAR(32)     NULL,
  loyalty_enabled TINYINT(1)   NOT NULL DEFAULT 0,
  loyalty_rate    DECIMAL(14,4) NULL,
  disable_promotions TINYINT(1) NOT NULL DEFAULT 0,
  allow_account_sales TINYINT(1) NOT NULL DEFAULT 0,
  account_limit   DECIMAL(14,2) NULL,
  auto_print_receipt TINYINT(1) NOT NULL DEFAULT 0,
  auto_email_receipt TINYINT(1) NOT NULL DEFAULT 0,
  require_order_reference TINYINT(1) NOT NULL DEFAULT 0,
  credit_terms    VARCHAR(32)  NULL COMMENT 'TimePeriod, e.g. 30 days',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME     NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_cg_pricelist FOREIGN KEY (price_list_id) REFERENCES price_list (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customer (
  id               CHAR(32)     NOT NULL,
  name             VARCHAR(255) NULL,
  first_name       VARCHAR(128) NULL,
  last_name        VARCHAR(128) NULL,
  code             VARCHAR(64)  NULL,
  company          VARCHAR(255) NULL,
  business_number  VARCHAR(64)  NULL,
  birthday         DATE         NULL,
  gender           VARCHAR(32)  NULL,
  billing_contact_id  CHAR(32)  NULL,
  delivery_contact_id CHAR(32)  NULL,
  email            VARCHAR(255) NULL,
  phone            VARCHAR(64)  NULL,
  mobile           VARCHAR(64)  NULL,
  fax              VARCHAR(64)  NULL,
  allow_marketing_emails TINYINT(1) NOT NULL DEFAULT 1,
  invoice_message  TEXT         NULL,
  comments         TEXT         NULL,
  customer_group_id CHAR(32)    NULL,
  override_customer_group TINYINT(1) NOT NULL DEFAULT 0,
  loyalty_enabled  TINYINT(1)   NOT NULL DEFAULT 0,
  loyalty_rate     DECIMAL(14,4) NULL,
  loyalty_points   DECIMAL(14,4) NOT NULL DEFAULT 0,
  disable_promotions TINYINT(1) NOT NULL DEFAULT 0,
  price_list_id    CHAR(32)     NULL,
  require_order_reference TINYINT(1) NOT NULL DEFAULT 0,
  account_limit    DECIMAL(14,2) NULL,
  current_owing    DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at       DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_customer_group (customer_group_id),
  KEY idx_customer_name (name),
  CONSTRAINT fk_customer_group FOREIGN KEY (customer_group_id) REFERENCES customer_group (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE customer_payment (
  id              CHAR(32)     NOT NULL,
  customer_id     CHAR(32)     NOT NULL,
  payment_method_id CHAR(32)   NULL,
  user_id         CHAR(32)     NULL,
  register_id     CHAR(32)     NULL,
  reference       VARCHAR(128) NULL,
  status          VARCHAR(32)  NULL COMMENT 'CustomerPaymentStatusEnum',
  start_balance   DECIMAL(14,2) NULL,
  amount          DECIMAL(14,2) NOT NULL,
  rounding        DECIMAL(14,4) NULL,
  timestamp       DATETIME     NOT NULL,
  relates_to_id   CHAR(32)     NULL,
  cancelled_at    DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_cp_customer (customer_id),
  CONSTRAINT fk_cp_customer FOREIGN KEY (customer_id) REFERENCES customer (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------
CREATE TABLE sale (
  id            CHAR(32)     NOT NULL,
  client_id     VARCHAR(64)  NULL,
  linked_sale_id CHAR(32)    NULL,
  register_id   CHAR(32)     NULL,
  user_id       CHAR(32)     NULL,
  customer_id   CHAR(32)     NULL,
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
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  uploaded_at   DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_sale_register (register_id),
  KEY idx_sale_customer (customer_id),
  KEY idx_sale_invoice (invoice_id),
  KEY idx_sale_created (created_at),
  CONSTRAINT fk_sale_register FOREIGN KEY (register_id) REFERENCES register (id),
  CONSTRAINT fk_sale_user FOREIGN KEY (user_id) REFERENCES app_user (id),
  CONSTRAINT fk_sale_customer FOREIGN KEY (customer_id) REFERENCES customer (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sale_item (
  id          CHAR(32)     NOT NULL,
  sale_id     CHAR(32)     NOT NULL,
  product_id  CHAR(32)     NULL,
  quantity    DECIMAL(14,4) NOT NULL,
  case_quantity DECIMAL(14,4) NULL,
  cost        DECIMAL(14,4) NULL,
  base_price  DECIMAL(14,4) NULL,
  total_price DECIMAL(14,2) NULL,
  savings     DECIMAL(14,2) NULL,
  tax         DECIMAL(14,2) NULL,
  tax_rate_id CHAR(32)     NULL,
  discount_amount VARCHAR(32) NULL,
  discount_reason VARCHAR(255) NULL,
  note        VARCHAR(255) NULL,
  loyalty_value DECIMAL(14,4) NULL,
  meta_data   JSON         NULL,
  PRIMARY KEY (id),
  KEY idx_si_sale (sale_id),
  KEY idx_si_product (product_id),
  CONSTRAINT fk_si_sale FOREIGN KEY (sale_id) REFERENCES sale (id),
  CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES product (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sale_payment (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  sale_id     CHAR(32)     NOT NULL,
  payment_method_id CHAR(32) NULL,
  subtype     VARCHAR(64)  NULL,
  register_id CHAR(32)     NULL,
  status      VARCHAR(32)  NULL COMMENT 'PaymentStatusEnum',
  amount      DECIMAL(14,2) NOT NULL,
  rounding    DECIMAL(14,4) NULL,
  cashout     DECIMAL(14,2) NULL,
  process_time DATETIME    NULL,
  receipt     TEXT         NULL,
  customer_payment_id CHAR(32) NULL,
  cancelled_at DATETIME    NULL,
  meta_data   JSON         NULL,
  PRIMARY KEY (id),
  KEY idx_spay_sale (sale_id),
  CONSTRAINT fk_spay_sale FOREIGN KEY (sale_id) REFERENCES sale (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Purchase / transfer orders  (GraphQL "Order"; ORDER is reserved in SQL)
-- ---------------------------------------------------------------------
CREATE TABLE purchase_order (
  id            CHAR(32)     NOT NULL,
  type          VARCHAR(32)  NOT NULL COMMENT 'OrderTypeEnum: ORDER,TRANSFER,CREDIT,...',
  status        VARCHAR(32)  NOT NULL COMMENT 'OrderStatusEnum: OPEN,SENT,RECEIVED,CANCELLED,...',
  from_id       CHAR(32)     NULL COMMENT 'supplier/outlet id',
  to_id         CHAR(32)     NULL COMMENT 'outlet/transferee id',
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
  created_by_id CHAR(32)     NULL,
  sent_by_id    CHAR(32)     NULL,
  received_by_id CHAR(32)    NULL,
  merged_into_id CHAR(32)    NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at       DATETIME     NULL,
  received_at   DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_po_status (status),
  KEY idx_po_invoice (invoice_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE order_product (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  order_id    CHAR(32)     NOT NULL,
  product_id  CHAR(32)     NULL,
  supplier_id CHAR(32)     NULL,
  supplier_code VARCHAR(128) NULL,
  case_quantity DECIMAL(14,4) NULL,
  ordered_quantity DECIMAL(14,4) NULL,
  received_quantity DECIMAL(14,4) NULL,
  base_cost   DECIMAL(14,4) NULL,
  ordered_cost DECIMAL(14,4) NULL,
  fees        DECIMAL(14,4) NULL,
  freight     DECIMAL(14,4) NULL,
  rebate      DECIMAL(14,4) NULL,
  PRIMARY KEY (id),
  KEY idx_op_order (order_id),
  CONSTRAINT fk_op_order FOREIGN KEY (order_id) REFERENCES purchase_order (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Gift cards
-- ---------------------------------------------------------------------
CREATE TABLE gift_card (
  id              CHAR(32)     NOT NULL,
  client_id       VARCHAR(64)  NULL,
  outlet_id       CHAR(32)     NULL,
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
  gift_card_id CHAR(32)     NOT NULL,
  sale_id      CHAR(32)     NULL,
  register_id  CHAR(32)     NULL,
  amount       DECIMAL(14,2) NOT NULL,
  action       VARCHAR(32)  NOT NULL COMMENT 'GiftCardMovementActionEnum: SOLD,REDEEMED',
  timestamp    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_gcm_card (gift_card_id),
  CONSTRAINT fk_gcm_card FOREIGN KEY (gift_card_id) REFERENCES gift_card (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------
CREATE TABLE promotion_category (
  id        CHAR(32)     NOT NULL,
  name      VARCHAR(255) NOT NULL,
  mdb_id    INT          NULL,
  show_on_order TINYINT(1) NOT NULL DEFAULT 0,
  include_in_integrations TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME    NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE promotion (
  id            CHAR(32)     NOT NULL,
  name          VARCHAR(255) NOT NULL,
  mdb_id        INT          NULL,
  client_id     VARCHAR(64)  NULL,
  promotion_category_id CHAR(32) NULL,
  start         DATETIME     NULL,
  end           DATETIME     NULL,
  express       TINYINT(1)   NOT NULL DEFAULT 0,
  mix_criteria  TINYINT(1)   NOT NULL DEFAULT 0,
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  sale_max_application_count INT NULL,
  deleted_at    DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_promo_category (promotion_category_id),
  CONSTRAINT fk_promo_category FOREIGN KEY (promotion_category_id) REFERENCES promotion_category (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE promotion_criteria (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  promotion_id CHAR(32)     NOT NULL,
  type         VARCHAR(32)  NULL COMMENT 'PromotionTypeEnum',
  buy_amount   DECIMAL(14,4) NULL,
  buy_amount_max DECIMAL(14,4) NULL,
  buy_amount_type VARCHAR(32) NULL COMMENT 'PromotionBuyAmountTypeEnum',
  discount_amount DECIMAL(14,4) NULL,
  min_quantity DECIMAL(14,4) NULL,
  quantity_type VARCHAR(32) NULL COMMENT 'PromotionQuantityTypeEnum',
  mixed_only   TINYINT(1)   NOT NULL DEFAULT 0,
  optional     TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_pcrit_promo (promotion_id),
  CONSTRAINT fk_pcrit_promo FOREIGN KEY (promotion_id) REFERENCES promotion (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Promotion <-> customer groups / outlets (M:N)
CREATE TABLE promotion_customer_group (
  promotion_id CHAR(32) NOT NULL, customer_group_id CHAR(32) NOT NULL,
  PRIMARY KEY (promotion_id, customer_group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE promotion_outlet (
  promotion_id CHAR(32) NOT NULL, outlet_id CHAR(32) NOT NULL,
  PRIMARY KEY (promotion_id, outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Stocktake
-- ---------------------------------------------------------------------
CREATE TABLE stocktake (
  id            CHAR(32)     NOT NULL,
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(32)  NULL COMMENT 'StocktakeTypeEnum',
  outlet_id     CHAR(32)     NULL,
  status        VARCHAR(32)  NOT NULL COMMENT 'StocktakeStatusEnum',
  display_expected TINYINT(1) NOT NULL DEFAULT 1,
  applied       TINYINT(1)   NOT NULL DEFAULT 0,
  completed_by_id CHAR(32)   NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at  DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_stocktake_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stocktake_product (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  stocktake_id CHAR(32)     NOT NULL,
  product_id   CHAR(32)     NOT NULL,
  cost         DECIMAL(14,4) NULL,
  case_quantity DECIMAL(14,4) NULL,
  scanned      TINYINT(1)   NOT NULL DEFAULT 0,
  expected_count DECIMAL(14,4) NULL,
  expected_value DECIMAL(14,2) NULL,
  actual_count DECIMAL(14,4) NULL,
  actual_value DECIMAL(14,2) NULL,
  PRIMARY KEY (id),
  KEY idx_stp_stocktake (stocktake_id),
  CONSTRAINT fk_stp_stocktake FOREIGN KEY (stocktake_id) REFERENCES stocktake (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Register closures
-- ---------------------------------------------------------------------
CREATE TABLE register_closure (
  id            CHAR(32)     NOT NULL,
  register_id   CHAR(32)     NOT NULL,
  user_id       CHAR(32)     NULL,
  movement      DECIMAL(14,2) NULL,
  total_expected DECIMAL(14,2) NULL,
  total_received DECIMAL(14,2) NULL,
  total_transactions INT     NULL,
  total_surcharge DECIMAL(14,2) NULL,
  opened_at     DATETIME     NULL,
  closed_at     DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_rc_register (register_id),
  CONSTRAINT fk_rc_register FOREIGN KEY (register_id) REFERENCES register (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE register_closure_payment (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  closure_id   CHAR(32)     NOT NULL,
  payment_method_id CHAR(32) NULL,
  expected     DECIMAL(14,2) NULL,
  received     DECIMAL(14,2) NULL,
  PRIMARY KEY (id),
  KEY idx_rcp_closure (closure_id),
  CONSTRAINT fk_rcp_closure FOREIGN KEY (closure_id) REFERENCES register_closure (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Misc / utilities
-- ---------------------------------------------------------------------
CREATE TABLE notification (
  id          CHAR(36)     NOT NULL,
  notifiable_type VARCHAR(32) NULL COMMENT 'NotifiableTypeEnum',
  notifiable_id CHAR(32)   NULL,
  data        JSON         NULL,
  read_at     DATETIME     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_target (notifiable_type, notifiable_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE security_event (
  id          CHAR(32)     NOT NULL,
  outlet_id   CHAR(32)     NULL,
  register_id CHAR(32)     NULL,
  user_id     CHAR(32)     NULL,
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
  PRIMARY KEY (id),
  KEY idx_mail_recipient (recipient)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vendor_connection (
  id          CHAR(32)     NOT NULL,
  name        VARCHAR(255) NOT NULL,
  sender_code VARCHAR(64)  NULL,
  customer_id CHAR(32)     NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Soft-deleted recoverable items (Trashed Items page)
CREATE TABLE trashed_item (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  item_type   VARCHAR(32)  NOT NULL COMMENT 'RecoverableTrashTypeEnum: PRODUCT,CUSTOMER,SUPPLIER,...',
  item_id     CHAR(32)     NOT NULL,
  name        VARCHAR(255) NULL,
  deleted_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
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
  id           CHAR(32)     NOT NULL,
  product_id   CHAR(32)     NULL,
  supplier_id  CHAR(32)     NULL,
  quantity     DECIMAL(14,4) NOT NULL DEFAULT 1,
  cost         DECIMAL(14,4) NOT NULL,
  cost_ex      DECIMAL(14,4) NULL,
  user_id      CHAR(32)     NULL,
  effective_time DATETIME   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_fc_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
