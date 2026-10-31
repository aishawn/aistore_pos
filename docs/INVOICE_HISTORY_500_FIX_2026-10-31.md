# Supplier invoice history HTTP 500

## Publication requested

After the remote pre-push verification blocker was reported, the owner explicitly requested uploading this fix to GitHub `main` and deploying it. The candidate was reapplied to `origin/main=86c2e3e2`; publication will use Dokploy's Java 21 `mvn -B clean verify` image-build gate. The earlier pre-push verification remains NOT RUN and must not be described as satisfied by the post-push build. Deployment and live read-only results will be recorded separately.

## Diagnosis

Read-only checks against SKR on 2026-10-31 verified matching frontend/backend runtime `a03b6919811c00ed60c0fb3a20acaa0754c68c33`. Login and Odoo session succeed. Invoice history returns HTTP 500 with no filters, only status, or only search; supplying both status and search returns HTTP 200. No business data was changed.

Dokploy backend logs confirm `org.postgresql.util.PSQLException: ERROR: could not determine data type of parameter $2`. MyBatis binds absent filters using its default JDBC OTHER type, while `? IS NULL` and polymorphic `CONCAT` do not provide a PostgreSQL parameter type. This is a query binding failure, not an Odoo connection failure or evidence of missing invoices.

## Candidate

Based on `origin/main` at `a03b6919`, isolated from the existing dirty checkout:

- Bind optional list/count filters as JDBC VARCHAR, including CONCAT arguments.
- Bind optional duplicate-lookup supplier IDs as BIGINT and ABNs as VARCHAR, fixing the same latent failure in invoice detail.
- Sort equal update timestamps by descending ID for deterministic pagination.
- Ignore obsolete list responses after search/filter changes or unmount; prevent overlapping Refresh clicks.
- Show a recoverable invoice-history message for server failures; retain authentication error handling and distinguish errors from empty results.
- Add MyBatis parameter-handler regression cases for all combinations of absent/present filters and nullable supplier identity.

## Verification and release limitation

- Node 24.19.0 TypeScript `tsc --noEmit`: PASS.
- Targeted ESLint for `InvoiceScansListPage.tsx`: PASS.
- `git diff --check`: PASS.
- Java regression tests / full backend verification: NOT RUN. No local builds were run, following the owner preference.
- Dokploy host Terminal: BLOCKED. The authenticated server terminal reports SSH authentication failure. No SSH settings were changed.
- `AGENTS.md` requires a remote Java 21 `mvn -B clean verify` for the exact candidate SHA before pushing backend changes, and passing tests before committing new test sources. Consequently this candidate remains uncommitted, unpushed and undeployed; current SKR runtime still has the defect.

Next: restore configured remote builder/terminal access, verify and freeze the candidate under the required test-commit gate, publish only this change to `main`, verify Dokploy completion and matching frontend/backend runtime SHAs, then repeat the read-only filter matrix and check the SKR page at mobile/desktop widths. Do not use the pre-fix all-filter HTTP 200 as acceptance of the fix. Real OCR, invoice creation and receiving were not tested.

Evidence: `UAT_INVOICE_HISTORY_500_SKR_2026-10-31.json`.
