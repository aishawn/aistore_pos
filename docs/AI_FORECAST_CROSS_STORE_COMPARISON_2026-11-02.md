# Cross-store forecast comparison (2026-11-02)

Both stores now have a leakage-safe 365-day sales-only evaluation on 2,000 products.
The exports are read-only and contain `writeRequests=[]`.

| Store | Date range | Orders | Order lines | Best regular champion (7d) | Regular holdout WAPE | Recent-first-sale Bias | Safety violations |
|---|---|---:|---:|---|---:|---:|---:|
| Demo (company 137) | 2025-10-31 to 2026-10-30 | 58,150 | 107,688 | moving_average_7_v1 | 105.4% | -87.4% | 0 |
| SKR (company 5) | 2025-11-02 to 2026-11-01 | existing 365d export | existing export | tsb_v1 | 105.6% | -87.0% | 0 |

The same failure pattern appears in both stores:

- intermittent and sparse demand has WAPE above 140%;
- recent-first-sale proxy products have severe negative bias;
- interval coverage is below the 95% production target;
- stockout labels, supplier lead times, and reliable cost data are unavailable.

This cross-store replication strengthens the decision to keep forecasting research-only,
keep low-confidence results manual-review only, and avoid changing the whole-store model.
The next useful data is native inventory history, actual PO/receipt events, and product
creation/promotion/price boundaries.

Source reports:

- `.local/ai-eval/demo-segmented-recheck-365d-20261102.json`
- `.local/ai-eval/skr-segmented-recheck-365d-20261102.json`
- `.local/ai-eval/demo-sales-snapshot-365d-20261102.json`
