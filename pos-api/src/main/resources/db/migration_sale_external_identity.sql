-- Durable external identity for Shopfront (and future) ledger imports.
-- Idempotent upsert key: (outlet_id, source_system, external_id).
ALTER TABLE sale ADD COLUMN IF NOT EXISTS source_system VARCHAR(32) NULL;
ALTER TABLE sale ADD COLUMN IF NOT EXISTS external_id VARCHAR(160) NULL;
ALTER TABLE sale ADD COLUMN IF NOT EXISTS source_store_key VARCHAR(64) NULL;
ALTER TABLE sale_item ADD COLUMN IF NOT EXISTS external_line_id VARCHAR(64) NULL;
ALTER TABLE sale_payment ADD COLUMN IF NOT EXISTS external_payment_id VARCHAR(64) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_outlet_source_external
  ON sale (outlet_id, source_system, external_id)
  WHERE source_system IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_source_external
  ON sale (source_system, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_item_external
  ON sale_item (sale_id, external_line_id) WHERE external_line_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_payment_external
  ON sale_payment (sale_id, external_payment_id) WHERE external_payment_id IS NOT NULL;
