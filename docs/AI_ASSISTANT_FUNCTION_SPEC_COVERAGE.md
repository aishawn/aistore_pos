# AI Assistant Function-Spec Coverage

## 2026-10-24 natural-language expansion gap report

The new 29-case online probe produced **22 PASS / 7 FAIL / 0 BLOCKED** with no
business writes. The failures exposed missing deterministic handling for
pricing advice, non-keyword wine recommendations, transaction-count wording,
the supplier question `Who are our suppliers?`, and the Chinese capability
question `AI会直接下单吗`.

The worktree now contains fixes in `WorkflowRouteRouter`,
`AssistantFastPathRouter` and `ReportAdhocRouter`, plus focused Java regression
tests. Because the candidate changes `pos-api`, they remain unpushed until an
exact-SHA Java 21 `mvn -B clean verify` gate is available. Demo runtime
`a5511fc689a8b4c871c0bacda15713afbd86b44f` did not match runner source
`3418c44ee8e3ce3d283725a2b47c6df20fa2e785`.

The shared `main` tip later advanced to `a1063d3`, but its Dokploy deployment
is `Error`; Demo still serves `a5511fc`. These fixes have no post-deploy
function coverage yet.

Later deployment attempts for `c905902` and `dc465b3` also returned `Error`,
and the deployment detail panel exposed no build lines. Treat the candidate as
unverified until the exact candidate SHA passes Java 21 `mvn -B clean verify`
and the public version endpoint reports that same SHA. The local executable
catalogue audit found 245 cases, 245 unique IDs and no duplicates, including
88 explicit no-route safety cases; this proves catalogue structure, not
backend test execution.

The subsequent 29-case served-runtime recheck returned **28 PASS / 1 FAIL / 0
BLOCKED**. The only failure was `AI会直接下单吗`, which returned `unknown`;
the local candidate now accepts spacing and additional Chinese order wording.
Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_CURRENT-29.json`.

The full 247-case run against served runtime `c941a617` returned **244 PASS / 3
FAIL / 0 BLOCKED**. The failures are limited to three Chinese automatic-order
capability variants; one incorrectly navigated to `/orders`. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_CURRENT_FULL-247.json`.
The runner source was `a63c84fb`, so this is a pre-fix served-runtime result.

## 2026-10-24 latest served-runtime coverage

The current executable catalogue contains **247 unique cases**. The served
runtime evidence in this section covers the previous 216-case catalogue; the
29-case natural-language expansion is pending a fresh run against a
source-verified runtime.

The recovered Demo proxy completed **216/216** assistant cases and a **5/5**
cross-capability smoke with zero business writes. The source/runtime identity
was not aligned: runner source was `3fc821cde40f70bb05857909ac0f505a8e56a014`
and the public runtime reported `3edd72d84f514856923c0c0d50b01fe7b015e120`.
The result proves the served routing behavior for that runtime, not deployment
of the latest source.

Read-only capability coverage in the same recovery window: availability 3/3,
route matrix 9/9, surface/auth 11/11, metrics 9/9, UI 2/2 and capability
fallback PASS. Product boundaries remain explicit: invoice OCR is BLOCKED by
retired route `41001`, live stock report is safely unavailable, cross-store and
operator checks lack credentials, and transcription fixtures were not supplied.

## 2026-10-24 user-facing test coverage

The likely store questions and their acceptance boundaries are catalogued in
`docs/AI_ASSISTANT_USER_TEST_CASES_2026-10-24.md`. The catalogue separates
read-only advice from execution requests, distinguishes current reports from
workflow navigation, and requires honest unavailable states for missing Odoo
data, provider failures, permissions and retired routes.

Current evidence: source `f5a294844f160433d5dd3c88f385aa3aa650dc93` completed
216/216 assistant cases with zero business writes. The next current-head probe
at source `700abe24a74ccf32fa05a76b389d446d8fbc1263` was blocked before login
by three HTTP 502 proxy responses, so it has no function-level verdict. The
current source is now `9c199bdf000ff881f41b890ff05ba77e67a0489c` after
documentation/evidence-only commits; its retry was blocked by the same proxy
condition.

## 2026-10-23 verified full regression

