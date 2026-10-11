-- Customer revision history (run once against the orithos database)
CREATE TABLE IF NOT EXISTS customer_revision (
  id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  action VARCHAR(32) NOT NULL,
  field_name VARCHAR(128) NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  summary VARCHAR(512) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cr_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
