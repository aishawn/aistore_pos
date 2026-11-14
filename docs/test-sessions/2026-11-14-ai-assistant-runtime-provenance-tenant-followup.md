# AI Assistant Runtime Provenance and Tenant Follow-up

Date: 2026-11-14 (Asia/Shanghai)

## Source and runtime

- Repository: `aishawn/aistore_pos`.
- Source candidate at report update: `6b0b51af01faccb15f073d6f2c043ae83986ca3b`.
- The original 30-case report/provenance batch used runtime `acda19240294e95f25c78fd2fc36200c8fe7ef28`.
- A later runtime identity probe and the 47-case inventory batch verified both SKR and Demo frontend/backend at `6b0b51af01faccb15f073d6f2c043ae83986ca3b`.
- Online questions used the authenticated assistant API and read-only report endpoints. No POS business writes were requested.

## Results

- The online catalog contains 402 unique utterance IDs with no duplicates.
- The 30 catalog entries requiring report source, status, period, timezone, or authoritative sales reconciliation passed on SKR (30/30) and Demo (30/30).
- All 60 responses used the deterministic route, had `llmFallback=false`, returned `writeRequests=[]`, and passed the script's authoritative report and metadata checks.
- Latency: SKR median 374 ms / maximum 623 ms; Demo median 395 ms / maximum 667 ms.
- The report subset includes Chinese and English yesterday sales/profit variants, explicit dates, date comparisons, and sales ranges. The ten yesterday-sales variants also passed on both stores; these are included in the 30-case subset, not additional unique cases.
- Cross-store scope override probe passed 10/10 checks across both stores. Each authenticated baseline returned `current_authenticated_store`; forged `vendorId`, `outletId`, `tenantId`, and `storeId` values either were rejected or returned an answer identical to the authenticated baseline. Four assistant requests were made; all returned empty `writeRequests`.
- Live history isolation: SKR's authenticated history list returned 40 existing threads. Using one existing thread's numeric ID and session key under the Demo login returned HTTP 200 / business code `40410` for both detail requests. No new thread was created and no message content was returned.
- Same-store live history restore: reading the latest existing SKR thread returned 2 messages; the assistant message included all 8 provenance properties (`source`, `dataAsOf`, `dataSource`, `storeScope`, report period, timezone, and data status). The probe only read existing rows and emitted no thread content or identifiers.
- Focused `AiAssistantControllerTest` passed 4/4 and `assistant-provenance.test.ts` passed 15/15 on the candidate source.
- The maintenance checkout's UI unit suite passed 222/222 and typecheck passed, but that checkout was dirty at `011f0563`; these are not exact-candidate results. The clean candidate UI full suite was blocked at 220/221 because its isolated install lacked the `redis` package. The provenance-focused test passed on the candidate.
- The current candidate's AI provenance/history UI helpers and tests contain no Odoo source constants or obsolete Odoo provenance assertions.
- A further SKR run selected 47 inventory/quantity/AOV/dead-stock/stock-value utterances from the 402-case catalog. All 47 passed their route/slot and applicable answer assertions; all used deterministic paths, `llmFallback=false`, and `writeRequests=[]`. Median assistant latency was 376 ms and maximum was 2,304 ms. Runtime identity matched the source candidate.
- Focused Java regression for the pasted `AiAssistantControllerTest.assistantResponseExposesAuthoritativeReportMetadata` failure passes 4/4 on this source. The current test verifies the expanded history call including provenance fields; the pasted log shows the older seven-argument expectation and is not reproducible on this candidate.
- `python scripts/check-project-docs.py` remains blocked by 86 missing/invalid entries in the partially available fact library, including baseline README/evidence files and older session links. The new session link itself resolves in this checkout.

## Limits and remaining work

