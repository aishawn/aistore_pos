# Test Session: 2026-11-04 SKR AI Read-Only Rerun

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-04-skr-ai-rerun` |
| Started / timezone | 2026-11-04 08:11 UTC |
| Operator | Codex |
| Branch | `main` runtime; evidence worktree at `91e1ed2b` |
| Source SHA | Probe SHA-256 `1c0a5fb06e964a5d782542ed6995de38a467818fbf53a69073560453e7bcc8a6` |
| Runtime SHA | Frontend/backend `91e1ed2b5322fd2eae40aa2613bd23dbd69d4eed` |
| Environment | Online authenticated SKR, read-only AI questions and reports |
| Database | `aipos_uat` via tenant runtime |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `AI-001` | `verify-skr-ai-readonly.mjs` | Mixed: yesterday/exact date and dead-stock reconciliation PASS; weekly net-sales check FAIL; purchase-intent question only navigates; forecast remains REVIEW | [UAT summary](../UAT_AI_READONLY_RERUN_2026-11-04_0811Z.json) | No RFQ, purchase order, synchronization, or other business write |
| `AI-001` | Authenticated `GET /api/odoo/replenishment?coverageDays=21&validateSales=true` | PASS for capture status/coverage; insufficient history for stockout or fill-rate evaluation | [UAT summary](../UAT_AI_READONLY_RERUN_2026-11-04_0811Z.json) | 4 continuous days only; lead-time coverage remains 0% |

## Summary

- Yesterday sales for 2026-11-03 (AUD 6.49) and exact-date sales for 2026-10-16 (AUD 7,738.14) match their direct APIs and include date, as-of, store scope, and source provenance.
- The last-week answer reports AUD 28,234.20, equal to API `grossSales`; API net revenue is AUD 27,857.38 after AUD 376.82 refunds. The existing net-sales acceptance check therefore remains failed until the product contract explicitly defines or corrects this answer's gross/net treatment.
- The 30-day dead-stock response returned 50 rows and all 50 matched the direct API candidate set. “What do we need to buy?” still navigates to the replenishment page without producing a purchase recommendation.
- Inventory capture reports `SUCCESS` at 2026-11-03T15:30:13Z. Latest business date remains 2026-11-04; 4 continuous days, 13,035/13,035 products, and 1/1 warehouse are covered, with no gaps or invalid snapshots. Compared with the prior handoff, latest date and observed-day count did not increase.
- Supplier lead-time coverage remains 0%; replenishment status is `REVIEW` and purchase mode is `DRAFT_RFQ`. Forecast output covered 2,263 products. Page errors and business write requests were both 0.

## Follow-up

1. Correct or explicitly define the weekly sales answer's gross-versus-net semantics; rerun this reconciliation afterward.
2. Continue natural snapshot collection; do not use the four-day history for stockout or fill-rate claims.
3. Keep manual review and procurement gates in place until demand accuracy, native inventory labels, and supplier cost/lead-time evidence pass their gates.
