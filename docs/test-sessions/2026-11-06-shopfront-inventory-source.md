# Shopfront Inventory source parity candidate - 2026-11-06

## Candidate and scope

- Repository: `aishawn/aistore_pos`, branch `main`, base `746e6794d4c96a124196fb5e1222c895e900eba9`.
- Candidate commit: `e0a31bca` (`fix(shopfront): align inventory dashboard with source report`), pushed to `origin/main`. The candidate is not deployed; SKR and Demo still report runtime `746e6794` at the last read.
- Environment: Windows local workspace; Python from Miniconda; Node `v22.22.2` (package declares Node >=24). POS local build was not run.
- Test scope: crawler Inventory report/Dashboard same-source caching and totals; full crawler suite; POS dashboard parser, source page contract, unit suite, typecheck, focused ESLint.

## Implementation evidence

- Inventory report previously rebuilt Shopfront-looking rows from the crawler GraphQL snapshot while labeling them `shopfront_reporting_api`. It now queries the Shopfront Inventory Reporting API directly, caches versioned rows for 60 seconds, and the Dashboard KPI uses that exact cache.
- Legacy unversioned GraphQL-derived inventory cache rows are rejected and refreshed. Inventory page and Dashboard reject unavailable or incomplete case/item quantities. Negative filtering uses signed each quantity (`case level * case quantity + item level`).
- Dashboard inventory API now requires the integration token; the POS same-origin proxy sends it. POS accepts only source version `shopfront_reporting_api_v1`, preventing a stale crawler deployment from masquerading as the new data contract.
- Historical sales mirror-only Odoo acknowledgements fail the sync instead of being accepted as a completed formal sales import. The old tests were updated to encode this invariant.

## Verification

- Focused crawler suites before the final full run: `test_source_reporting.py` + `test_pos_import_results.py`: 67 passed.
- Full crawler suite: 130 passed, 0 failed.
- POS frontend unit suite: 188 passed, 0 failed.
- POS typecheck: passed.
- Focused ESLint: 0 errors, 3 warnings in `ShopfrontSourceDataPage.tsx` (unused snapshot state and existing hook warnings).
- `git diff --check`: passed after code and documentation edits.
- Source mutations/business writes: none. Shopfront live parity, deployment SHA, and runtime response: not verified.

## Limits and next acceptance

Local fixtures prove the Inventory page and Dashboard share one Reporting API response; they do not prove the query matches Shopfront's UI filters or that source rows equal the live page. After push/deploy, compare the same SKR data revision and outlet on Shopfront Inventory, Sales, Dashboard, Products, Purchase and POS Dashboard. Check source row counts, case/item totals, last-cost value, sales revenue/cost/profit/percentage and transaction count, purchase totals, active product IDs, timestamps, and all cursors. Record differences by source filter, permission, pagination, transformation, or downstream ledger. Do not claim exact alignment until those live comparisons pass.