- The online runner reports overall `BLOCKED` because only 47 of 402 catalog entries were selected in the latest batch. Full catalog acceptance remains open.
- The 47-case inventory batch verifies intent, product query extraction, safe no-match behavior, and general answer shape. It does not compare each returned stock quantity with an independent authoritative inventory snapshot; stock-value and dead-stock totals also need source-level reconciliation before numeric correctness can be claimed.
- The online test surface reports `estimatedTokensOnly`; provider billing in AUD cannot be independently verified. This batch had zero observed model fallback, but no invoice-level cost evidence was available.
- The history probe crossed stores, not user accounts within one store. Cross-user ownership regressions are covered by backend mapper/service tests; an online second-user credential was not available for a same-store identity probe.
- Existing local browser evidence for history, clear-chat, voice success/failure, and cancel/retry uses intercepted API fixtures. Real microphone/ASR behavior, live durable-history restoration, and server-side cancellation remain separate acceptance items.
- Evidence JSON is stored under the candidate's ignored `.local/ai-eval/` directory, including the latest `inventory-47-correct-skr-6b0b51af.json`. An earlier exploratory selection used an overbroad temporary filter and is excluded from results.
- No POS sales, inventory, purchasing, pricing, invoice, or other business write was performed.

## Status

Partial pass. Report metadata and cross-store request scoping passed for the tested cases; full AI assistant acceptance remains open.

### 2026-11-14 stock response correctness follow-up

- Read-only targeted UAT against SKR and Demo runtime `0f2a3e3312cabc45e8246f67dd35fc6857c185af` selected `natural-stock-store-zh`, `stock-no-catalogue-match-en`, and `report-stock-value-en`. Both stores passed 1/3 and failed 2/3: stock quantity matched the authenticated `/api/products` oracle for the first eight Shiraz results, and the explicit no-match query correctly returned no catalogue match. Chinese Shiraz stock answers failed the Chinese-language assertion. Stock-value answers failed a stricter response assertion. All six assistant requests were deterministic, had no LLM fallback, and returned `writeRequests=[]`.
- Captured SKR stock-value response showed the false-zero behavior: several uncosted products were listed at AUD 0.00, with a reported store total of AUD 0.00 across zero valued products and 3,055 excluded products. The SQL's NULL inventory values were converted to zero in the response formatter; a zero-coverage aggregate was also described as a storewide value.
- Local candidate now returns an unavailable message when zero products have verifiable positive costs, labels partial results as known-cost subtotals with complete value unavailable, and skips rows whose inventory value is NULL. It does not change the uncertain cost formula. Shopfront's inventory report treats `lastCost` as case cost and uses `caseQuantity` for unit conversion, while Orithos `product_cost.cost` lacks a documented unit and has conflicting uses elsewhere. Reconcile this contract before enabling positive cost valuations.
- TDD evidence: the new zero-coverage test failed against the previous formatter; after the implementation, the focused report and controller tests passed **29/29** (`ReportRespondNodeTest` 25/25, `AiAssistantControllerTest` 4/4). The subsequent NULL-row test also failed against the previous formatter before the NULL-row skip was added. `node --check scripts/pilot-ai-workflow-utterances-online-uat.mjs` and `git diff --check` passed.
- The pasted Docker failure is historical: its test expected the seven-argument history append call, while source at `0f2a3e33` already verifies all provenance arguments. `AiAssistantControllerTest` passes 4/4 on the current checkout; the pasted failure is not reproducible there.
- Updated ignored evidence is in `.local/ai-eval/stock-followup-skr-0f2a3e33-strict.json`, `.local/ai-eval/stock-followup-demo-0f2a3e33-strict.json`, `.local/ai-eval/stock-value-response-skr-0f2a3e33.json`, and the post-deploy SKR/Demo receipts below.
- Full utterance acceptance remains open: this was a three-case slice from 402; voice, durable UI history/clear, cancellation/retry, same-store multi-user isolation, inventory cost-contract verification, dead-stock quantity reconciliation, and invoice-level online cost are not newly cleared.

### 2026-11-14 post-deploy stock response verification

