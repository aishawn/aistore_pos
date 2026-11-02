# 365-Day Cross-Store Forecast Recheck

Generated 2026-11-03 from read-only Odoo exports. Each store uses 500 top-selling products, 365 daily observations, and leakage-aware segmented walk-forward evaluation at 7, 14, and 28 day horizons.

## Source Coverage

| Store | Company | Date range | Orders | Order lines | Products | Writes |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| Demo | 137 | 2025-10-31 to 2026-10-30 | 58,150 | 64,750 | 500 | 0 |
| SKR | 5 | 2025-11-03 to 2026-11-02 | 57,730 | 64,309 | 500 | 0 |

Raw snapshots remain local under `temp/ai-eval/` and are not committed. SHA-256 hashes:

- Demo sales: `1D538D1E4E1455FCCCAA5925E5CD5A40CED1C9AF311E75DFCCBCDCA115984BE2`
- SKR sales: `859346DB0703805F24DC10A5A6AAF3E32FDFB15C8990CEE04ED54EB5738435FE`
- Demo evaluation: `0DCA5DD24C79A28BEA19D7CD32A1C5A0D07FE949F6290CAA0449B81CFDA1E9A1`
- SKR evaluation: `56774CFA19F839E3A1F9A55AAE1F51F1EA8CF814F38C7BFEE748E1D1EDA544E5`

## Holdout Results

WAPE is weighted absolute error divided by actual units. Improvement is relative to the evaluator baseline. Every listed holdout has `predictionSafetyViolations=0`.

| Store | Horizon | Segment | Champion | WAPE | Baseline | Improvement | Bias |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| Demo | 7d | Intermittent | moving_average_7_v1 | 1.479 | 1.560 | 5.2% | 0.5% |
| Demo | 14d | Intermittent | moving_average_7_v1 | 1.488 | 1.582 | 5.9% | 0.0% |
| Demo | 28d | Intermittent | moving_average_7_v1 | 1.511 | 1.627 | 7.1% | 2.2% |
| Demo | 7d | Sparse long-tail | tsb_v1 | 1.751 | 1.708 | -2.5% | 1.3% |
| Demo | 14d | Sparse long-tail | tsb_v1 | 1.686 | 1.680 | -0.3% | -4.9% |
| Demo | 28d | Weekly pattern | croston_sba_v1 | 1.185 | 1.211 | 2.1% | 16.4% |
| SKR | 7d | Intermittent | tsb_v1 | 1.477 | 1.577 | 6.3% | 0.1% |
| SKR | 14d | Intermittent | tsb_v1 | 1.490 | 1.575 | 5.4% | 1.0% |
| SKR | 28d | Intermittent | tsb_v1 | 1.479 | 1.605 | 7.8% | -2.5% |
| SKR | 7d | Sparse long-tail | exponential_smoothing_v1 | 1.597 | 1.715 | 6.9% | -18.1% |
| SKR | 14d | Sparse long-tail | exponential_smoothing_v1 | 1.569 | 1.682 | 6.7% | -20.3% |
| SKR | 28d | Sparse long-tail | exponential_smoothing_v1 | 1.514 | 1.791 | 15.5% | -28.4% |

## Decision

- Intermittent demand is the only cross-store candidate for a controlled research champion: moving average on Demo and TSB on SKR. Keep selection per store/segment and behind a feature flag.
- Sparse long-tail results are not safe for automatic ordering: Demo does not beat baseline, while SKR has material negative bias.
- Demo weekly-pattern 28d and SKR weekly-pattern 28d exceed the +/-10% bias gate.
- No stockout labels, native inventory movement history, supplier lead times, or realized purchase costs are present in this evaluation. Fill rate, service level, excess inventory, and planning cost remain unverified.
- No model switch, automatic PO, RFQ confirmation, or business write is authorized by this report.

## Reproduction

```text
python scripts/ai_forecast_segmented_eval.py --snapshot temp/ai-eval/demo-sales-365d-500.json --output temp/ai-eval/demo-segmented-365d-500.json --horizons 7 14 28 --minimum-train-days 120 --minimum-segment-products 20
python scripts/ai_forecast_segmented_eval.py --snapshot temp/ai-eval/skr-sales-365d-500.json --output temp/ai-eval/skr-segmented-365d-500.json --horizons 7 14 28 --minimum-train-days 120 --minimum-segment-products 20
```
