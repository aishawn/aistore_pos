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
- Updated ignored evidence is in `.local/ai-eval/stock-followup-skr-0f2a3e33-strict.json`, `.local/ai-eval/stock-followup-demo-0f2a3e33-strict.json`, and `.local/ai-eval/stock-value-response-skr-0f2a3e33.json`. The backend source fix has not been deployed, so the live language and stock-value failures remain until a gate-qualified deployment and rerun.
- Full utterance acceptance remains open: this was a three-case slice from 402; voice, durable UI history/clear, cancellation/retry, same-store multi-user isolation, inventory cost-contract verification, dead-stock quantity reconciliation, and invoice-level online cost are not newly cleared.
