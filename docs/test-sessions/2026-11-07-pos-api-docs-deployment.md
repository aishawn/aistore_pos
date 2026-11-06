# 2026-11-07 POS API docs deployment follow-up

## Scope

Verify deployment of the API documentation UI fix from main commit `3f7365ca`. Checks were read-only on SKR and Demo.

## Checks

- PASS: both `/api/public/version` endpoints report frontend and backend SHA `3f7365ca29230f7cbf73b04cf431460027c2d998`.
- PASS: browser accessibility inspection of `/api-docs` shows the OpenAPI spec link points to `/api/pos/v1/openapi.yaml` and refunds are marked supported.
- PASS: `/api/pos/v1/openapi.yaml` returns HTTP 200 with `text/yaml` on both stores.
- NOT RUN: backend idempotency fix, valid sale/refund/inventory/purchase writes, webhook delivery/retry, and cleanup.

## Limits

This proves deployment and documentation navigation only. It does not prove Java backend candidate behavior or business-write acceptance. Current `main` includes later documentation-only commit `23099d84`.
