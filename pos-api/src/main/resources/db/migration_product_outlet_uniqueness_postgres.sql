-- Allow the same Shopfront catalogue to exist on multiple Orithos outlets
-- (Demo + SKR) without stealing rows via global name/barcode uniqueness.

UPDATE product_barcode pb
SET outlet_id = p.outlet_id
FROM product p
WHERE pb.product_id = p.id
  AND (pb.outlet_id IS DISTINCT FROM p.outlet_id);

ALTER TABLE product DROP CONSTRAINT IF EXISTS uq_product_active_name;
DROP INDEX IF EXISTS uq_product_active_name;
DROP INDEX IF EXISTS idx_product_name;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_outlet_active_name
  ON product (outlet_id, active_name)
  WHERE active_name IS NOT NULL;

ALTER TABLE product_barcode DROP CONSTRAINT IF EXISTS uq_barcode_code;
DROP INDEX IF EXISTS uq_barcode_code;

CREATE UNIQUE INDEX IF NOT EXISTS uq_barcode_outlet_code
  ON product_barcode (outlet_id, code);
