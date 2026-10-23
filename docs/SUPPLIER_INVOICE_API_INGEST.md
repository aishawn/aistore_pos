# Supplier invoice API ingest (scaffold)

Orithos can accept supplier invoice files through Stock → **Invoices**. A reserved inbound API exists for when a supplier provides their own document feed.

## Current behaviour

- UI capture: photograph, gallery image, or PDF upload → OCR preview → draft session → match → Odoo RFQ → confirm → receive.
- Inbound API: `POST /api/invoice-scans/ingest` (multipart `file`, optional `supplierCode`).
- Default: **disabled**. `NoopSupplierInvoiceIngest` returns business code `50120`.

## Enable later

1. Set Dokploy / env `SUPPLIER_INVOICE_INGEST_ENABLED=true` (maps to `app.invoice.supplier-ingest-enabled`).
2. Implement a `SupplierInvoiceIngestPort` adapter for the vendor (auth, payload mapping, OCR → `InvoiceScanSessionService.create`).
3. Keep production writes gated; prefer isolation UAT before enabling on a live tenant.

## Expected future payload (draft)

```http
POST /api/invoice-scans/ingest
Authorization: Bearer <store admin JWT>
Content-Type: multipart/form-data

file: <pdf|image>
supplierCode: <optional vendor code>
```

Response shape matches a saved invoice scan session (`/api/invoice-scans/{id}`).
