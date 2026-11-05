# Reporting Validation

Updated: 2026-11-05. Owner: TBD.

## Follow-up review (2026-11-05)

- Source revision reviewed: `9b4c8510db5ede2c4a60ec688fe9e3b2304eb311` on `main`, plus the purchase comparison state fix in this follow-up.
- Runtime identity: both `https://skr.orithos.com.au/api/public/version` and `https://demo.orithos.com.au/api/public/version` returned frontend/backend `9b4c8510db5ede2c4a60ec688fe9e3b2304eb311` in read-only HTTP checks. This includes the report-root redirect and report reconciliation corrections; it does not include the purchase comparison state fix in this follow-up.
- Unauthenticated GET requests to `/reports` and `/reports/dashboard` redirected to `/login`; no authenticated UI interaction or business data was accessed in this follow-up.
- Source review found and fixed stale purchase comparison state when a new query starts. Local regression/type checks are recorded in [the runtime review session](../../../test-sessions/2026-11-05-report-optimization-runtime-review.md).
- Same-store/same-period Overview, groups, details, purchase, closures, CSV and print parity remain NOT RUN because authenticated Odoo/report access is unavailable in this execution context.

## Current status

| Check | Status | Evidence and limits |
|---|---|---|
| TypeScript typecheck | PASS | Full `npm run typecheck` exited 0 with Node 24.22.1 on the current worktree, including the `/reports` redirect route. |
| Targeted ESLint | NOT RUN (RERUN INTERRUPTED) | ESLint on `app/reports/page.tsx` produced no diagnostics but was interrupted after more than five minutes; the prior candidate run reported 0 errors / 16 React effect warnings. |
| Focused report/date/inventory tests | PASS | 39/39 across report date presets, DST boundaries, inventory totals/snapshots, cache scoping, cash variance summary, purchase report dates, and sales reconciliation; see [follow-up session](../../../test-sessions/2026-11-05-report-optimization-follow-up.md) |
| Full frontend unit suite | PASS | `npm run test:unit`: 175/175 on Node 24.22.1; all frontend library suites passed, including reporting, inventory, date/DST, source scoping, and reconciliation helpers. |
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
| Runtime identity | PASS (report code deployed) | SKR and Demo public version endpoints both return frontend/backend SHA `756a42e9958f5fc232f6b4a800ab07723e7838b8`, built 2026-11-05 13:35 UTC; this runtime contains report implementation commit `71a715a7`. |
| SKR report route access | PARTIAL | On runtime `756a42e9`, `/reports/dashboard`, `/reports/sales`, `/reports/purchase`, `/reports/closures`, `/reports/inventory`, and `/products?view=inventory` returned HTTP 200 after POS login. `/reports` returned 404; a redirect to `/reports/dashboard` is added locally and awaits deployment. No rendered browser interaction was verified. |
| POS/Odoo session | BLOCKED | On runtime `756a42e9`, SKR POS login returned 200. `GET /api/odoo/session` returned HTTP 200 with `user: null` and `autoRecoverConfigured: true`; manual Odoo session connect previously returned 502. Direct GETs to Odoo `/` and `/web/login?db=aipos_uat` timed out from this environment. |
| Live report API | BLOCKED | Authenticated requests to Overview, sales groups, purchase groups, closures, and inventory metadata returned 401 because no `orithos_odoo_session` could be established. No report data was returned. |
| Date boundary, store timezone, and company scope | NOT RUN | Requires fixtures or authenticated read-only environment checks |
| Sales totals reconciled to Odoo source orders and lines | NOT RUN | Must separately compare orders vs sale lines; refunds and zero-total orders are excluded |
| Purchase count/amount reconciled to Odoo | NOT RUN | Must confirm `purchase` and `done` state semantics for target Odoo configuration |
| Register cash difference reconciled to closed sessions | NOT RUN | Validate null values, rounding, and expected/count cash fields |
| Register closure list, visible columns, and full print result | NOT RUN | Source now renders the rows and requests all matching print rows; browser and Odoo read-only confirmation remain required |
| Shopfront coverage and Odoo reconciliation | PARTIAL | Read-only live checks on runtime SHA `1e7f3a1e`: both hosts reported sync event `completed`; SKR yesterday Odoo revenue `$3,760.72` versus source gross `$4,068.63` (144 source orders, tax `$334.36`); demo Odoo revenue `$0` versus the same source. Candidate now flags this mismatch, but it awaits deployment and repeat validation |
| Deployment identity | PASS (report implementation) | Runtime `00b81626c8ff09be7a965eddd4f3a0f6d7288425` on SKR and Demo contains report implementation `71a715a7`; main pushes auto-deployed even though a manual webhook attempt had returned `Branch Not Match`. |
| Inventory scope reconciliation | PARTIAL | Before the candidate fix, SKR product inventory reported `0` across 2,263 products while dashboard sellable units were `52,026`; demo reported 49,498 vs dashboard 49,504 across 12,986 products. Product routes lacked warehouse context and dashboard stock lacked a bound-location filter; candidate fix awaits live confirmation |
| CSV formula injection, export completeness, print layout | NOT RUN | Column selection is wired to sales, purchase, closure, and inventory exports/print rendering, but no browser/export runtime check has been performed |
| Report data reconciliation, CSV/print parity | NOT RUN | Odoo session is unavailable, so matching-range totals, source drill-down, exports, and print output could not be requested. Retry after Odoo connectivity/session recovery. |

## Required evidence for a PASS

Record source SHA, deployed/runtime SHA when applicable, environment, tenant/company and warehouse scope, timezone, selected date range, fixture or sample identifiers, metric definition, expected and actual values, source sync revision/status, test mode (fixture/local/read-only/write), and limitations. Do not reuse a fixture PASS as live data quality evidence. Do not run provider-spending or business-write checks without explicit authorization.

## Suggested focused checks

1. Boundary dates including a daylight-saving transition and a single-day interval.
2. One store with known POS orders, sale lines, refunds, voids, and multiple product categories; reconcile order totals separately from line totals.
3. Confirmed, received, cancelled, and draft purchase orders; verify the report includes only configured intended states.
4. Closed sessions with balanced cash, a non-zero difference, and missing expected/counted fields.
5. Export all matching groups and compare row count/totals with the on-screen report; verify formula-prefixed supplier/product names remain inert in a spreadsheet.
6. Confirm store binding cannot read another company's data and that URLs preserve filters through refresh/back navigation.
