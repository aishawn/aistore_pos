# Shopfront Report Refresh Propagation

Date: 2026-11-10 (Asia/Shanghai)

POS candidate: local `main` change based on `db302055`, not pushed

Crawler candidate: `d980cf5` (`main`, local only)

Production POS baseline: `db30205559b4d531435b5b9e7ea0e626910e558f` on SKR and Demo.

Crawler health: `ok`, source fingerprint `76550821428d56d3ccd7b480a16c3c20715bc6b2109caf2d45e5567dc93e201e`.

## Change

POS report pages now pass an explicit refresh request through the authenticated proxy for Sales, Inventory, Purchase, and Dashboard inventory. The crawler Dashboard inventory endpoint forwards it to the same Shopfront Reporting API loader as the Inventory report. If the source refresh falls back to older cached data, the report UI reports an error instead of presenting the old snapshot as current. Product-page refresh remains backed by the durable catalog snapshot and does not start a full catalog fetch.

## Local Verification

- Crawler `python -m pytest -q`: 261 passed.
- POS UI `npm run test:unit`: 213 passed.
- POS UI `npm run typecheck`: passed with Node 24.22.1.
- Focused ESLint: 0 errors, 3 existing React effect warnings.
- `git diff --check`: passed in both repositories.

## Live Read-Only Evidence

- Existing crawler job #197 remained active at `pos_inventory:skr:2500/10852`, heartbeat `2026-11-09T19:23:42Z`; SyncRun #99 was running. No new job was triggered by this change.
- Crawler archive coverage: 11,033 source-linked products; current catalog 10,855 (10,852 ACTIVE, 3 NOT_ACTIVE); 178 source IDs are referenced by sales but not confirmed in the current catalog. The complete inventory snapshot has 10,852 product rows.
- SKR product reconciliation: crawler 11,033, POS 11,033, missing 0, extra 0. Inventory mirroring and Demo mirroring were not yet complete.
- Saved sales remain 156,588 transactions / 306,934 lines in crawler and 156,424 / 306,614 in SKR POS, a difference of 164 transactions / 320 lines. Sales reconciliation was not started while job #197 was active.
- No Shopfront mutation or user-initiated business write was made. The existing catalog job continued its POS mirror writes.

## Not Verified

- Deployment of either candidate and post-deployment runtime SHA.
- Refresh behavior against Shopfront after deployment.
- Visual page-by-page acceptance. Browser UI automation returned `browser.user is unavailable`; API reconciliation is not a substitute for visual page acceptance.
- Final SKR/Demo inventory reconciliation and sales repair.
