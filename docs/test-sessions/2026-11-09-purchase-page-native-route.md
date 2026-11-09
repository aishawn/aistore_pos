# Test Session: 2026-11-09 purchase page native route

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-09-purchase-page-native-route` |
| Started / timezone | 2026-11-09 / Asia/Shanghai |
| Operator | Codex |
| Branch | `main` |
| Source SHA | `9703508f92c762c7f02ce9bd79f1790bc96678c1` |
| Runtime SHA | POS Demo/SKR/App frontend and backend `9703508f92c762c7f02ce9bd79f1790bc96678c1` |
| Environment | Local checks plus authenticated Demo and public runtime read-only probes |
| Database | Not connected |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `UI-001` | `npm run typecheck` | PASS | Local command output | Node 22.22.2; package requires Node 24+ |
| `UI-001` | `npm run test:unit` | PASS | 211 tests, 0 failures | Includes a new allow/deny source-host mapping regression |
| `UI-001` | `git diff --check` | PASS | Local command output | Includes only whitespace validation |
| `UI-001` | Targeted ESLint | PASS | No diagnostics | Changed route, pages, source component and host-scope test |
| `UI-001` | `python scripts/check-project-docs.py` | PASS | 81 Markdown files | Corrected a stale reporting validation link to the existing follow-up session |
| `LIVE-001` | Demo authenticated `/purchases` and legacy route | PASS | HTTP 200; `/purchases/odoo` HTTP 307 to `/purchases` | Read-only; no purchase or inventory mutation |
| `LIVE-002` | Demo authenticated `/api/orders` | PASS | `code=0`, outstanding total 0 | This is a read of current test tenant data, not write-path acceptance |
| `LIVE-003` | Demo authenticated Shopfront purchase archive | PASS | `sourceTotal=2366`, `total=2366`, first page 40; `readOnly=true` | Crawler records remain history only |
| `LIVE-004` | Public runtime identity | PASS | Demo/SKR/App frontend and backend match source SHA | Authenticated SKR purchase data read was not repeated in this follow-up |

## Summary

- Passed: typecheck, targeted ESLint and 211 frontend unit tests.
- Passed: deployed runtime and authenticated Demo read-only purchase flow.
- Failed: none.
- Not run: production build, database integration, purchase/receipt writes.
- Business impact: the candidate redirects the normal purchase list to the Orithos API and reads historical Shopfront records directly from the crawler. No purchase, receipt, or inventory transaction was written.

## Follow-up

1. Complete procurement create, partial receipt, retry/idempotency and inventory-ledger checks in a dedicated isolated test tenant.
2. Compare open Odoo purchase orders and supplier/product mappings per store; block cutover for unknown quantities, cost, GST or pack size.
3. Validate GST purchase export and record the per-store authorized write cutover before removing Odoo purchasing dependencies.
