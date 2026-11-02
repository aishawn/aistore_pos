# Product Cost Coverage Read-Only Audit

Date: 2026-11-03
Database: `aipos_uat`
Scope: active `product.product` reads only; no Odoo writes.

| Odoo company | Active products | Positive `standard_price` | Cost coverage | Positive stock and cost | Stock-cost value |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 5 (Demo) | 13,001 | 4,196 | 32.3% | 1,384 | AUD 350,455.62 |
| 137 (SKR) | 12,989 | 2,609 | 20.1% | 1,286 | AUD 330,239.93 |

All active products returned a nonnegative cost field, but most costs are zero. Therefore the inventory cash report is valid only for the subset with a positive trusted cost and positive stock; it must not present the result as the full-store cash value without the excluded count.

This reinforces the current review gate: populate real purchase costs and supplier lead times before using inventory value for automated replenishment or budget allocation. `writeRequests=[]`.