The deployed frontend and backend both report SHA
`3edd72d84f514856923c0c0d50b01fe7b015e120`, matching the runner source commit.
All **216/216** executable assistant cases passed, including workflow routing,
reports, entity search, safety guards, prompt-injection rejection and unknown
input. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_FULL-216.json`.
The run was assistant-API-only with zero business writes.

## 2026-10-22 representative smoke

The representative case selection was corrected to use IDs that exist in the
executable catalog. The two corrected runs were blocked by Demo login HTTP 502
(`LOGIN_FAILED_502`) before any assistant request, yielding **0 PASS / 1
BLOCKED / 0 FAIL** with no business writes. Evidence:
`UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-22.json` and
`UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-22-RERUN.json`. No function
coverage conclusion should be drawn from this blocked run.

The executable catalog audit now reports **216 unique case IDs**. The runner's
login probe retries transient 502/503/504 responses three times before
classifying the run as unavailable; this changes test robustness only, not
assistant routing behavior.

The retry-enabled smoke still stopped at login with HTTP 502 after all three
attempts (`UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-22-RETRY2.json`).
The full current-catalog selection was blocked at the same login boundary before any
function was exercised (`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_FULL-217.json`).
The diagnostic evidence identifies the final response as Cloudflare HTTP 502
with HTML content and no correlation header after three login attempts; it does
not exercise any AI function (`UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-22-DIAGNOSTIC.json`).

Anonymous probes of auth, AI config, and assistant endpoints all returned 502
as well (`UAT_AI_BACKEND_PROXY_HEALTH_2026-10-22.json`), so no function-level
online verdict is possible until the backend proxy recovers.
The runner records these proxy checks before login in
`UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-22-PROXY-INTEGRATED.json`.

## Runtime identity probe

The online runner now stores `/api/public/version` status, frontend/backend commit and build-time fields, plus whether both runtime commits match source HEAD. Smoke evidence `UAT_AI_WORKFLOW_RUNTIME_IDENTITY_SMOKE.json` records `Restock list please` as **1/1 PASS** to `/stock/replenishment`, while runtime commit fields were null and `matchesSourceCommit=false`. This improves attribution diagnostics; it does not change the full catalog verdict or confirm deployment of current code.

The focused recheck of all 25 prior failures reproduced **25/25** against the served Demo. Evidence: `UAT_AI_WORKFLOW_PREVIOUS-FAILS_RECHECK_2026-10-21.json`. Each record includes expected and actual routing/format assertions and a correlation ID; response text and sales amounts remain omitted. Source coverage exists for these failures, but no Java test execution is claimed and the runtime SHA remains unknown.

The latest full runner evidence selected **216/216** and returned **75 PASS / 116 BLOCKED / 25 FAIL**, matching the focused failure recheck. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-217-CURRENT-RECHECK.json`; its filename is historical naming, while the JSON payload is authoritative for the 216-case count.

The latest companion evidence confirms availability 3/3, gates PASS, routes 9/9, surface/auth 11/11, UI 2/2, Sommelier 10/10, invoice preview 6/6, metrics 9/9 and synthetic English/Chinese transcription 4/4. Price Suggestions remains blocked by Cloudflare 502; live stock report remains safely unavailable. The missing-fixture transcription result is retained as a diagnostic artifact, while the completed synthetic rerun is the provider-capability result.

History/Platform remains 9 PASS / 2 BLOCKED because cross-store and operator credentials are unavailable. Stock RPC remains 4 PASS / 5 BLOCKED / 1 INFO; zero matching rows are recorded without exposing row values, and tenant/warehouse scope is unchanged.

The current AI Java source scan covers 113 files with zero direct logger calls that interpolate question, prompt, answer, response, raw response, or utterance values. Runtime log privacy remains unverified until the candidate passes the Java 21 gate and is deployed.

