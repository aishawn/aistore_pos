# SKR 730-day segmented backtest (2026-11-03)

## Data

- Source: read-only Odoo `pos.order.line` JSON-RPC, company `5` (`aipos_uat`)
- Date range: `2024-11-03` to `2026-11-02` (730 days)
- 500 highest-volume products from a 1,000-product export
- 116,655 completed orders and 169,674 order lines in the range
- `writeRequests=[]`

This adds a second seasonal window to the earlier 365-day study. It is still sales-only: no verified stockout labels, native daily inventory truth, supplier lead time, expiry, or realized purchase cost is joined to the series.

## Method

The existing leakage-aware segmented evaluator was run for 7, 14, and 28-day horizons. Minimum training history was 180 days; earlier 70% of folds selected a segment champion and the later 30% scored holdout performance. Segments are assigned from training data at each origin.

## Holdout summary

| Horizon | Segment | Products | Champion | WAPE | Bias | Improvement vs baseline | Safety violations | Exploratory gate |
|---:|---|---:|---|---:|---:|---:|---:|---|
| 7 | Intermittent | 346 | TSB | 1.404 | -4% | 11.6% | 0 | Pass |
| 7 | Recent-first-sale proxy | 60 | Croston SBA | 1.039 | -94% | 0.2% | 0 | Fail |
| 7 | Regular | 85 | TSB | 1.086 | +1% | 4.9% | 0 | Fail |
| 7 | Sparse long-tail | 214 | Exponential smoothing | 1.591 | -11% | 15.4% | 0 | Fail |
| 7 | Weekly-pattern proxy | 52 | TSB | 1.127 | -4% | 8.2% | 0 | Pass |
| 14 | Intermittent | 341 | TSB | 1.408 | -5% | 11.3% | 0 | Pass |
| 14 | Recent-first-sale proxy | 60 | Croston SBA | 1.040 | -94% | 0.2% | 0 | Fail |
| 14 | Regular | 84 | TSB | 1.103 | +1% | 3.8% | 0 | Fail |
| 14 | Sparse long-tail | 212 | Exponential smoothing | 1.576 | -15% | 15.9% | 0 | Fail |
| 14 | Weekly-pattern proxy | 52 | TSB | 1.116 | -7% | 9.4% | 0 | Pass |
| 28 | Intermittent | 337 | TSB | 1.442 | -1% | 10.3% | 0 | Pass |
| 28 | Recent-first-sale proxy | 60 | Croston SBA | 1.057 | -91% | 0.3% | 0 | Fail |
| 28 | Regular | 80 | TSB | 1.119 | +1% | 1.8% | 0 | Fail |
| 28 | Sparse long-tail | 209 | TSB | 1.579 | -15% | 16.6% | 0 | Fail |
| 28 | Weekly-pattern proxy | 51 | TSB | 1.142 | -5% | 7.6% | 0 | Pass |

WAPE above `1.0` means absolute error exceeds the actual demand total. The passing relative gates only show that TSB improves on the current baseline in those segments; they do not support automatic purchase quantities or a store-wide default switch.

## Decision

- Keep the current per-product selection and manual-review controls.
- Do not promote TSB globally. It is a research candidate for intermittent and weekly-pattern products only, subject to inventory and cost validation.
- Keep new-item, regular, and sparse long-tail results out of automated purchasing; the new-item proxy has severe negative bias.
- The next evidence gate is native inventory snapshots plus a supplier pilot with real lead times and costs. Then evaluate stockout precision, fill rate, holding cost, and safety violations using only products with trustworthy labels.

Artifacts are local and ignored: `.local/ai-eval/skr-sales-730-20261103.json`, `.local/ai-eval/skr-sales-730-500-20261103.json`, and `.local/ai-eval/skr-730-500-segmented-20261103.json`.
