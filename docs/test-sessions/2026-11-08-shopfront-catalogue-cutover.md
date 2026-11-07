# Shopfront Catalogue Cutover and Runner Check

- Date: 2026-11-08
- Candidate source SHA: `d97ea602171692c06d9f58ebc2c036176423ba1a`
- Runtime SHA: `d97ea602171692c06d9f58ebc2c036176423ba1a` on SKR and Demo (frontend and backend)
- Database scope: read-only inventory evidence from `aipos_uat`; no crawler migration or import was started
- Read/write scope: authenticated HTTP route checks and read-only crawler APIs; zero business-data writes

## Product and Inventory Counts

- Shopfront ACTIVE source products: 10,849. Odoo saleable variants: 13,292. These are different populations and must remain separately labeled.
- The screenshot's 50,992 available-unit total did not match the audited Odoo route-equivalent total of 51,229 positive units. A later complete comparison of 10,852 Shopfront source inventory keys against the Odoo inventory mirror found no missing/extra keys or row-level quantity differences, with 50,914 positive units in that matched key scope. The older 51,512 Shopfront aggregate is stale; these totals use different snapshots and scopes.
- No Shopfront source costs were written to Odoo.

## Routes and Deployment

- GitHub `main` auto-deployed the candidate to SKR and Demo. `/api/public/version` reported the candidate SHA for frontend and backend on both hosts.
- Authenticated `/products` returned 200 and rendered Odoo-catalogue markers without the old source-only-page marker.
- `/products/odoo` and `/products/shopfront` redirect to `/products`.
- `/reports/shopfront/dashboard`, `/reports/shopfront/sales`, `/reports/shopfront/inventory`, and `/reports/shopfront/purchase` redirect to their canonical Reports pages.
- `/purchases?state=purchase` redirects to `/purchases`.
- Purchases and Suppliers retain their embedded Shopfront history sections as read-only views.

## Runner Status

- `https://crawler.orithos.com.au/healthz`: HTTP 200. No queued or running jobs were returned.
- Durable job #10 (`legacy_migration`) failed because the crawler restarted. Durable job #20 (`legacy_migration`) later completed; no retry was needed.
- SyncRun #19 failed with `inventory reconciliation required for 3 unmatched source row(s)`. The saved run contains no item identities. `PosImportRun` detail lookups for IDs 19 and 20 returned 404. The current read-only product reconciliation reports 0 crawler products missing from POS across 11,030 POS source-linked products. Current parity does not identify the historical three rows.
- The crawler status API does not expose its runtime SHA.

## Checks and Limits

- Route static assertions: PASS.
- `git diff --check`: PASS.
- POS UI typecheck: NOT RUN; `tsc` is absent from this worktree's local dependencies.
- Project documentation checker: FAIL, 65 existing missing-file/link errors in this checkout.
- Local application build and browser screenshot verification: NOT RUN.
- No crawler retry, source refresh, inventory import, cost update, or other business write was issued.
