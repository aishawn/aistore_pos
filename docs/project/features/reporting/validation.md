# Reporting Validation

Updated: 2026-11-05. Owner: TBD.

## Current status

| Check | Status | Evidence and limits |
|---|---|---|
| TypeScript typecheck | PASS ON PRE-FAST-FORWARD CANDIDATE | Full `npm run typecheck` exited 0 with Node 24.22.1 before `main` advanced to `cf022f55`; the rerun on the updated base was interrupted after prolonged silence. Report changes were unchanged; rerun before the next code change or release. |
| Targeted ESLint | NOT RUN (FINAL RERUN INTERRUPTED) | The previous candidate run reported 0 errors / 16 React effect warnings; this final rerun produced no diagnostics and was interrupted after more than two minutes. Re-run before the next code change or release. |
| Focused report/date/inventory tests | PASS | 39/39 across report date presets, DST boundaries, inventory totals/snapshots, cache scoping, cash variance summary, purchase report dates, and sales reconciliation; see [follow-up session](../../../test-sessions/2026-11-05-report-optimization-follow-up.md) |
| Project fact-library checker | PASS | Follow-up checker result and Markdown count are recorded in [session](../../../test-sessions/2026-11-05-report-optimization-follow-up.md); required structure, local links/headings and evidence assertions verified |
| Sales amount reconciliation helper | PASS | 3/3 local cases for cent rounding, detectable variance, and non-finite totals; [session](../../../test-sessions/2026-11-05-report-reconciliation.md) |
| Scoped sales report TypeScript check | PASS | Changed sales report API/page and reconciliation helper; temporary scoped tsconfig removed after checking |
| Scoped report table/column TypeScript check | PASS | Sales, purchase, closure API/page, and shared column chooser; [session](../../../test-sessions/2026-11-05-report-columns.md) |
| Shopfront margin, inventory totals, report cache, source margin tests | PASS | 25/25 focused unit tests; [session](../../../test-sessions/2026-11-05-store-data-scope.md) |
| `git diff --check` | PASS | No whitespace errors; Git emitted line-ending normalization notices for three route wrappers |
| Report date, closure summary, sales reconciliation unit tests | PASS | 10/10 local tests; no Odoo data; [session](../../../test-sessions/2026-11-05-report-optimization.md) |
| Inventory column/filter URL implementation | INFO | Source inspection confirms query/category/stock/sort/columns are URL-backed and inventory CSV/print reuse the snapshot; refresh/back behavior and full export parity still require browser verification |
| Sales and purchase source drill-down implementation | INFO | Scoped API domains and amount summaries are implemented; browser interaction and source-to-group reconciliation remain NOT RUN |
| Source inspection of report routes and UI | INFO | Current working-tree source reviewed; this does not identify the deployed SHA |
| Date boundary, store timezone, and company scope | NOT RUN | Requires fixtures or authenticated read-only environment checks |
| Sales totals reconciled to Odoo source orders and lines | NOT RUN | Must separately compare orders vs sale lines; refunds and zero-total orders are excluded |
| Purchase count/amount reconciled to Odoo | NOT RUN | Must confirm `purchase` and `done` state semantics for target Odoo configuration |
| Register cash difference reconciled to closed sessions | NOT RUN | Validate null values, rounding, and expected/count cash fields |
| Register closure list, visible columns, and full print result | NOT RUN | Source now renders the rows and requests all matching print rows; browser and Odoo read-only confirmation remain required |
| Shopfront coverage and Odoo reconciliation | PARTIAL | Read-only live checks on runtime SHA `1e7f3a1e`: both hosts reported sync event `completed`; SKR yesterday Odoo revenue `$3,760.72` versus source gross `$4,068.63` (144 source orders, tax `$334.36`); demo Odoo revenue `$0` versus the same source. Candidate now flags this mismatch, but it awaits deployment and repeat validation |
| Deployment identity | BLOCKED | At the latest runtime check, main app-source SHA was `6121dba2b99fea9689b1082d7a83e496fa3b6e83`; SKR and Demo public version endpoints return frontend/backend SHA `cf022f55a6a9a793c78941597e269ca610fd467a` (built 2026-11-05 12:50 UTC). Supplied Dokploy webhook returned `Branch Not Match`; no retry was made. Verify Dokploy repository/ref/root/Compose settings before deployment. |
| Inventory scope reconciliation | PARTIAL | Before the candidate fix, SKR product inventory reported `0` across 2,263 products while dashboard sellable units were `52,026`; demo reported 49,498 vs dashboard 49,504 across 12,986 products. Product routes lacked warehouse context and dashboard stock lacked a bound-location filter; candidate fix awaits live confirmation |
| CSV formula injection, export completeness, print layout | NOT RUN | Column selection is wired to sales, purchase, closure, and inventory exports/print rendering, but no browser/export runtime check has been performed |
| Report page, Odoo source reconciliation, CSV/print parity | NOT RUN | Current runtime SHA does not contain the report changes; complete read-only browser/data acceptance only after the correct main SHA is deployed |

## Required evidence for a PASS

Record source SHA, deployed/runtime SHA when applicable, environment, tenant/company and warehouse scope, timezone, selected date range, fixture or sample identifiers, metric definition, expected and actual values, source sync revision/status, test mode (fixture/local/read-only/write), and limitations. Do not reuse a fixture PASS as live data quality evidence. Do not run provider-spending or business-write checks without explicit authorization.

## Suggested focused checks

1. Boundary dates including a daylight-saving transition and a single-day interval.
2. One store with known POS orders, sale lines, refunds, voids, and multiple product categories; reconcile order totals separately from line totals.
3. Confirmed, received, cancelled, and draft purchase orders; verify the report includes only configured intended states.
4. Closed sessions with balanced cash, a non-zero difference, and missing expected/counted fields.
5. Export all matching groups and compare row count/totals with the on-screen report; verify formula-prefixed supplier/product names remain inert in a spreadsheet.
6. Confirm store binding cannot read another company's data and that URLs preserve filters through refresh/back navigation.
