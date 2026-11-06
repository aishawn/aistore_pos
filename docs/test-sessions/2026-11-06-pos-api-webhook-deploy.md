# POS API webhook reliability deployment

## Scope

Source SHA: `cce3cb7795d7adbdfb0e928cbef3b153ddce5ca9`. Target: Dokploy POS Compose, runtime database `aipos_uat`. This session did not execute authenticated API business writes.

## Changes

- Odoo RPC failures now expose only a sanitized, bounded exception class category; raw Odoo exception text is not returned.
- Webhook events are queued durably before delivery. HTTP requests run from the scheduled delivery worker, so a slow callback does not hold up a batch write.
- Webhook lookup/queue failures no longer change an already completed operation to failed.
- Added unit coverage for safe exception-category handling.

## Verification

- PASS: GitHub Actions `Backend Java 21 Verify`, run `42192952592`, executed `mvn -B clean verify` for the exact source SHA.
- PASS: Dokploy deployment `9q4urzQ8aFYfv_gqBjEQh` completed for the exact source SHA.
- PASS: Demo and SKR `/api/public/version` both reported frontend/backend runtime SHA `cce3cb7795d7adbdfb0e928cbef3b153ddce5ca9`.
- PASS: Dokploy read-only Compose settings show branch `main`, autoDeploy enabled, `ODOO_DATABASE=aipos_uat`, and all three POS API UAT write gates enabled.
- PASS: Demo `/api/pos/v1/openapi.yaml` responds `200 text/yaml`.
- FAIL: Project fact-library workflow `42192952547` reports 65 missing baseline documentation files in this checkout; the required missing paths are broader than this API feature.
- NOT RUN: API token lifecycle and tenant isolation; authenticated Odoo reads; sale/refund/inventory/purchase writes; idempotency replay/conflict; webhook signature and retry delivery; CLI fixture; cleanup of previously reported sale `pos.order` `8064930`.

## Limits

Deployment and configuration evidence prove the feature flags and runtime revision, not successful business writes. No production database was targeted, and no new UAT business write was performed in this session.
