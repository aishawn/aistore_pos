-- Supplier invoice OCR scan workspace (drafts before Odoo PO/receive).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS invoice_scan_session (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  vendor_id BIGINT NOT NULL,
  created_by BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  source_type VARCHAR(16) NOT NULL DEFAULT 'upload',
  supplier_name VARCHAR(255) NULL,
  supplier_abn VARCHAR(64) NULL,
  invoice_number VARCHAR(128) NULL,
  invoice_date DATE NULL,
  due_date DATE NULL,
  total_payable DECIMAL(14, 2) NULL,
  gst_included DECIMAL(14, 2) NULL,
  odoo_supplier_id BIGINT NULL,
  odoo_outlet_id BIGINT NULL,
  odoo_po_id BIGINT NULL,
  odoo_po_name VARCHAR(128) NULL,
  odoo_picking_id BIGINT NULL,
  odoo_picking_name VARCHAR(128) NULL,
  source_filename VARCHAR(255) NULL,
  source_content_type VARCHAR(128) NULL,
  notes TEXT NULL,
  internal_notes TEXT NULL,
  ocr_json JSON NULL,
  confirmed_by BIGINT NULL,
  confirmed_at TIMESTAMP NULL,
  discarded_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_invoice_scan_vendor_updated (vendor_id, updated_at),
  KEY idx_invoice_scan_vendor_status (vendor_id, status),
  KEY idx_invoice_scan_vendor_invoice (vendor_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_scan_line (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT NOT NULL,
  line_index INT NOT NULL DEFAULT 0,
  description VARCHAR(512) NULL,
  brand VARCHAR(255) NULL,
  pack_qty DECIMAL(14, 4) NULL,
  qty_cases DECIMAL(14, 4) NULL,
  unit_price DECIMAL(14, 4) NULL,
  line_total DECIMAL(14, 4) NULL,
  odoo_product_id BIGINT NULL,
  odoo_product_name VARCHAR(512) NULL,
  match_status VARCHAR(32) NOT NULL DEFAULT 'unmatched',
  confidence DECIMAL(6, 4) NULL,
  KEY idx_invoice_scan_line_session (session_id, line_index),
  CONSTRAINT fk_invoice_scan_line_session
    FOREIGN KEY (session_id) REFERENCES invoice_scan_session (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoice_supplier_abn_map (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  vendor_id BIGINT NOT NULL,
  supplier_abn VARCHAR(64) NOT NULL,
  odoo_supplier_id BIGINT NOT NULL,
  supplier_name VARCHAR(255) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_invoice_supplier_abn (vendor_id, supplier_abn)
);
