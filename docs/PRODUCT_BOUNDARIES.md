# Product Boundaries

This is the durable product map for agents. It describes the intended data source, write behavior, and minimum evidence. Current status belongs in the latest handoff and capability documents.

| Area | System of record | Default behavior | Minimum acceptance evidence |
|---|---|---|---|
| Sell / checkout | Odoo | Business write | Matched runtime SHA, Odoo order/payment, GST, stock and receipt reconciliation |
| Refunds | Odoo | Business write | Original-order linkage, amount/tax/stock reconciliation and audit result |
| Register / cash close | Odoo | Business write | Cash/card totals, difference review, retry, close state and reopen/recovery evidence |
| Products / stock | Odoo | Read and business write | Tenant/company/warehouse scope, quantity and concurrent update behavior |
| Stocktake | Odoo | Business write | Invalid quantity rejection, idempotent retry, adjustment and restore evidence |
| Purchasing / receiving | Odoo | Business write | Supplier scope, partial/over receipt handling, retry, stock and accounting reconciliation |
| Prices / capped pricing | Odoo | Review first, then business write | Inclusive GST, cost, net margin, stale-price rejection and POS price read-back |
| Customers / groups / price lists | Odoo | Role-controlled read/write | Admin versus staff permissions, tenant scope, failure recovery and real Odoo evidence |
| Reports / overview | Odoo | Read-only | Store business timezone, date boundaries, refunds and totals reconciled to Odoo |
| AI assistant | Odoo plus configured provider | Read-only by default | Provider capability, route/intent, tenant scope, sanitized errors and no unintended writes |
| Invoice OCR | Configured vision provider plus Odoo workflow | Preview by default | Real invoice field accuracy; preview must not create purchasing or receiving records |
| Platform / signup | POS application and Odoo provisioning | Controlled platform writes | Platform/store role separation, slug reservation, bootstrap and tenant isolation |
| Shopfront history | R2 archive | Read-only by default | Archive labeling, manifest/dry run for imports, and post-import stock reconciliation |

## Evidence rules

- A page being reachable, an HTTP 200, a mock, or a fixture proves only the checked UI/contract behavior.
- A business acceptance claim requires a real target, read/write scope, source SHA, runtime SHA, and a saved evidence artifact.
- Historical handoffs may report older boundaries or blockers; do not rewrite them. Use the current AGENTS rules and newest status files for current decisions.
