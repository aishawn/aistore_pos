# Test Session: 2026-11-03 Inventory report

| Field | Value |
|---|---|
| Session ID | 2026-11-03-inventory-report |
| Timezone | Asia/Shanghai |
| Operator | Codex |
| Source | main baseline `24854d147073a2c8c5dee16c53a90218431bfb58` plus scoped candidate diff; containing feature commit records exact source |
| Runtime SHA | Local webpack development; online NOT RUN |
| Environment | Local unit, actual handler/in-memory Odoo transport, intercepted browser fixture |
| Database | Not applicable |
| Real business writes | 0 |

| Suite | Command/workflow | Result | Evidence |
|---|---|---|---|
| RPT-001 | Node 24 `--experimental-strip-types --test src/lib/inventory-report.test.ts` | PASS 7/7 | Decimal cost, negative/fractional stock, missing/zero cost, mixed units, displayed-name/category/inclusive-price sorting, snapshot identity/expiry/eviction |
| RPT-001 | `node scripts/pilot-inventory-report-route-local.mjs` | PASS 8/8 | [Route fixture](../UAT_INVENTORY_REPORT_ROUTE_LOCAL_2026-11-03.json) |
| UI-002 | `node scripts/pilot-inventory-report-ui-local.cjs` | PASS 37/37 | [Browser fixture](../UAT_INVENTORY_REPORT_UI_LOCAL_2026-11-03.json), 390/1024/1440px; screenshots visually inspected at 390 and 1440 |
| RPT-001 | Node 24 `tsc --noEmit`, targeted ESLint and `git diff --check` | PASS | Changed UI, API route, API client and report helpers |
| REL-001 | Dokploy build/runtime identity | NOT RUN locally | main push triggers normal deployment; no local build |
| RPT-001 | Real Odoo stock/value reconciliation and large-catalogue latency | NOT RUN | Fixture evidence does not establish live acceptance |

The API fixture reads 1,012 owned products across three Odoo batches, excludes another company, and appends all pages without repeats or rescans. Tests cover filters, sorting, invalid sort options, permission rejection, inaccessible costs, expired/session/company/query-mismatched snapshots and provider failure. UI tests cover auto append, stable totals, stale response rejection, failed append retention/retry, 409 refresh and missing-cost messaging.

Limits: snapshot is local to a server process (5 minutes / 32 entries); process restart or load balancing may require explicit refresh. Initial query scans all matching products and inclusive-price sorting quotes all unique price/tax combinations; large-data latency remains unverified. Totals use current unit cost, not accounting stock valuation. No actual Odoo, sales, stocktake or other business writes.
