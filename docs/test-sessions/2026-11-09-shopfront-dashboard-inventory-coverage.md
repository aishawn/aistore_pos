# Shopfront Dashboard Inventory Coverage

Date: 2026-11-09 (Asia/Shanghai)
Environment: Local crawler/POS UI fixtures
POS base SHA: `a08f27e91dcf4acdb1c9fcc27b0d782fce7d7ba7` (dirty candidate)
Crawler base SHA: `acc2ed0c2753af73440ecb66fcc4e4c899d2eaa8` (dirty candidate)
Runtime SHA: Not checked
Database: Not applicable
Business data writes: 0

## Scope

The crawler now returns the convertible sellable-units subtotal with covered/excluded row counts and row coverage when at least one inventory row has valid case and item quantities. The Overview can display that subtotal as partial and clears any Odoo inventory value when the Shopfront source inventory report is unavailable. Zero-coverage, stale and upstream failure states remain unavailable.

## Checks

| Check | Result | Notes |
|---|---|---|
| Crawler focused source reporting | PASS, 19 tests | `.venv` Python 3.11 environment |
| Crawler full test suite | PASS, 167 tests | Existing FastAPI/SQLAlchemy deprecation warnings |
| POS UI Shopfront dashboard metrics | PASS, 9 tests | Node 22.22.2; focused test command |
| POS UI typecheck | BLOCKED | `tsc` is absent from `node_modules`; project requires Node 24+ |
| `git diff --check` | PASS | Both repositories |
| SKR/Demo runtime and page verification | NOT RUN | Candidate is not deployed; response row coverage is unknown |

## Limits and follow-up

- Row coverage is not unit-weighted coverage. Excluded rows may contain stock, so a partial subtotal is not the complete Shopfront store total.
- Verify the deployed crawler response and authenticated SKR/Demo Store Pulse after deployment. Compare filters and totals with Shopfront's own Inventory report before claiming parity.
- No Shopfront API write, POS write, or Odoo business-data write was performed.
