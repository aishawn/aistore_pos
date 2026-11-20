# 2026-11-20 AI Report Runtime Acceptance

## Runtime

Source SHA and frontend/backend runtime SHA matched `e33b962ece540ded491bdcbf1283d8d8f61b9eaa` on both Demo and SKR. All requests were authenticated, read-only AI/report checks. No POS business writes were issued. Raw per-check outputs remain in local `.local/ai-eval/` and are not committed.

## Results

| Suite | Store | Result | Writes |
|---|---|---:|---:|
| Authenticated report and inventory answers | Demo | PASS, 14/14 | 0 |
| Authenticated report and inventory answers | SKR | PASS, 14/14 | 0 |
| Previous complete business week sales | Demo | PASS, 4/4 | 0 |
| Previous complete business week sales | SKR | PASS, 4/4 | 0 |

The sales suite covered Chinese and English questions for Adelaide business week `2026-11-09` through `2026-11-15`; both answers reconciled with the same-store native overview. The broader suite included deterministic-route and no-LLM-fallback assertions for report answers, inventory summaries, stock value honesty, product count, and sampled stock quantities.

## Limits

This is a selected read-only baseline, not the full assistant utterance catalog or a model-quality evaluation. Dead-stock freshness remains incomplete until the sales/inventory source exposes a trusted watermark. `Offline Test Gates` last reported `startup_failure` without creating jobs at `e33b962e`. The separate Project fact library check remains blocked by ignored/untracked documentation in a clean checkout.

## Re-run after documentation release

After the documentation-only release, source SHA and frontend/backend runtime SHA matched `6f7d9a9f1fde0eeb0336e47bf75b9e0da7272b65` on both stores. The report/inventory suite again passed 14/14 per store, and the previous complete business week suite passed 4/4 per store. All four runs had zero failures, zero blocked checks, and zero business writes. Raw reports were refreshed in local `.local/ai-eval/`.

## Offline harness

At source SHA `41e8b92e87f824edd7650f1485d647bf2b693379`, the offline AI evaluation tests passed 39/39 and forecast/report tooling tests passed 46/46 locally. These tests cover evaluator assertions and metric/report utilities; they do not measure online model quality or forecast accuracy. GitHub Java 21 verification passed for `41e8b92e`. Project fact library verification still fails in a clean checkout because its required documentation is ignored or untracked.
