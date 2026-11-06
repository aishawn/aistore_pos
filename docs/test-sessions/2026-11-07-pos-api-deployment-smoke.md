# POS API deployment and UAT read-only smoke

Date: 2026-11-07

## Scope

Verify the POS API documentation and runtime after the `main` updates. Read-only requests only.

## Evidence

- GitHub `main` and SKR/Demo frontend/backend runtime SHA at check time: `90125a3ea1faaee133f744947f40d15e8d7ee16e`.
- SKR and Demo `/api-docs`: HTTP 200.
- SKR and Demo `/api/pos/v1/openapi.yaml`: HTTP 200; both contain all 12 read resource enum values, required purchase `unitCost`, and async `completed_with_errors`/`unknown` states.
- Unauthenticated `GET /api/pos/v1/products?limit=1`: HTTP 401 on both stores.
- Authenticated SKR and Demo `/api/odoo/uat-context`: HTTP 200, `isolated=true`, `database=aipos_uat`, frontend/backend commits match.
- Node 24 ESLint for `app/api-docs/page.tsx` and TypeScript `tsc --noEmit`: PASS.
- Exact Java 21 GitHub Actions result: NOT VERIFIED in this environment.
- Business writes, idempotency replay/conflict, webhook delivery/retry: NOT RUN.

## Limits

The authenticated UAT endpoint attests Odoo isolation but does not attest the POS PostgreSQL database. The local ignored environment file uses database name `postgres` for `POSTGRESQL_URL`; without confirmation of a dedicated remote POS UAT database, no token or business write was submitted.
