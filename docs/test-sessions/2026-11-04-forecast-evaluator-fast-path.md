# Test Session: 2026-11-04 Forecast Evaluator Fast Path

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-04-forecast-evaluator-fast-path` |
| Started / timezone | 2026-11-04 / Asia/Shanghai; business dates use Australia/Adelaide |
| Operator | Codex |
| Branch | Detached worktree at `dfda8a93cc7c9ad6515c83fcdf30768c05ed9289` |
| Source SHA | Base `dfda8a93cc7c9ad6515c83fcdf30768c05ed9289`; modified evaluator SHA-256 `a05b6e9494dbb98141e2704d8850aa58f97ad3d2b084a6fba376b5921b53dd02` |
| Runtime SHA | Not applicable; offline research |
| Environment | Offline fixed sales snapshot; no application runtime |
| Database | Not applicable |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `AI-004` | Forecast engine explicit-model parity against `explicit_model_forecast`, 7/20/120-day training prefixes and all six configured models | PASS: 18/18 exact forecast-point matches, including p50/p80/p90 | [Evaluator](../../scripts/ai_forecast_segmented_eval.py) | Offline helper check; does not change production forecast path |
| `AI-004` | `python scripts/ai_forecast_segmented_eval.py --snapshot <ignored 365-day snapshot> --closed-dates-file docs/AI_SKR_CONFIRMED_CLOSED_DATES_2026-11-04.json --output .local/ai-eval/skr-segmented-open-days-365d-current.json --horizons 7 14 28 --minimum-train-days 120 --validation-fraction 0.70 --minimum-segment-products 20` | PASS: full 2,000-SKU evaluation completed; all configuration and metric fields match the committed report | [Committed report](../UAT_AI_FORECAST_SEGMENTED_2000SKU_2026-11-04.md), [closed dates](../AI_SKR_CONFIRMED_CLOSED_DATES_2026-11-04.json) | Full result remains in ignored `.local/ai-eval`; not an inventory-aware evaluation |
| `AI-004` | `python -m py_compile scripts/ai_forecast_segmented_eval.py` and `git diff --check` | PASS | [Evaluator](../../scripts/ai_forecast_segmented_eval.py) | Syntax and whitespace checks |

## Summary

- Passed: exact output parity for all six models; full sales-only run with 2,000 SKUs, 365 days, 7/14/28-day horizons; detailed metrics and configuration exactly match the previous report.
- Blocked: inventory-aware stockout/fill-rate evaluation because the available native inventory series covers only four consecutive business dates; supplier lead-time coverage is 0%.
- Failed: model release gates remain failed. Champion WAPE is approximately 103.6%-172.1%, and recent-first-sale proxy bias is approximately -83.6% to -88.0%.
- Not run: online AI acceptance and any business write.
- Business impact: no production model, forecast policy, inventory, purchase order, RFQ, or Odoo data was changed.

## Follow-up

1. Keep the production forecast strategy and manual review gates unchanged.
2. Continue collecting native inventory snapshots and verify their capture timestamps and coverage before running `ai_forecast_walkforward_eval.py` for stockout-aware scoring.
3. Keep supplier lead-time and cost rows unverified until supported by receipts/invoices or written field definitions.

## Evidence

- Snapshot SHA-256: `1db83438ef97c0d131ee38994b222b8cd7538fdb9381a375a21a4710061f9729`.
- Owner-confirmed closed-date list SHA-256: `1f2962afc6d6e04152e24f672fd9488090e5d4badac4593a715fe982ce94f70d`.
- Optimized evaluator SHA-256: `a05b6e9494dbb98141e2704d8850aa58f97ad3d2b084a6fba376b5921b53dd02`.
- Full run elapsed about 21 minutes 43 seconds. The earlier unoptimized attempt was stopped after more than 38 minutes of CPU time without a result.
- The committed machine-readable backtest remains the detailed metric artifact; the new rerun comparison found zero result/configuration differences after excluding provenance hashes.
