# Reports Feature Record

Updated: 2026-11-05. Owner: TBD.

This directory records the POS reporting surfaces and the evidence behind their numbers. The current implementation reads Odoo through company and store scoped report RPCs. A page being implemented or visible in source does not establish that its deployed version is live or that Shopfront synchronization covers its selected dates.

## Feature status

| Capability | Entry | Implementation status | Current evidence |
|---|---|---|---|
| Overview | `/reports` | Implemented in source; deployment and online acceptance not established here | Prepared Odoo report snapshot; Shopfront coverage metadata where available |
| Sales report | `/reports/sales` | Implemented in source; deployment and online acceptance not established here | Odoo POS orders and sale lines, date/product/category grouping |
| Purchase report | `/reports/purchase` | Implemented in source; deployment and online acceptance not established here | Confirmed and completed Odoo purchase orders |
| Register closures | `/reports/closures` | Implemented in source; deployment and online acceptance not established here | Closed Odoo register sessions and cash reconciliation |
| Inventory and dead stock | Overview and inventory report surfaces | Existing source implementation; exact deployed behavior must be checked per route | Odoo stock quantities/costs; incomplete catalogue or invalid cost must remain visible |

Deployment status (2026-11-05): report implementation is committed on `main` at `71a715a7e970a0abaf0d8c2c7f18a3a2fcb4fa62`. At the latest runtime identity check, the main app-source SHA was `6121dba2b99fea9689b1082d7a83e496fa3b6e83`; SKR and Demo public version endpoints both reported frontend/backend `cf022f55a6a9a793c78941597e269ca610fd467a`, built at 2026-11-05 12:50 UTC. The supplied Dokploy webhook returned `Branch Not Match`; live report acceptance is blocked until Dokploy Source/Git settings are verified and the current main SHA is deployed.

Read [design](design.md), [validation](validation.md), and [progress](progress.md) before using figures in management reporting. Historical Shopfront margin reconciliation is a separate evidence set and is not interchangeable with these operational reports.
