# Supplier Lead-Time Read-Only Audit

Date: 2026-11-03
Database: `aipos_uat`
Scope: read-only Odoo `purchase.order` and completed `stock.picking` reads; no business writes.

## Evidence

| Odoo company | Lookback | Purchase orders | Completed receipts | Valid lead-time observations | Supplier groups | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 5 (Demo) | 730 days | 0 | 0 | 0 | 0 | No purchase history available |
| 137 (SKR) | 730 days | 0 | 0 | 0 | 0 | No purchase history available |

The read-only inference script completed successfully for both companies and emitted empty `writeRequests` arrays. This is a valid empty source result, not an authentication or permission failure.

## Impact on replenishment

- Supplier lead-time coverage cannot be inferred from this UAT database.
- The replenishment API correctly keeps every product in review status and does not treat missing lead time as zero.
- The forecast response still marks its order-cycle and cost policy as simulated/review-required.
- Automated RFQ or purchase-order creation must remain disabled.

## Required next data input

To validate operational replenishment, add real purchase orders linked to completed receipts, with order and receipt timestamps, supplier, product lines, quantities, and actual purchase costs. After that data exists, rerun the 730-day inference and segmented backtest; do not write inferred values into supplier master data without owner review.
