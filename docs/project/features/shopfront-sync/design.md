# Shopfront Sync Design

Updated: 2026-11-17. Owner: TBD.

## Data path and invariants

Shopfront GraphQL and Reporting APIs are read-only source interfaces. The crawler persists source identity and snapshots, then sends defined business mappings to the Orithos POS API. Admin, permission, security, notification, and other non-business Query roots must remain in the private archive and must not become POS business records.

- Product total, active product count, inventory product count, inventory row count, sellable units, signed quantity, and negative quantity are different measures. Reports must name the measure they display.
- Inventory preserves signed source quantities. Positive sellable units are a separate derived metric and must not overwrite negative source balances.
- A complete inventory snapshot is promoted only after every cursor page is checkpointed, IDs and quantities validate, and the staged product count agrees with the scan count. Previous complete data remains readable until atomic promotion.
- Page nodes and their next cursor are committed together. A retry resumes after the last committed cursor. Repeated or missing cursors fail the scan without advancing the checkpoint.
- A daily job with a failed, skipped, partial, or timed-out required mirror is `partial` or `failed`; it must not report `completed`.
- Shopfront Sales `Profit` and `Profit Percentage` come from the Shopfront Reporting API. The dashboard parser checks `profit = revenue - cost` and `profit_percentage = profit / revenue * 100` per row, then aggregates profit over revenue for a weighted percentage. It does not substitute Orithos margin when the source report is unavailable.
- Shopfront source sales and imported Orithos `sale` records are separate representations; compare by stable external IDs and the documented source/business-date contract, not totals alone.

## Dashboard source rules

Current store pages and AI queries read operational data from Orithos POS APIs. They must not make live Shopfront or Odoo requests. Shopfront reports, including `/reports/misc`, are independent read-only source references for crawler operations and reconciliation; they are not a page runtime backend. When comparing a Shopfront report with Orithos, label both sources, business date, timezone, freshness, metric definition, and coverage limits.

Shopfront report refreshes belong to the crawler/reconciliation path. A stale or failed upstream read must be reported and must not silently become an empty successful result or a current Orithos value. Product and inventory pages use Orithos APIs populated by the approved sync/import path; a page refresh must not trigger an uncontrolled full Shopfront scan.

## Product catalogue surface

`/products` is the canonical product directory backed by Orithos products and actions. Source-derived product, inventory, price, cost, sales, and coverage fields must reach the page through Orithos APIs after the relevant sync/import contract has accepted them. The Shopfront-only catalogue route is not a second directory; legacy `/products/odoo` and `/products/shopfront` routes remain compatibility redirects only while present.

Catalogue counts must identify their scope: Shopfront ACTIVE products are source products, Orithos catalogue totals are saleable variants, and positive available units are a signed-stock-derived quantity. These measures are not interchangeable and must retain their source labels.

Product data reports cost and inventory status independently. A numeric zero is a valid source value; a missing source row, failed sync, or restricted permission must remain distinguishable. Failed optional data must not silently become an empty successful result or replace source values with guesses.

## Orithos business import safety

Shopfront source records are mirrored independently from formal POS business tables. Formal product imports must have a source ID, name, positive case quantity, shelf price (including a quantity-one tier), source status, and a matching Orithos tax rate before writing. Unknown source tax codes must not become a null tax assignment. Only source-active, non-deleted products may be active in Orithos; other source states are imported inactive.

A complete inventory replacement must be non-empty, contain unique source product IDs and explicit quantities, and resolve every source product to an Orithos product before clearing the current outlet snapshot. When multiple Shopfront source products resolve to one Orithos product, their business attributes must agree before catalog writes; conflicting prices, GST, case quantities, status, or costs block the whole batch. Inventory rows that resolve to the same Orithos product must also agree on quantity and replenishment values before a snapshot is replaced. Formal imports run atomically: row failures abort the batch. Product prices are stored against the mapped outlet and the base shelf price is materialized at quantity one when the source provides only tier prices.

Shopfront sales have an Orithos native importer and reconciliation path; current coverage and unresolved records are tracked in the root `HANDOFF.md`. Suppliers, customers, and purchase orders remain source mirrors until each domain has an explicit Orithos business-ledger importer and reconciliation contract. A crawler acknowledgement alone does not prove source records have been posted correctly as POS sales, receipts, or payments.

## Cost confirmation and scoped cleanup

- A current product cost is usable only when the crawler confirms the product in a complete current catalog and selects the cost belonging to the configured Shopfront outlet. Global or historical cost fields do not confirm a current outlet cost.
- Legacy product costs missing from the current catalog are unavailable, including for a POS product that remains active. Preserve its product state and box quantity; do not reuse a historical cost or invent zero.
- The POS `products:clear-unverified-costs` integration accepts a bounded list of explicit source IDs and expected current costs. It requires one mapped, live POS product per source ID in the selected outlet, an unconfirmed catalog marker, and exact numeric match to the expected cost. Any mismatch rejects the transaction.
- The transaction updates only `product.cost` and `product.shopfront_catalog_confirmed`, and stores old/new values, source ID, outlet, reason and timestamp in `shopfront_product_cost_audit`. It does not update sale-item costs, inventory, prices, status, box quantity, or other product attributes.
- Reconciliation is not complete when the full source catalog snapshot is missing/partial/stale or the two-store field comparison reports any mismatch/unavailable field. Report those conditions independently from the scoped stale-cost cleanup result.

## Completion evidence

For each store and selected business date, record source query/report, timezone, source row/count totals, unique IDs, crawler rows, downstream acknowledgement counts, snapshot timestamp and completeness, job status, and sampled field comparisons. Local fixtures and deployment health are not source-to-POS parity evidence.
