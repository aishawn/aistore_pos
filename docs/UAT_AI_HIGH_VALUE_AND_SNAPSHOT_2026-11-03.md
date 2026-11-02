# AI High-Value Questions and Snapshot UAT

Date: 2026-11-03
Runtime: `306c56bc32c50fd58a9949bcbe59e9333b37994a`
Scope: read-only Demo and SKR validation. No Odoo business writes.

## High-value assistant questions

The following questions returned HTTP 200 and `writeRequests=[]` in both stores:

- `Which inventory ties up the most cash?` -> `report_stock_value`
- `Which products have the highest inventory value?` -> `report_stock_value`
- `Which products may stock out in the next 7 days?` -> `/stock/replenishment`
- `哪些商品未来7天可能断货？` -> `/stock/replenishment`

Inventory value answers use Odoo product cost and on-hand quantity. Stockout questions open the review queue and do not create or confirm a purchase order.

## Snapshot and replenishment evidence

| Store | Products | Warehouses | Observed days | Gap days | Last attempt | Lead-time coverage | Result |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Demo | 12,987 / 12,987 | 2 / 2 | 2 | 0 | SUCCESS | 0 / 12,987 | PASS, REVIEW |
| SKR | 12,999 / 12,999 | 1 / 1 | 3 | 0 | SUCCESS | 0 / 12,999 | PASS, REVIEW |

Both replenishment responses reported complete catalogue coverage and no non-GET Odoo calls. Forecasting remains review-only because the cost policy is marked as simulated/review-required and supplier lead times are unavailable.

## Decision

The second real snapshot continuity gate is satisfied. Do not enable automated purchasing or switch the global forecasting default. The next data action is to populate and validate supplier lead times and real purchase cost coverage, then rerun segmented service-level and inventory-cost backtests.
