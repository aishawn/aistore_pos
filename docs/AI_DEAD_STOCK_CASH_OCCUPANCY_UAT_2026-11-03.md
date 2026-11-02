# Dead-Stock and Cash-Occupancy Read-Only UAT

Executed against the deployed `712134726fbe1d56ad004daf71fe208b07e5435b` runtime on 2026-11-03. The endpoint reads native Odoo stock, product cost, and completed POS sales only. No business writes were made.

## Results

| Store | Company | Products | 30d no-sale | 60d no-sale | 90d no-sale | 30d value (AUD) | 60d value (AUD) | 90d value (AUD) | Invalid cost/stock | Writes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Demo | 137 | 12,989 | 11,079 | 10,642 | 10,414 | 1,323,819.79 | 1,288,602.25 | 1,273,001.85 | 8,360 | 0 |
| SKR | 5 | 13,001 | 11,054 | 10,625 | 10,399 | 1,770,936.48 | 1,529,479.76 | 1,445,429.91 | 8,262 | 0 |

The endpoint returned HTTP 200 for both stores, `catalogueCoverage.complete=true`, and `dataQuality=CURRENT_NATIVE_STOCK_POS_SALES_READ_ONLY`. Response time was about 8 seconds per store because it loads the full catalogue and three independent sales windows.

## Interpretation

- This is already a high-value operator workflow: it ranks products with no recent sales and quantifies cash tied up in the subset with valid stock and cost fields.
- The no-sale counts are broad exception queues, not proof of obsolescence. A product can be seasonal, newly listed, inactive, or intentionally held.
- The cash values are partial. Demo has invalid cost/stock on 8,360 products and SKR on 8,262 products; those rows are excluded from the value totals.
- Add category, last receipt date, expiry/season flags, margin, and valid unit cost before recommending markdowns or stop-replenishment actions.
- Keep the result read-only and require human review before price changes, disposal, or purchase suppression.
