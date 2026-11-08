# Reporting Progress

Updated: 2026-11-07. Owner: TBD.

## Product catalogue read latency (2026-11-08)

- Ordinary `/api/odoo/records` product pages now use the existing Redis-backed scoped read cache with a 30-second TTL and request coalescing. Cache identity includes host, authenticated Odoo/access session, tenant/company, sample-data revision, permission-derived cost visibility and all query/pagination parameters. Inventory report pages and their immutable snapshots bypass this cache.
- Explicit product refresh bypasses both browser and server cache. Existing successful-write report revision invalidation and Shopfront sync revision changes make prior catalog entries unreachable. Responses expose `generatedAt`, `cacheStatus`, `requestId`, `X-Correlation-ID`, `X-Cache-Status` and total `Server-Timing`; the catalogue shows its generated time.
- Node 24 targeted report/cache and catalogue-domain checks pass 13/13; modified TypeScript sources pass syntax transpilation and `git diff --check`. Full typecheck is blocked in this checkout because `npm ci` could not obtain Next.js and other packages. Authenticated SKR/Demo browser P50/P95 and running SHA have not been remeasured; deployment status is pending. No business data was written.

## Cost audit gateway timeout (2026-11-07)

- Authenticated SKR read-only reproduction on runtime `d814f135`: the default 30-day cost audit returned HTTP 502 after 30.2 seconds (the UI reported an HTML error page); the same endpoint limited to one completed business day returned HTTP 200 in 13.8 seconds (20 products, 27 sales lines). This confirms the long synchronous capture exceeded the gateway response window; no business records were written.
- Source fix now runs capture in a background task and returns a job ID immediately; authorized same-store polling returns the persisted audit after completion. Identical requests join the active job; a different date/product scope is rejected until it completes. Odoo reads remain read-only.
- Fix commit `99d996eb` is on `main`; the deployment hook returned HTTP 301 and SKR/Demo still report runtime `9f0d733c`. Per deployment rules, further hook retries are stopped pending Dokploy Git repository/branch configuration review. Job status is in process memory and expires on service restart; evidence snapshots retain the existing `.local` persistence behavior. See [validation](validation.md) and [test session](../../../test-sessions/2026-11-07-cost-audit-gateway-timeout.md).

## Shopfront product and inventory follow-up (2026-11-07)

- Live read-only product queries on SKR and Demo returned matching Shopfront coverage: 10,849 active, 10,849 mapped, 0 unmapped, and 10,849 inventory-covered products. The source snapshot timestamp was `2026-11-06T18:13:31.444091`; sync coverage reported `partial` for run 294 through `2026-11-06`.
- The `-196 LEMON P/F 6% 330ML` source mapping returned 128 Shopfront units and 128 Odoo units. Its Shopfront cost field is 116.75 with case quantity 30; Odoo `standard_price` is 123.87. Cost tax/unit semantics are not verified, so no cost write was made. A same-name Odoo inventory search also returned a zero-quantity variant outside the canonical Shopfront product page mapping.
- The Inventory report now identifies its Odoo company/warehouse snapshot and links to Products. Products already displays mapped Shopfront category, source cost, inventory, price, 30-day performance, and actions alongside Odoo stock/cost context.
- Shopfront crawler health, sync status, and coverage endpoints timed out. Full current source refresh and complete row-level alignment remain unverified; no business data was written.

## Inventory scope and purchase URL follow-up (2026-11-07)

- `/purchases?state=purchase` now redirects in the server page before the purchasing workspace renders, so the retired `Receipts · To receive` tab cannot flash during client hydration.
- The inventory API's default catalogue view replaces the POS-only domain with `sale_ok = true`; therefore `13,292` is an Odoo saleable-variant count, not a POS-enabled-only count. The footer now names that scope accurately.
- Odoo positive stock units remain an Odoo snapshot total. Shopfront active-product and positive-unit values remain read-only source-snapshot measures and are displayed with source/freshness context. The latest recorded Shopfront audit was 10,849 ACTIVE products and 51,512 positive units; the screenshot's 50,992 Odoo quantity is historical and is not asserted as the current Shopfront total.

