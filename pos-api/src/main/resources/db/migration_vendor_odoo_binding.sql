-- Vendor ↔ Odoo company binding + optional per-store R2 prefix.
ALTER TABLE vendor
  ADD COLUMN odoo_company_id BIGINT NULL,
  ADD COLUMN odoo_pos_config_id BIGINT NULL,
  ADD COLUMN odoo_warehouse_id BIGINT NULL,
  ADD COLUMN odoo_stock_location_id BIGINT NULL,
  ADD COLUMN odoo_provision_status VARCHAR(16) NOT NULL DEFAULT 'unmapped',
  ADD COLUMN odoo_provision_error VARCHAR(512) NULL,
  ADD COLUMN r2_prefix VARCHAR(128) NULL;

-- Pilot operator store: map to company 1 when present (single-store demo).
UPDATE vendor
SET odoo_company_id = 1,
    odoo_provision_status = 'ready',
    r2_prefix = CONCAT('shopfront/', subdomain, '/')
WHERE subdomain = 'demo' AND (odoo_company_id IS NULL OR odoo_provision_status = 'unmapped');
