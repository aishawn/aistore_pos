# Reports Feature Record

Updated: 2026-11-08. Owner: TBD.

This directory records the POS reporting surfaces and the evidence behind their numbers. The current implementation reads Odoo through company and store scoped report RPCs. A page being implemented or visible in source does not establish that its deployed version is live or that Shopfront synchronization covers its selected dates.

## Feature status

| Capability | Entry | Implementation status | Current evidence |
|---|---|---|---|
| Overview | `/reports/dashboard` (`/reports` redirects to dashboard) | Implemented on `main`; current runtime matched `main` before this follow-up patch | Prepared Odoo report snapshot; Shopfront coverage metadata where available |
| Sales report | `/reports/sales` | Implemented in source; deployment and online acceptance not established here | Odoo POS orders and sale lines, date/product/category grouping |
| Purchase report | `/reports/purchase` | Implemented in source; deployment and online acceptance not established here | Confirmed and completed Odoo purchase orders |
| Register closures | `/reports/closures` | Implemented in source; deployment and online acceptance not established here | Closed Odoo register sessions and cash reconciliation |
| Inventory and dead stock | Overview and inventory report surfaces | Existing source implementation; exact deployed behavior must be checked per route | Odoo stock quantities/costs; incomplete catalogue or invalid cost must remain visible |

Ordinary product catalogue pages use the shared scoped Redis read cache for 30 seconds with in-flight request coalescing and revision-based invalidation. Inventory report pagination is intentionally excluded. Runtime timing and SKR/Demo parity require a separate authenticated online check; see validation.

Deployment status (2026-11-05): public runtime checks last observed `7617e3ce9d2548096c5f3db28631bfd98738762e`; later POS crawler audit evidence was read on runtime `809ef6304a50de96f906d2c2c44a3f38552933ae`. Current uncommitted reporting changes are not deployed. The audit confirms Shopfront historical sales are kept in a separate Odoo mirror and are not native `pos.order`; comparing those ledgers is invalid. Dashboard's zero snapshot versus the direct report's `$3,760.72` across 141 native orders remains a separate same-ledger inconsistency and is OPEN. See validation and progress records.

Read [design](design.md), [validation](validation.md), and [progress](progress.md) before using figures in management reporting. Historical Shopfront margin reconciliation is a separate evidence set and is not interchangeable with these operational reports.
