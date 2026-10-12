-- AI report views for template SQL / SqlGuard. Safe to re-run (CREATE OR REPLACE).
-- Cost columns are intentionally omitted; do not GRANT base tables to orithos_ai_ro.

SET NAMES utf8mb4;

-- Completed sale lines. Tenant is sale.outlet_id (not register / machine id).
CREATE OR REPLACE VIEW ai_rpt_sale_item AS
SELECT
  si.id,
  COALESCE(s.outlet_id, si.outlet_id) AS outlet_id,
  COALESCE(s.local_sold_at, s.created_at) AS sold_at,
  si.product_id,
  si.quantity AS qty,
  si.total_price AS amount,
  s.customer_id,
  s.id AS sale_id,
  COALESCE(s.business_date, DATE(COALESCE(s.local_sold_at, s.created_at))) AS business_date
FROM sale_item si
INNER JOIN sale s ON s.id = si.sale_id
WHERE s.status = 'COMPLETED';

-- Product names and category; no purchase cost.
CREATE OR REPLACE VIEW ai_rpt_product AS
SELECT
  p.id,
  p.outlet_id,
  p.name,
  p.status,
  p.category_id,
  c.name AS category_name
FROM product p
LEFT JOIN category c ON c.id = p.category_id
WHERE p.deleted_at IS NULL;

-- On-hand inventory by outlet.
CREATE OR REPLACE VIEW ai_rpt_inventory AS
SELECT
  pi.product_id,
  pi.outlet_id,
  pi.quantity,
  pi.reorder_level,
  pi.on_order
FROM product_inventory pi;

-- One row per completed sale (average ticket / customer-sale).
CREATE OR REPLACE VIEW ai_rpt_customer_sale AS
SELECT
  s.id AS sale_id,
  s.outlet_id AS outlet_id,
  COALESCE(s.local_sold_at, s.created_at) AS sold_at,
  s.customer_id,
  s.total_price AS amount,
  COALESCE(s.business_date, DATE(COALESCE(s.local_sold_at, s.created_at))) AS business_date
FROM sale s
WHERE s.status = 'COMPLETED';

-- NL2SQL / template audit (question, generated SQL, allow/deny).
CREATE TABLE IF NOT EXISTS ai_report_audit (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  vendor_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  outlet_id BIGINT NULL,
  outlet_ids VARCHAR(255) NULL,
  question TEXT NULL,
  sql_text TEXT NULL,
  path VARCHAR(32) NULL,
  allowed TINYINT(1) NOT NULL DEFAULT 0,
  reject_reason VARCHAR(512) NULL,
  row_count INT NULL,
  latency_ms INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ai_report_audit_created (created_at),
  KEY idx_ai_report_audit_outlet (outlet_id, created_at)
);
