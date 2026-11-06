# Progress

## 2026-11-06

- Added token schema/service with one-time plaintext creation, revoke, expiry and last-use tracking.
- Added `/api/pos/v1` token management and Odoo-backed read endpoints for six resource families.
- Added scope and vendor/company checks, allow-listed Odoo models/fields, pagination and fail-closed errors.
- Added thin Python CLI with environment/config support, JSON output, retry handling and explicit write confirmation.
- Pending: resource-specific Odoo writes, durable idempotency replay, operations, webhooks, OpenAPI generation, Dokploy build and online UAT.
