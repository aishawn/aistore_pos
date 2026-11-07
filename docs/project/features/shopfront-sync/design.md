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

The SKR Store Pulse uses Shopfront source sales report for yesterday sales and profit percentage, plus the same Shopfront Inventory Reporting API rows used by the Inventory page for sellable units. The GraphQL inventory snapshot remains the sync/POS import source, not the source for Shopfront report parity. Inventory API responses carry a version marker so an older crawler cannot present GraphQL-reconstructed data as an aligned report. The UI fails closed to an unavailable marker if the source report is unavailable, stale, incomplete, or from an older contract. Orithos/Odoo values remain available on their explicitly labeled operational report surfaces and may be used for same-ledger reconciliation only.

## Product catalogue surface

`/products` is the canonical product directory. It presents Odoo product variants and actions, with Shopfront source product, inventory, price, cost, sales, and coverage data as explicitly labeled read-only enrichment. The Shopfront-only catalogue route is not a second directory; `/products/odoo` and `/products/shopfront` remain compatibility redirects to `/products`.

Catalogue counts must identify their scope: Shopfront ACTIVE products are source products, Odoo catalogue totals are saleable variants, and positive available units are a signed-stock-derived quantity. These measures are not interchangeable and must retain their source labels.

## Completion evidence

For each store and selected business date, record source query/report, timezone, source row/count totals, unique IDs, crawler rows, downstream acknowledgement counts, snapshot timestamp and completeness, job status, and sampled field comparisons. Local fixtures and deployment health are not source-to-POS parity evidence.
