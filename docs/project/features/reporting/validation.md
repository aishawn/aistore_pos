# Reporting Validation

Updated: 2026-11-05. Owner: TBD.

## Current status

| Check | Status | Evidence and limits |
|---|---|---|
| TypeScript typecheck | BLOCKED | `tsc --noEmit` reports two ReactNode errors in the separate untracked `src/components/ShopfrontSourceDataPage.tsx:280`; no diagnostics point to the reporting files. Node 22.22.2 is below the declared Node >=24 engine, so repeat after the workspace issue is resolved under the supported runtime |
| Targeted ESLint | INFO | Earlier changed-report/inventory lint returned 0 errors and 20 warnings; the latest narrow sales-only lint process stalled and was interrupted, so rerun on the final candidate before release |
| Project fact-library checker | PASS | 66 Markdown files; required structure, local links/headings and evidence assertions verified |
| Sales amount reconciliation helper | PASS | 3/3 local cases for cent rounding, detectable variance, and non-finite totals; [session](../../../test-sessions/2026-11-05-report-reconciliation.md) |
| Scoped sales report TypeScript check | PASS | Changed sales report API/page and reconciliation helper; temporary scoped tsconfig removed after checking |
| `git diff --check` | PASS | No whitespace errors; Git emitted line-ending normalization notices for three route wrappers |
| Source inspection of report routes and UI | INFO | Current working-tree source reviewed; this does not identify the deployed SHA |
| Date boundary, store timezone, and company scope | NOT RUN | Requires fixtures or authenticated read-only environment checks |
| Sales totals reconciled to Odoo source orders and lines | NOT RUN | Must separately compare orders vs sale lines; refunds and zero-total orders are excluded |
| Purchase count/amount reconciled to Odoo | NOT RUN | Must confirm `purchase` and `done` state semantics for target Odoo configuration |
| Register cash difference reconciled to closed sessions | NOT RUN | Validate null values, rounding, and expected/count cash fields |
| Shopfront coverage indicator | NOT RUN | Sync state is scoped by target/date, but it records sync events rather than proving row-level source completeness |
| CSV formula injection, export completeness, print layout | NOT RUN | No browser or export verification performed in this change |
| Deployment and online acceptance | NOT RUN | No deployment identity or live verification recorded |

## Required evidence for a PASS

Record source SHA, deployed/runtime SHA when applicable, environment, tenant/company and warehouse scope, timezone, selected date range, fixture or sample identifiers, metric definition, expected and actual values, source sync revision/status, test mode (fixture/local/read-only/write), and limitations. Do not reuse a fixture PASS as live data quality evidence. Do not run provider-spending or business-write checks without explicit authorization.

## Suggested focused checks

1. Boundary dates including a daylight-saving transition and a single-day interval.
2. One store with known POS orders, sale lines, refunds, voids, and multiple product categories; reconcile order totals separately from line totals.
3. Confirmed, received, cancelled, and draft purchase orders; verify the report includes only configured intended states.
4. Closed sessions with balanced cash, a non-zero difference, and missing expected/counted fields.
5. Export all matching groups and compare row count/totals with the on-screen report; verify formula-prefixed supplier/product names remain inert in a spreadsheet.
6. Confirm store binding cannot read another company's data and that URLs preserve filters through refresh/back navigation.
