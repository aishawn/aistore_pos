# AI Forecast Evaluation Report

## Scope

This is a read-only evaluation of the deterministic `seasonal_naive_v1`
baseline using the fixed demo snapshot at
`forecast-service/fixtures/skr-snapshot-demo.json`. It does not connect to
SKR/Odoo and produced no business writes.

## Result

| Check | Result |
|---|---|
| Evaluation execution | PASS |
| Series evaluated | 2 |
| Blocked series | 0 |
| Mean WAPE | 52.94% |
| Quality gate (<=30% mean WAPE) | FAIL |
| Business write requests | 0 |
| Model | `seasonal_naive_v1` |
| Source snapshot SHA | `b41e612e31ad08332b0f6d96fd73ec6123724dae` |
| Runtime SHA | `0c5d24538da8f99067307e630f7c64db1dbfefdd` |

The stable series (`productId=1001`) achieved 0% WAPE. The series with three
stockout-censored days (`productId=1002`) achieved 105.88% WAPE, MAE 2.57 and
positive bias 2.29 units/day. This is a deliberate failure signal: observed
sales during a stockout are not complete demand, so the baseline should not be
promoted to production replenishment.

The rolling 7-day run produced two windows per product. The stable product
remained at 0% WAPE. The censored product averaged 52.94% WAPE with 92.86%
P80/P90 coverage and one censored window. Rolling 14-day and 28-day results are
`BLOCKED` because the demo snapshot has only 28 days; these are not treated as
passing results.

## Regression checks

- Python syntax and forecast smoke tests: PASS.
- Rolling 7/14/28-day evaluator: PASS as a run; 14/28-day horizons correctly
  reported `BLOCKED` for insufficient history.
- Input date/unit and stockout flag alignment validation: PASS.
- Java Maven suite: PASS, 477 tests, 0 failures, 0 errors.
- `git diff --check`: PASS.

## Next required gates

1. Run the same evaluator on a fixed, anonymized SKR snapshot.
2. Add rolling 7/14/28-day backtests and compare seasonal, moving-average,
   exponential-smoothing and intermittent-demand baselines.
3. Correct censored demand using inventory, neighbouring days and category
   signals; retain low confidence when evidence is insufficient.
4. Keep `AI_FORECAST_ENABLED=false` until the SKR quality gate passes over at
   least four weeks and stockout-specific error is acceptable.