## Inventory labels and purchasing navigation (2026-11-06)

- Removed the redundant `Receipts · To receive` tab from the purchasing workspace. Legacy `/purchases?state=purchase` links now replace the URL with `/purchases` and show the canonical Purchase Orders view.
- Inventory footer labels the count as Odoo saleable variants and the quantity as Odoo positive stock units. The count uses the inventory `All products` domain `sale_ok = true`; the quantity sums positive balances only, while negative-stock variants remain in the list and do not offset the total. Shopfront product history states its active-catalog count and warns that it is not directly comparable to Odoo variants.
- The scope-label clarification deployed from `main` as runtime `2aead338` on SKR, Demo, and App. The screenshot values remain historical snapshot values; row-level Shopfront parity is not certified.
- Inventory report's Shopfront read-only section now shows Shopfront active products, its complete snapshot's positive units and snapshot time beside the matching Odoo variant count. It flags snapshots older than 24 hours, so stale source quantities are not presented as current parity evidence.
- The provided screenshots show 10,849 Shopfront product results versus 13,292 Odoo product variants (2,443 more Odoo rows). These are different sources and record scopes; aggregate counts alone cannot identify which products differ. Positive stock units are calculated by summing only positive Odoo balances, so negative balances do not offset the shown total (the screenshot shows 5,379 negative-stock variants). Public runtime version confirms deployment SHA `43fb774d`, built after the screenshots; the UI labels now expose the Odoo/positive-stock scope. This does not certify the Shopfront-to-Odoo row mapping or stock against an authenticated raw-source comparison.

## Shopfront parity reliability follow-up (2026-11-06)

- Shopfront-mode Overview now displays an unavailable marker for current sales and transaction counts when the source report is missing; it no longer presents the Odoo fallback as if it were a Shopfront total. Yesterday sales, source Profit/Revenue, and sellable inventory already have source availability/freshness guards.
- Source calculation contract and the local reliability candidate are recorded in [Shopfront sync](../shopfront-sync/README.md) and the [2026-11-06 test session](../../../test-sessions/2026-11-06-shopfront-dashboard-parity.md).
- Typecheck/lint and live Shopfront page parity remain unverified. Do not treat the candidate as deployed or fully aligned.

## Follow-up review (2026-11-05)

- Online read-only root-cause check on POS runtime `809ef630`: crawler run 212 for `skr`, 2026-11-04..05, fetched/processed 311 Shopfront sales; the POS mirror acknowledged 311 and Odoo acknowledged 3 mirror batches (`mirrored=311`, native `imported=0`). Historical Shopfront rows are intentionally stored in `shopfront.sync.sale`, not native `pos.order`, even when the business-write gate is reported enabled. The dashboard's cross-ledger comparison was invalid; this candidate classifies it `not_comparable` and removes the Shopfront coverage banner. No business data was written or replayed.
- The crawler reports 155,976 stored sales overall, including 822 `INCOMPLETE`; these do not prove 822 missing native orders. Older runs also failed on Odoo receipt count/skip compatibility, while the latest 311-row run completed. Exact historical order-level source-to-mirror parity remains unverified.