Current workflow catalog: **216 cases**. The latest full Demo run selected all
216 and returned **75 PASS / 116 BLOCKED / 25 FAIL**. All 116 blocked responses
were HTTP 200 with sanitized `50210`. The 25 assertion failures comprised
seven execution-intent misroutes, ten history/report boundary misroutes, one
Chinese bulk-price destination mismatch, and seven dated-sales responses that
failed the AUD/singular-day format checks. The three new “sell on [date]”
phrases were BLOCKED, so this run gives no online route verdict for them. The
online test records format assertions as booleans, not the returned sales
amount. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-216-CURRENT-CONTINUATION.json`.

## Current FAIL-to-test mapping

All **25** failed assertions in the 216-case online run have a matching local
Java regression assertion: seven execution-intent prompts and the bulk-price
destination are covered by `ClassifyQueryNodeTest` / `WorkflowRouteRouterTest`;
the ten report/history prompts are covered by `ClassifyQueryNodeTest` /
`ReportAdhocRouterTest`; and seven currency/singular-day failures are covered by
`ReportRespondNodeTest`, with date and one-day period checks in
`ReportPeriodResolverTest`. This confirms test presence only. None of these
Java tests has been executed against the current dirty worktree.

The remote Java 21 pre-push gate is still unavailable: local Java is 8, there is
no Docker CLI or GitHub Actions workflow, and the configured SSH endpoint port
53554 failed its TCP reachability check. Keep backend changes unpushed until a
remote builder can verify the exact candidate SHA.

The companion read-only suites remain: features **13/14** (price API Cloudflare
502), reports **15/16** (live stock safely unavailable), availability **3/3**,
route **9/9**, surface/auth **11/11**, UI **2/2**, metrics **9/9**, Sommelier
**10/10**, invoice OCR **6/6**, synthetic English/Chinese ASR **4/4**,
enablement and capability fallback **PASS**. History/platform is **9 PASS / 2
BLOCKED** for missing cross-store/operator credentials. These results also
describe the served Demo; its runtime SHA is unavailable.

The focused 12-phrase Demo test returned **0 PASS / 5 BLOCKED / 7 FAIL**: five
assistant calls returned sanitized `50210`; seven successful report responses
contained the selected date but missed AUD and singular-day wording. Evidence:
`UAT_AI_ASSISTANT_DATED_SALES_ONLINE_2026-10-21_CURRENT.json`. Runtime SHA is
unverified; this is a served-behavior finding, not proof about current source.

Current companion Demo suites: features **13/14** (price API Cloudflare 502),
reports **15/16** (stock report safely unavailable), availability **3/3**, route
**9/9**, surface/auth **11/11**, UI **2/2**, metrics **9/9**, Sommelier **10/10**,
invoice OCR **6/6**, synthetic English/Chinese ASR **4/4**, enablement gate
**PASS**, and capability fallback **PASS**. History/platform is **9 PASS / 2
BLOCKED** for missing cross-store/operator credentials. Direct stock RPC is
**4 PASS / 5 BLOCKED / 1 INFO**; tested company/warehouse domains returned no
matching rows. Full evidence is in the `*_CURRENT-CODEX.json` files. Demo runtime
commit is null. Admin guard was skipped because it creates a temporary user and
role.

The latest 8-case natural-language extension was checked against Demo in
assistant-API-only mode: **3 PASS / 5 BLOCKED / 0 FAIL**. The blocked responses
were sanitized `50210`; no business writes were issued. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_NEW-8CASES-CURRENT.json`.

### Historical 2026-10-21 full read-only iteration (210 cases)

The earlier 210-case run was **79 PASS / 113 BLOCKED / 18 FAIL**; it is superseded by the current full 213-case run. All 113 current blocked calls returned `50210`; the 18 route mismatches cover seven execution-intent guards, ten report/history boundaries and Chinese bulk-price lookup. Seven more successful date-sales responses missed the required currency/singular wording. Companion results and caveats are in the current UAT evidence linked from `AI_ASSISTANT_TEST_PLAN.md`.

