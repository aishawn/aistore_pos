# Shopfront Sync Validation

## Inventory coverage summary recovery (2026-11-08)

- Authenticated read-only SKR browser check showed the Inventory page's first 40 Shopfront-linked products with non-zero inventory and source cost. Example `-196 LEMON P/F 6% 330ML`: 4 cases + 8 items (128 units), source box cost `$116.75` / 30, unit display `$3.89`, shelf price `$8.99`. The inventory summary's separate crawler Reporting API request returned a temporary service error even though the Odoo `aipos_uat` mirror-backed product rows were available.
- A read-only audit of `aipos_uat`, company 5, `UATPI/Stock` compared all 10,849 ACTIVE Shopfront products: 0 missing canonical products and 0 quantity mismatches. Shopfront source mirror contains 10,849 active products, 10,852 inventory rows and 50,914 positive units. Seven source-cost-positive products still have zero Odoo `standard_price`; source cost remains visible read-only and is not written when pack/tax evidence is insufficient.
- Candidate change calculates active product, cost, mapping, inventory coverage and snapshot timestamp in the same Odoo mirror-backed inventory snapshot as the rows, and serves this summary without a second Reporting API request. The summary labels source values separately from signed Odoo balances. Legacy historical/reporting endpoints remain available.
- Candidate verification: POS UI `npm run typecheck` PASS; targeted ESLint PASS (0 errors; 9 existing warnings); `npm run test:unit` PASS (202 tests); `git diff --check` PASS. No crawler task, Shopfront write, or Odoo business-data write was issued.
- Candidate `b09500eaa4e8aeb91f18af09d9b59c567dd934c5` was deployed and its initial UI review exposed the collapsed-summary issue documented below. The corrected follow-up deployment and visible coverage acceptance are recorded in the following section. This does not resolve the crawler's missing Shopfront OAuth report scopes, verify report sales/purchase parity, or establish the tax basis of source cost.

### Live visibility follow-up (2026-11-08)

- GitHub `main` commit `b09500eaa4e8aeb91f18af09d9b59c567dd934c5` reached both SKR and Demo; `/api/public/version` returned that SHA for frontend and backend.
- Authenticated SKR `/reports/inventory` read showed Shopfront inventory and cost on stock-ranked rows (for example, GRT NTH ORG: 465 units, `$50.02` / pack 24; `-196 LEMON P/F 6% 330ML`: 128 units, `$116.75` / pack 30). The summary content was hidden because it reused the collapsible history section. The follow-up renders the snapshot coverage continuously.
- After the visibility change: UI typecheck PASS; focused ESLint on `ShopfrontSourceSections.tsx` PASS, 0 errors; UI unit suite 202/202 PASS; `git diff --check` PASS. Follow-up deployment and visible summary metrics are pending.
- Follow-up `9dc1f9a7f1a3c7f8e4a4d170589d0f266058611c` is deployed on SKR and Demo (frontend and backend runtime SHA). After reloading SKR, the always-visible summary displayed 10,849 active Shopfront products, 10,849 Odoo variants, 50,914 positive Shopfront units, 10,849 / 10,849 inventory-covered products, 9,993 products with source cost, and 856 source-reported `$0` costs. Snapshot time shown: 8 Nov 2026, 5:04 am Adelaide. This does not resolve the crawler's missing Shopfront OAuth report scopes, establish full report parity, or prove source cost tax basis.
- Project documentation checker remains FAIL with 66 pre-existing missing-file/link errors in this checkout. No Shopfront write or Odoo business-data write was issued.

## Inventory default view correction (2026-11-08)

