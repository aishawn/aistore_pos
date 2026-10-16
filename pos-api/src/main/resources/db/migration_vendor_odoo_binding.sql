-- Vendor ↔ Odoo company binding + optional per-store R2 prefix.
ALTER TABLE vendor
  ADD COLUMN odoo_company_id BIGINT NULL COMMENT 'res.company id in shared Odoo DB',
  ADD COLUMN odoo_pos_config_id BIGINT NULL COMMENT 'pos.config id',
  ADD COLUMN odoo_warehouse_id BIGINT NULL COMMENT 'stock.warehouse id',
  ADD COLUMN odoo_stock_location_id BIGINT NULL COMMENT 'stock.location id (stock)',
  ADD COLUMN odoo_provision_status VARCHAR(16) NOT NULL DEFAULT 'unmapped'
    COMMENT 'unmapped|pending|ready|failed',
  ADD COLUMN odoo_provision_error VARCHAR(512) NULL,
  ADD COLUMN r2_prefix VARCHAR(128) NULL COMMENT 'e.g. shopfront/{subdomain}/';

-- Pilot operator store: map to company 1 when present (single-store demo).
UPDATE vendor
SET odoo_company_id = 1,
    odoo_provision_status = 'ready',
    r2_prefix = CONCAT('shopfront/', subdomain, '/')
WHERE subdomain = 'demo' AND (odoo_company_id IS NULL OR odoo_provision_status = 'unmapped');