Latest current-Demo continuation: utterances **76 PASS / 87 BLOCKED / 11 FAIL**
(all BLOCKED responses were `50210`); AI surface/auth **11/11**, metrics
**9/9**, Sommelier **10/10**, and reports **15/16** (live stock unavailable).
The feature verifier passed 10 checks before Overview navigation hit
`ERR_CONNECTION_CLOSED`; route-matrix login hit `socket hang up`; the invoice
OCR preview attempt hit a TLS disconnect before login. Those interrupted runs
are not feature passes. The latest valid synthetic invoice OCR evidence remains
the earlier **6/6** preview. Current run evidence is recorded in matching
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-174CASE-CURRENT.json`.

The follow-up network retry completed Features **14/14**, route matrix **9/9**,
and invoice OCR preview **6/6**. OCR extracted the synthetic supplier,
invoice/date, two line items, GST and total, with no preview write. The UI
suite remains a genuine compatibility failure because the served Demo is
missing the current `What should I restock?` quick action; this is deployment
drift, not a fixture-only result.

The current 2026-10-21 public run reported **70 PASS / 82 BLOCKED / 7 FAIL** for
the 159-case catalog. All blocked calls returned `50210`; do not count them as
routing assertion failures. The seven FAILs cover three pricing-history
questions, three invoice-existence/count questions and the Chinese bulk-price
destination. Current local router and unit coverage addresses these utterances,
but the Demo runtime SHA remains unverified. Independent Odoo stock RPC passed
9 checks with one INFO for a
missing explicit warehouse binding. A binding-aware rerun confirmed the tenant
company alignment and passed 9 RPC checks plus that INFO, while the AI report
endpoint still returned its safe unavailable response. This does not validate
the AI report graph or prove the Demo backend uses the diagnostic credentials.
The assistant controller now records safe exception-type diagnostics while
keeping provider messages out of the cashier response and application log.
Evidence: `UAT_AI_STOCK_RPC_READONLY_ONLINE_2026-10-21_CONTINUATION.json`.
Binding-aware evidence:
`UAT_AI_STOCK_RPC_READONLY_ONLINE_2026-10-21_BINDING-CONTEXT.json`.
The generated non-PII Australian invoice sample passed live provider extraction
for supplier, invoice number/date, two line items, GST and total, with no
supplier/purchase/receipt writes. Evidence:
`UAT_INVOICE_OCR_PREVIEW_ONLINE_2026-10-21_FULL-AI-CONTINUATION.json`.
Synthetic English and Chinese speech both passed the live transcription endpoint
(2/2); the transcript was not submitted to the assistant and was omitted from
the artifact. Browser hold/release/cancel and provider-error fixtures remain
local UI evidence. Evidence:
`UAT_AI_TRANSCRIPTION_ONLINE_2026-10-21_FULL-AI-CONTINUATION.json`.

The latest seven utterance additions cover dated sales paraphrases in English
and Chinese. `AssistantFastPathRouterTest` checks deterministic `report_sales`
routing, and `ReportPeriodResolverTest` checks explicit-year precedence,
Australian day-first dates and a one-business-day window. Demo validation is
pending deployment identity and a compatible runtime.

The latest local expansion adds eight cashier variants for replenishment,
price review and wine pairing. The focused Demo check returned **4 PASS / 4
BLOCKED / 0 FAIL**; all blocked responses were sanitized `50210` and the
runtime SHA was not verified. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_NEW-8CASES.json`.

Eight write-intent guard cases are now in the executable catalog. The latest
Demo check was **0 PASS / 3 BLOCKED / 5 FAIL**: five FAILs silently opened
read-only workflow routes on the served runtime. Evidence:
`UAT_AI_WRITE_INTENT_GUARDS_ONLINE_2026-10-21-8CASE.json`.

The subsequent full 182-case run returned **76 PASS / 90 BLOCKED / 16 FAIL**;
evidence is `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_182CASE_RECHECK.json`.
The five safety failures are confirmed as old-runtime behavior. The current
working tree now short-circuits explicit write intent to a guided `unknown`
result before model classification and has a node regression for all eight
phrases. It remains un-deployed pending the Java 21 remote verification gate.

Current online capability recheck: AI features **13 PASS / 1 BLOCKED / 0 FAIL**
(price suggestions upstream `502`, page Retry available), surface/auth **11/11**,
route matrix **9/9**, metrics **9/9** at 390/1440px, AI UI **2/2**, and reports
**15 PASS / 1 BLOCKED / 0 FAIL** (safe live-stock unavailable response). Evidence
files use the `*_CURRENT_RECHECK.json` names; runtime SHA is unverified.

