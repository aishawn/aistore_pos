# Reporting Design

Updated: 2026-11-05. Owner: TBD.

## Scope and data path

The reporting UI lives in `pos-ui`; report pages call same-origin `/api/odoo/*` routes. `reportAccess` enforces report permission and derives the company, warehouse, host, and timezone from the authenticated store binding. The API queries Odoo with company-scoped domains and returns uncached responses. Overview uses prepared snapshots and records Shopfront source coverage by target and business date; sales, purchases, and register closures query Odoo directly.

Every report should expose store/company, period, source, timezone, generation time, and source coverage. A null Shopfront sync record means coverage is unknown, not that synchronization failed or completed. The sync ledger records only days for which a sync event was recorded. It does not independently prove the Odoo mirror contains every source row.

## Metrics and boundaries

- Sales: completed POS orders (`paid`, `done`, `invoiced`) with positive order total. Negative-total refund orders are excluded; refund lines inside an otherwise positive order may remain. Date grouping counts orders and sums order totals. Product/category grouping reads sale lines, sums `qty` and `price_subtotal_incl`, and counts lines. Date grouping quantity is unknown and must display as `—`, never zero. The order gross total and grouped line amount are shown separately with their difference; line allocation is not represented as an accounting reconciliation.
- Sales category grouping uses the first POS category attached to a product; uncategorised products are explicit. Products with multiple POS categories are not fractionally attributed.
- Purchases: `purchase.order` records in `purchase` or `done`, grouped by supplier/status/month. `amount_total` is the confirmed order amount, not proof of invoice payment, goods received, or final accounting cost.
- Register closures: closed `pos.session` records, expected ending cash compared with counted ending cash. The difference is cash reconciliation only; it does not represent card settlement or total drawer variance. Exception filtering is evaluated across the selected range, capped at 10,000 rows.
- Inventory/dead stock: Odoo stock and cost data. Invalid or missing quantity/cost and incomplete catalogue coverage must be disclosed; derived stock value is not realized savings.

All date filters use the store timezone and half-open UTC intervals. No report page may imply a business write. CSV output must escape spreadsheet formula prefixes. Filter state is URL-addressable where implemented. Large tables should report loaded and matching totals and make the export scope clear.

## Change controls

When a metric, state domain, date rule, or source changes, update this file and validation evidence. Keep historical reports immutable. Mark unobserved deployment and online behavior as NOT RUN.
