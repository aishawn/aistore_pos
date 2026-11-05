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
- Current investigation found that report coverage can say `completed` while the target company's Odoo sales differ from the complete Shopfront mirror. The implementation marks sales mismatch as incomplete, exposes source-derived gross margin, and scopes inventory reads to the bound warehouse/location. It is committed on `main` at `71a715a7`; latest `main` is `d59a00cc`.
- Reports navigation labels Sales report and Purchase analysis separately from Sales History and Purchase Orders.
- Sales date groups open matching Odoo POS orders; product/category groups open matching sale lines. Purchase supplier/status/date/month groups open matching purchase orders. The read-only source panel paginates rows and reports source amount less grouped amount as a reconciliation signal.
- Inventory report stores query, category, stock status, sort, and visible-column state in the URL. CSV and print use the selected columns and fetch all matching rows from one inventory snapshot. Inventory reporting omits stock value and product-edit actions; zero-stock and negative-stock filters remain available.
- Inventory metadata identifies the mapped Odoo company, snapshot creation time, store timezone, and separate Shopfront sync coverage. Unknown coverage remains explicit; sync events are not described as proof of row-level completeness.
- Register closure history now renders the loaded rows and the selected expected / counted / difference columns; printing requests the full matching result and uses the same visible columns. This closes the source-level blank-table defect found during review; browser and online confirmation remain pending.
- Inventory Clear filters now includes the stock-status filter and is offered when stock status is the only active filter. The duplicate stock-status URL synchronization effect was removed.
- Purchase day and month buckets now explicitly use the authenticated store timezone, including dates near local month boundaries.
- Local verification on Node 24.22.1: full frontend unit suite 175/175, including focused report/date/inventory coverage 39/39. Full TypeScript typecheck passed on the pre-fast-forward candidate; the final TypeScript and targeted ESLint reruns after `main` advanced were interrupted without diagnostics. The previous ESLint candidate run reported 0 errors / 16 warnings. Project documentation checker PASS. At the latest runtime identity check, main app-source SHA was `6121dba2b99fea9689b1082d7a83e496fa3b6e83`; report implementation commit is `71a715a7e970a0abaf0d8c2c7f18a3a2fcb4fa62`.

## Open issues

| Priority | Status | Issue | Closure condition |
|---|---|---|---|
| P1 | OPEN | Shopfront sync ledger records sync events, not row-level source completeness in Odoo | Reconcile source counts/hashes for sampled dates and document the coverage guarantee |
| P1 | OPEN | SKR/demo Odoo sales differ from the complete Shopfront source mirror for 2026-11-04 | Deploy the reconciliation status change, then investigate missing/extra target orders without replaying a broad history sync |
| P1 | OPEN | Dashboard and product inventory have differed because they queried different store/location scopes | Verify matched inventory totals for both stores after deploying the warehouse/location context change |
| P1 | OPEN | Sales order totals and sale-line totals can differ by refunds, tax, rounding, and order-level adjustments | Reconcile representative source samples and keep metric definitions visible |
| P1 | IN PROGRESS | Grouped reports now open scoped source records; browser and online reconciliation are not yet proven | Verify each group type, source row count, and source amount against the grouped table in read-only Odoo |
| P1 | FIXED IN SOURCE | Register closure history fetched rows and totals but rendered no table; print also had no rows to display | Table now renders selected columns from the loaded or full print result; verify desktop/mobile and printed output after deployment |
| P1 | OPEN | Deployment and live report behavior are not established by this source change | Record deployed SHA and complete read-only acceptance for each store |
| P1 | BLOCKED | Dokploy webhook returned `Branch Not Match`; SKR/demo still report runtime SHA `cf022f55a6a9a793c78941597e269ca610fd467a` while main app-source SHA at the last check was `6121dba2b99fea9689b1082d7a83e496fa3b6e83` | Verify Dokploy repository `aishawn/aistore_pos`, branch `main`, repository root `/`, and Compose file `docker-compose.yml`; deploy and verify both public version endpoints before report UAT |
| P2 | OPEN | URL state, column selection, CSV, and print need end-to-end confirmation | Verify refresh/back/forward, selected column parity, full export row counts, and print output in browser |
| P2 | OPEN | Purchase `done` state and register cash fields require target-instance semantic confirmation | Compare against Odoo UI and source records for representative cases |

## Next steps

1. Verify Dokploy Source/Git settings after the `Branch Not Match` response; do not retry the webhook until repository, ref, root, and Compose file are confirmed.
2. Deploy the reviewed main source and confirm both frontend/backend version endpoints on SKR and Demo report the deployed source SHA.
3. Verify source drill-down, closure table/print, inventory URL state, selected-column parity, full CSV row counts, and Odoo source totals in read-only mode.
4. Reconcile Shopfront source row counts with Odoo for sampled dates; until then keep synchronization coverage classified as sync-event evidence only.
