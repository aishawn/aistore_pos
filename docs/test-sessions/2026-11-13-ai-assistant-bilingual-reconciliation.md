# Test Session: 2026-11-13 AI assistant bilingual reconciliation

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-13-ai-assistant-bilingual-reconciliation` |
| Started / timezone | 2026-11-13 / Asia/Shanghai |
| Branch / local base | `main` / `39eb296e952589b429d91347a54db96b6c24acd2` (dirty; 3 commits behind origin) |
| Online runtime | SKR and Demo frontend/backend `173dacfe1db75504187fac8f5a5ba24e21ea8c64` |
| Environment | Windows; Java 21.0.12; Node 22.22.2; authenticated, read-only browser/API probes |
| POS business writes | 0; assistant `writeRequests=[]` on every successful query |
| Model usage cost | Provider usage was not available; cap not independently evidenced |

## Local checks

| Suite | Result | Scope |
|---|---|---|
| AI backend regression | PASS 245/245 | Java 21; deterministic routing, report templates/periods, tenant SQL guards/history, cost boundaries and replenishment failure handling |
| POS UI unit tests | PASS 205/205 | Node 22.22.2; includes provenance precedence and no-row versus undated aggregate rendering |
| POS UI typecheck | PASS | `npm run typecheck` |
| Helper ESLint | PASS | provenance and history helper files |
| Online UAT script syntax | PASS | `node --check scripts/pilot-ai-provenance-ui-uat.mjs` before the final bilingual assertion edit; rerun pending |
| Browser history fixture | BLOCKED | Existing local UI server has no usable backend for dashboard auth; stopped before history checks. No production APIs or business writes were used. |

## Online read-only reconciliation

The authenticated browser script queried sales for Adelaide 2026-11-07..13 on both stores. Both responses used `report_sales` and `source=deterministic`; sales AUD 27,782.79, gross profit AUD 9,029.92 and 1,004 transactions matched each same-store, same-period `/api/reports/native-overview` response exactly. Both had `writeRequests=[]`.

The Chinese question `昨天营业额怎么样？` on SKR and Demo resolved deterministically to Adelaide 2026-11-12. Each returned sales AUD 5,173.94, gross profit AUD 1,985.28 and 185 transactions, exactly matching its same-store overview; `writeRequests=[]`.

All four queries returned one aggregate metrics row without a date field. API metadata correctly said `available` and supplied the report period, timezone and data timestamp. The currently deployed UI incorrectly rendered “No sales rows returned” / “没有返回销售行” for that nonempty aggregate row. This is a confirmed display defect, not a ledger mismatch. A local fix now distinguishes empty results from returned aggregates without readable daily dates; it has not been deployed or rechecked online.

Runtime SHA `173dacfe` is different from the dirty local source. The local online UAT harness was expanded for Chinese labels, single-day ranges, same-period overview reconciliation and write-request checks. Initial Chinese harness attempts timed out because it only waited for English `Source:`; after fixing localization it captured the response. No provider usage evidence was available, so online model cost remains unknown.

## Limits

This session does not prove every intent, the complete utterance catalog, inventory/dead-stock/replenishment parity, prompt-injection behavior online, cross-tenant isolation online, full history/clear, microphone speech recognition, cancellation/retry, or the AUD 10 model-cost cap. No deployment or push was performed in this session.

## Follow-up: frequent Chinese phrase and local history browser

At 2026-11-13 08:55 Asia/Shanghai, reran `昨天销售额是多少？` against both authenticated stores. Both runtimes remained `173dacfe1db75504187fac8f5a5ba24e21ea8c64`. Both answers were deterministic `report_sales` for Adelaide 2026-11-12; sales AUD 5,173.94, gross profit AUD 1,985.28, and 185 transactions matched each store's `native-overview`. Both returned `writeRequests=[]`. The deployed UI still said “没有返回销售行” despite a non-empty aggregate row without a daily date. This leaves one confirmed UI failure for deployment and retest; it is not a metric reconciliation failure. Model provider usage was not visible.

Local regression on Java 21: the AI controller/router/replenishment focused suite passed 62/62. POS UI unit tests passed 205/205 and `npm run typecheck` passed. `node --check` passed for the provenance, history, and AI card UAT scripts. The local fixture browser test used the existing POS UI dev server at `127.0.0.1:3100`, system Chrome, and intercepted API fixtures. All checks passed at 1440, 1024, 768, and 390px, including history metadata restore, reload, follow-up question, report link, new chat/clear, back/forward navigation, empty/missing history, and no page errors. This is not a live history API test.
