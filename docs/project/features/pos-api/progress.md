# Progress

## 2026-11-06

- Added token schema/service with one-time plaintext creation, revoke, expiry and last-use tracking.
- Added `/api/pos/v1` token management and Odoo-backed read endpoints for six resource families.
- Added scope and vendor/company checks, allow-listed Odoo models/fields, pagination and fail-closed errors.
- Added thin Python CLI with environment/config support, JSON output, retry handling and explicit write confirmation.
- Added feature-gated sales, inventory-count and draft-purchase batch adapters, persisted operation records, idempotency replay/conflict handling, webhook registration/signatures/retries, and an in-app API docs page with a deployed OpenAPI asset.
- Pending: purchase-receipt adapter, exact-SHA Java 21 verification, deployment, and online UAT in `aipos_uat`.