Current goal-continuation Demo run: all 92 historical read-only cases, `55 PASS / 34 BLOCKED / 3 FAIL`. The current source catalog is now 117 cases; the 25 newly added natural-language variants are local regression coverage and have not been fully validated by the old runtime. The three failures are the old runtime routing invoice existence/bill-count questions to OCR; the current source adds report-context guards and regression tests. Runtime SHA remains unverified. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_GOAL_CONTINUATION_FULL.json` and the current 113-case evidence.

The follow-up 106-case run against the same public runtime is `62 PASS / 40 BLOCKED / 3 FAIL`; evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_106CASE_LOCAL-SOURCE-CATALOG.json`. The 109-case follow-up is `62 PASS / 42 BLOCKED / 4 FAIL`; its additional failure is a pricing-report misroute from the old runtime, covered by the local workflow-report guard. The three invoice failures remain unchanged. This is read-only assistant API evidence and does not prove deployment of the source fix.

The final 111-case follow-up is `62 PASS / 43 BLOCKED / 5 FAIL`; evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_111CASE_LOCAL-SOURCE-CATALOG.json`. The two pricing-report and three invoice-report failures are old-runtime regressions covered by local guards; the 43 blocked cases are generic `50210` responses and no business writes.

This mapping turns the product function description into executable acceptance areas. Live checks are read-only unless an isolated Odoo test company is explicitly approved. A `PASS` means the routing/UI contract is covered; it does not claim provider quality or production deployment. The current 2026-10-21 continuation executed all 92 historical cases (`55 PASS / 34 BLOCKED / 3 FAIL`); the runtime SHA was not verified. The current catalog includes natural-language regressions and 20 write-intent safety cases pending deployment. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_GOAL_CONTINUATION_FULL.json`.

Execution-language safety coverage includes purchase (`Place the purchase
order`, `Buy these items now`, `下单采购这些商品`), replenishment (`执行补货`) and
pricing (`Apply these prices`, `执行调价`). Their paired advice questions stay
read-only. No online safety case performs a business mutation.

The latest full Demo execution of the 194-case catalog returned **76 PASS / 100
BLOCKED / 18 FAIL**. All blocked responses were `50210`; the runtime identity
was `unverified-after-deploy`, and the assistant-only runner recorded no
business writes. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-194CASE_CURRENT.json`.

Fresh capability evidence remains stable: features **13/14** with one upstream
502 block, route matrix **9/9**, surface/auth **11/11**, and reports **15/16**
with a safe live-stock unavailable response. See the four
`*_CONTINUATION_CURRENT.json` artifacts in `docs/`.

Entity-action capability boundaries are covered separately by
`scripts/pilot-ai-entity-invalid-op-local-uat.mjs`: unsupported `create`,
`import`, and `export` requests now return an explicit unavailable message;
supplier `view` resolves to the read-only Odoo directory; unsupported model
operations still fail closed. The fixture also verifies cancellation,
duplicate-delete protection, retry after a failed delete, zero escaped
business writes, and no accidental supplier edit navigation.

The latest 144-case public read-only run is recorded in
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_144CASE_CURRENT.json`:
`65 PASS / 72 BLOCKED / 6 FAIL`, with `writeRequests` limited to the assistant
API. The six failures are attributable to the unverified old runtime; source
commit and runtime SHA are intentionally recorded separately.

