# Dashboard data trust audit — 2026-11-03

Read-only target: Odoo `aipos_uat`, company 5, AUD, Australia/Adelaide.
Observed at 2026-11-03T09:06:45Z using the modified report calculator against live Odoo.
This is shared UAT evidence, not production acceptance or a deployed-code claim.

| Metric | Observation | Conclusion |
| --- | --- | --- |
| Yesterday (local Nov 2) | UTC Nov 1 13:30 to Nov 2 13:30, exclusive end | Store timezone boundaries verified |
| Sales incl tax | AUD 3,579.98, 134 orders | Odoo order aggregate |
| Tax / sales ex tax | AUD 307.67 / 3,272.31 | Odoo order fields |
| Sales-line ex-tax sum | AUD 3,579.98 across 276 lines, 496 units | Does not reconcile; difference AUD 307.67; margin blocked |
| Inventory | -10,350,065 units; 8,265 products with negative quants | Raw company/internal-location aggregate; requires stock reconciliation |
| Native purchases | 2,343 draft orders; zero completed purchase-linked receipts | Cannot establish last valid receipt cost |
| Preserved source purchases | 2,306 RECEIVED source orders | Evidence for reconciliation only, not native completed receipts |
| Existing sales-line cost | AUD 35,332.99 total_cost; purchase_price field absent | Cannot use as trustworthy cost |

The importer maps case costs to per-unit product costs and writes inclusive line totals into both subtotal fields. Example: product 1335 has AUD 49.68 per case of 20, labelled excluding GST: AUD 2.484 per selling unit, not AUD 49.68. Some native purchase prices divide case cost by ordered quantity; zero ordered quantity can also result in zero cost. These are confirmed mapping defects. The cause of the stock magnitude still requires movement/import chronology analysis; replacing stock with a source snapshot is not justified.

## Implemented report behavior

- Cost rule confirmed by owner: latest completed supplier-to-internal receipt at or before each sale, using the linked confirmed purchase line's ex-tax subtotal / quantity and compatible UOM conversion. Current product cost is never a fallback. Different currencies, missing receipts, incompatible units and refunds without original-sale cost evidence remain unverified.
- Order net sales must reconcile to sales-line net sales before margin calculation. All relevant lines must have cost evidence before publishing a whole-day margin. Coverage is weighted by absolute sales value.
- Negative stock stays signed and is explicitly flagged. Mixed units are not added together. Query failures remain unavailable, distinct from confirmed zero sales.
- Cache schema version changed to invalidate older results based on purchase_price.
- Receipt history and sale lines are bounded at 10,000; exceeding the bound withholds verification. Purchase-line prices are current Odoo values, not immutable receipt snapshots; later PO price edits remain a historical-audit limitation. Landed costs are outside the selected purchase-price definition.

## Historical repair proposal (not executed)

1. Produce a read-only per-record manifest linking source sales, orders, receipts and products; include source IDs, currency, GST classification, case quantities, receipt dates, existing values, proposed values and unresolved rows. Do not infer GST rates from ambiguous labels or use ordered quantity as case size.
2. Reconstruct sales ex-tax amounts from original line tax evidence and reconcile each order. Reconstruct purchase receipt prices from source receipt history, preserving received-at timestamps; do not confirm imported draft POs, which could duplicate inventory/accounting effects.
3. Independently reconcile stock: source snapshot timestamps plus subsequent signed movements, warehouse/location scope and imported sale replay. Resolve the movement discrepancy before proposing quant corrections.
4. Before any business write, obtain owner approval for the exact manifest/scope, create a verified database backup, prove restore in an isolated copy, rehearse the repair and record rollback evidence. Keep importer corrections and historical data migration separately reviewable.
5. Re-run the dashboard audit and order/stock reconciliation after approved repair; only promote margin once sales and receipt costs pass.

## Reproduction and validation

With Node 24+, set ODOO_USER / ODOO_PASS privately (optionally ODOO_URL), then run:
`node --experimental-strip-types scripts/dashboard-data-audit.mjs --company 5 --database aipos_uat`.
The script permits only read/read_group/search_read/search_count methods and prints aggregates, never credentials or raw sales records.

Local narrow tests: purchase-cost/data-trust, report period/DST and report cache (26 passed). Typecheck and targeted lint are recorded in the task handoff. No local application build or Odoo business write. Browser/deployment acceptance remains pending.
