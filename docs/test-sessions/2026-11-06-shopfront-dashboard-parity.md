# Test Session: 2026-11-06 Shopfront dashboard KPI parity

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-06-shopfront-dashboard-parity` |
| Started / timezone | 2026-11-06 / Asia/Shanghai |
| Operator | Codex |
| Branch | `main` |
| Source SHA | Candidate working tree based on `d77dc109`; final commit SHA pending |
| Runtime SHA | SKR and Demo `d77dc109db9bce9b41312911b1f77d2eeb04bf93` before this candidate |
| Environment | Local crawler and POS UI checks; deployment and online repair pending |
| Database | `aipos_uat` |
| Real business writes | Pending one-day idempotent source replay and inventory snapshot refresh |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `UI-001` | `node --experimental-strip-types --test src/lib/shopfront-dashboard-metrics.test.ts` | PASS: 3/3 | Command output in session | Tests source Profit/Revenue validation, incomplete reports, inventory totals |
| `UI-001` | `npm run typecheck` in `pos-ui` | PASS | `tsc --noEmit` exit 0; Next build type check also passed | Windows TypeScript check was slow but completed |
| `UI-002` | `node --experimental-strip-types --test src/lib/shopfront-dashboard-metrics.test.ts` | PASS: 3/3 | Command output in session | Source sales validation and inventory KPI parsing |
| `UI-003` | `npm run build` in `pos-ui` | PASS | Next production build completed; `/reports/dashboard/odoo` route present | Existing middleware deprecation warning |
| `UI-004` | `npm run lint -- --no-warn-ignored` | BLOCKED | ESLint configuration references missing `react-hooks` plugin | Environment/repository dependency configuration issue |
| `UI-005` | `npm run test:unit` | FAIL: 184 pass, 1 fail | `shopfront-report-margin.test.ts:21` | Existing mirror fixture does not satisfy current date filtering; unrelated to this change |
| `SHP-001` | `python -m pytest tests/test_source_reporting.py -q` | PASS: 8/8 | Command output in session | Inventory units, incremental manifest, report conversion, fail-closed behavior |
| `SHP-002` | `python -m compileall -q app` | PASS | Command output in session | Crawler Python syntax |
| `OPS-001` | Crawler `/healthz`, `/api/sync/status`, `/api/sync/runs` | INFO | Live read-only response | Health 200. Job 76 completed; job 77 failed on Odoo receipt `item_count`; latest run 212 completed with `sales_skipped_unchanged`. This does not prove all source/target rows reconcile. |
| `REL-001` | GitHub main and SKR/Demo `/api/public/version` | PENDING | Deployment workflow | Push is followed by runtime SHA verification |
| `UAT-001` | SKR one-day source replay, inventory snapshot and KPI parity | PENDING | Crawler sync job and authenticated report | Verify 2026-11-05, source totals, inventory units and manifest completeness |

## Summary

- Passed: targeted frontend tests, TypeScript, production build, crawler tests and compile.
- Blocked: lint requires an uninstalled `react-hooks` ESLint plugin.
- Failed: one existing full-suite source-margin fixture; 184 other tests passed.
- Pending: production deploy, one-day source replay, complete inventory refresh and online acceptance.
- Business impact: repair will replay source sales idempotently and refresh a read-only source inventory snapshot; it will not create Odoo stock adjustments.

## Root cause follow-up

- The Dashboard inventory candidate originally called Shopfront's custom `/api/source-reports/inventory` DSL. The live crawler endpoint returned 502, so that KPI could not be considered repaired even though parser fixtures passed.
- The crawler already persists inventory from the paginated GraphQL catalog query with an `InventorySnapshotManifest`. The inventory API incorrectly required products with inventory rows to equal every product in the catalog manifest. Legitimate zero-stock products can have no inventory rows, so a complete source fetch was reported as an incomplete snapshot.
- The first correction allowed zero-stock products to lack rows. Live evidence found a second root cause: incremental catalog sync could persist a new inventory row without adding its product ID to the complete snapshot manifest. Dashboard therefore failed closed on a manifest mismatch.
- The correction extends the complete manifest only when every incremental product includes valid inventory-field evidence. A daily repair can request a full inventory snapshot for exactly one business date. Inventory report rows and Dashboard KPIs now read the durable GraphQL snapshot; the custom inventory DSL is not on the critical path.
- `/reports/dashboard` now shows Shopfront source sales and stock; the native Odoo report remains available at `/reports/dashboard/odoo`. Active products and Sellable units are separate metrics; Sellable units convert case and item levels.
- Online repair and source parity remain pending deployment. The separate Odoo ledger/warehouse quantity reconciliation remains a distinct issue and is not repaired by changing Dashboard source metrics.

## Follow-up

1. Push the reviewed fix to `main`, then confirm Dokploy runtime SHA.
2. Replay 2026-11-05 and refresh the full SKR inventory snapshot through the crawler durable job.
3. Verify source sales 164 / AUD 4,494.56 and inventory sellable units against the persisted snapshot and UI.
4. Record any incomplete source sale without inventing missing lines; reconcile Odoo warehouse mapping separately.
