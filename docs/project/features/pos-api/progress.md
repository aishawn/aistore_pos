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
- Commit `cce3cb77` passed the GitHub Java 21 verification and deployed through Dokploy; Demo and SKR runtime SHA both match. Current UAT database and three API write gates were confirmed from Dokploy's read-only service configuration.
- Fixed the Odoo 20 `sync_from_ui` payload failure: removed the unsupported `last_order_preparation_change` key and added stable UUIDs to sale/refund lines and payments. The local Java 21 `mvn -B clean verify` passed (516 tests), commit `e72558d4` is on `main`, and SKR runtime reports the exact SHA. Authenticated sale/refund verification is still pending because an administrator session is not available in this workspace.
- Added CLI HTTP fixture coverage for REST token auth, resource reads, operation lookup, write confirmation, idempotency headers, and token output redaction. Both tests pass on commit `e9a01aad`; its deployment was not yet visible on public runtime endpoints at the time of verification. Authenticated API UAT remains pending.
