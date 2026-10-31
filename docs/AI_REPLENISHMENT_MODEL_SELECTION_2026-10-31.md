# AI replenishment model selection — 2026-10-31

## Implemented

- `forecast-service` now selects a model per product when at least 28 daily observations are available.
- Candidates are Seasonal Naive, Moving Average 7, Exponential Smoothing, Croston SBA, TSB, and two-stage occurrence.
- Selection uses rolling holdout WAPE and returns `selectionStatus`, `selectionMetric`, and candidate scores.
- Short or fully censored histories are explicitly labelled `INSUFFICIENT_HISTORY` or `BLOCKED`; the deterministic fallback remains visible to the caller.
- Odoo replenishment now exposes forecast intervals, expected post-replenishment stockout days, inventory value, suggested order value, and stockout revenue risk when source prices are available.
- The UI displays model status, confidence, forecast quality, forecast interval, estimated order value, and forecast stockout risk.

## Verification

- `forecast-service`: 7 tests passed.
- Inventory history and forecast evaluation tests: 27 tests passed.
- `git diff --check`: passed.

## Limits

- The current native inventory history has one observed date, so formal stockout backtesting remains blocked.
- Cost and revenue fields are `null` when Odoo does not provide a valid source price; no financial assumptions are invented.
- The branch has not been merged to `main` or deployed. Demo and SKR runtime verification remains pending exact-SHA deployment.
- Frontend lint/typecheck could not be run in this environment because the project requires Node 24 while the available runtime is Node 22 and dependency installation did not complete.