- Rechecked current deployed version: SKR and Demo return frontend/backend runtime `7617e3ce`; it includes the purchase comparison state fix. The runtime is behind the unpushed local `main` head, but the report change itself is deployed.
- Rechecked the staged workflow surfaces: report navigation separates Sales report from Sales History, Purchase analysis from Purchase Orders, and exposes Register Closures directly. Sales and purchase pages support Today, custom date ranges, previous-period/year comparison, and URL-backed grouping/columns; inventory keeps stock filters, sort, progressive loading, and full-snapshot CSV/print.
- Fixed a stale comparison display in Purchase report: changing the date/group/comparison now clears the previous comparison result and error while the new requests load.
- SKR authenticated read-only check on runtime `7617e3ce`: Sales for the Adelaide business day 2026-11-04 returned 141 orders and `$3,760.72`; order gross and date-group amount reconciled to `$0.00`. Purchase and closure queries returned zero rows for that day. Dashboard `period=yesterday` returned a zero-sales cached snapshot and now flags `sourceReconciliation=mismatch` and `completeness=incomplete`; its last prepared timestamp was reported as 2026-11-05 14:34 (timezone not captured). A forced refresh queued asynchronously but its poll returned 401. The inconsistency remains OPEN, not evidence that the sales orders are absent.
- Online CSV/print parity and the new purchase comparison behavior remain unverified. See [validation](validation.md) and [runtime review session](../../../test-sessions/2026-11-05-report-optimization-runtime-review.md).

## Current worktree

- Corrected the invalid cross-ledger comparison between Shopfront's historical mirror and native Odoo POS totals. Dashboard no longer presents that difference as a sales mismatch; completed sync events no longer promote row completeness to `complete`. Focused reporting tests passed 19/19, the full frontend suite 182/182, Node 24 typecheck and docs checker passed. Runtime/browser/export verification remains pending.
- Added direct sales reporting grouped by date, product, or POS category, with full-result CSV export and progressive loading.
- Added purchase aggregation by supplier, status, date, or month, with a direct link to the Purchase Orders workflow.
- Added closed register history, date filtering, cash-difference filtering, CSV, and print actions.
- Added source sync state lookup by target and selected date range to the three reports. The interface distinguishes missing coverage from a known complete/partial/failed sync record.
- Added request revision guards so stale sales, purchasing, or closure responses cannot replace the latest selection.
- Overview keeps source coverage internal; source coverage and prepared timestamps remain available from report APIs and report detail surfaces.
- Sales now exposes canonical positive-total POS order gross alongside the grouped amount, calculates the grouped-minus-order difference to cents, and includes these checks in CSV output. The page explicitly states that negative-total refund orders are excluded but mixed-order return lines may remain.
- Sales, purchasing, and closure tables now share a column chooser. CSV columns follow visible column order while retaining the complete matching row set; print hides the filter toolbar and respects visible columns.
- Historical report note: commit `71a715a7` exposed source-derived gross margin and scoped inventory reads to the bound location. The previous source-vs-native mismatch classification is superseded by the current distinct-ledger classification in this candidate.
- Reports navigation labels Sales report and Purchase analysis separately from Sales History and Purchase Orders.
- Sales date groups open matching Odoo POS orders; product/category groups open matching sale lines. Purchase supplier/status/date/month groups open matching purchase orders. The read-only source panel paginates rows and reports source amount less grouped amount as a reconciliation signal.
- Inventory report stores query, category, stock status, sort, and visible-column state in the URL. CSV and print use the selected columns and fetch all matching rows from one inventory snapshot. Inventory reporting omits stock value and product-edit actions; zero-stock and negative-stock filters remain available.
- Inventory metadata identifies the mapped Odoo company, snapshot creation time, store timezone, and separate Shopfront sync coverage. Unknown coverage remains explicit; sync events are not described as proof of row-level completeness.
- Register closure history now renders the loaded rows and the selected expected / counted / difference columns; printing requests the full matching result and uses the same visible columns. This closes the source-level blank-table defect found during review; browser and online confirmation remain pending.
- Inventory Clear filters now includes the stock-status filter and is offered when stock status is the only active filter. The duplicate stock-status URL synchronization effect was removed.
- Purchase day and month buckets now explicitly use the authenticated store timezone, including dates near local month boundaries.
- Added `/reports` server redirect to the existing `/reports/dashboard` after live route inspection found `/reports` returned 404; local Node 24 typecheck passes, deployment verification is pending.
- Read-only acceptance: SKR and Demo both run frontend/backend `756a42e9958f5fc232f6b4a800ab07723e7838b8` (build time 2026-11-05 13:35 UTC), which contains report implementation commit `71a715a7`. On SKR, `/reports/dashboard`, sales, purchase, closures, inventory, and Products pages returned HTTP 200; `/reports` returns 404. Odoo session GET returns `user: null`; manual session connect returned 502, report APIs returned 401 on the previous runtime, and direct Odoo host requests timed out. Report totals/exports are therefore not reconciled online.
- Local verification on Node 24.22.1: full frontend unit suite 175/175 (before the redirect-only route addition), report/date/inventory coverage 39/39, and current full TypeScript typecheck PASS. The one-file ESLint rerun on the redirect route produced no diagnostics and was interrupted after more than five minutes; prior candidate lint reported 0 errors / 16 warnings. Project documentation checker PASS.

