# Sales History daily aggregation repair — 2026-11-03

Environment: local regression fixtures and online read-only SKR/Odoo `aipos_uat`, company 5. Real business writes: 0.

## Root cause and behavior

Odoo `read_group` returns a localized label (`02 Nov 2026`) and UTC `__range` boundaries. The original route filtered the label as ISO, silently discarding every day. Grouping sales and refunds together also lost gross values and refund counts. The repair uses UTC boundaries converted to the company timezone and aggregates positive/negative orders independently. Sell now has one Sales History entry, with Daily summary and Sales lines views; `/history` uses the same views.

## Evidence

- Online before repair: runtime frontend/backend `8233614685bbf39a87566ded48b216649d0f6ef9`; SKR daily API HTTP 200 with 0 rows, lines API HTTP 200 with 40 rows.
- Repaired parser and aggregation against real Odoo: 1,006 dates; total net sales 4,518,274.18; net tax 371,790.26. Reconciled to an independent ungrouped Odoo total: PASS.
- Latest day, 2026-11-02: 133 sales, 1 refund, gross 3,584.98, refunds 5.00, net 3,579.98, tax 307.67.
- Five focused unit cases PASS: sales/refund merging, sales-only/refund-only days, actual localized Odoo response, malformed group rejection, DST boundaries and empty history.
- Targeted ESLint PASS. No local application build run, per repository instructions.
- This pre-release evidence does not establish deployment or online browser acceptance of the repair.

- Full typecheck BLOCKED: shared older dependencies lack redis and produce pre-existing report-worker errors; clean dependency installation hit ENOSPC. No full typecheck success claimed.

## Deployment and live acceptance

- Fix commit and verified frontend/backend runtime: `7f8ded6a30d86cd00466d4791ce838f7fa3dd777`.
- Dokploy exact-commit build/deployment: DONE, finished 2026-11-03 09:15:03 UTC (17:15:03 Asia/Shanghai).
- SKR daily API: HTTP 200 with daily rows, truthful next-page flag and matching latest-day totals; sales lines still returns 40 records.
- Real browser read-only PASS: `/history` shows 2026-11-02, 133 sales, 1 refund, 3,584.98 gross, 5.00 refunds, 3,579.98 net, 307.67 tax. Selecting from/to 2026-11-02 yields exactly one day. Sales lines tab loads 40 items. Sell menu has one history entry and opens the same working daily summary.
- Real business writes: 0. No local application build performed. Remote build and live runtime/browser acceptance PASS despite the local dependency/typecheck limitation above.
