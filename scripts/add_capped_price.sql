-- Add capped_price table for Capped Pricing feature.
-- Run against an existing Orithos database after schema.sql.

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
  PRIMARY KEY (id),
  KEY idx_capped_price_product (product_id),
  KEY idx_capped_price_type (source_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
