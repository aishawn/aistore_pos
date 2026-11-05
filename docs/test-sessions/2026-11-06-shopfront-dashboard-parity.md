# Test Session: 2026-11-06 Shopfront dashboard KPI parity

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-06-shopfront-dashboard-parity` |
| Started / timezone | 2026-11-06 / Asia/Shanghai |
| Operator | Codex |
| Branch | `main` |
| Source SHA | Candidate working tree based on `1e967049`; commit SHA pending |
| Runtime SHA | SKR POS frontend/backend `1e96704928aeaf8e0c59806580d21a16b107d941` before this candidate |
| Environment | Local tests; online read-only health/status/version probes |
| Database | `aipos_uat` (no database writes) |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `UI-001` | `node --experimental-strip-types --test src/lib/shopfront-dashboard-metrics.test.ts` | PASS: 3/3 | Command output in session | Tests source Profit/Revenue validation, incomplete reports, inventory totals |
| `UI-001` | `npm run typecheck` in `pos-ui` | BLOCKED | Command produced no output and was interrupted after extended runtime | Targeted KPI tests pass; full typecheck needs rerun in a healthy local dependency environment |
| `SHP-001` | `python -m pytest -q -c pyproject.toml tests/test_source_reporting.py` | PASS: 4/4 | Command output in session | Report and persisted GraphQL snapshot case/item conversion; missing units fail closed |
| `SHP-001` | `python -m compileall -q app/source_reporting.py app/main.py` | PASS | Command output in session | Python syntax |
| `OPS-001` | Crawler `/healthz`, `/api/sync/status`, `/api/sync/runs` | INFO | Live read-only response | Health 200. Job 76 completed; job 77 failed on Odoo receipt `item_count`; latest run 212 completed with `sales_skipped_unchanged`. This does not prove all source/target rows reconcile. |
| `REL-001` | SKR `/api/public/version` | INFO | Live read-only response | Both services still reported pre-candidate `1e967049`; this candidate is not deployed. |
| `UAT-001` | Authenticated Shopfront source reports and dashboard UI | NOT RUN | None | Browser control could not determine the Windows browser URL; exact online KPI values remain unverified. |

## Summary

- Passed: focused dashboard parser tests, TypeScript, crawler inventory summary tests and compile.
- Blocked: source report authentication and live Dashboard values were not read in this session.
- Failed: none in the final focused suites; an initial strict float equality assertion was replaced with a `1e-12` tolerance and the final suite passed.
- Not run: source/crawler/POS/Odoo same-day value comparison, five-page live reconciliation, build/deployment and browser acceptance.
- Business impact: read-only metrics path only; no Shopfront, POS or Odoo business writes.

## Root cause follow-up

- The Dashboard inventory candidate originally called Shopfront's custom `/api/source-reports/inventory` DSL. The live crawler endpoint returned 502, so that KPI could not be considered repaired even though parser fixtures passed.
- The crawler already persists inventory from the paginated GraphQL catalog query with an `InventorySnapshotManifest`. The inventory API incorrectly required products with inventory rows to equal every product in the catalog manifest. Legitimate zero-stock products can have no inventory rows, so a complete source fetch was reported as an incomplete snapshot.
- The candidate now derives Dashboard inventory from the durable GraphQL snapshot, converts case and item levels using each product's case quantity, and fails closed on incomplete manifest, missing pack size, duplicate product rows, or ambiguous multi-outlet scope. The general inventory API now accepts inventory-row product IDs that are a subset of the full product manifest and exposes both counts.
- Root-cause correction is locally implemented but NOT DEPLOYED. Online parity and mapped-outlet verification remain required. The separate Odoo quantity-zero finding is not repaired by changing Dashboard source metrics and still requires warehouse/location mapping and inventory sync reconciliation.

## Follow-up

1. Complete review and merge with the latest `origin/main`, then confirm Dokploy deployment and runtime SHA.
2. Verify mapped SKR outlet inventory against Shopfront, including manifest completeness, positive item-unit total, negative SKU count, and snapshot timestamp.
3. Reconcile Odoo company/warehouse/location mapping and the actual stock import path separately; do not write stock quantities to make the dashboard agree.
4. Reconcile Sales, Inventory, Dashboard, Products and Purchase source IDs, fields, date windows and totals across crawler, POS staging and Odoo mirror.
