-- Orion AI Supply Chain: weekly purchase planning inputs and outputs.
-- Prices and deals are stored data. The optimizer never invents them.

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