## Open issues

| Priority | Status | Issue | Closure condition |
|---|---|---|---|
| P1 | OPEN | Shopfront sync ledger records sync events, not row-level source completeness in Odoo | Reconcile source counts/hashes for sampled dates and document the coverage guarantee |
| P1 | RESOLVED IN SOURCE | Dashboard compared Shopfront archive totals with native Odoo POS totals although the integration stores these in separate ledgers | Deploy `not_comparable` status and verify that the false mismatch/incomplete warning is absent; retain same-ledger order/line reconciliation |
| P1 | OPEN | Shopfront crawler contains 822 `INCOMPLETE` source sales; row-level source/Odoo-mirror parity is not proven | Build a same-period source-ID/count audit against `shopfront.sync.sale` and classify incomplete/cancelled/parked records without creating native POS orders |
| P1 | OPEN | Dashboard and product inventory have differed because they queried different store/location scopes | Verify matched inventory totals for both stores after deploying the warehouse/location context change |
| P1 | OPEN | Dashboard yesterday snapshot shows zero sales while direct date-group report shows AUD 3,760.72 for the same company/business date | Repair or invalidate the mismatched prepared snapshot; confirm authenticated async refresh and reconcile the same source order set on SKR and Demo |
| P1 | OPEN | Sales order totals and sale-line totals can differ by refunds, tax, rounding, and order-level adjustments | Reconcile representative source samples and keep metric definitions visible |
| P1 | IN PROGRESS | Grouped reports now open scoped source records; browser and online reconciliation are not yet proven | Verify each group type, source row count, and source amount against the grouped table in read-only Odoo |
| P1 | FIXED IN SOURCE | Register closure history fetched rows and totals but rendered no table; print also had no rows to display | Table now renders selected columns from the loaded or full print result; verify desktop/mobile and printed output after deployment |
| P1 | BLOCKED | POS session login succeeds but no Odoo session is established; report APIs return 401 and Odoo session connect returns 502 | Restore Odoo host reachability and/or service-account authentication; `/api/odoo/session` must return an authenticated user and session cookie on both stores |
| P1 | OPEN | Report pages load in SKR but page data, exports, print, and Odoo reconciliation cannot be validated while the Odoo session is unavailable | After Odoo session recovery, reconcile same-store/same-day Overview, grouped sales, details, purchase, closures, CSV and print |
| P2 | OPEN | URL state, column selection, CSV, and print need end-to-end confirmation | Verify refresh/back/forward, selected column parity, full export row counts, and print output in browser |
| P2 | OPEN | Purchase `done` state and register cash fields require target-instance semantic confirmation | Compare against Odoo UI and source records for representative cases |

## Next steps

1. Restore authenticated Odoo access on both stores and confirm `/api/odoo/session` returns a user and session cookie.
2. Deploy the `/reports` redirect addition from current `main` and verify it redirects to `/reports/dashboard`.
3. Verify source drill-down, closure table/print, inventory URL state, selected-column parity, full CSV row counts, and Odoo source totals in read-only mode.
4. Reconcile Shopfront source IDs and statuses against the Odoo Shopfront mirror for sampled dates; do not compare that archive with native `pos.order` totals.
