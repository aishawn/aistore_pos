-- Allow the same Shopfront catalogue to exist on multiple Orithos outlets
-- (Demo + SKR) without stealing rows via global name/barcode uniqueness.

UPDATE product_barcode pb
SET outlet_id = p.outlet_id
FROM product p
WHERE pb.product_id = p.id
  AND (pb.outlet_id IS DISTINCT FROM p.outlet_id);

ALTER TABLE product ADD COLUMN IF NOT EXISTS shopfront_managed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS shopfront_product_mapping (
  store_key VARCHAR(64) NOT NULL,
  source_product_id VARCHAR(160) NOT NULL,
  pos_product_id BIGINT NOT NULL,
  match_type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (store_key, source_product_id)
);

UPDATE product p
SET shopfront_managed = TRUE
WHERE EXISTS (
  SELECT 1 FROM shopfront_product_mapping m
  WHERE m.pos_product_id = p.id AND m.status = 'MAPPED'
);

ALTER TABLE product DROP CONSTRAINT IF EXISTS uq_product_active_name;
DROP INDEX IF EXISTS uq_product_active_name;
DROP INDEX IF EXISTS idx_product_name;

DROP INDEX IF EXISTS uq_product_outlet_active_name;
CREATE UNIQUE INDEX uq_product_outlet_active_name
  ON product (outlet_id, active_name)
  WHERE active_name IS NOT NULL AND shopfront_managed IS NOT TRUE;

ALTER TABLE product_barcode DROP CONSTRAINT IF EXISTS uq_barcode_code;
DROP INDEX IF EXISTS uq_barcode_code;

CREATE UNIQUE INDEX IF NOT EXISTS uq_barcode_outlet_code
  ON product_barcode (outlet_id, code);
