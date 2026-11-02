# Segmented forecast recheck (2026-11-02)

The leakage-safe expanding-window evaluator was rerun on the 365-day, 2,000-product
SKR sales snapshot for 7, 14, and 28-day horizons. The report is research-only:
native inventory and stockout labels are unavailable, so it cannot certify fill rate,
stockout rate, cost, or purchase safety.

| Horizon | Segment | Validation-selected champion | Holdout WAPE | Holdout Bias | P90 coverage | Safety violations | Gate |
|---:|---|---|---:|---:|---:|---:|---|
| 7d | Intermittent | moving_average_7_v1 | 150.9% | +3.9% | 88.3% | 0 | fail |
| 7d | Regular | tsb_v1 | 105.6% | +1.8% | 88.1% | 0 | fail |
| 7d | Recent first sale proxy | two_stage_occurrence_v1 | 109.4% | -87.0% | 84.7% | 0 | fail |
| 14d | Intermittent | moving_average_7_v1 | 151.5% | +4.8% | 88.2% | 0 | fail |
| 14d | Regular | tsb_v1 | 104.4% | -1.6% | 87.5% | 0 | fail |
| 28d | Intermittent | moving_average_7_v1 | 154.3% | +6.5% | 88.2% | 0 | fail |
| 28d | Regular | tsb_v1 | 106.2% | +0.7% | 87.2% | 0 | fail |

No segment meets the production requirements. Keep per-product model selection as a
research display only; do not enable automatic purchasing or switch the whole-store
default until native inventory history, lead times, and reliable costs are available.

Source report: `.local/ai-eval/skr-segmented-recheck-365d-20261102.json`.