- Read-only authenticated SKR API check: Products coverage was 10,849 active/mapped products, 50,914 positive Shopfront units, and 10,849 inventory rows. Inventory sorted by `shopfront_quantity desc` returned 465, 456, 425, 422, and 400 units on the first five rows; each row exposed Shopfront cost and Odoo quantity matched source quantity.
- The prior name-sorted first page contained zero-stock gift-card/recharge products, which explains the reported all-zero appearance. The UI now defaults Inventory to stock descending while preserving explicit URL sorting.
- `npm run typecheck` passed. No business-data writes were performed. Seven positive source-cost records still have zero Odoo `standard_price`; these require source case-size/tax-basis review and remain explicitly source-read-only.
- Commit `d33d14b427d598c548642e848b78b807bcdb6e53` was deployed to SKR and Demo; both public version APIs report this exact frontend/backend runtime. Post-deploy SKR API recheck with the page's `shopfront_quantity desc` options again returned 465, 456, 425, 422, 400 with readable source cost and matching Odoo quantities.

## Inventory scope and coverage clarification (2026-11-08)

- Runtime `68b2c7efa9c8248339277408382b5ece615c3048` is deployed on SKR (frontend and backend). The preceding coverage UI runtime was `f2b7fb0b944520647c9a1fdd9bb245348f1c0d6d`.
- Authenticated read-only route check: Products and Inventory both use 10,849 Shopfront canonical products. Inventory returned 10,849 rows, 50,914 positive units, and source cost/inventory data on the first page; Odoo quantity matched source quantity in the sampled rows and the full `aipos_uat` audit had 0 mismatches.
- Coverage API returned 10,849 active, 10,849 mapped, 0 unmapped, 10,849 inventory-covered, 9,993 non-zero-cost products, and 856 real zero-cost products. Source snapshot: `2026-11-07T18:34:46.280813+00:00`.
- `npm run typecheck` passed for the candidate. Dokploy deployment status was `done`; public version API reports runtime `68b2c7ef`.
- This resolves the UI scope discrepancy between 10,849 Shopfront products and the previous 13,064 mixed Odoo inventory rows. It does not claim that every Shopfront setting or tax-inclusive cost interpretation has been independently verified.

## Product / inventory parity follow-up (2026-11-08)

- POS `main` `fce60e3cef10322b10c578032eb9d2d16c0542b1` and Odoo `main` `63c50a0bb65d6a06f6622928506857abc74eec37` are deployed. Odoo identity-resolution fix `077b740` is included in the deployed history. POS and Odoo deployment status was reported `done` for these exact revisions.
- Durable sync job #29: `completed`, 11,030 products, 10,852 inventory rows, 0 unmatched inventory rows.
- Read-only comparison scope: Odoo database `aipos_uat`, company 5, `UATPI/Stock`. All 10,849 ACTIVE Shopfront products on the canonical Products-page mapping had 0 missing canonical products and 0 stock quantity differences. Valid case-size products had 0 differences between source box cost divided by case quantity and Odoo standard unit cost.
- Authenticated SKR Products page was verified with Status, Product, Category, Cost, Inventory, Price, Performance, and Actions, including responsive/mobile rendering. Example `-196 LEMON P/F 6% 330ML`: `$116.75` per case / 30 = `$3.89` per item; 128 units; `$8.99` price; 105 units in 30 days.
- Current counts are scope-specific: 10,849 ACTIVE Shopfront products; 50,914 positive units on the matched source-key scope; 13,292 Odoo saleable variants and 51,229 route-wide positive units. The screenshot's 50,992 and prior source snapshot's 51,512 are stale.
- Tax/cost semantic limit: Shopfront product source provides separate retail `taxRate` and purchase `costTaxRate`, but the captured API query has no explicit `costEx` or tax-inclusive cost flag. Mapping the tax IDs separately is correct; it does not prove the cost's tax inclusion. Shopfront reported profit remains a Shopfront metric, not an Odoo ledger amount. Cost display parity is verified; tax-basis parity and full-site functional/data parity remain open pending source setting/UI evidence.
- No Odoo database migration or new business-data mutation was performed in this follow-up. The audit inspected the already deployed state on `aipos_uat`.

## Product enrichment read states (2026-11-08)

