# Supplier lead-time read-only recheck

Generated at `2026-11-02T23:00Z` against Odoo database `aipos_uat`. The probe read only `purchase.order` and completed `stock.picking` records for the two bound companies over the previous 365 days. No business mutation was attempted.

| Odoo company | Purchase orders | Completed receipts | Valid lead-time observations | Suppliers with observations | Write requests |
|---:|---:|---:|---:|---:|---:|
| 5 (SKR) | 0 | 0 | 0 | 0 | 0 |
| 137 (Demo) | 0 | 0 | 0 | 0 | 0 |

## Interpretation

There is no defensible realized supplier lead time in the current UAT data. The replenishment service must continue to treat missing lead time as a hard manual-review gate. It must not infer lead time from POS receipts, purchase-order creation dates, scheduled dates, or zero stock.

The next data requirement is a supplier-linked purchase order, approval timestamp, incoming receipt and actual completion timestamp, or verified `product.supplierinfo.delay` values for the relevant company and products. Until that data exists, fill-rate, service-level and realized purchasing-cost metrics remain unverified.
