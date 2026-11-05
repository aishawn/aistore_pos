# Reporting Progress

Updated: 2026-11-05. Owner: TBD.

## Current worktree

- Added direct sales reporting grouped by date, product, or POS category, with full-result CSV export and progressive loading.
- Added purchase aggregation by supplier, status, date, or month, with a direct link to the Purchase Orders workflow.
- Added closed register history, date filtering, cash-difference filtering, CSV, and print actions.
- Added source sync state lookup by target and selected date range to the three reports. The interface distinguishes missing coverage from a known complete/partial/failed sync record.
- Added request revision guards so stale sales, purchasing, or closure responses cannot replace the latest selection.
- Overview now keeps source-coverage and report-prepared timestamps visible even when coverage is complete.
- Sales now exposes canonical positive-total POS order gross alongside the grouped amount, calculates the grouped-minus-order difference to cents, and includes these checks in CSV output. The page explicitly states that negative-total refund orders are excluded but mixed-order return lines may remain.
- Sales, purchasing, and closure tables now share a column chooser. CSV columns follow visible column order while retaining the complete matching row set; print hides the filter toolbar and respects visible columns.
- Current investigation found that report coverage can say `completed` while the target company's Odoo sales differ from the complete Shopfront mirror. The implementation marks sales mismatch as incomplete, exposes source-derived gross margin, and scopes inventory reads to the bound warehouse/location. It is committed on `main` at `71a715a7` and is present in the deployed runtime `00b81626`.
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
| P1 | OPEN | SKR/demo Odoo sales differ from the complete Shopfront source mirror for 2026-11-04 | Deploy the reconciliation status change, then investigate missing/extra target orders without replaying a broad history sync |
| P1 | OPEN | Dashboard and product inventory have differed because they queried different store/location scopes | Verify matched inventory totals for both stores after deploying the warehouse/location context change |
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
4. Reconcile Shopfront source row counts with Odoo for sampled dates; until then keep synchronization coverage classified as sync-event evidence only.
