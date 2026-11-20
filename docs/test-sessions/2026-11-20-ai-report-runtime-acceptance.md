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

## Latest deployed SHA

At `e02799a91045d83a3138792e11128642b295c072`, Demo and SKR frontend/backend SHA matched the test source. Report/inventory acceptance passed 14/14 per store; complete-week sales acceptance passed 4/4 per store. All four reports recorded zero failures, zero blocked checks, and zero business writes. The complete-week period was Adelaide `2026-11-09` to `2026-11-15`. Raw outputs are in local `.local/ai-eval/`.

## 2026-11-20 continuation: deterministic answers and crawler watermark

At POS source/runtime SHA `dc03b42ba8ce931658955d9607279fffcbb83d1f`, the authenticated read-only report/inventory suite again passed 14/14 on Demo and SKR; the complete-week sales suite passed 4/4 per store. Three selected natural-language boundary questions also passed per store: ambiguous stock lookup, no matching product, and Chinese dead-stock question. Those boundary runs used deterministic routes with no LLM fallback and issued no business writes. Their partial-suite summaries are `BLOCKED` by design because only three cases ran; the selected cases themselves passed. Local JSON reports remain under `.local/ai-eval/` and are not committed.

Crawler status was queried read-only at `https://crawler.orithos.com.au` around 2026-11-20 16:10 Asia/Shanghai using `GET /api/sync/status` and `GET /api/sync/runs`; no jobs were started or modified. Runtime metadata reports `git_sha=unknown` and source fingerprint `fad14f197ef57f2f5b449672e536e0caf93d567f43e6c1b0095f5c2925767152`. Recomputing the deployed fingerprint algorithm over `app/*.py` exactly matches the independent `shopfront-crawler` `main` source at `449c3b2bf1521c0b3d25c4be3110d3b7834dd03a`; the application code is attributable to that commit, while the embedded Git metadata remains unknown. The SKR status initially showed an `extended_data` job running with a recent heartbeat. Its latest daily sales run at that time was `partial`, reporting 275 of 295 sales processed. A separate completed sync record reported 10,862 inventory rows and a complete POS readback with zero missing, extra, or quantity-mismatched rows. No sync was started or modified by this test session.

For the crawler query keyed as `store=demo`, status freshness was `unknown` and no matching run was returned. This is a crawler source-key result, not evidence that Demo POS has no data. A subsequent automatic SKR run (`666`) completed with 300/300 sales processed and 300 imported. Both response targets, `primary` and `primary:demo`, reported expected/imported 300, zero skipped/rejected/unmatched lines, and zero errors; the live SKR freshness status was `fresh` with no active job. This confirms a later rolling sync is healthy, but does not identify the 20 rows from the earlier partial run individually. AI dead-stock answers still do not expose a trusted `dataAsOf` watermark, so their displayed freshness remains unverified.

After the documentation push, the Demo and SKR version endpoints both reported frontend/backend SHA `72165bac59d5cfde9ac035476d796297e68869f7`. The six-case read-only smoke suite then passed 6/6 on each store with matching source/runtime SHA, deterministic routes, `llmFallback=false`, and zero write requests. Cases covered pricing navigation and confirmation guidance, invoice-record scope, stock clarification, unauthorized-route injection, and raw-SQL rejection. Reports are `.local/ai-eval/readonly-smoke-demo-72165bac.json` and `.local/ai-eval/readonly-smoke-skr-72165bac.json` (ignored local artifacts).
