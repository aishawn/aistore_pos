# 2026-11-07 POS API UAT smoke

## Scope

GitHub `main`, SKR, and Demo runtime: `18bf164e98ef8e4877f9a5d70157f3cf300a3fe8`. Target database was attested separately on both stores as `aipos_uat`. No valid business write payload was submitted.

## Checks

- PASS: SKR and Demo login; authenticated `/api/odoo/uat-context` returned `isolated=true`, `database=aipos_uat`, and matching frontend/backend runtime SHA `18bf164e`.
- PASS: `/api/pos/v1/openapi.yaml` returned HTTP 200 on both stores.
- PASS: Created a temporary SKR API token with `api.read`, `api.write`, and `api.batch` scopes; `GET /api/pos/v1/products?limit=1` returned HTTP 200 with one item.
- PASS: Empty `sales:batch`, `inventory:batch`, and `purchases:batch` requests with unique `Idempotency-Key` values each returned HTTP 400 after authentication and scope checks, rather than HTTP 423 for a disabled write feature. These malformed empty batches were rejected before any business record was created.
- PASS: Revoked the temporary API token; a subsequent product read with it returned HTTP 401.
- NOT RUN: Valid sale/refund, inventory adjustment, draft purchase, idempotency replay/conflict, webhook delivery/retry, and cleanup of business records.
- PASS: GitHub `main`, SKR, and Demo report the exact same SHA `18bf164e` after auto-deployment.

## Limits

This verifies the API path, temporary token lifecycle, UAT isolation, enabled sales/inventory/purchase feature gates, and exact-SHA deployment. It does not prove that valid business writes succeed or reconcile correctly in Odoo. No secret values or token plaintext were recorded.
