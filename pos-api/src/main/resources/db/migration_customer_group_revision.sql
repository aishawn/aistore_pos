CREATE TABLE IF NOT EXISTS customer_group_revision (
  id BIGINT NOT NULL,
  customer_group_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  action VARCHAR(32) NOT NULL,
  field_name VARCHAR(128) NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  summary VARCHAR(512) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id));
