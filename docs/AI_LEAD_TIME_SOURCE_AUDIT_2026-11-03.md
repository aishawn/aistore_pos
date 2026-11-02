# Lead-Time Source Audit

This is a read-only audit of Odoo company `137` (Demo) and company `5` (SKR), performed 2026-11-03. No purchase, receipt, inventory, or configuration writes were made.

## Findings

| Store | Company | Purchase orders | `purchase`/`done` orders | All orders state | Orders with `effective_date` | Done incoming pickings | Done incoming pickings linked to PO |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| Demo | 137 | 2,344 | 0 | 2,344 `draft` | 0 | 0 | 0 |
| SKR | 5 | 2,343 | 0 | 2,343 `draft` | 0 | 399 | 0 |

The 399 SKR incoming pickings are POS/register inventory receipts. Sample origins are `Orithos UAT Business Two Register ...`; `partner_id` and `purchase_id` are empty. They do not represent supplier delivery events.

## Available Odoo Fields

Odoo exposes the fields needed for a future calculation:

- `purchase.order.date_order`, `date_approve`, `effective_date`, `state`, `picking_ids`
- `purchase.order.line.product_id`, `qty_received`, `date_order`, `date_approve`, `move_ids`
- `stock.picking.purchase_id`, `scheduled_date`, `date_done`, `picking_type_code`, `state`
- `stock.move.purchase_line_id`, `product_id`, `create_date`, `date`, `state`
- `product.supplierinfo.partner_id`, `product_tmpl_id`, `delay`, `last_purchase_date`

## Decision

The current 0% lead-time coverage is a source-data gap, not a forecasting failure. No defensible supplier lead time can be inferred from the existing records:

1. `product.supplierinfo` has no matching rows for the eligible store catalogue.
2. Purchase orders have never reached `purchase` or `done` state.
3. Completed inbound pickings are not linked to purchase orders.

Keep `MISSING_LEAD_TIME` as a hard review gate. Do not infer supplier lead time from POS register receipts, `create_date`, or scheduled dates.

## Required Data Onboarding

For each supplier/product relationship, import or enter a vendor, purchase unit, and contractual `delay` in days. For future orders, require this event chain:

`purchase.order.date_order` -> `purchase.order.date_approve` -> `stock.picking.date_done`, linked through `purchase_id` / `purchase_line_id`.

After at least 20 completed supplier-linked receipts per major supplier, recalculate median and P90 lead time and rerun the replenishment backtest. Until then, all recommendations remain review-only and the purchase workflow remains `READ_ONLY_PREVIEW`/`DRAFT_RFQ`.
