# Test Session: 2026-11-04 SKR Open-Day Forecast Backtest

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-04-forecast-open-day-backtest` |
| Started / timezone | 2026-11-04 / Australia-Adelaide data boundary |
| Operator | Codex |
| Branch | `codex/assistant-provenance-ui` |
| Source SHA | `a680e22005169423fd259b10f10ff4e3858c0497` plus evaluator SHA-256 `f2f3d8e4399691d235f4201eeeac1c5bd7a03364b4ff434cb5783024d0a886f6` |
| Runtime SHA | Not applicable; offline research |
| Environment | Offline fixed snapshot, read-only source |
| Database | Not applicable; snapshot only |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `AI-004` | `python scripts/ai_forecast_segmented_eval.py --snapshot .local/ai-eval/skr-sales-snapshot-365d.json --output .local/ai-eval/skr-segmented-open-days-365d-2026-11-04.json --closed-dates-file docs/UAT_SKR_CONFIRMED_CLOSED_DATES_2026-11-04.json` | PASS: completed 2,000 SKU series across 60 folds and 3 horizons | [JSON](../UAT_FORECAST_ROLLING_BACKTEST_2026-11-04.json), [CSV](../UAT_AI_FORECAST_SEGMENTED_OPEN_DAYS_ALL_MODELS_2026-11-04.csv) | Sales-only evaluation; native stockout, lead-time, and business-cost labels unavailable |
| `AI-004` | `python -m unittest scripts.tests.test_ai_forecast_segmented_eval -v` | PASS: 4/4 | [Evaluator tests](../../scripts/tests/test_ai_forecast_segmented_eval.py) | Includes closed-day training and holdout offset checks |
| `AI-004` | `python -m py_compile scripts/ai_forecast_segmented_eval.py scripts/tests/test_ai_forecast_segmented_eval.py` | PASS | [Evaluator](../../scripts/ai_forecast_segmented_eval.py) | Syntax check only |

## Summary

- Passed: 365-day open-day-masked segmented walk-forward demand evaluation; 2,000 SKUs; 7/14/28-day horizons; six models; 216 CSV summary rows; 4 targeted unit tests; Python syntax check.
- Blocked: stockout, fill-rate, cost, and purchase-value evaluation because native daily inventory events, verified lead times, and business cost inputs are incomplete.
- Failed: absolute WAPE research gate. Champion holdout WAPE ranges from 103.6% to 172.1%; recent-first-sale proxy bias is -83.6% to -88.0%.
- Not run: production calendar-aware forecast acceptance and any business write.
- Business impact: no production model or procurement policy changed. Forecast safety violations 0; write requests 0.

## Follow-up

1. Keep the production forecast calendar-unaware status visible until the calendar contract and tests are implemented.
2. Accumulate complete native daily inventory snapshots and owner-confirm supplier/cost terms before reporting operational fill rate or savings.
3. Address cold-start underforecasting and high absolute WAPE in further offline model work; do not promote the segment champions from this run.

## Evidence

- Sales snapshot SHA-256: `1db83438ef97c0d131ee38994b222b8cd7538fdb9381a375a21a4710061f9729`.
- Confirmed closed-date calendar SHA-256: `b756a4869b923542bfc265688eb58966328bc05ac787af005a23321a89e90d20`.
- Machine-readable result SHA-256: `4c40331cadbdd93708e6dbb4f41821aa431c81e99f711b9a0c1323fb4153a591`.
- Closed dates inside the snapshot: `2025-12-25` and `2026-04-03`, both excluded from training exposure and open-day scoring without shifting date offsets.
- The result is one-store, one-year, sales-only research. It does not validate lost demand during stockouts or realized inventory economics.