- Candidate based on POS repository `7afad8245a17a2d087f88c089262a03dfbe64620` plus the local changes in [test session](../../../../test-sessions/2026-11-08-shopfront-product-read-states.md).
- The read path now marks source cost as available/missing/unavailable/restricted and source inventory as available/missing/unavailable. Zero is considered a returned value. Desktop and mobile catalogue rows use the same rendering helper and keep Odoo values distinct.
- Focused `shopfront-catalogue.test.ts`: 5/5 PASS. POS UI typecheck and production build: PASS. Targeted ESLint: 0 errors / 9 pre-existing React effect warnings. `git diff --check`: PASS.
- Project fact-library checker: FAIL with 66 missing-file/link errors in this checkout; the new session file is ignored by `/docs/` and is explicitly force-added for the change record. These errors concern absent repository docs, not this implementation.
- Deployment and authenticated live route check remain pending. No Odoo business-data write has been performed for this candidate.

## Product catalogue count reconciliation (2026-11-07)

- Read-only `aipos_uat` audit, SKR company 5, location `UATPI/Stock`: 10,849 ACTIVE Shopfront products, 10,852 inventory rows, and 51,512 positive units. Positive units exclude negative balances; 5,373 inventory rows are negative. Latest inventory snapshot: `2026-11-06T16:22:09.877859`.
- 11,005 uniquely mapped product stock rows matched exactly; 25 source references are ambiguous and 2 ACTIVE products have no canonical template. 281 mapped products have positive source cost but zero Odoo recorded cost. No data was changed.
- Frontend change separates Shopfront source counts from Odoo product variant totals, includes shared company templates, labels source unavailability, and retains Odoo inventory-report values as a distinct source.
- Local verification: Shopfront mapping/stock helper tests 4/4 PASS; `npm run typecheck` PASS; focused ESLint 0 errors / 9 existing `react-hooks/set-state-in-effect` warnings; `git diff --check` PASS.
- The legacy `/purchases?state=purchase` URL is redirected to `/purchases` by the existing PurchasingWorkspace compatibility handler.
- Dokploy Compose is bound to GitHub `main` with `autoDeploy=true`. Online deployment for this candidate is pending; the public version endpoint reported `7d824a2665c616d7463fec72cb3dd8f7a7d9afad` before push.
- First live candidate `5ba3b317` showed the corrected 10,849 source products and 51,512 source units, and redirected `/purchases?state=purchase` to `/purchases`. Product rows exposed an optional performance-query failure clearing other source fields; that failure isolation fix is in the follow-up candidate and awaits deployment verification.

## Product route and runner check (2026-11-08)

- Source route review: `/products` now uses the Odoo catalogue with existing Shopfront read-only enrichment; `/products/odoo` redirects to `/products`. `/products/shopfront` and the four `/reports/shopfront/*` routes redirect to their canonical pages. Purchases and Suppliers embed Shopfront historical purchase/supplier sections as read-only views.
- Deployment: GitHub `main` commit `d97ea602171692c06d9f58ebc2c036176423ba1a` auto-deployed to SKR and Demo; frontend and backend runtime SHAs both match. Authenticated HTTP route checks returned 200 for `/products` with Odoo-catalogue markers and without the source-only-page marker; legacy product, Shopfront Reports, and `/purchases?state=purchase` URLs returned 307 to their canonical pages.
- Read-only `https://crawler.orithos.com.au` API: `/healthz` returned 200; no queued/running jobs. Durable job #10 failed because the crawler restarted; durable job #20 later completed. SyncRun #19 failed because inventory reconciliation found 3 unmatched source rows. Its record contains no source IDs, and `PosImportRun` IDs 19/20 return 404. Current product reconciliation returned 0 crawler products missing from POS and 11,030 POS source-linked products. Runtime source SHA was not exposed by these endpoints.
- `git diff --check` and route static assertions: PASS. POS UI typecheck could not run: this checkout has no local TypeScript compiler (`tsc` missing from `pos-ui/node_modules/.bin`). The project-doc checker reports 65 pre-existing missing-file/link errors in this checkout. Node 24.22.1 is available; no local application build was run.
- Read-only only: no migration retry, inventory import, source refresh, or Odoo business write was issued. Inventory row-level evidence is from the separate `aipos_uat` audit recorded above; this runner API check did not independently read Odoo quantities.

## Inventory report source alignment candidate (2026-11-06)

