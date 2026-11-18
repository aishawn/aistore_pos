-- Allow the same Shopfront catalogue to exist on multiple Orithos outlets
-- (Demo + SKR) without stealing rows via global name/barcode uniqueness.

UPDATE product_barcode pb
SET outlet_id = p.outlet_id
FROM product p
WHERE pb.product_id = p.id
  AND (pb.outlet_id IS DISTINCT FROM p.outlet_id);

ALTER TABLE product ADD COLUMN IF NOT EXISTS shopfront_managed BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF to_regclass('shopfront_product_mapping') IS NOT NULL THEN
    UPDATE product p
    SET shopfront_managed = TRUE
    WHERE EXISTS (
      SELECT 1 FROM shopfront_product_mapping m
      WHERE m.pos_product_id = p.id AND m.status = 'MAPPED'
    );
  END IF;
END;
$$;

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
