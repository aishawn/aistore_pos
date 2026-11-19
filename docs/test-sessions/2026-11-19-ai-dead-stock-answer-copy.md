# POS AI dead-stock answer copy regression

## Scope

Fixed the Chinese dead-stock answer wording after the prior live sample exposed awkward date-range phrasing and an English empty-result response. This change is limited to deterministic response formatting; it does not change report calculations, data completeness, routing, or business behavior.

## Evidence

- Source change: `e58b6bc6` (`fix(ai): localize dead-stock report responses`); the change is included in the current `main` history.
- Local Java 21 focused regression: `ReportRespondNodeTest`, 35/35 passed.
- `git diff --check`: passed.
- Demo and SKR read-only online checks: Chinese and English prompts routed to deterministic `report_dead_stock`; no model fallback and no POS business write requests. Chinese date ranges use `至`, and empty-result wording is Chinese.
- The answer retains the warning that sales freshness and completeness cannot be confirmed. The result remains `incomplete`.

## Limitations and follow-up

This verifies response language and routing, not the truth or completeness of the dead-stock list. The source currently provides no trusted report `dataAsOf` for this combined inventory and sales query, so freshness acceptance remains `BLOCKED`; do not infer freshness from query time or inventory timestamps alone. Resolve this only when an authoritative sales/source watermark is available, then add a regression and repeat the read-only Demo/SKR comparison.

No model calls, deployment action, or POS business writes were performed as part of the local regression. The online checks create normal assistant audit/session records.

## Empty-result status correction

The follow-up audit found that generic report logic marked an empty dead-stock result `no_data` before checking the missing freshness timestamp. That could produce a definitive “no dead-stock items” answer despite the unresolved freshness gap. Added a regression that first failed with `expected: incomplete, was: no_data`, then required empty dead-stock results without `dataAsOf` to remain `incomplete`. The response regression now requires the Chinese answer to say that absence cannot be confirmed and that the result needs verification.

Java 21 focused verification after the correction: `NativeReportQueryNodeTest` 11/11 and `ReportRespondNodeTest` 35/35 PASS (46/46 total). No timestamp was synthesized; the status remains `incomplete` until an authoritative source watermark is available.

## Deployment identity

Fix commit `66de47da8054443981f65854810ead97d3929410` is on `main`. Public `/api/public/version` checks confirmed both Demo and SKR frontend and backend report this exact SHA. Authenticated post-deploy assistant acceptance was NOT RUN: no assistant login credential was available in the current process, and browser automation could not verify the existing browser URL as allowed. Runtime identity is verified; online behavior for this specific empty-result correction remains pending.

## Natural-language route gap and live follow-up

After loading the store credentials from the local ignored environment file without printing them, the natural prompt `有哪些滞销商品？` returned API code `50210` in both stores at runtime `cbd05e60`. Safe backend logs showed that this phrase fell through to remote `CLASSIFICATION`, which failed with `IllegalStateException`; the user-visible controller message was generic. The failure-event persistence path also logged a secondary `BadSqlGrammarException`. The AI gateway container reported healthy. This was a routing gap for this phrase; it does not establish that all provider calls fail.

Added deterministic coverage for default Chinese wording `有哪些滞销商品？` and explicit-range wording `最近30天有哪些滞销商品？`. Java 21 `AssistantFastPathRouterTest` passed 73/73; the missing phrase first failed before the route was added. Commit `3b9a57ba50c1e5e4b88cffdabe4bab2997c78014` is deployed.

Authenticated post-deploy checks on Demo and SKR passed 6/6: Chinese default, Chinese explicit 30-day, and English 30-day questions in each store. Every response was HTTP 200 / API code 0, deterministic `report_dead_stock`, `llmFallback=false`, `reportDataStatus=incomplete`, freshness warning present, and `writeRequests=[]`. The requests create normal assistant audit/session records but no POS business writes. No provider generation call was used by this selected route set.

Remaining limitation: broader LLM-classified questions were not re-tested. The combined dead-stock data source still has no trusted sales freshness watermark.

## Follow-up diagnostics

Read-only investigation against the current POS PostgreSQL schema prepared (but did not execute) the `platform_alert` upsert/search/status-update and `platform_failure_event` insert statements successfully. The old `BadSqlGrammarException` is therefore not reproducible against the current schema and SQL; no SQL change was made. Existing server logs no longer retain the original event, so its SQLState and exact failing statement remain unknown.

The AI gateway failure logs now record the upstream HTTP status when available and the deepest exception type, without logging exception messages, prompts, response bodies, or credentials. Failure-event persistence logs now include only SQLState and JDBC vendor code in addition to exception types. Java 21 focused tests passed for both diagnostics. These fields are intended to identify the failing layer on the next naturally occurring classification error; no paid model request was made for diagnosis.

This does not yet verify general classification online. Re-test a representative classified question after deployment only when needed, and use its correlation ID to inspect `providerStatus` and `causeType`. Do not infer provider health from container health alone.

## Classification model routing

Code-path review found that the production `AiGateway` branch bypasses `ClassifyQueryNode.classifyOptions()`, so the configured `AI_GATEWAY_CLASSIFY_MODEL` was ignored. `RemoteAiGateway` also selected `AI_GATEWAY_FALLBACK_MODEL` for both the initial classification attempt and fallback, which meant a provider failure could retry the same model without reaching a distinct fallback. Model-routing tests reproduced both gaps before the fix. Classification now uses the configured classification model (or the existing lightweight fallback when unset) and switches to the primary model after failure. Other task routing is unchanged.

Java 21 focused verification passed 80/80 across model routing (3), gateway diagnostics (2), failure-event diagnostics (2), and assistant fast-path routing (73). No model request was made. The change still needs deployment identity verification; online quality for general classified questions remains pending a budget-capped manual sample.