- Commit `dc245d8971773a5bf80355b6fa2e3ccf21666320` was pushed to `main`. The public version endpoint for both SKR and Demo reported frontend/backend runtime SHA `dc245d8971773a5bf80355b6fa2e3ccf21666320`.
- Re-ran the same three read-only cases on each deployed store. SKR passed 3/3 and Demo passed 3/3; all six assistant calls were deterministic, `llmFallback=false`, and `writeRequests=[]`. The first-eight Shiraz quantities matched `/api/products`; the no-match item was absent from the product API and clearly rejected; the stock-value answer matched the new zero-cost/partial-coverage contract. Runner overall status is `BLOCKED` because 3 of 402 cases were selected, not because a selected case failed.
- Post-deploy receipts: `.local/ai-eval/stock-postdeploy-skr-dc245d89.json` and `.local/ai-eval/stock-postdeploy-demo-dc245d89.json`.
- Per owner direction, the exact-SHA remote Java 21 full-backend gate was bypassed for this push. Local focused verification passed 29/29 tests, but this is not equivalent to the required remote full Maven gate; broader backend regression risk remains.

### 2026-11-14 backend regression and replenishment date-window follow-up

- The pasted Docker failure was produced at `2026-11-12T15:17:54Z`. Its expected `AiChatHistoryService.appendTurn` call had seven arguments, while the controller already persisted the expanded provenance fields. The assertion was updated in later source history; current `AiAssistantControllerTest` passes 4/4 and the current full Maven suite also passes. No production change was needed to address that historical assertion failure.
- Java 21 `mvn -B clean verify` on baseline source `473e7b6f38c50d7b61948901a281e18781122c61`: **769/769**. After the replenishment query change below, the same exact command passed **769/769** again. Focused `AiAssistantControllerTest` passed 4/4.
- TDD identified and fixed an off-by-one/future-date issue in replenishment demand: the prior SQL treated the recent period as 29 inclusive dates, the prior period as unbounded above, and did not use the report's `created_at` fallback when both business date and local sale time were absent. The new Adelaide windows are two contiguous 28-day ranges ending today; future-dated rows are excluded, and the sales report's date fallback is applied. The SQL-level regression failed before the change and passed after it.
- A read-only `EXPLAIN ANALYZE` of the replenishment sales aggregation CTE against the POS ledger completed in 18.167 ms for SKR outlet 87 and 16.060 ms for Demo outlet 1 on 2026-11-14 Adelaide time. This measures the sales CTE only, not end-to-end assistant latency.
- Read-only ledger counts confirm positive `product_cost.cost` rows are zero in both outlets. `product.cost` is positive for 10,177 SKR and 10,210 Demo products, but its unit is not proven to match Shopfront `lastCost`. The local `SHOPFRONT_DATABASE_URL` is SQLite, not an independently queryable POS mirror; direct per-product source `lastCost` reconciliation remains open. AI inventory value must remain unavailable unless its cost source is complete and validated; do not substitute `product.cost` by assumption.
- The code was pushed as `3c2e545bfd4031ed40fc7592f6d5979211869cdf`. Both SKR and Demo frontend/backend report that exact runtime SHA. Two read-only replenishment utterances per store passed (English and Chinese), with no assistant business writes. Runner status is `BLOCKED` only because the run selected 2/402 catalog cases; the selected cases had zero failures. Evidence: `.local/ai-eval/replenishment-postdeploy-skr-3c2e545b.json` and `.local/ai-eval/replenishment-postdeploy-demo-3c2e545b.json`.
- The maintained `main` checkout has unrelated local changes and was left untouched. No POS business writes were performed.

### 2026-11-14 local UI workflow follow-up

