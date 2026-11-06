# 2026-11-07 POS API current verification

## Scope

Read-only verification of the API contract and documentation on GitHub `main`, SKR, and Demo. No API token or business write was created in this pass.

## Results

- PASS: GitHub `main` was `a517667a0275f2290bc10561df2d0cb08ff0f384` at inspection. Both stores reported frontend/backend runtime `7352e1b52c34563f070f03a119a06d2681176b62`; the latest frontend-only commit was not yet deployed.
- PASS: `/api-docs` and `/api/pos/v1/openapi.yaml` returned HTTP 200 on SKR and Demo. The live schema contains `unitCost` and `completed_with_errors`.
- PASS: unauthenticated `GET /api/pos/v1/products?limit=1` returned HTTP 401 on both stores.
- PASS: `python -m unittest discover -s tools/tests -v` passed 4/4 CLI fixtures.
- PASS: `npm run typecheck` and targeted ESLint for `app/api-docs/page.tsx` and `app/api/odoo/records/route.ts` passed on the current main checkout.
- PASS: the feature OpenAPI, UI source, and both public OpenAPI files parse as YAML and have identical SHA-256 values. `git diff --check` passed.
- PASS: browser accessibility inspection in the preceding verification turn showed the API docs page rendering the Orithos API title, resources, batch examples, purchase cost guidance and operation states. The docs live inside the POS UI; no separate docs service is needed.

## Not run and limits

- NOT RUN: valid sale, full-sale refund, inventory count, draft purchase, idempotency replay/conflict, partial batch failure, webhook delivery/retry and cleanup.
- Odoo `aipos_uat` isolation is documented by the preceding authenticated UAT smoke. The live POS PostgreSQL database identity is still unknown. A read-only connection using the local configured URL timed out; local configuration is not proof of Dokploy configuration.
- The exact Java 21 `mvn -B clean verify` result for the current backend source was not obtained in this pass. No Java build was run locally.
