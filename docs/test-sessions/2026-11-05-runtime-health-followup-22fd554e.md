# Runtime health follow-up: `22fd554e` (2026-11-05)

## Read-only evidence

| Check | SKR | Demo |
|---|---:|---:|
| `/api/public/version` | HTTP 200, SHA `22fd554ec2f3bda040b542a2ec50215cdbcfb71c` | HTTP 200, same SHA |
| Build time | `2026-11-05T14:07:15Z` | `2026-11-05T14:07:15Z` |
| `/api/odoo/inventory-history` without session | HTTP 401 | Not queried after identical shared runtime result |
| `/api/odoo/replenishment` without session | HTTP 401 | Not queried after identical shared runtime result |

Direct read-only `https://odoo.orithos.com.au/web/database/selector` still exceeded a 15-second client timeout. No credentials were submitted in this check and no RFQ, purchase order, inventory, sales, or other business write was issued.

## Interpretation

Both POS stores are running the same new deployment, but the Odoo upstream is still not reachable from the direct route and authenticated POS/Odoo endpoints cannot be evaluated without a valid session. The `401` results are an authentication precondition, not evidence that inventory history is empty or that replenishment is safe.

## Gate impact

Keep online AI acceptance and inventory-aware backtesting blocked. After Odoo connectivity and a valid read-only session are restored, rerun both stores at this fixed SHA and record inventory `latestBusinessDate`, `observedDays`, product/warehouse coverage, AI answer dates/ranges/sources, and write request evidence.