- Local Next dev server target: `http://localhost:3103`; source baseline `a705695893acf006ba0b7570a24a5723ed26c441`. All browser API calls were intercepted by fixtures. No real AI provider calls, POS writes, production deployment, or microphone privacy changes occurred.
- History/browser fixture passed **101 checks** across 1440, 1024, 768, and 390px. It covers URL and refresh restore, provenance rendering, tables/report links, continued and new sessions, browser back/forward, mobile missing/empty history messages, navigation, and no horizontal overflow. Clear chat was verified at desktop/tablet widths: it clears the current dialogue and URL, sends no DELETE, and leaves the persisted history entry recoverable.
- A new cancel/retry browser fixture passed **9 checks**. A cancelled request restored the composer controls, kept the submitted question once, and ignored a deliberately late answer. A transient failure exposed Retry; the retry re-sent the same question, replaced the failed assistant response, and did not duplicate the user message. Unexpected business write requests: zero; browser page errors: zero.
- Voice success fixture passed: click-to-start/stop produced one transcription, filled the composer, did not auto-submit to the assistant, and stopped the captured audio track. Voice failure fixture passed: HTTP 50211 showed a retryable error, left the composer empty, and did not submit an assistant request. These fixtures emulate browser APIs and do not prove real microphone hardware or provider ASR behavior.
- Evidence files (ignored local output): `.local/ai-eval/assistant-history-ui-local-a705.json`, `.local/ai-eval/assistant-cancel-retry-local-a705.json`, `.local/ai-eval/voice-success-local-a705.json`, and `.local/ai-eval/voice-failure-local-a705.json`.
- Verification on Java 21: `mvn -B clean verify` passed **769/769**; UI unit suite passed **221/221**; `npm run typecheck` passed; `node --check` passed on all four history/cancel-retry/voice UAT scripts.
- Reconciled the 14 earlier SKR online batch receipts: they collectively select **402 unique utterance IDs**, with **402/402 checks passing**, zero failed/blocked individual checks, zero LLM fallbacks, and runtime/source identity matching `473e7b6f` in all 14 files. Each batch runner itself reports `BLOCKED` because `fullCatalogRun=false`; this is aggregate coverage on the older candidate, not one full-catalog acceptance run on current `a7056958`.
- The pasted Docker failure is pre-fix history: the failing seven-argument assertion was expanded by later commit `7a1d0bb4`. The current full suite on `a7056958` passes. No backend code change was needed in this follow-up.
- Remaining acceptance limits: full 402-utterance catalog is not rerun in this follow-up; real microphone/ASR, live durable chat persistence, same-store multi-user isolation, invoice-level model cost, and complete independent inventory/dead-stock numeric reconciliation remain open. Inventory value remains fail-closed while the authoritative unit-cost contract is unresolved.

### 2026-11-14 utterance answer-assertion coverage audit

- The full SKR result on source/runtime `eb7ed870ca2201654794038dfb2fecf9337116f3` contains 402/402 PASS under the prior routing, slot, deterministic-source, and read-only checks. `llmFallback=false` on all selected cases. The result JSON does not retain answer text, so answer content and values cannot be rechecked from that artifact.
- A local audit of the same 402-case catalog found 208 cases with factual answer intents; 151 lack a positive `answerIncludes` or `answerRegex`. Missing assertions by intent: `report_adhoc` 36, `report_stock` 37, `report_sales` 24, `qa` 30, `unknown` 8, `report_aov` 4, `search_product` 4, `search_customer` 4, `report_qty` 2, `report_dead_stock` 2.
- Updated the evaluator to fail closed when an answer is empty or a factual intent has no positive content expectation. The live runner now distinguishes catalog-coverage `BLOCKED` from behavioral `FAIL` and writes an audit list of missing cases; it does not retain answer bodies.
- Local verification: Node `v22.22.2`; `node --test scripts/ai-eval/assistant-assertions.test.mjs` 18/18 PASS; both changed evaluator scripts pass `node --check`; `git diff --check` PASS. No live requests, model calls, POS business writes, or deployment in this follow-up.
- `python scripts/check-project-docs.py` is BLOCKED in this worktree: it reports 86 missing required files/links because the local project fact-library corpus is incomplete here. The new session link resolves; the missing corpus and unrelated broken references were not reconstructed or modified.
- Current complete answer acceptance remains BLOCKED until the 151 expected-answer assertions are authored from fixed snapshots/authoritative APIs, then checked against the same-store, same-period results. Provider spend cannot be confirmed because usage metering is unavailable; the AUD 10 ceiling remains unverified.
- The pasted Docker test failure is historical: its build ran at `2026-11-12T15:17:54Z`; commit `7a1d0bb4` at `2026-11-12T23:21:08+08:00` corrected the stale seven-argument assertion, and that commit is already in `origin/main`. No backend source change was needed here.
