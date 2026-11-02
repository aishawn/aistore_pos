# UAT AI Read-only Validation

Generated: 2026-11-03

Runtime: `28a433a97cf299ac606a27bc90a6f064aa79b171` (frontend and backend)

## Scope

- Demo: `https://demo.orithos.com.au`
- SKR: `https://skr.orithos.com.au`
- Authenticated AI report questions and replenishment exception reads
- No sales, inventory, purchase, supplier, or RFQ writes

## Results

| Area | Demo | SKR |
|---|---:|---:|
| AI report checks | 23/23 PASS | 23/23 PASS |
| Replenishment HTTP status | 200 | 200 |
| Catalogue coverage | COMPLETE, 12,987 products | COMPLETE, 12,999 products |
| Non-GET Odoo calls | 0 | 0 |
| Write requests | 0 | 0 |
| Native snapshot status | REVIEW | REVIEW |

The AI report suite covers date parsing in English and Chinese, local business-date handling, sales ranges, stock quantity reconciliation against the store catalogue, inventory value, dead stock, unsupported comparisons, and guided empty states. The empty "today" response is intentionally compared with its wording and recovery guidance; the 24-hour dashboard is a rolling window and is not a same-day oracle near midnight.

The replenishment API returned per-product model selection and forecast quality for both stores. The selected model is per-product (`modelVersion=6`), and all observed requests were read-only. The cost basis remains a planning simulation and is labelled for review.

## Constraints requiring follow-up

- Supplier lead-time coverage is `0%` in both stores (`supplierinfo` rows: `0`). Every replenishment item therefore requires manual review; no RFQ or supplier creation should be automated.
- Native inventory snapshots are continuous for the observed period, but only 2 days (Demo) and 3 days (SKR) are currently observed. This is insufficient for stockout truth or a full inventory-aware backtest.
- Most catalogue products have insufficient history for a validated forecast (`10,878/12,987` Demo and `10,890/12,999` SKR). They remain visible with low-confidence/manual-review status.
- The 365-day segmented backtest on the top 500 SKR products passed only exploratory relative gates; absolute WAPE remained high. Do not change the full-store default or automate purchasing on this evidence.

## Artifacts

- `scripts/pilot-ai-report-readonly-uat.mjs`
- `scripts/ai-eval/probe-replenishment-readonly.mjs`
- `.local/ai-eval/ai-report-demo-20261103.json` (local evidence, ignored)
- `.local/ai-eval/ai-report-skr-20261103.json` (local evidence, ignored)
- `.local/ai-eval/replenishment-readonly-20261101.json` (local evidence, ignored)
- `docs/UAT_AI_365D_SEGMENTED_BACKTEST_2026-11-03.md`
- `docs/UAT_AI_SUPPLIER_COST_AUDIT_2026-11-03.md`

## Next validation gate

Collect at least 28 consecutive native snapshot days, populate supplier lead times and costs for a pilot subset, then rerun segmented rolling backtests and compare exception precision, fill rate, holding cost, and safety violations before enabling any automated purchasing action.
