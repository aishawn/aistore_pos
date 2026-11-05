# Shopfront Sync Feature Record

Updated: 2026-11-06. Owner: TBD.

This feature reads Shopfront data into the crawler archive and forwards only explicitly mapped business domains to POS/Odoo. Historical Shopfront sales remain a separate mirror; they are not native POS orders and do not update live stock.

## Feature status

| Capability | Implementation | Evidence |
|---|---|---|
| Product and inventory source capture | GraphQL catalog and inventory snapshots | [Design](design.md), [validation](validation.md) |
| Sales and source reports | GraphQL transaction mirror plus Shopfront report proxy | [Design](design.md) |
| Purchase and supply mirror | Read-only source orders; mirror does not receive stock | [Design](design.md) |
| Durable inventory refresh | Page checkpoint and staging candidate; promote only after complete validation | Local candidate tests only; deployment pending |
| POS/Odoo acknowledgements | Strict count and business receipt contracts | Customer item-count response fix is in a separate Odoo candidate; deployment pending |

Read [progress](progress.md) for the current candidate and [validation](validation.md) for exact test and runtime evidence. A successful crawler fetch does not prove downstream POS parity.
