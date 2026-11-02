# Replenishment explanation and exception audit

Runtime checked: `f38c4ab5197f3eddc43055de33158d9575658e6b`

Both Demo and SKR returned HTTP 200 for the authenticated read-only replenishment endpoint with complete catalogues and no business writes. Every product includes `reason`, `reasonParts`, `dataIssues`, model metadata, confidence, stock cover, and suggested quantity fields. The API therefore has enough evidence to render an explanation-first review queue.

## Current exception state

| Store | Products | Review required | Exception count | Recommendation status | Attention level | Lead-time coverage |
|---|---:|---:|---:|---|---|---:|
| Demo | 12,987 | 12,987 | 12,987 | 100% `REVIEW_DATA` | 100% `REVIEW` | 0% |
| SKR | 12,999 | 12,999 | 12,999 | 100% `REVIEW_DATA` | 100% `REVIEW` | 0% |

The most frequent review causes are missing supplier lead time, low forecast confidence, low demand history, analog cold-start estimates, negative stock values, and cost/price review. With 100% of products marked for review, the raw exception list is not an efficient owner workflow; an urgent-risk view is needed to prioritize high-risk and out-of-stock-with-demand items.

## UI change

The replenishment page now has an **Urgent risks** filter and count. It selects products where `risk=HIGH` or `onHand <= 0` with positive recent demand. The filter is read-only and does not relax the `REVIEW_DATA` gate or enable RFQ creation. Existing explanation, data-review, out-of-stock, slow-stock, and all-product views remain available.

## Verification

- AI report regression: Demo `23/23`, SKR `23/23`
- Replenishment read-only probe: Demo and SKR HTTP `200`, complete catalogues, zero non-GET Odoo calls
- `npm run typecheck`: pass
- `npx eslint src/components/OdooReplenishmentPage.tsx`: zero errors, one pre-existing hook dependency warning at line 312

## Next product-data gate

Populate supplier lead times and clean negative stock/cost records for a small pilot subset. Then verify that the urgent queue shrinks, explanations show actionable causes, and only validated products become eligible for a draft RFQ.
