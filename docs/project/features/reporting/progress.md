# Reporting Progress

Updated: 2026-11-05. Owner: TBD.

## Current worktree

- Added direct sales reporting grouped by date, product, or POS category, with full-result CSV export and progressive loading.
- Added purchase aggregation by supplier, status, or month, with links to the Purchase Orders workflow.
- Added closed register history, date filtering, cash-difference filtering, CSV, and print actions.
- Added source sync state lookup by target and selected date range to the three reports. The interface distinguishes missing coverage from a known complete/partial/failed sync record.
- Added request revision guards so stale sales, purchasing, or closure responses cannot replace the latest selection.
- Overview now keeps source-coverage and report-prepared timestamps visible even when coverage is complete.

## Open issues

| Priority | Status | Issue | Closure condition |
|---|---|---|---|
| P1 | OPEN | Shopfront sync ledger records sync events, not row-level source completeness in Odoo | Reconcile source counts/hashes for sampled dates and document the coverage guarantee |
| P1 | OPEN | Sales order totals and sale-line totals can differ by refunds, tax, rounding, and order-level adjustments | Reconcile representative source samples and keep metric definitions visible |
| P1 | OPEN | Deployment and live report behavior are not established by this source change | Record deployed SHA and complete read-only acceptance for each store |
| P2 | OPEN | URL state and browser navigation need end-to-end confirmation for all report pages | Verify refresh/back/forward with saved period and grouping |
| P2 | OPEN | Purchase `done` state and register cash fields require target-instance semantic confirmation | Compare against Odoo UI and source records for representative cases |

## Next steps

1. Run source-level type/lint checks permitted by the repository environment.
2. Reconcile each report against Odoo read-only samples using the focused checks in validation.md.
3. Update `docs/TEST_REPORT_INDEX.md` and a dated test session only after an actual check is run; retain NOT RUN for checks not performed.
4. After the intended main-branch update is deployed, capture deployed SHA, store scope, date range, and read-only results before describing behavior as online verified.