- Inventory page and Dashboard KPI now consume one shared Shopfront Reporting API report result. A versioned cache rejects prior GraphQL-reconstructed rows; old cached values are refreshed before they can be shown as aligned. Dashboard and report pagination totals use the same case/item conversion and signed negative-stock rule.
- Local evidence: crawler focused suite 67/67 PASS; full crawler suite 130/130 PASS; frontend unit suite 188/188 PASS; POS TypeScript typecheck PASS; focused ESLint 0 errors / 3 warnings. The two old Odoo receipt tests now assert that a mirror-only response is rejected as incomplete formal sales import.
- Deployment, runtime SHA, and direct Shopfront Inventory/Dashboard UI comparison are NOT RUN. This change must not be described as fully aligned until a live source response confirms query filters, row count, case/item totals, valuation, and the deployed POS three metrics on one data revision.

Updated: 2026-11-06. Candidate based on POS repository `efb1434f05c9b8faeaa171dcf940890f64371c0d`; no deployment or online parity acceptance is recorded in this file.

## Local candidate checks

| Check | Result | Scope / limit |
|---|---|---|
| Crawler full pytest suite | PASS, 129 tests | Local fixtures and mocked source/POS only |
| Shopfront Dashboard parser tests | PASS, 5 tests | Source profit/margin rules and inventory freshness only |
| Inventory page interruption/resume | PASS | Mocked first-page checkpoint, timeout, resumed second page, signed negative quantity, manifest promotion |
| Purchase mirror timeout status | PASS | Mocked daily job confirms `partial`, timeout reason, and warning phase |
| Odoo supply import fixture | PASS, 7 tests | Includes success receipt `item_count`; no deployed Odoo request |
| POS UI typecheck | BLOCKED | Worktree has no installed TypeScript compiler (`tsc` not recognized) |
| POS UI targeted lint | BLOCKED | Worktree has no installed ESLint executable |
| POS UI full unit suite | 177 pass, 2 fail | Both failures cannot import `redis`; no package dependencies are installed in this worktree |
| Project documentation checker | FAIL, 65 errors | This checkout is missing required project fact-library pages and referenced reporting sessions; not evidence of code behavior |
| Runtime/deployment and live Shopfront parity | NOT RUN | Candidate is unpushed; no live refresh or Shopfront write was performed |

## Acceptance still required

- Confirm POS and Odoo candidate commits are on their respective `main` branches and Dokploy runs those exact SHAs.
- Verify crawler `/healthz`, `/api/sync/status`, and `/api/sync/coverage`; a complete inventory manifest must match source product IDs and persisted product/outlet rows.
- Compare Shopfront source report counts and amounts with crawler rows for identical Adelaide business dates and all applicable report filters.
- Compare SKR dashboard yesterday sales, weighted profit percentage, and sellable units against Shopfront UI/API on the same data revision.
- Verify sales and purchasing by stable source ID, not only aggregate counts. Preserve negative inventory and explain any source rows the account cannot access.
- Confirm no mutation requests were issued during source comparison and that only intended business mirror domains were sent downstream.

## Live read-only baseline (2026-11-06)

Crawler `/healthz` returned `ok`. `/api/sync/coverage?store=skr` returned source-capture counts at `2026-11-05T23:29:46Z`: 11,030 product rows; 10,852 current catalog rows, of which 10,849 are ACTIVE and 3 NOT_ACTIVE; 178 product rows have no current catalog observation. Inventory has 10,852 product/outlet rows at one outlet, 5,374 negative rows, positive quantity sum 51,864, signed sum -255,329, and a complete 10,852-product manifest. Sales have 155,978 records and 305,666 lines, with zero missing line names. These counts confirm crawler coverage only; Shopfront page filter parity and POS/Odoo row parity remain unproven.

The live job endpoint confirms the historical defect: daily jobs 95 and 98 are `completed` while their `purchase_mirror_result.status` is `timeout`; customer jobs 96 and 99 failed because the Odoo response omitted `item_count`. These are the direct targets of the local reliability fixes. No live job was started and no business write was issued during this read.
