# Lead-Time Source Recheck

Date: 2026-11-03
Database: `aipos_uat`
Scope: read-only Odoo JSON-RPC inspection; no writes were issued.

## Findings

- `product.supplierinfo` exposes the expected fields (`product_id`, `partner_id`, `delay`, `min_qty`, `price`, `company_id`, `date_start`, `date_end`), but `search_read` returned zero rows.
- The latest Demo purchase orders remain in `draft`; sampled records have `date_approve=false` and `effective_date=false`.
- Completed SKR pickings sampled from Odoo have `purchase_id=false`. They are POS/register stock receipts and cannot establish supplier delivery duration.
- The POS replenishment endpoint therefore correctly reports `supplierLeadTime.coverage=0` and marks every item for manual review.

## Decision

Keep `MISSING_LEAD_TIME` as a hard safety gate. Do not infer supplier lead time from POS receipt time, purchase-order creation time, or scheduled dates. Do not enable automatic purchasing or cost-based fill-rate evaluation until supplier-linked receipt history or verified supplier lead-time data is available.

## Required Data To Unblock

For each major supplier, capture a supplier-linked purchase order, approval/confirmation timestamp, linked incoming picking, and actual `date_done`. A verified `product.supplierinfo.delay` value is also acceptable when it is populated for the relevant company and products.
