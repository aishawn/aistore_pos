-- Product revision history (safe to re-run)
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
  KEY idx_pr_product (product_id),
  KEY idx_product_revision_outlet (outlet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
