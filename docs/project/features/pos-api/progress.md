# Progress

## 2026-11-06

- Added token schema/service with one-time plaintext creation, revoke, expiry and last-use tracking.
- Added `/api/pos/v1` token management and Odoo-backed read endpoints for six resource families.
- Added scope and vendor/company checks, allow-listed Odoo models/fields, pagination and fail-closed errors.
- Added thin Python CLI with environment/config support, JSON output, retry handling and explicit write confirmation.
- Added feature-gated sales, inventory-count and draft-purchase batch adapters, persisted operation records, idempotency replay/conflict handling, webhook registration/signatures/retries, and an in-app API docs page with a deployed OpenAPI asset.
- Sales, validated full-sale refunds, inventory count adjustments, and draft purchase writes are implemented behind deployment feature flags. Batch requests persist an idempotency record, run as asynchronous operations, and publish durable webhook events.
- The API docs page and downloadable OpenAPI asset describe the current write and replay behavior. Runtime release verification is tracked in `validation.md`.
- Hardened Odoo RPC error responses to expose only a bounded exception class category, never Odoo's raw error text; added a unit test for category sanitization.
- Full live UAT write, retry, webhook delivery, and cleanup verification remain open; see `validation.md` for evidence and the test sale needing API refund cleanup.
