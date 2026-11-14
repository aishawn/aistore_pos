# AI Assistant Runtime Provenance and Tenant Follow-up

Date: 2026-11-14 (Asia/Shanghai)

## Source and runtime

- Repository: `aishawn/aistore_pos`.
- Source candidate: `acda19240294e95f25c78fd2fc36200c8fe7ef28`.
- SKR and Demo frontend/backend runtime: `acda19240294e95f25c78fd2fc36200c8fe7ef28`.
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
- `python scripts/check-project-docs.py` remains blocked by 86 missing/invalid entries in the partially available fact library, including baseline README/evidence files and older session links. The new session link itself resolves in this checkout.

## Limits and remaining work

- The online runner reports overall `BLOCKED` because only 30 of 402 catalog entries were selected. Full catalog acceptance remains open.
- The online test surface reports `estimatedTokensOnly`; provider billing in AUD cannot be independently verified. This batch had zero observed model fallback, but no invoice-level cost evidence was available.
- The history probe crossed stores, not user accounts within one store. Cross-user ownership regressions are covered by backend mapper/service tests; an online second-user credential was not available for a same-store identity probe.
- Existing local browser evidence for history, clear-chat, voice success/failure, and cancel/retry uses intercepted API fixtures. Real microphone/ASR behavior, live durable-history restoration, and server-side cancellation remain separate acceptance items.
- Evidence JSON is stored under the candidate's ignored `.local/ai-eval/` directory as `metadata-30-skr-acda.json`, `metadata-30-demo-acda.json`, `deterministic-10-skr-acda.json`, and `deterministic-10-demo-acda.json`.
- No POS sales, inventory, purchasing, pricing, invoice, or other business write was performed.

## Status

Partial pass. Report metadata and cross-store request scoping passed for the tested cases; full AI assistant acceptance remains open.
