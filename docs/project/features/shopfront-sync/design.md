# Shopfront Sync Design

Updated: 2026-11-06. Owner: TBD.

## Data path and invariants

Shopfront GraphQL and Reporting APIs are read-only source interfaces. The crawler persists source identity and snapshots, then sends defined business mappings to POS/Odoo. Admin, permission, security, notification, and other non-business Query roots must remain in the private archive and must not become POS business records.

- Product total, active product count, inventory product count, inventory row count, sellable units, signed quantity, and negative quantity are different measures. Reports must name the measure they display.
- Inventory preserves signed source quantities. Positive sellable units are a separate derived metric and must not overwrite negative source balances.
- A complete inventory snapshot is promoted only after every cursor page is checkpointed, IDs and quantities validate, and the staged product count agrees with the scan count. Previous complete data remains readable until atomic promotion.
- Page nodes and their next cursor are committed together. A retry resumes after the last committed cursor. Repeated or missing cursors fail the scan without advancing the checkpoint.
- A daily job with a failed, skipped, partial, or timed-out required mirror is `partial` or `failed`; it must not report `completed`.
- Shopfront Sales `Profit` and `Profit Percentage` come from the Shopfront Reporting API. The dashboard parser checks `profit = revenue - cost` and `profit_percentage = profit / revenue * 100` per row, then aggregates profit over revenue for a weighted percentage. It does not substitute Odoo margin when the source report is unavailable.
- Shopfront's historical sales mirror and native Odoo `pos.order` are separate ledgers. Cross-ledger total differences are not a valid completeness test.

## Dashboard source rules

The SKR Store Pulse uses Shopfront source sales report for yesterday sales and profit percentage, plus the same Shopfront Inventory Reporting API rows used by the Inventory page for sellable units. The GraphQL inventory snapshot remains the sync/POS import source, not the source for Shopfront report parity. Inventory API responses carry a version marker so an older crawler cannot present GraphQL-reconstructed data as an aligned report. Inventory rows with valid case level, item level and case quantity contribute to a known sellable-units subtotal; the response includes covered and excluded row counts and row coverage. The UI labels a partial subtotal and its row coverage, and fails closed when no rows are convertible, the source is unavailable or stale, or the contract is invalid. A partial subtotal must not be presented as a complete store total. Orithos/Odoo values remain available on their explicitly labeled operational report surfaces and may be used for same-ledger reconciliation only.

## Product catalogue surface

`/products` is the canonical product directory. It presents Odoo product variants and actions, with Shopfront source product, inventory, price, cost, sales, and coverage data as explicitly labeled read-only enrichment. The Shopfront-only catalogue route is not a second directory; `/products/odoo` and `/products/shopfront` remain compatibility redirects to `/products`.

Catalogue counts must identify their scope: Shopfront ACTIVE products are source products, Odoo catalogue totals are saleable variants, and positive available units are a signed-stock-derived quantity. These measures are not interchangeable and must retain their source labels.

Product enrichment reports cost and inventory status independently. A numeric zero is a valid source value; a missing source row, failed read, or restricted cost permission must remain distinguishable. Failed optional source reads must not silently become an empty successful result or replace Shopfront values with Odoo values.

## Orithos business import safety

Shopfront source records are mirrored independently from formal POS business tables. Formal product imports must have a source ID, name, positive case quantity, shelf price (including a quantity-one tier), source status, and a matching Orithos tax rate before writing. Unknown source tax codes must not become a null tax assignment. Only source-active, non-deleted products may be active in Orithos; other source states are imported inactive.

A complete inventory replacement must be non-empty, contain unique source product IDs and explicit quantities, and resolve every source product to an Orithos product before clearing the current outlet snapshot. When multiple Shopfront source products resolve to one Orithos product, their business attributes must agree before catalog writes; conflicting prices, GST, case quantities, status, or costs block the whole batch. Inventory rows that resolve to the same Orithos product must also agree on quantity and replenishment values before a snapshot is replaced. Formal imports run atomically: row failures abort the batch. Product prices are stored against the mapped outlet and the base shelf price is materialized at quantity one when the source provides only tier prices.

Shopfront sales, suppliers, customers, and purchase orders remain source mirrors until each domain has an explicit Orithos business-ledger importer and reconciliation contract. A crawler ledger route to Orithos alone does not mean those source records have been posted as POS sales, receipts, or payments.

## Completion evidence

For each store and selected business date, record source query/report, timezone, source row/count totals, unique IDs, crawler rows, downstream acknowledgement counts, snapshot timestamp and completeness, job status, and sampled field comparisons. Local fixtures and deployment health are not source-to-POS parity evidence.
