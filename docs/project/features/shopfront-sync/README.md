# Shopfront Sync Feature Record

Updated: 2026-11-17. Owner: TBD.

This feature reads Shopfront as a read-only upstream source into the crawler archive and forwards explicitly mapped data into the Orithos POS API/PostgreSQL ledger for SKR and Demo. Shopfront is not the POS backend; never use its Register. See the root `HANDOFF.md` for current domain coverage and deployment status.

## Feature status

| Capability | Implementation | Evidence |
|---|---|---|
| Product and inventory source capture | GraphQL catalog and inventory snapshots | [Design](design.md), [validation](validation.md) |
| Sales and source reports | GraphQL transaction mirror plus Shopfront report proxy | [Design](design.md) |
| Purchase and supply mirror | Read-only source orders; mirror does not receive stock | [Design](design.md) |
| Durable inventory refresh | Page checkpoint and staging candidate; promote only after complete validation | Local candidate tests only; deployment pending |
| Orithos acknowledgements and parity | Strict count and business receipt contracts; compare both store targets | Verify terminal crawler state, source IDs/fields, and SKR/Demo API parity against the current deployment SHA |
| Scoped cost reconciliation | Exact source IDs, expected-current-cost checks, outlet mapping, and immutable old/new audit rows | [2026-11-17 session](../../../test-sessions/2026-11-17-shopfront-cost-reconcile.md); 179 SKR and 179 Demo costs cleared where the current source catalog did not confirm them |

Read [progress](progress.md) for the current candidate and [validation](validation.md) for exact test and runtime evidence. A successful crawler fetch does not prove downstream POS parity.
