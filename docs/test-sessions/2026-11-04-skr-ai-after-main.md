# Test Session: 2026-11-04 SKR AI After Main Deployment

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-04-skr-ai-after-main` |
| Started / timezone | 2026-11-04 06:50 UTC |
| Operator | Codex |
| Branch | `main` runtime, commit `91e1ed2b5322fd2eae40aa2613bd23dbd69d4eed` |
| Source SHA | Runtime `91e1ed2b5322fd2eae40aa2613bd23dbd69d4eed`; probe SHA-256 `1c0a5fb06e964a5d782542ed6995de38a467818fbf53a69073560453e7bcc8a6` |
| Runtime SHA | Frontend and backend `91e1ed2b5322fd2eae40aa2613bd23dbd69d4eed` |
| Environment | Online read-only SKR; assistant queries plus GET reports and forecast |
| Database | `aipos_uat` via tenant runtime |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `AI-001` | `node scripts/ai-eval/verify-skr-ai-readonly.mjs` | Mixed: yesterday and exact-date sales PASS; weekly net-sales question FAIL; dead-stock 50/50 PASS; purchase question only navigates; forecast GET available but inventory review gate remains | [UAT summary](../UAT_AI_READONLY_AFTER_91E1ED2B_2026-11-04.json) | AI queries used POST endpoints, but no Odoo/POS business mutation was requested or observed; `writeRequests=[]` |
| `AI-001` | `GET /api/public/version` on SKR and Demo | PASS: both report frontend/backend commit `91e1ed2b5322fd2eae40aa2613bd23dbd69d4eed` | [UAT summary](../UAT_AI_READONLY_AFTER_91E1ED2B_2026-11-04.json) | Confirms runtime identity; this main commit contains offline tooling and evidence |

## Summary

- Passed: yesterday sales AUD 6.49 equals the direct report; 2026-10-16 sales AUD 7,738.14 equals the sales-daily API; both answers include date, as-of, store scope, and source. Dead-stock answer returned 50 rows and all 50 matched the direct API candidate set. Runtime page errors 0.
- Failed: weekly answer/table total AUD 25,990.14 versus same-range net-sales API AUD 25,613.32; difference AUD 376.82 equals reported refunds. Date range, as-of, store, and source were present, so the mismatch is a sales-sign/accounting issue rather than missing provenance.
- Blocked: inventory strategy acceptance. Forecast GET returned 2,263 products, but native inventory history has only 4 continuous days through 2026-11-04; supplier lead-time coverage is 0%, inventory status `REVIEW`, purchasing mode `DRAFT_RFQ`.
- Not run: RFQ creation, purchase confirmation, and any Demo business write. The assistant prompt “What do we need to buy?” only navigated to `/stock/replenishment`; it did not produce or validate a purchase recommendation.
- Business impact: no business data changed. Keep procurement review-only and resolve the weekly refund mismatch before accepting net-sales answers.

## Follow-up

1. Rebase the refund accounting correction onto current main only after the exact candidate SHA passes the remote Java 21 pre-push gate.
2. Let the scheduled native inventory snapshot worker run naturally; do not use the current four-day history for stockout/fill-rate claims.
3. Keep the supplier terms sample in manual review until source invoices and pack/GST/freight units are confirmed.
