# 2026-11-07 POS API UAT smoke

## Scope

GitHub `main`: `81c33ad8b83b9ae358bbffc3e7187447d3e3d991`. SKR and Demo runtime: `336f98bc1b92ad287be73ce159bba1e01a906a70`. The `pos-api/` tree is identical between the current main and runtime SHAs. Target database was attested separately on both stores as `aipos_uat`. No valid business write payload was submitted.

## Checks

- PASS: SKR and Demo login; authenticated `/api/odoo/uat-context` returned `isolated=true`, `database=aipos_uat`, and matching frontend/backend runtime SHA `336f98bc`.
- PASS: `/api/pos/v1/openapi.yaml` returned HTTP 200 on both stores.
- PASS: Created a temporary SKR API token with `api.read`, `api.write`, and `api.batch` scopes; `GET /api/pos/v1/products?limit=1` returned HTTP 200 with one item.
- PASS: Empty `sales:batch`, `inventory:batch`, and `purchases:batch` requests with unique `Idempotency-Key` values each returned HTTP 400 after authentication and scope checks, rather than HTTP 423 for a disabled write feature. These malformed empty batches were rejected before any business record was created.
- PASS: Revoked the temporary API token; a subsequent product read with it returned HTTP 401.
- NOT RUN: Valid sale/refund, inventory adjustment, draft purchase, idempotency replay/conflict, webhook delivery/retry, and cleanup of business records.
- NOT DEPLOYED: Current GitHub `main` SHA `81c33ad8`; both stores still report runtime SHA `336f98bc`.

## Limits

This verifies the API path, temporary token lifecycle, UAT isolation, and that sales/inventory/purchase feature gates are open. It does not prove that valid business writes succeed or reconcile correctly in Odoo. The current runtime's `pos-api/` source matches main, but the latest UI/product catalogue changes on main are not deployed. No secret values or token plaintext were recorded.
