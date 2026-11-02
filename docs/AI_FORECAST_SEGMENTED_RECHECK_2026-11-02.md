# Segmented forecast recheck (2026-11-02)

The leakage-safe expanding-window evaluator was run on both 365-day, 2,000-product sales snapshots. Each store used 7, 14 and 28-day holdout horizons. The reports are research-only: native inventory and stockout labels are unavailable, so they cannot certify fill rate, stockout rate, planning cost, or purchase safety.

| Store | Horizon | Segment | Validation champion | Holdout WAPE | Bias | P90 coverage | Safety violations |
|---|---:|---|---|---:|---:|---:|---:|
| Demo | 7d | Intermittent | moving_average_7_v1 | 148.5% | +0.9% | 87.9% | 0 |
| Demo | 7d | Regular | moving_average_7_v1 | 105.4% | +1.6% | 87.4% | 0 |
| Demo | 7d | Recent first sale proxy | two_stage_occurrence_v1 | 108.9% | -87.4% | 84.8% | 0 |
| Demo | 14d | Intermittent | moving_average_7_v1 | 149.4% | +0.4% | 88.0% | 0 |
| Demo | 14d | Regular | moving_average_7_v1 | 106.3% | 0.0% | 86.8% | 0 |
| Demo | 28d | Intermittent | moving_average_7_v1 | 151.9% | +2.8% | 88.2% | 0 |
| Demo | 28d | Regular | croston_sba_v1 | 110.5% | +8.7% | 88.9% | 0 |
| SKR | 7d | Intermittent | moving_average_7_v1 | 150.9% | +3.9% | 88.3% | 0 |
| SKR | 7d | Regular | tsb_v1 | 105.6% | +1.8% | 88.1% | 0 |
| SKR | 7d | Recent first sale proxy | two_stage_occurrence_v1 | 109.4% | -87.0% | 84.7% | 0 |
| SKR | 14d | Intermittent | moving_average_7_v1 | 151.5% | +4.8% | 88.2% | 0 |
| SKR | 14d | Regular | tsb_v1 | 104.4% | -1.6% | 87.5% | 0 |
| SKR | 28d | Intermittent | moving_average_7_v1 | 154.2% | +6.5% | 88.2% | 0 |
| SKR | 28d | Regular | tsb_v1 | 106.2% | +0.7% | 87.2% | 0 |

Sparse long-tail and weekly-pattern segments are also present in both JSON reports. Their holdout WAPE remains above 109% for every horizon, while recent-first-sale segments show approximately -84% to -87% bias. These are not acceptable production forecasts.

The evaluator may mark a segment as meeting its exploratory accuracy rule when it improves against its sales-only baseline and keeps bias/safety within that limited rule. That does not override the report status `RESEARCH_ONLY_BLOCKED_STOCKOUT_LABELS_UNAVAILABLE`. Keep per-product model selection as a research display only; do not switch the whole-store default or enable automatic purchasing.

Source reports:

- `.local/ai-eval/demo-segmented-recheck-365d-20261102.json`
- `.local/ai-eval/skr-segmented-recheck-365d-20261102.json`
