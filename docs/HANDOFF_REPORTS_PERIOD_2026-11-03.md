# Reports calendar periods — 2026-11-03

- Reports Overview now offers only Yesterday (default), Last week and Last month. Empty-state sliding-window shortcuts were removed. Refresh/retry retains the selected period, and request revisions prevent stale responses from replacing the current result.
- The reporting-dashboard API accepts `period=yesterday|last_week|last_month`. It resolves company timezone before calculating complete local calendar boundaries, with inclusive start / exclusive end for both orders and order lines. Yesterday compares with the same weekday last week; last week compares with the preceding Monday–Sunday week; last month compares with the preceding full calendar month. Yesterday groups hourly, even on 23/25-hour DST days; week/month group daily. Six existing `hours` values and `period=this_week` remain compatible.
- Date labels show actual included dates, including the last day of the month. Card comparison copy uses the response's comparison label. Display/transport uses store timezone/UTC respectively. No database migration, backend Java changes, Classic/R2 fallback or live business writes.

## Local verification

Node runtime: bundled Node 24.19.0. No local application build or Maven run.

- `node --experimental-strip-types --test src/lib/report-period.test.ts`: 9/9 pass; covers store midnight, Monday, year boundary, February/leap year and Adelaide DST transitions.
- `node scripts/pilot-reports-period-route-local.mjs`: 6 grouped checks pass, invoking the actual GET handler with in-memory read-only RPC transport. Checks exact order/line current and comparison domains, end exclusion, company scope, granularity, all legacy ranges, this_week and missing session. Evidence: `UAT_REPORTS_PERIOD_ROUTE_LOCAL_2026-11-03.json`.
- `node scripts/pilot-reports-period-ui-local.cjs` (bundled Playwright, Edge): browser fixtures at 390/1024/1440 test the three controls/default, period query parameters, comparison copy, inclusive month dates, refresh, stale response ordering, failed-refresh retry, empty state and viewport overflow. Evidence: `UAT_REPORTS_PERIOD_UI_LOCAL_2026-11-03.json`; screenshots: `screenshots/reports-period-2026-11-03/reports-{width}.png` and `reports-month-{width}.png`.
- `tsc --noEmit`, targeted ESLint on the two changed production files and period utility/test, and `git diff --check`: pass.

These tests use fixtures and do not establish deployed-runtime or live Odoo reconciliation acceptance. Deployment/source SHA must be checked separately after main auto-deploy. Unrelated inventory work and pre-existing local artifacts are excluded from this change.