| Function area | Representative user questions | Automated coverage | Current status |
|---|---|---|---|
| Store assistant and sales | `Today's sales`, `What did we make today?`, `16 Oct 2026 sales`, `What did we take on 16 October 2026?`, `What's today's revenue?`, `今天收入多少`, `昨天营业额` | `AssistantFastPathRouterTest`, `ReportPeriodResolverTest`, `ReportRespondNodeTest`, 210-case workflow and report reconciliation UAT | Screenshot query resolved to 2026-10-16; `12.99` matched Overview. Summary now includes AUD and grammatically correct day/sale counts, with targeted Java regression cases added; tests and deployment remain pending. Latest 210-case run has 113 service-blocked calls and 18 old-runtime route mismatches; the new paraphrase was blocked by 50210. Runtime SHA unverified |
| Customer lookup | `Find customer Alex Example`, `Can you find customer Alex Example?`, `帮我查一下 客户 Alex Example` | `AssistantFastPathRouterTest`, workflow UAT, entity-directory fixture UAT | Local fixture preserved `?q=Alex Example` at 390/1440. Online cases remain blocked by old runtime `50210`; runtime SHA unverified |
| Supplier, order and stocktake navigation | `Show me the suppliers`, `Show me purchase orders`, `Go to stocktake`, `查看供应商列表`, `去盘点` | `WorkflowRouteRouterTest`, workflow UAT | New read-only routes covered locally: `/suppliers/odoo`, `/orders`, `/stocktake`; write verbs are excluded and remain guided actions |
| Date and period reports | `14/10/2026 sales`, `16 Oct 2026 sales`, `最近7天销售额`, `And yesterday?` | `ReportPeriodResolver` tests, workflow and `pilot-ai-report-readonly-uat.mjs` | Screenshot day and amount reconciliation passed (`12.99`); reports 15 PASS / 1 BLOCKED (live stock) |
| Quantity and average ticket | `How many tickets yesterday?`, `本月客单价`, `最近7天销量` | report router/service tests | PASS locally; live data depends on Odoo |
| Product and stock lookup | `Is VB Cans in stock?`, `Do we have VB Cans?`, `Any VB Cans in stock?`, `店里有 VB Cans 吗？`, `VB Cans还有吗？` | `AssistantFastPathRouterTest`, stock RPC fixture, read-only Odoo diagnostic | Direct Odoo RPC is 9 PASS / 1 INFO; AI stock report remains safely unavailable. Entity list/search points to `/products/odoo`; most utterance calls are blocked by old runtime `50210`. |
| Replenishment | `Which products need reordering?`, `Which items are low on stock?`, `What should I restock?`, `What should I order for the weekend?`, `哪些商品库存低` | `WorkflowRouteRouterTest`, workflow utterance UAT, AI feature UAT | Local source has deterministic route coverage; public runtime returned `50210` for several new aliases and its SHA is unverified; suggestions remain drafts |
| Pricing suggestions | `Which prices should I review?`, `How much should I charge for Shiraz?`, `哪些商品需要调价` | workflow route tests and pricing read-only UAT | Price Suggestions UI fixture PASS with zero writes; live natural-language route remains runtime-dependent; no automatic price writes |
| Wine recommendations | `Find me a wine for steak`, `Recommend a red wine under $30`, `Pair a wine with lamb`, `牛排配什么酒`, `晚餐喝什么酒` | workflow route tests, Sommelier read-only UAT | New aliases covered locally; existing route/surface checks pass; catalogue/stock scope required |
| Supplier invoice OCR | `Scan this supplier invoice`, `Scan this bill`, `Take a photo of this invoice`, `Scan this supplier bill`, `上传这张账单`, `识别这张发票` | feature/OCR API, online preview and invoice UI fixture | Synthetic provider preview 6/6 PASS; UI retry/preview boundary fixture 6/6 PASS; no purchase/receipt write. Real supplier formats still need broader validation |
| Voice input | spoken sales/stock questions, cancel and provider failure | capability gate, transcription and voice fixture UAT | Local recording/cancel/failure and capability gates PASS; latest live synthetic English/Chinese ASR 4/4 PASS; transcript omitted from evidence |
| History and platform metrics | conversation history, store usage and platform audit | history/metrics UAT scripts | 9 PASS / 2 BLOCKED; second-store and operator credentials required for cross-tenant checks (`UAT_AI_FOLLOWUP_HISTORY_PLATFORM_2026-10-24_RETRY.json`) |
| Permissions and tenant isolation | restricted report role, missing store binding, forged `/admin/secret` route mixed with product/customer/stock wording | admin guard, tenant, sanitizer tests, `AssistantFastPathRouterTest` | PASS fail-closed locally; forged-route detection runs before entity/report shortcuts |

## Required negative cases

`How much red wine sold this week?`, `How many invoices did we receive?`, and `How much did we pay suppliers this month?` must remain report questions. They must not open the wine or invoice workflow merely because they contain those nouns. `Compare sales on 14 Oct with 15 Oct` is an unsupported custom comparison and must receive an honest limitation. Prompt injection, unsupported entity operations, and unknown text must produce no navigation or business write.

## Evidence rules

- Record the exact source commit and runtime SHA separately.
- `HTTP 200` with a business error is not a pass.
- A webhook response or a reachable page is not deployment proof.
- Never log API keys, passwords, tokens, or full provider response bodies.
