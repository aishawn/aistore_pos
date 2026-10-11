-- Run on existing databases to add supplier authentication and additional contacts support.

CREATE TABLE IF NOT EXISTS supplier_authentication (
  supplier_id BIGINT NOT NULL,
  account_number VARCHAR(64) NULL,
  username VARCHAR(128) NULL,
  password_hash VARCHAR(255) NULL COMMENT 'BCrypt — never store plaintext',
  additional_auth TEXT NULL,
  PRIMARY KEY (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS supplier_additional_contact (
  id BIGINT NOT NULL AUTO_INCREMENT,
  supplier_id BIGINT NOT NULL,
  name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_sac_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
