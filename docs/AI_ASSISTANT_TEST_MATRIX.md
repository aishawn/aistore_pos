# AI Assistant Test Matrix

## 2026-10-24 Stock identifier diagnostic

The executable catalogue now contains **360 unique cases**, including barcode
and SKU questions (`查条码 9311234567890`, `找 SKU VB-375`, `Check barcode ...`,
`Find SKU ...`). A focused read-only run of 12 stock/clarification cases against
Demo returned **0 PASS / 0 BLOCKED / 12 FAIL**. The served runtime is
`0e4a48ead3e32c57623ed726e3583cee5945d0ca`; the test runner source was
`e21a794356594de3aed15805664dc0fcac482c5f` (`matchesSourceCommit=false`).
The shared branch later advanced to `7fd56990` through a documentation-only
commit; backend candidate changes remain dirty on top of that tip.
Failures are expected runtime/source mismatch diagnostics: the old runtime sends
stock-of/for and Chinese stock forms to `entity_action`/`search_product`, and
barcode/SKU forms to the classifier. The candidate deterministic router and
Odoo name/barcode/SKU domain fix are not yet online. Evidence:
`UAT_AI_STOCK_IDENTIFIER_CLARIFICATION_ONLINE_2026-10-24_RUNTIME-0E4A48EA.json`.
All requests were Assistant API-only with zero business writes.

## 2026-10-24 Current Source Expansion Rerun

The executable catalogue contains **357 unique cases**. The latest read-only
Demo run returned **327 PASS / 0 BLOCKED / 29 FAIL** with
`writeRequests=["none: assistant API only"]`. The 29 failures are isolated to
the old runtime: 3 bulk-pricing phrases, 7 explicit stock-of/for product
phrases, and 19 unqualified empty-stock clarification phrases. The candidate
source has deterministic coverage and focused Java assertions for these cases.

Runtime frontend/backend is `0e4a48ead3e32c57623ed726e3583cee5945d0ca`; source
is `e21a794356594de3aed15805664dc0fcac482c5f`, so the result is diagnostic only.
Companion read-only suites passed: features **14/14**, availability **3/3**,
routes **9/9**, and reports **23/23**. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_20261022T231906600Z_e21a7943.json` plus the
current suite outputs. Candidate acceptance still requires the Java 21 exact-SHA
gate and a matching deployment.

## 2026-10-24 Current Full Rerun

The executable catalogue now contains **344 cases**, including eight new
unqualified stock “no results/blank search” variants and four bulk-pricing
navigation variants. The read-only Demo run returned **325 PASS / 0 BLOCKED /
19 FAIL**; 16 failures are stock clarification cases and 3 are bulk-pricing
phrases missing from the served runtime. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_CURRENT_FULL-344-RERUN.json`.

Runtime frontend/backend is `0e4a48ead3e32c57623ed726e3583cee5945d0ca`; source
is `e21a794356594de3aed15805664dc0fcac482c5f`, so this is a runtime diagnosis,
not candidate acceptance. AI feature surface is **14/14 PASS** and the old
card contract is **0/9 PASS**. Companion availability/routes/surface-auth/reports
checks are **3/3**, **9/9**, **11/11**, and **23/23 PASS**. No business writes were issued. Candidate
acceptance remains pending the Java 21 exact-SHA gate and matched deployment.

## 2026-10-23 Full Feature Recheck

Each suite below captured its own source SHA because the shared branch HEAD moved during the run. All online checks targeted the older Demo runtime (`0e4a48ea`) unless stated otherwise; do not treat the combined results as one SHA-matched candidate release.

The executable utterance catalogue now has 332 cases. The current full run
returned **324 PASS / 0 BLOCKED / 8 FAIL**; every failure is an unqualified stock
clarification question answered by the old runtime as `unknown`. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_FULL-332-RERUN-CURRENT.json`.
The candidate deterministic router expects `qa`, no route, a product name/barcode
request and an empty write list for all eight.

| Area | Result | Evidence / note |
|---|---:|---|
| Natural-language matrix | 324 PASS / 0 BLOCKED / 8 FAIL of 332 | Eight generic stock questions lack product identity; old runtime answered `unknown`. Assistant API only, no business writes. Latest rerun evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_FULL-332-RERUN-CURRENT.json`. |
| Features; reports | 14/14; 23/23 PASS | `UAT_AI_FEATURES_VERIFY_ONLINE_2026-10-23_GOAL-RECHECK-SOURCE-12A7243B.json`; `UAT_AI_REPORTS_READONLY_ONLINE_2026-10-23_GOAL-RECHECK-RUNTIME-0E4A48EA.json` |
| Availability; routes; surface/auth | 3/3; 9/9; 11/11 PASS | Three separate online evidence files suffixed `GOAL-RECHECK.json`; these verify the served app, not current source. |
| Metrics; transcription; synthetic invoice OCR | 9/9; 4/4; 9/9 assertions PASS | Metrics runtime unverified; transcription used synthetic audio and submitted no assistant prompt; OCR used a synthetic invoice image and made zero Odoo writes. |
| Browser AI card UI | Live old runtime: 1 FAIL; local candidate fixture: 35/35 PASS | Seven card/safety scenarios across 320/390/768/1024/1440px. Route-specific CTA text, deferred navigation, no overflow, external-link rejection, zero business writes and no page errors. Evidence `UAT_AI_CARD_UI_LOCAL_2026-10-23_CURRENT.json`; fixture verification does not prove deployment. |
| Assistant card API contract | 0/9 PASS, 9 FAIL | Served card responses lack structured `cta`; guided-action responses also lack the Action guide card. This is an old-runtime mismatch, not a verdict on the current DTO candidate. |
| Provider health | 1 BLOCKED | DashScope request ended with `ECONNRESET`; no response body/key recorded. |

Frontend unit tests pass **17/17**, `npm run typecheck` passes after Next dev regenerated the malformed route declarations, and targeted ESLint/script syntax checks pass. Local production build was not run. Backend pre-push gate remains exact-SHA Java 21 `mvn -B clean verify`.

## 2026-10-23 Current Goal Recheck

| Area | Result | Finding / next assertion |
|---|---:|---|
| Natural-language utterances | 324 PASS / 0 BLOCKED / 8 FAIL of 332 | Eight failures are generic stock-discovery questions without a product identifier. Expected clarification is `qa`, request a product name/barcode, no route and no invented stock value. Evidence source `e21a7943` differs from Demo runtime `0e4a48ea`; this is old-runtime diagnosis, not candidate acceptance. |
| Stock clarification variants | 1 PASS / 0 BLOCKED / 12 FAIL of 13 | Dedicated runner covers empty-result English/Chinese variants plus named unknown-product and named known-product controls. The named unknown-product control passed on the old runtime; the 12 clarification failures are runtime/source mismatch evidence. `UAT_AI_STOCK_CLARIFICATION_VARIANTS_ONLINE_CURRENT.json` |
| Named unknown product contrast | Candidate case added | `Do we have ORITHOS-UAT-NO-MATCH-84721 in stock?` must be read-only `report_stock` and distinguish no catalogue match from unavailable source. |
| Guided-action card contract | 5 PASS / 4 FAIL of 9 | Existing Demo lacks Action guide cards for create customer, edit product, receive stock and save prices. Candidate implementation awaits Java 21 same-SHA gate and matched-runtime check. |
| AI metrics | 9/9 PASS | Admin metrics, anonymous 401, responsive UI and table accessibility pass; runtime SHA unverified; zero business/configuration writes. |

All utterance and card checks call the assistant API only. Keep `writeRequests=[]`; do not turn explicit write phrases into completed actions. Candidate backend changes are not deployable until Java 21 `mvn -B clean verify` passes for the exact SHA.

## Current Recheck (2026-10-23)

On matched Demo runtime `0e4a48ead3e32c57623ed726e3583cee5945d0ca`: natural utterances **323/323 PASS**; reports **23/23 PASS**, including an unknown-product read that distinguishes a valid no-match from source failure; sales chat UI **2/2 PASS** at 390px and 1440px. Companion suites on the Demo target passed: Sommelier **10/10**, AI routes **9/9**, AI surface/auth **11/11**, and synthetic speech **4/4**; their evidence files record deployment SHA as unverified. Capability-gate PASS is a fault-injected unavailable-voice UI check; transcription itself reported available and passed both languages but did not capture runtime SHA. Evidence files use `GOAL-RECHECK` in their names, except the full utterance matrix `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_0E4A48EA.json`.

Pricing pages are **8 PASS / 2 BLOCKED / 0 FAIL** because Demo has no Odoo price rules configured for Capped Pricing, so data-state assertions could not be completed. No business write was issued. Java 21 Dokploy exact-SHA gate logs and isolated business-flow acceptance remain outstanding; overall pilot remains **NO-GO**.

## 最新截图问题复验（2026-10-23）

HEAD 与 Demo frontend/backend runtime 均为 `0e4a48ea`。最新完整线上自然问法矩阵 **323/323 PASS**，销售/库存报表 **22/22 PASS**，截图聊天 UI 在 390/1440px **2/2 PASS**；各证据均声明或探测到匹配 runtime SHA。相关证据：`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_HEAD-0E4A48EA-FINAL.json`、`UAT_AI_REPORTS_READONLY_2026-10-23_FINAL.json`、`UAT_AI_SALES_CHAT_UI_2026-10-23_HEAD-0E4A48EA-FINAL.json`。

全量问法覆盖查询、推荐/建议、导航、发票状态/扫描/上传对照及明确写操作保护，Assistant API only，`writeRequests=["none: assistant API only"]`。独立原始 RPC 名称筛选仍有 4 个 BLOCKED，但应用层动态库存商品与数量对账已通过。Java 21 Dokploy exact-SHA 完整日志未归档，Pilot 仍 NO-GO。

## Historical Acceptance Snapshot (Superseded Above)

Report recheck: **19 PASS / 2 BLOCKED / 1 FAIL**. The screenshot date, English
natural sales wording, single-day/AUD copy, Overview reconciliation, and two
natural stock-route variants pass. One Chinese sales paraphrase (`10月16日卖了多少？`)
was incorrectly classified as `report_qty` by the deployed runtime. A backend
candidate now routes that dated sales phrase to `report_sales`, with a Java
regression case; Java 21 verification and matched-runtime recheck are pending.
Live stock answer and quantity reconciliation remain BLOCKED because the deployed
AI report returns an unavailable response. Dynamic Odoo RPC diagnosis found
the current POS availability filter returns zero rows, while a tenant-scoped
inventory query without that filter returns stock fields. A backend candidate
removes that POS-only filter for stock/dead-stock reports; Java 21 exact-SHA
verification and matched-runtime acceptance are pending. Evidence:
`UAT_AI_REPORTS_READONLY_2026-10-23_ITERATION.json` and
`UAT_AI_STOCK_RPC_READONLY_2026-10-23_DYNAMIC.json`.

The current deployed runtime is verified against HEAD `65b332c94fcd3387005f54d443cd7e4be6f047ee`. The full **322-case** Assistant API-only matrix passed **322 PASS / 0 BLOCKED / 0 FAIL**, including Chinese/English invoice upload, scan, and arrival-query contrast cases. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_20261022T180421573Z_65b332c9.json`; `writeRequests=["none: assistant API only"]`.

The invoice preview UI mock passed **7/7** at 390px, including capability/OCR retry, editable review fields, Odoo read-only lookup isolation, and no business writes. Evidence: `UAT_INVOICE_SCAN_MOCK_2026-10-23_CURRENT.json`. This does not verify live OCR provider/model configuration.

The prior 5-case boundary recheck on the older runtime returned **4 PASS / 0 BLOCKED / 1 FAIL**:
`UAT_AI_WORKFLOW_BOUNDARY_CANDIDATE_2026-10-24.json`. The two price actions and
both English invoice upload requests returned `guided_action`; `上传这张账单`
still returned `navigate` on runtime `9e61de5d`. Runtime SHA does not match
source `00e4a5af`, so this is a diagnostic of the older deployed service, not
the dirty candidate. At the time, the candidate added Chinese `上传`, `传上去`
and `传一下` in an invoice/bill context as write intent. The later matched-
runtime 322-case run above verifies the routing fix; Java 21 exact-SHA gate logs
still need to be archived separately.

The action distinction is intentional: upload/submit/receive requests require
`guided_action` to `/invoices/scan`; scan/identify/read requests navigate to the
preview; invoice arrival/count questions stay read-only. Every branch must
assert `writeRequests=[]`.

The latest complete 320-question read-only run is
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_CURRENT-110F585.json`:
**277 PASS / 38 BLOCKED / 5 FAIL**. All 38 blocks were `50210`; Demo runtime
`b4719e7c` did not match source `2a9d2cf1`. Three failures were an outdated
`guided_action` expectation for upload phrases that opened the invoice preview;
two were price execution mismatches.

The earlier 5-case recheck `UAT_AI_WORKFLOW_BOUNDARY_RECHECK_9E61DE5.json` returned
**3 PASS / 0 BLOCKED / 2 FAIL** on runtime SHA `9e61de5d`, matching HEAD but
not the dirty worktree. Both price cases now pass. Two English upload phrases
still return `guided_action` while Chinese upload returns `navigate`; the
candidate aligns all upload phrases to open the preview only. Its Java 21
exact-SHA gate has not run. Keep the pilot **NO-GO**.

Every case should assert: intent and route; answer/slots and source-data
fallback; tenant/date/currency boundaries; positive and negative contrast
behavior; and `writeRequests=[]`. For explicit mutations, require
`guided_action`, an appropriate review page, and zero writes. For questions
about status, capabilities or procedures, require `qa`/read-only reporting and
no write-workflow navigation.

Previously source-matched evidence of 216/216 PASS is recorded in
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_SHA-VERIFIED.json` for SHA
`7c5e9817`. The current worktree has advanced beyond that SHA, so it is a
historical verified baseline, not proof of the current candidate.

## 2026-10-22 latest full run (310 utterances)

Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_20261022T155514915Z_8a4c56e5.json` returned **266 PASS / 36 BLOCKED / 8 FAIL**. All blocked calls returned `50210`; no business writes were issued. Demo frontend/backend SHA `b4719e7c51c2ffebdcd8b0916e7186480c55201d` differs from source SHA `8a4c56e51e40317bd16183ee8ebb7148e9841082`, so this is old-runtime evidence only.

The eight old-runtime mismatches are three price execution prompts missing `/stock/capped-pricing`, three Chinese invoice-arrival prompts opening `/invoices/scan`, `商品有几种？` classified as `report_adhoc`, and `How do I close the till?` opening `/close`. Candidate regression coverage now includes deterministic routing for each family plus positive controls for invoice scanning and explicit price writes. Newly added catalogue variants exercise invoice arrival, product counts and till phrasing in English and Chinese. All candidate expectations remain pending the same-SHA Java 21 gate and runtime-matched rerun.

## 2026-10-22 current recheck (304 utterances)

The current runner catalogue returned **265 PASS / 33 BLOCKED / 6 FAIL** across 304 assistant-only questions. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_20261022T151353424Z_d7ae6395.json`. All 33 blocked responses were `50210`. The six failures were three pricing execution phrases missing `/stock/capped-pricing` and three invoice-arrival questions routed to `/invoices/scan`. Runtime frontend/backend were `b4719e7c51c2ffebdcd8b0916e7186480c55201d`; source HEAD was `d7ae6395ab4b4fe984afc81ceb15934c7f146fcb` with a dirty worktree, so this does not verify the current source. No business writes were issued.

Companion rechecks: features **14 PASS / 1 FAIL** (invoice OCR probe HTTP 500 / `50000`), reports **15/16** (live stock source unavailable with a safe response), availability 3/3, route matrix 9/9, surface/auth 11/11, UI 2/2, transcription 4/4, metrics 9/9, capability/enabled gates PASS. History/platform was 9 PASS / 2 BLOCKED; stock RPC was 4 PASS / 5 BLOCKED / 1 INFO because several AI-domain queries returned no product rows. The local invoice preview browser mock passed 6 checks, but is not real OCR verification. Evidence files use `2026-10-22_CURRENT-RECHECK` or timestamped `d7ae6395` names. Java 21 exact-SHA verification and runtime-matched acceptance remain pending.

## 2026-10-22 D7AE served-runtime full regression

The 301-case Assistant API-only run returned **265 PASS / 32 BLOCKED / 4 FAIL**. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_CURRENT-301-D7AE6395.json`. Runtime frontend/backend were both `b4719e7c51c2ffebdcd8b0916e7186480c55201d`, while the source was `d7ae6395ab4b4fe984afc81ceb15934c7f146fcb`; this is not source-matched acceptance. All 32 blocked cases returned `50210`. All requests used Assistant API only and no business write was issued.

The four stable mismatches are three price execution phrases (`Set these prices now`, `Change these prices`, `设置这些价格`) classified as `guided_action` without the expected `/stock/capped-pricing` review route, and `收到发票了吗？` navigated to `/invoices/scan` instead of read-only `report_adhoc`. Java source tests already assert the expected behaviors; exact-SHA Java 21 `mvn -B clean verify` and a matching runtime rerun remain required. Companion suites: availability 3/3, route 9/9, surface/auth 11/11, UI 2/2, metrics 9/9 and capability/enabled gates PASS; features 14 PASS/1 BLOCKED (retired OCR 41001), reports 15/16 (live stock source unavailable), transcription 2 PASS/2 BLOCKED (missing audio fixtures), history/platform 9 PASS/2 BLOCKED (missing second-store and operator credentials).

## 2026-10-22 current-candidate read-only diagnostic

The runner executed all **301** entries from its `cases` array: **247 PASS / 28 BLOCKED / 26 FAIL**. It called the Assistant API only and recorded `writeRequests=["none: assistant API only"]`. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_CURRENT-301-BC4159C.json`. Demo frontend/backend SHA was `b4719e7c51c2ffebdcd8b0916e7186480c55201d`; the source commit was `bc4159c34e6a51e2f4d47718d35838820581d50c` with `worktreeDirty=true`, so results diagnose the served old runtime and do not verify the candidate.

The 26 failed responses all had business code `0` and an empty `writeRequests` list. Fourteen guided write requests lacked a review route; the remaining failures include incorrect routes for purchase commands, an invoice-count question misrouted to invoice capture, and AI capability questions classified as actions/navigation instead of `qa`. The 28 blocked responses returned `50210`. Candidate fixes require the Java 21 exact-SHA gate and a runtime-matched rerun before acceptance.

## 2026-10-22 current workspace 299-case diagnostic

The Assistant API-only run returned **247 PASS / 28 BLOCKED / 24 FAIL** with
`writeRequests=["none: assistant API only"]`. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_CURRENT-299-D3EC716.json`.
Demo frontend/backend were `b4719e7c`; the runner source was `d3ec7165` and
`worktreeDirty=true`, so this is old-runtime diagnostic evidence, not
current-candidate acceptance.
All 28 blocks returned `50210`. Source review found a direct Chinese price
change phrase without a review destination; the candidate now maps that phrase
to `/stock/capped-pricing` and adds regression assertions. The executable
catalog now has 301 unique cases (counted from the runner's `cases` array). Java 21 exact-SHA verification remains
required before backend changes can be pushed or deployed.

The read-only UI rechecks against the served Demo pass Availability **3/3** and
Route Matrix **9/9**. Evidence: `UAT_AI_AVAILABILITY_2026-10-22_CURRENT-D3EC716-RECHECK.json`
and `UAT_AI_ROUTE_MATRIX_2026-10-22_CURRENT-D3EC716-RECHECK.json`. The earlier
availability navigation timeout and route setup socket hang up did not recur.
These verify the served pages and interactions, not source/runtime identity.

A later 7-case write-boundary subset returned **3 PASS / 0 BLOCKED / 4 FAIL**
on that older runtime. The four observed mismatches were missing or incorrect
review destinations for replenishment submission, buying items, Chinese order
submission, and pricing execution. The source/runtime SHA mismatch means these
are not current-source verdicts. The browser card suite separately passed at
390px and 1440px, covering product count and sommelier response cards.
Other recent suites remain limited by retired OCR (`41001`), live stock-source
unavailability, missing second-store/operator accounts, and missing audio
fixtures; their recorded source SHA does not match this current candidate.

## 2026-10-22 latest 290-case read-only run

Evidence: `UAT_AI_WORKFLOW_B4719_FULL_RECHECK.json`. Demo runtime was
`b4719e7c`; candidate source was `a176a107`, so this is runtime evidence, not
candidate acceptance. The 290 cases returned **251 PASS / 14 FAIL / 25
BLOCKED**, with no business writes. Twelve failures reflect the runner's old
requirement for a route on fail-closed `guided_action` replies; the runner now
accepts a null route while requiring any returned route to match the case's
expected review destination. The other two are old-runtime misroutes covered
by candidate fixes and Java regression assertions; they still need the Java 21
same-SHA gate and runtime-matched recheck.

Companion read-only suites: Availability 3/3, Routes 9/9, Surface/Auth 11/11,
Metrics 9/9, AI UI 2/2, and capability gates PASS. Features 14 PASS / 1 BLOCKED
(retired invoice OCR endpoint `41001`); Reports 15/16 (live stock source
unavailable); History/platform 9 PASS / 2 BLOCKED (missing second-store and
platform-operator accounts); transcription 2 PASS / 2 BLOCKED (no audio
fixtures). See the matching `UAT_AI_*_2026-10-22_CURRENT-GOAL-RERUN.json`
files for per-case evidence.

## 2026-10-22 配套能力矩阵

| Area | Result | Boundary |
|---|---:|---|
| Availability / routes / surface / metrics / UI | 3/3, 9/9, 11/11, 9/9, 2/2 PASS | Read-only |
| Capability gates | PASS | Chat enabled; voice disabled with clear state |
| Features | 14 PASS / 1 BLOCKED | Retired OCR route returns 41001 |
| Reports | 15/16 | Live stock source unavailable; safe message shown |
| History / platform | 9 PASS / 2 BLOCKED | Missing second-store and platform-operator credentials |
| Transcription | 2 PASS / 2 BLOCKED | Missing audio fixtures |

## 2026-10-22 255-case retry-corrected result; catalog now 265

The latest full catalogue returned **248 PASS / 0 BLOCKED / 7 FAIL**. Timeout
errors now retry before classification, so the remaining failures are stable:
one stock-constrained recommendation, five automatic-order capability phrasings,
and one numeric replenishment command. No business writes were issued.
Two additional category-quantity safety cases are local-only until the next
source-matched online run.

The six newer natural-expression cases returned **4 PASS / 0 BLOCKED / 2 FAIL**
on the same old runtime. The failures were `Suggest a price for Shiraz` and
`Can you create a purchase order?`; both have deterministic local coverage now.

The complete current catalogue returned **252 PASS / 0 BLOCKED / 11 FAIL** in
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_CURRENT-263.json`. All requests
were assistant API-only with zero business writes. Runtime/source SHA mismatch
keeps this as diagnostic evidence pending source-matched deployment.

The two newest numeric execution cases returned **1 PASS / 0 BLOCKED / 1 FAIL**:
the purchase quantity request passed, while the old runtime still routed the
restock quantity request to `/stock/replenishment`.

## 2026-10-22 252-case current recheck; catalog now 255

The latest 252-case catalogue returned **248 PASS / 0 BLOCKED / 4 FAIL** against
Demo. The four failures are deterministic gaps in the served 582b92fb runtime:
one stock-constrained sommelier phrase, two Chinese automatic-order questions,
and one numeric English replenishment command. No business writes were issued.
The runner source SHA and runtime SHA do not match.

The three follow-up capability questions returned **0 PASS / 0 BLOCKED / 3
FAIL** on the same served runtime: one navigated to /orders and two returned
unknown. They remain pending source-matched deployment verification.

## 2026-10-22 最新只读配套结果

Demo 当前运行版本的配套矩阵：上一版问法 **247/247 PASS**，availability **3/3**，
routes **9/9**，surface/auth **11/11**，metrics **9/9**，UI **2/2**；features
为 **14 PASS / 1 BLOCKED**（旧 OCR `41001`），reports 为 **15/16**（实时库存
源不可用但界面正确提示）。所有检查都没有销售、采购、收货、调价、库存或关班写入。
运行证据见 `*_2026-10-22_POST-ROUTE.json` 文件。

Capability gates 显示聊天可用、语音明确禁用；History/platform 为 **9 PASS / 2 BLOCKED**
（缺第二门店和 platform-operator 凭据），transcription 为 **2 PASS / 2 BLOCKED**
（缺音频 fixture）。当前 Demo 前后端运行 SHA 是 `582b92fb`，与 runner source `1cd417c3` 及当前 HEAD `6fa3383d` 均不一致；下一次
发布必须先完成 exact-SHA Java 21 门禁，再重新做 SHA 绑定回归。

## New regression cases for natural cashier phrasing

The executable catalogue adds five boundary cases: two conversational wine
recommendation requests, two Chinese capability questions about automatic
ordering, and one English quantity-based replenishment command. Expected
results are respectively /sommelier navigation, qa with no route, and a
fail-closed execution response with no write. These cases must be rerun after
the served runtime SHA is verified.

## 2026-10-22 历史 7911d0d4 问法结果

`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_7911D0D4_DATA-AWARE-247.json`：
**246 PASS / 0 BLOCKED / 1 FAIL**。唯一失败为
`Recommend something in stock for steak` 的 intent（route 已正确为
`/sommelier`，却标记为 `report_adhoc`）。该问法已加入确定性路由回归；后端候选
未通过同 SHA Java 21 `mvn -B clean verify` 前，不宣称线上修复。

安全矩阵继续要求所有带执行动词的自然表达（下单、保存价格、收货、直接补到指定
数量）无业务路由、无销售/采购/库存/价格/收银写入；数据无行和 provider 不可用要
单独归类，不能计作路由通过。

## 2026-10-22 d0669 companion suite

Availability, route, surface/auth, and metrics checks are **3/3**, **9/9**,
**11/11**, and **9/9 PASS** respectively. The checks cover enabled state,
configuration records, product lookup, empty voice/image guards, anonymous
401 boundaries, metrics UI at 390/1440px, and accessibility headers. No
business writes were issued.

## 2026-10-22 d0669 data-aware result

After adding an explicit no-sales/no-source-data classification, the deployed
d0669 runtime returned **232 PASS / 15 BLOCKED / 0 FAIL** for all 247 cases.
The 15 blocks are the dated sales cases with no completed sales rows; there
are no remaining deterministic routing failures in this run. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_D0669F94_DATA-AWARE-247.json`.

## 2026-10-22 e0 smoke follow-up

The focused smoke was **1 PASS / 2 BLOCKED / 0 FAIL**: replenishment routed
correctly; capability help saw HTTP 502 and purchase-order execution saw
`50210` after three attempts. No business writes were issued.
Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_E0A867B0_SMOKE-3.json`.

## 2026-10-22 e0 runtime full recheck

The current runtime `e0a867b0387c7760c1dfc1bea9a5c374debb0930` returned
**188 PASS / 44 BLOCKED / 15 FAIL** for the 247-case catalogue. All 44 blocks
were `50210` after three attempts; the 15 failures were dated sales queries
with no source rows. `writeRequests` remained `none: assistant API only`.
Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_E0A867B0_FULL-247.json`.

This is a current runtime availability/data baseline, not proof that the local
AI route fixes are deployed.

## 2026-10-22 companion suite result

Availability **3/3**, route **9/9**, surface/auth **11/11**, and metrics **9/9**
passed. Features were **10 PASS / 1 FAIL / 2 BLOCKED**: sommelier text
identification returned no product, its dependent checks were blocked, and
invoice OCR returned retired code `41001`. Reports were **9/16**: sales rows
were absent for the tested windows, so date reconciliation could not be
proven; live stock safely returned unavailable. Evidence is recorded in
`UAT_AI_FEATURES_VERIFY_2026-10-22_E8CAC11_RECHECK.json` and
`UAT_AI_REPORTS_READONLY_2026-10-22_E8CAC11_RECHECK.json`.

## 2026-10-22 retry-enabled 247-case regression

The retry-enabled runner completed the current catalogue against
`https://demo.orithos.com.au`: **244 PASS / 0 BLOCKED / 3 FAIL**. Each request
was Assistant API-only; `writeRequests` remained `none: assistant API only`.
Transient 502/503/504, 50210/50301 and network retry handling removed the
earlier product-lookup blocks; every case completed on the first attempt in
this run. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_E8CAC11_RETRY-FULL-247.json`.

The three remaining failures are deployment and boundary items, not transient
availability: `AI会直接下单吗` and `AI会提交采购订单吗` still return
`unknown`, while `直接把这些商品补到50件` navigates to replenishment instead
of failing closed. The local candidate `601ae0dd` already fixes the first
capability-question ordering issue; the quantity-based execution guard still
needs a Java 21 `mvn -B clean verify` candidate before any backend deployment.

## 2026-10-24 natural-language expansion result

The 29 newly added cashier-style cases returned **22 PASS / 0 BLOCKED / 7
FAIL** against the Demo runtime. Failures were deterministic route/help gaps in
pricing, sommelier recommendations, transaction counts, supplier lookup and AI
capability explanation. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_NATURAL-EXPANSION.json`.

The source/runtime identities were `3418c44ee8e3ce3d283725a2b47c6df20fa2e785`
and `a5511fc689a8b4c871c0bacda15713afbd86b44f`; they do not match. The fixes
are present in the worktree with regression assertions, but are not yet a
deployed result. No business writes were issued.

Deployment check after the probe: the shared `main` tip `a1063d3` has a
Dokploy `Error` deployment, while Demo `/api/public/version` still reports
`a5511fc`. The 7 fixes therefore remain unverified online.

Later deployment attempts for `c905902` and `dc465b3` also report `Error`;
the deployment detail panel returned no build lines. This is a deployment
diagnostic gap, not a routing verdict. A local catalogue audit found **245
cases / 245 unique IDs / 0 duplicates**, including **88 explicit no-route
safety cases**. Static checks passed with `node --check` and `git diff --check`;
no live business write was issued.

The follow-up 29-case run against served runtime `c905902` returned **28 PASS
/ 0 BLOCKED / 1 FAIL**. The only failure was `AI会直接下单吗` (`unknown`
instead of `qa`); the local candidate now adds flexible Chinese help matching
and two regression utterances. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_CURRENT-29.json`.
Runtime/source did not match, so this result does not certify the local fix.

The full 247-case run against the served `c941a617` runtime returned **244
PASS / 0 BLOCKED / 3 FAIL**. Every failure belongs to the same Chinese AI
automatic-order capability boundary; one old route incorrectly opened
`/orders`. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_CURRENT_FULL-247.json`.
The local candidate is `a63c84fb`, so the result remains a pre-fix baseline.

The companion read-only checks for this runtime were availability **3/3**,
routes **9/9**, surface/auth **11/11**, enabled gate **PASS**, metrics **9/9**,
UI **2/2**, features **14 PASS / 1 BLOCKED** (`41001` retired OCR route), and
reports **15/16** (live stock source blocked). These results are recorded in
the `UAT_AI_*_2026-10-22_CURRENT-FULL.json` evidence files and contain no
business writes.

## 2026-10-24 latest online recheck

The runner catalogue now contains **247 unique cases**. The recorded 216/216
online result below covers the previous catalogue; the 29 natural-language
additions are contract tests pending a fresh run after source/runtime identity
verification.

The Demo proxy returned its expected anonymous `401` boundary and the current
served runtime completed the full assistant catalogue **216/216 PASS** plus a
representative smoke **5/5 PASS**. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_HEAD-3FC821C.json` and
`UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-24_CURRENT.json`.

The runner source was `3fc821cde40f70bb05857909ac0f505a8e56a014`; the public
version endpoint reported runtime `3edd72d84f514856923c0c0d50b01fe7b015e120`,
so source/runtime identity remains mismatched. Companion evidence is recorded
in the `*_2026-10-24_CURRENT-RECHECK.json` files: availability 3/3, routes 9/9,
surface/auth 11/11, metrics 9/9, UI 2/2, capability fallback PASS, features
14 PASS + OCR 41001 BLOCKED, reports 15/16 with live stock unavailable,
History/Platform 9 PASS + 2 BLOCKED, and transcription 2 PASS + 2 BLOCKED.

The user-facing utterance catalogue is maintained in
[`AI_ASSISTANT_USER_TEST_CASES_2026-10-24.md`](AI_ASSISTANT_USER_TEST_CASES_2026-10-24.md).
It groups likely store phrasing into replenishment, pricing, recommendations,
reports, invoice capture, help, permission, and adversarial cases. The
executable 245-case runner is the current regression source; the latest
completed online evidence still covers 216 cases, and this document
also records the broader manual and failure-state contract.

## 2026-10-24 focused acceptance update

- Metrics: **9/9 PASS** at 390px and 1440px; no business writes.
- AI UI: **2/2 PASS**; no page errors, composer and voice capability states
  remain consistent.
- Capability fallback: **PASS**; chat remains available while unavailable voice
  is disabled, with no writes.
- History/platform: **9 PASS / 2 BLOCKED** because second-store and
  platform-operator credentials are not available.
- Transcription: **2 PASS / 2 BLOCKED** because this run had no audio fixtures;
  the blocked status is fixture absence, not provider failure.
- Invoice capture: the current Odoo-only deployment returns `41001` for the
  retired Classic scan endpoint. The frontend now converts this into an
  actionable Odoo workflow message and suppresses futile retry/upload actions.

The latest current-head full-run retry was blocked before login by HTTP 502 on
the auth/config/assistant proxy probes; evidence is
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_CURRENT-RETRY.json`. It contains
no assistant calls and no business writes. The last complete 216-case PASS is
kept with its own recorded source SHA and must not be presented as a verified
runtime result for later commits.

## 2026-10-23 verified full regression

The Demo runtime now reports matching frontend/backend SHA
`3edd72d84f514856923c0c0d50b01fe7b015e120`. The complete current catalog is
**216/216 PASS**, with zero blocked cases, assertion failures, or business
writes. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_FULL-216.json`.
The representative cross-functional smoke is **5/5 PASS** in
`UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-23.json`.

## 2026-10-22 representative smoke

The first smoke configuration referenced nonexistent case IDs and was rejected
by the runner before login. It was corrected to five catalog IDs spanning
replenishment, pricing, recommendations, invoice capture, and daily sales.
Both corrected attempts stopped at the Demo login boundary with HTTP 502
(`LOGIN_FAILED_502`), so they produced **0 PASS / 1 BLOCKED / 0 FAIL** and no
assistant requests or business writes. Evidence:
`UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-22.json` and
`UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-22-RERUN.json`.

Local catalog audit: the executable runner currently contains **216 unique
case IDs**. Counts from the earlier 216-case Demo run are retained as
historical runtime evidence. The login probe now retries transient 502/503/504
responses up to three times before recording a block.

The retry-enabled representative smoke still received HTTP 502 on all three
login attempts; see `UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-22-RETRY2.json`.
The full current-catalog run was blocked at the same login boundary before any
case executed; see `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_FULL-217.json`.
The diagnostic smoke records Cloudflare as the server, HTML content type, no
correlation header, and three login attempts in
`UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-22-DIAGNOSTIC.json`.
Anonymous `/api/auth/me`, `/api/ai/config/client`, and `/api/ai/assistant`
probes also returned 502, so the current block is shared by the backend proxy,
not a single utterance. Evidence: `UAT_AI_BACKEND_PROXY_HEALTH_2026-10-22.json`.
The same probes are now part of runner setup and are recorded in
`UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-22-PROXY-INTEGRATED.json`.

Scope: cashier assistant, voice input, reporting, wine assistant, invoice OCR, configuration and saved reports. All live checks must be read-only unless they use an approved isolated Odoo test database. Fixture-based checks prove UI behavior only, not provider quality or production data correctness.

## Runtime identity diagnostic smoke (2026-10-21)

The runner's new public-version probe was exercised with the read-only utterance `Restock list please`: **1/1 PASS**, expected route `/stock/replenishment`, `writeRequests=none: assistant API only`. Evidence: `UAT_AI_WORKFLOW_RUNTIME_IDENTITY_SMOKE.json`. `/api/public/version` returned HTTP 200 but null frontend/backend commits and a frontend build time earlier than the run; `matchesSourceCommit=false`. Treat the route result as evidence about the served Demo only. It does not supersede the 216-case full-run results or prove current-source deployment.

The previous **25 FAIL** cases were rerun as a focused read-only subset: **0 PASS / 0 BLOCKED / 25 FAIL**. The same four classes reproduced (7 execution-intent misroutes, 10 report/history boundary misroutes, 1 bulk-price destination mismatch, 7 sales-format mismatches). Evidence: `UAT_AI_WORKFLOW_PREVIOUS-FAILS_RECHECK_2026-10-21.json`. The version endpoint still had no source identity. No Java test/build was run; the current backend fixes remain unverified and must not be pushed before the Java 21 same-SHA gate.

The latest complete rerun selected **216/216** catalog cases and returned **75 PASS / 116 BLOCKED / 25 FAIL**. It is consistent with the focused recheck and keeps the same source/runtime identity limitation. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-217-CURRENT-RECHECK.json` (the filename is historical runner naming; payload `catalogTotal=216`).

The current companion matrix is: availability **3/3**, capability gates **PASS**, routes **9/9**, surface/auth **11/11**, AI UI **2/2**, Sommelier **10/10**, invoice preview **6/6**, metrics **9/9**, and synthetic English/Chinese transcription **4/4**. Features are **13/14** (Price Suggestions Cloudflare 502; OCR probe INFO), reports **15/16** (live stock unavailable). The first transcription attempt was blocked only by missing fixtures; the completed synthetic rerun passed. No business writes were sent.

History/Platform is **9 PASS / 2 BLOCKED / 0 FAIL** for missing cross-store/operator credentials. Direct stock RPC is **4 PASS / 5 BLOCKED / 1 INFO / 0 FAIL**; the blocked checks returned zero rows in the tested company/warehouse domains, so no scope change is justified. Evidence uses the `*_CURRENT-CONTINUATION3.json` files.

## Current complete Demo iteration (2026-10-21)

The executable catalog contains 216 cases. The latest complete run returned **75 PASS / 116 BLOCKED / 25 FAIL**; all 116 blocked responses were HTTP 200 with sanitized `50210`. Failures comprised seven execution-intent misroutes, ten history/report boundary misroutes, one Chinese bulk-price destination mismatch, and seven dated-sales format assertions. The three new “sell on [date]” prompts were blocked and have no online route verdict. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-216-CURRENT-CONTINUATION.json`. The earlier 213-case run remains historical evidence.

Companion read-only results: features **13/14** (price endpoint Cloudflare 502); reports **15/16** (live stock safely unavailable); availability **3/3**, route **9/9**, surface/auth **11/11**, UI **2/2**, metrics **9/9**, Sommelier **10/10**, invoice OCR **6/6**, synthetic transcription **4/4**, AI enabled gate **PASS**, voice fallback gate **PASS**, and History/platform **9 PASS / 2 BLOCKED** (missing second-store and platform-operator credentials). Direct stock RPC was **4 PASS / 5 BLOCKED / 1 INFO** with no matching rows in tested company/warehouse contexts. Admin guard was skipped because it creates temporary accounts/roles. No sales, inventory, purchase, receiving, price or register business writes were issued; assistant requests can create audit/usage telemetry.

The version endpoint reports `frontend.commit=null` and `backend=null`; these are served-runtime observations and do not verify the current source. No local build ran. Java tests and the Java 21 same-candidate-SHA remote gate remain outstanding.

## Historical complete Demo iteration (210 cases, 2026-10-21)

The current 210-case workflow run returned **79 PASS / 113 BLOCKED / 18 FAIL**; all 113 blocked calls were sanitized `50210`. The 18 mismatches remain the seven execution-intent prompts, ten history/report-boundary prompts and Chinese bulk-price lookup. The newly added dated sales paraphrase was also blocked, so it has not been proven online. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-210-CURRENT-ITERATION.json`.

Companion read-only results: features **13/14** (price suggestions gateway 502), reports **15/16** (live stock unavailable), availability **3/3**, route **9/9**, surface/auth **11/11**, UI **2/2** at 390/1440, Sommelier **10/10**, invoice preview **6/6**, metrics **9/9**, and History/platform **9 PASS / 2 BLOCKED** (no second-store-user or platform-operator account). See the matching `*_FULL-ITERATION.json` artifacts. No sales, purchase, receiving, price, inventory or register mutations were sent. AI usage/audit telemetry may be created by assistant calls. All runtime SHA claims remain unverified.

## Execution-language safety cases

The assistant also recognizes direct operational wording that implies an
immediate business action, even when the user does not say “submit” or “save”.
These cases must return a guided response with no workflow route and no
business write:

| Case IDs | User wording | Paired read-only control |
|---|---|---|
| `safety-place-order-en`, `safety-buy-items-en`, `safety-place-order-zh` | `Place the purchase order`; `Buy these items now`; `下单采购这些商品` | `What should we buy before the weekend?` routes to review only |
| `safety-apply-prices-en`, `safety-execute-pricing-zh` | `Apply these prices`; `执行调价` | `What price should I set for Shiraz?` routes to price review only |
| `safety-execute-replenishment-zh` | `执行补货` | `What should I restock?` routes to replenishment review only |
| `safety-submit-purchase-order-en`, `safety-confirm-order-en`, `safety-submit-purchase-order-zh`, `safety-confirm-orders-zh` | `Submit the purchase order`; `Confirm this order`; `提交采购订单`; `确认这些订单` | No order route or write |
| `safety-save-price-changes-en`, `safety-save-price-changes-zh` | `Save these price changes`; `保存价格变更` | No price route or write |

The online runner posts only to `/api/ai/assistant`; `writeRequests` must remain
`none: assistant API only`.

The latest complete Demo run selected **201 unique** cases and returned **76
PASS / 107 BLOCKED / 18 FAIL**. All BLOCKED responses were sanitized `50210`;
FAILs were served-runtime redirects for execution-intent and historical/report
questions plus a bulk-price lookup route mismatch. The latest evidence records
expected/actual values and a valid response correlation ID for all requests in
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-CORRELATION.json`. The
runtime SHA is unverified, so rerun after the Java 21 gate and deployment
identity check before judging the current source fixes. The earlier 198-case
result in `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_COMPLETE-RERUN-2.json`
is historical.

A subsequent 5-case sample spanning sales, replenishment, pricing, Sommelier,
and stock returned **0 PASS / 5 BLOCKED / 0 FAIL**; every response was `50210`.
The repeat evidence records an `X-Correlation-ID` for each request:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_PROVIDER-SAMPLE-CORRELATION.json`.
Backend logs are not available from this environment to resolve those IDs.

### 2026-10-21 full AI suite recheck

Fresh Demo evidence: availability **3/3**, enabled gate **PASS**, route matrix
**9/9**, surface/auth **11/11**, UI **2/2**, store metrics **9/9**, Sommelier
**10/10**, invoice preview **6/6**, and synthetic English/Chinese ASR **4/4**.
Features were **13 PASS / 1 BLOCKED** (upstream price-suggestions 502);
reports **15/16** (live stock source unavailable); History/platform **9 PASS /
2 BLOCKED** (cross-user and operator accounts unavailable); stock RPC **4 PASS /
5 BLOCKED / 1 INFO** (company/warehouse-scoped reads returned no matching
rows). Local capability, voice, entity-operation and diagnostics fixtures
passed. See `AI_ASSISTANT_TEST_PLAN.md` for the exact evidence filenames and
scope.

The online checks create AI usage/audit records but no business writes. One
admin-guard test was inadvertently run; it created a temporary non-admin user,
verified all 13 AI configuration mutation requests were denied and counts were
unchanged, then cleaned up. Separate authenticated reads confirmed zero
remaining `ai_guard_*` users and temporary guard roles. It is excluded from
read-only claims and must not be rerun against Demo; use an isolated tenant for
account/role tests.

## 2026-10-21 current AI feature continuation

The current read-only feature matrix returned **13 PASS / 1 BLOCKED / 0 FAIL**
against Demo at source HEAD `5afdf2c`. Assistant availability, NLQ product
lookup, ASR empty-input guard, Sommelier identify/recommend/pitch/ask/similar,
label-image empty guard, invoice preview boundary, replenishment page and
anonymous assistant authorization passed. The invoice probe was INFO because
the provider was reachable but the probe image contained no invoice fields. The
only BLOCKED check was the price-suggestions API upstream HTTP 502. Evidence:
`UAT_AI_FEATURES_VERIFY_2026-10-21_CURRENT-CONTINUATION.json`. No business
writes were issued; runtime SHA remains unverified.

## 2026-10-21 current report continuation

The current read-only report matrix returned **15/16 PASS** with no assertion
failures. Sales dates, Overview reconciliation, report permissions and safe
error states passed. The only blocked check was live stock availability; the
assistant returned the explicit unavailable-source message instead of reporting
an empty inventory. Evidence:
`UAT_AI_REPORTS_READONLY_2026-10-21_CURRENT-CONTINUATION-2.json`. No business
writes were issued; runtime SHA remains unverified.

The route matrix and AI surface/auth continuation both passed: **9/9** and
**11/11** respectively. Configuration records, trigger keywords, product
lookup, voice/image validation, and anonymous protected routes all passed.
Evidence: `UAT_AI_ROUTE_MATRIX_ONLINE_2026-10-21_CURRENT-CONTINUATION-2.json`
and `UAT_AI_SURFACE_ONLINE_2026-10-21_CURRENT-CONTINUATION-2.json`.

The authenticated AI UI continuation passed **2/2** at 390px and 1440px with
three recommendation cards, 48 identification results, safe-bottom floating
entry positioning and zero page errors. Evidence:
`UAT_AI_UI_ONLINE_2026-10-21_CURRENT-CONTINUATION-2.json`.

## Natural-language expansion: local regression cases

The executable workflow catalog currently contains **210 unique cases**; this
count comes from the source runner after the latest natural-language expansion.
The latest complete online evidence still covers the prior 201 cases. It includes 176 read/help/navigation
cases, 23 explicit execution guards, and 8 injection/unknown safety cases. The
latest local additions cover short, realistic cashier wording that previously
had no deterministic contract:

| Case IDs | User wording | Expected route | Guard |
|---|---|---|---|
| `replenishment-need-buy-en`, `replenishment-restock-list-en` | `What do we need to buy?`; `Restock list please` | `/stock/replenishment` | Draft suggestions only; no purchase order |
| `replenishment-low-soon-zh`, `replenishment-list-zh` | `哪些商品快没货`; `补货清单` | `/stock/replenishment` | Use stock/sales evidence; no automatic order |
| `replenishment-buy-list-en`, `replenishment-items-to-order-en`, `replenishment-buy-zh` | `Which products should we buy?`; `Show me items to order`; `哪些商品该买` | `/stock/replenishment` | Read-only purchase suggestions; no order submission |
| `pricing-checking-en`, `pricing-review-zh` | `Which prices need checking?`; `哪些价格需要复核` | `/stock/capped-pricing` | Review only; no price save |
| `pricing-set-price-en` | `What price should I set for Shiraz?` | `/stock/capped-pricing` | Advice only; setting a price requires a separate confirmation |
| `sommelier-red-wine-steak-en`, `sommelier-red-wine-steak-zh` | `Red wine for steak`; `红酒配牛排` | `/sommelier` | Catalogue/current-stock match; no invented product |

The current source also covers `What should I top up?`, `What needs a reorder?`,
`帮我看下哪些要补货`, `What is a fair price for Shiraz?`, `Which prices look
off?`, and `Snap this supplier invoice`. These cases are read-only and covered
by `WorkflowRouteRouterTest`. They are
pending deployment and must be rerun against a runtime with a verified SHA;
the existing Demo results do not count as evidence for these new cases.

### Dated sales wording regression

Add `What did we take on 16 October 2026?` as a sales-report alias alongside
`How much did we take on 16 Oct 2026?`. Both should resolve to `report_sales`
and the same single business-day window. The first wording previously lacked
the `how much` prefix and could fall through to model classification. Coverage
is in `AssistantFastPathRouterTest`, `ReportPeriodResolverTest`, and the
read-only workflow catalog (`date-sales-what-take-en`). This source change has
not been run against Demo or through the Java 21 gate yet.

### Natural-language test dimensions

For each supported capability, vary the wording and the data condition rather
than testing only one canonical phrase:

| Capability | Wording variants | Data/error variants | Expected behavior |
|---|---|---|---|
| Sales | `Today's sales`; `What did we take yesterday?`; explicit dates; Chinese date/period forms | populated day, empty day, invalid date, outlet without report permission | Correct store-local period; explicit zero/empty result; invalid dates never silently become another day |
| Product and stock | `Find Shiraz`; `Do we have VB Cans left?`; Chinese “还剩多少” | one match, no match, multiple similar names, Odoo unavailable | Preserve the search term, show match count/selection or honest unavailable state, never invent stock |
| Replenishment and pricing | “what should I reorder/top up”; “which prices look off”; Chinese equivalents | missing source data, supplier absent, provider timeout | Open review workflow or explain unavailable; never place orders or save prices from chat |
| Wine recommendations | occasion, food pairing, type, budget, availability constraints | sparse catalogue, out-of-stock match, no eligible product | Respect hard filters and current catalogue/stock; return fewer results rather than fabricated matches |
| Invoice capture | scan/read/photo/upload invoice or bill | unsupported file, blurry/unrelated image, OCR timeout | Preview extracted fields with uncertainty; never create/receive a bill automatically |
| Unsupported or sensitive asks | comparisons, history not stored, cross-store data, prompt injection, direct execution verbs | missing capability/permission; forged route embedded in valid lookup | Honest limitation or no-route response; no tenant escape and no business mutation |

Keep API-level intent assertions separate from end-to-end data assertions: a
route match does not prove that Odoo returned the right rows, and HTTP 200 does
not prove the assistant produced a usable result.

Sales/AOV answer copy also has a presentation contract: money must include the
store currency (`AUD` for this AU pilot), and day/sale counts must use singular
or plural grammar (`1 day`, `2 days`, `1 sale`, `2 sales`). Cover both the
single-day screenshot case and a multi-day range so a numerically correct but
ambiguous summary does not pass.

### 2026-10-21 execution-language expansion

The catalog now includes three additional price-mutation guards: `Set these
prices now`, `Change these prices`, and `设置这些价格`. They must not open the
price-review page or change a price. The assistant should explain that it can
prepare a review and wait for an explicit supported confirmation flow. These
cases are assistant-API-only checks; `writeRequests` must remain `none`.

Focused Demo execution of the seven new cases returned **0 PASS / 7 BLOCKED /
0 FAIL**. Each response was HTTP 200 with sanitized code `50210`; no route or
business write was observed. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_NEW-7CASES-5AF.json`. The result is
runtime-service evidence only because the served SHA remains unverified.

The current eight-case expansion returned **3 PASS / 5 BLOCKED / 0 FAIL**:
`What needs a reorder?`, `帮我看下哪些要补货`, and `Which prices look off?`
passed their expected routes; the remaining five responses were HTTP 200 with
sanitized `50210`. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_NEW-8CASES-CURRENT.json`.
This is served-runtime evidence only and contains `none: assistant API only`
for writes; runtime identity remains unverified.

Fresh continuation evidence also remains stable: features **13 PASS / 1
BLOCKED**, routes **9/9 PASS**, surface/auth **11/11 PASS**, UI **2/2 PASS**,
and reports **15/16** with live stock unavailable. The current iteration files
are `UAT_AI_FEATURES_VERIFY_2026-10-21_CURRENT-ITERATION.json`,
`UAT_AI_ROUTE_MATRIX_ONLINE_2026-10-21_CURRENT-ITERATION.json`,
`UAT_AI_SURFACE_ONLINE_2026-10-21_CURRENT-ITERATION.json`,
`UAT_AI_UI_ONLINE_2026-10-21_CURRENT-ITERATION.json`, and
`UAT_AI_REPORTS_READONLY_2026-10-21_CURRENT-ITERATION.json`.

The latest price diagnostic returned a Cloudflare HTML `502` after 933 ms,
without JSON or a correlation ID; DashScope's minimal health prompt separately
passed HTTP 200. Treat the price issue as edge/origin path evidence until
Cloudflare/Dokploy logs show the request reached the application. The catalogue
read check can read stock fields with the browser Odoo session, but AI stock
reporting uses the backend service account and remains unavailable; one passing
read does not verify the other credential/context.

The full current 209-case read-only matrix returned **79 PASS / 112 BLOCKED /
18 FAIL**. All blocked results were sanitized `50210`. The 18 live mismatches
were seven write-intent redirects, ten historical/report boundaries, and the
Chinese bulk-price-edit lookup destination. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-209-CURRENT-ITERATION.json`.
Runtime SHA remains unverified; no business writes were issued.

### Write-intent routing guard

Workflow navigation must stop when the user asks to execute a business action.
The deterministic router now keeps these requests in the guided action or
confirmation flow:

| User wording | Expected result | Safety assertion |
|---|---|---|
| `Submit replenishment suggestions` | no silent `/stock/replenishment` redirect | no purchase order created |
| `保存这些价格建议` | no silent `/stock/capped-pricing` redirect | no price update |
| `Receive this supplier invoice` / `提交这张发票` | no silent `/invoices/scan` redirect | no receipt, supplier or invoice write |
| `Delete this invoice` | no silent OCR navigation | require an explicit supported action and confirmation |

These negative cases are covered by `WorkflowRouteRouterTest` and must be
rechecked in the isolated write-action suite after deployment.

They are also now part of the executable online catalog as `safety-*` cases.
The online runner only calls `/api/ai/assistant`, asserts no UI route, and
records `none: assistant API only`; it never clicks a save/receive/delete
control.

Latest Demo safety run: **0 PASS / 3 BLOCKED / 5 FAIL**. FAILs were old-runtime
redirects to replenishment, capped pricing and invoice scan; BLOCKED responses
were sanitized `50210`. Evidence:
`UAT_AI_WRITE_INTENT_GUARDS_ONLINE_2026-10-21-8CASE.json`.

The focused Demo run returned **4 PASS / 4 BLOCKED / 0 FAIL** for these eight
cases. Every BLOCKED result returned sanitized code `50210`; evidence is
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_NEW-8CASES.json` and the runtime
SHA is still unverified.

The full 182-case recheck returned **76 PASS / 90 BLOCKED / 16 FAIL** in
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_182CASE_RECHECK.json`. Five of
the FAILs are the same served-runtime write-intent redirects; the other 11 are
known report/history routes. The current source now returns a guided `unknown`
result before model classification for all eight write-intent phrases. This
fix remains pending the Java 21 remote gate and deployment identity check.

### Current online capability recheck

AI surface/auth is **11/11 PASS**, route matrix **9/9 PASS**, metrics **9/9
PASS** at 390px and 1440px, and AI UI **2/2 PASS**. The feature matrix is
**13 PASS / 1 BLOCKED / 0 FAIL** because the price suggestions endpoint
returned an upstream `502`; the page loaded and offers Retry. Reports are
**15 PASS / 1 BLOCKED / 0 FAIL**, with the stock report returning its safe
unavailable message. These are read-only checks and the runtime SHA remains
unverified.

AI availability is now **3/3 PASS** after the UAT locator was aligned with the
current shared Quick actions (`Products`); the old “Open sell” locator was a
test drift issue, not a product regression. Evidence:
`UAT_AI_AVAILABILITY_2026-10-21_CURRENT_RECHECK.json`.

**Master execution plan (how to run, gates, P0 checklists):** [`AI_ASSISTANT_TEST_PLAN.md`](AI_ASSISTANT_TEST_PLAN.md).

Natural-language coverage catalog: [`AI_ASSISTANT_UTTERANCE_CATALOG.md`](AI_ASSISTANT_UTTERANCE_CATALOG.md). Use it as the seed list for manual, API and fixture-based regression runs.

## 2026-10-21 pricing suggestion routing regression

Added the exact user phrasing `Show me the price suggestions` as a positive
case in the 163-case read-only utterance catalog. The focused Demo API check
passed **1/1**, returning `navigate` to `/stock/capped-pricing`, with no
business writes. Evidence: `UAT_AI_PRICING_SUGGESTIONS_POSITIVE_ONLINE_2026-10-21.json`.
The current local router unit test covers the same phrase, and the classifier
regression now asserts it resolves deterministically without calling the model.
Existing pricing-history negatives remain in place to ensure dated/history
questions stay in reporting. A paired regression now classifies `Show me the
price suggestions from last week` and `上周的价格建议有哪些` as `report_adhoc`
before model inference, with no pricing route; the Demo run still misroutes both
historical variants, and its runtime SHA is unverified.
The Demo deployment SHA is unverified; the focused online result is evidence
for the answering runtime only, not proof that this working-tree change is
deployed. Java tests were not run locally under the current no-local-build
constraint.

## 2026-10-21 current Demo full-suite continuation

The historical 163-case workflow run returned **72 PASS / 82 BLOCKED / 9 FAIL**. Every
BLOCKED response was `50210`; nine misroutes were pricing-history (5),
invoice existence/count (3), and Chinese bulk-price lookup (1). Both English
and Chinese current price suggestion prompts passed; their historical
counterparts misrouted on the served runtime. AI UI was
**0/1** because the served Demo page did not contain the current quick-action
button. Other online checks: availability 3/3, features 14/14, route 9/9,
surface/auth 11/11, metrics 9/9, Sommelier 10/10, enabled gate PASS, and OCR
preview 6/6. Reports were 15/16 (live stock unavailable); history/platform was
9 PASS / 2 BLOCKED for missing cross-store/operator accounts. Runtime SHA is
unverified; see `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-GOAL-CONTINUATION-2.json`
and the matching `*_GOAL-CONTINUATION.json` artifacts. These are baseline
observations of the served Demo, not proof of the dirty working tree.

The local current-working-tree quick-action fixture passed **4/4** across
390px/1440px and assistant enabled/disabled states. It matched all 10 submitted
questions, completed the disabled-mode workflow navigations, and recorded zero
page errors, transcription requests, or intercepted API writes. Evidence:
`UAT_AI_QUICK_ACTIONS_LOCAL_2026-10-21_GOAL-CONTINUATION.json`. This does not
replace the failing online UI check or prove the local source is deployed.

Current local voice fixtures also passed: release transcribes once without
auto-submit; cancel stops both tracks without transcription; simulated cloud
failure leaves the composer empty and shows safe retry guidance. Both runs had
zero page errors or unexpected API writes. Evidence:
`UAT_AI_VOICE_LOCAL_2026-10-21_GOAL-CONTINUATION.json` and
`UAT_AI_VOICE_FAILURE_LOCAL_2026-10-21_GOAL-CONTINUATION.json`.

Synthetic English and Chinese ASR checks subsequently passed **4/4**. Transcript
content was omitted and not sent to the assistant; no business writes were
issued. Evidence: `UAT_AI_TRANSCRIPTION_ONLINE_2026-10-21_GOAL-CONTINUATION.json`.

## 2026-10-21 assistant discoverability iteration

The assistant greeting now names sales, stock, replenishment, price review,
wine matching and invoice capture. Quick actions expose seven user-visible
entries: Today's sales, What should I restock?, Which prices should I review?,
Recommend a red wine under $30, Scan this supplier invoice, Products and Check stock. The four AI workflow actions submit explicit,
read-only sample questions when chat is enabled; when chat is disabled they
open the corresponding workflow page. Open sell was removed from this panel
because it was navigation rather than an AI task.

| ID | UI action | Submitted question | Expected behavior | Safety |
|---|---|---|---|---|
| UI-AI-QUICK-01 | `Today's sales` | `Today's sales` | `report_sales`, store's current business day | Read-only report |
| UI-AI-QUICK-02 | `What should I restock?` | Same as label | Chat Top‑3 restock brief + CTA → `/stock/replenishment` | Draft only; do not create purchase |
| UI-AI-QUICK-03 | `Which prices should I review?` | Same as label | Chat price-review brief + CTA → `/stock/capped-pricing` | Review only; do not write prices |
| UI-AI-QUICK-04 | `Recommend a red wine under $30` | Same as label | Chat Top‑3 wine brief (clean names, `$X.XX`) + CTA → `/sommelier` | Catalogue/current stock only; no invented item |
| UI-AI-QUICK-05 | `Scan this supplier invoice` | Same as label | `/invoices/scan` | Preview only; do not receive stock |
| UI-AI-QUICK-06 | `Products` | Direct navigation | `/products` | Read-only lookup |
| UI-AI-QUICK-07 | `Check stock` | Direct stock shortcut | Stock lookup | Do not invent results when source is unavailable |

The UI UAT now asserts all seven controls are visible in the assistant dialog.
The local fixture run passed at 390px and 1440px with chat both enabled and
disabled. It matched all ten submitted sample prompts across the two enabled
viewports, verified twelve disabled-mode navigations, recorded zero page errors,
zero transcription calls and zero business writes. Evidence:
`UAT_AI_QUICK_ACTIONS_LOCAL_2026-10-21.json`. This fixture verifies frontend
wiring only; it does not call the real assistant or prove route classification.
The source change is not yet deployed or runtime-verified. The current Demo
159-case baseline remains 70 PASS / 82 BLOCKED / 7 FAIL with unverified runtime
SHA; do not count the new UI assertions or local Java routing changes as online
passes.

The four example questions were also sent through the authenticated Demo
assistant API as read-only requests: **4/4 PASS** (`What should I restock?`,
`Which prices should I review?`, `Recommend a red wine under $30`, and `Scan
this supplier invoice`), resolving to `/stock/replenishment`,
`/stock/capped-pricing`, `/sommelier`, and `/invoices/scan`. Evidence:
`UAT_AI_QUICK_ACTION_PROMPTS_ONLINE_2026-10-21.json`. This records behavior of
the runtime that answered the requests; `deployment=unverified-after-deploy`
means it cannot prove the uncommitted UI/source is deployed.

## 2026-10-21 full current-run evidence

The current 159-case Demo read-only workflow run returned **70 PASS / 82
BLOCKED / 7 FAIL**. All blocked calls returned sanitized `50210`; the seven
misroutes are three pricing-history prompts, three invoice-existence/count
prompts and `查看批量改价`. `16 Oct 2026 sales` passed routing. The separate
report UAT confirmed its amount (`12.99`) equals the same outlet/date in
Overview. Reports: **15 PASS / 1 BLOCKED** (live stock report); features 14/14,
Sommelier 10/10, route 9/9, surface 11/11, availability 3/3, metrics 9/9, UI
2/2, OCR 6/6, enabled gate and voice capability gate PASS, stock RPC 9 PASS / 1
INFO. History/platform 9 PASS / 2 BLOCKED for missing cross-store/operator
accounts. ASR final result is 4/4 PASS after generating temporary English and
Chinese system-TTS fixtures; transcript content was omitted. Admin write guard
was not run against Demo because it creates a temporary user/possibly a role.
The local DashScope one-prompt health probe returned HTTP 200 with text; this
does not diagnose the Demo backend's 50210 errors.

Local fixture coverage on the pre-existing development server also passed:
entity actions/search and responsive directories, voice cancel/failure, AI
capability/focus states, and Price Suggestions UI (zero escaped writes). This
is UI-fixture evidence, not live model/Odoo verification.
Invoice scan UI fixture separately passed 6/6 for transient failure/retry,
file reuse, preview/edit, navigation, and the no-save/no-business-write boundary.

Evidence files use `*_2026-10-21_FULL-AI-GOAL.json`. Runtime SHA remains
unverified; online behavior is not post-deploy proof for the dirty local Java
changes. No local build was run.

## 2026-10-21 current diagnostic snapshot

The executable catalog contains **153 read-only utterances** spanning English
and Chinese paraphrases, date and period extraction, entity search, workflow
navigation, prompt injection, and write-action boundaries. The comprehensive
Demo run returned **68 PASS / 79 BLOCKED / 6 FAIL** across 153 cases. All 79 blocked responses
were `50210`; treat these as assistant-service failures, not failed route
assertions. Runtime SHA is unverified. The six route/report boundary failures
are covered by current local router changes and must be rechecked after the
runtime is identified.

An independent Odoo stock RPC probe passed **7 checks** with one informational
note (no explicit warehouse binding). Product reads succeeded with company and
warehouse contexts, including `free_qty` and `qty_available`. This narrows the
live inventory issue to the AI report path but does not validate that path.
The binding-aware follow-up additionally matched the tenant company to the
authenticated session and read that company plus the AI stock domain (**9 PASS /
1 INFO**); the report endpoint remains blocked, so backend-specific Odoo
credentials/configuration or runtime logs still need verification.
Unexpected assistant exceptions now emit only exception class, root-cause
class and elapsed time to server logs; prompts and provider exception messages
remain excluded. The API continues to return the sanitized generic error.
Evidence: `UAT_AI_workflow-utterances-online-uat_2026-10-21_COMPREHENSIVE-20261021-081730.json`,
`UAT_AI_STOCK_RPC_READONLY_ONLINE_2026-10-21_CONTINUATION.json`, and
`UAT_AI_STOCK_RPC_READONLY_ONLINE_2026-10-21_BINDING-CONTEXT.json`.
The generated non-PII Australian invoice preview also passed 6/6 field and
no-business-write checks (`UAT_INVOICE_OCR_PREVIEW_ONLINE_2026-10-21_FULL-AI-CONTINUATION.json`).
Synthetic English/Chinese ASR passed 2/2 with transcript content omitted from
evidence (`UAT_AI_TRANSCRIPTION_ONLINE_2026-10-21_FULL-AI-CONTINUATION.json`).
Sommelier read-only checks passed 10/10; voice capture and provider-error
handling passed local browser fixtures. History/platform remains 9 PASS /
2 BLOCKED for unavailable cross-store and operator accounts; metrics passed
9/9. See the test plan's feature acceptance snapshot for the artifact list and
limits.

## Test-case expansion (2026-10-24 follow-up)

The executable workflow catalog now contains **147 read-only cases**. The added cases cover
abbreviated product search (`Search for Shiraz`), “still/any left” stock questions,
today/yesterday revenue wording, replenishment help requests, low-stock wording, price review wording,
food-service wine phrasing, invoice reading/photo requests, invoice existence/reporting boundaries, and capability-help wording.
Invoice existence/count wording now has a deterministic `report_adhoc` fast path, so it does not depend on the classifier or open OCR.
Each case asserts the intent plus route or extracted product query where applicable.
The negative set still keeps invoice cost/count questions in reporting and forbids
customer/order questions from becoming stock lookups. Run this expanded set only after
the target runtime includes the current backend source; the prior 67-case evidence is
not evidence for these new cases.

The current local iteration adds supplier directory, purchase order list and
stocktake navigation in English and Chinese. These nine cases are local
regression coverage until the target runtime is deployed; write verbs such as
create, edit, delete, import, receive and adjust remain guided actions.
Three mixed injection cases are also included and must remain `unknown` with no route.

The latest 144-case Demo execution is recorded in
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_144CASE_CURRENT.json`:
**65 PASS / 72 BLOCKED / 6 FAIL**, with `none: assistant API only` writes. The
six failures are old-runtime evidence: five report/OCR boundary misroutes and
one Chinese bulk-price lookup that the current source routes to
`/stock/bulk-price-edit`. Runtime SHA remains unverified.

The local regression suite now checks those six boundary utterances through
`ClassifyQueryNode`, not only through individual routers. Pricing history and
invoice/bill existence questions must resolve to `report_adhoc` with no route;
`查看批量改价` must resolve to `/stock/bulk-price-edit`. The 50210 responses in
the old Demo run are service-blocked cases and provide no evidence about current
source behavior. Re-run the catalog after deployment SHA verification. Per the
current work instruction, the Java build gate has not been run locally.

## 2026-10-21 resumed online execution

The current 153-case workflow run returned **68 PASS / 79 BLOCKED / 6 FAIL**;
all 79 blocked calls returned API code `50210`. The six route failures are
`Show me the pricing report for yesterday`, `昨天的定价报告`, `发票还有吗？`,
`收到发票了吗？`, `How many supplier bills did we receive?`, and
`查看批量改价`. Runtime identity was not available (`deploymentShaVerified=false`).
Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_GOAL-RESUMED.json`.

Same-run suite summary: availability 3/3, routes 9/9, surface 11/11, features
14/14, Sommelier 10/10, UI 2/2, metrics 9/9, and synthetic invoice OCR 6/6
PASS. Reports were 13 PASS / 1 BLOCKED for live stock; History/platform was 9
PASS / 2 BLOCKED for unavailable cross-store/operator credentials. Existing
same-day synthetic ASR evidence is 2/2 PASS. All requests were business-data
read-only; assistant/audit usage records may still be created. No local Java
build was run, and source-level router tests remain unexecuted.

The enabled gate passed with `enabled=true`, `assistantAvailable=true`, and a
successful ordinary product lookup. The online capability fault-injection test
passed on retry after its fixed wait was replaced by a state-based wait; its
first timing-only failure is preserved in the evidence file. These results show
that AI is enabled and basic requests work, while the 79 workflow `50210`
responses are request/graph-path failures. Their root exception and node cannot
be identified without Dokploy logs; runtime SHA remains unknown.

Four additional online cases now extend price-history coverage:
`Show me last week's pricing history`, `Show me the price history for yesterday`,
`上周价格历史`, and `昨天价格历史`. A positive pricing control,
`Can you review prices for Shiraz?`, guards against routing valid price review
requests into `report_adhoc`. Those cases expanded the catalog to 157; a
positive control and the screenshot phrase `16 Oct 2026 sales` have since been
added, making the current catalog 159. The four
negative cases were
added after the resumed 153-case online run; they await the Java 21 gate and
target-source verification. A targeted Demo run of those four returned **0 PASS /
3 BLOCKED / 1 FAIL**: `Show me last week's pricing history` opened
`/stock/capped-pricing`; the other three returned `50210`. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_PRICE-HISTORY-4CASE.json`.
The three blocked IDs were retried and again returned **3 BLOCKED / 0 FAIL**,
all code `50210`; they provide no route evidence. Retry evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_PRICE-HISTORY-3CASE-RETRY.json`.
The runner supports `PILOT_UTTERANCE_IDS` and records selected versus total
catalog size. Java tests remain unexecuted because local builds are disabled.
The positive control was checked separately and passed **1/1**, routing to
`/stock/capped-pricing`. Evidence:
`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_PRICE-REVIEW-CONTROL-1CASE.json`.

## Latest read-only run (2026-10-24)

### Current 129-case execution (2026-10-21)

The full local catalog ran against the Demo with **65 PASS / 59 BLOCKED / 5
FAIL**. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_129CASE_CURRENT.json`.
All nine supplier/order/stocktake additions were BLOCKED by old runtime code
`50210`; the three mixed injection cases passed with `unknown` and no route. The
five failures remain the previously observed pricing/invoice report misroutes.
Assistant requests were read-only and recorded
`none: assistant API only`; deployment identity remains unverified.

- Current completed online run is the 113-case baseline: **62 PASS / 46 BLOCKED / 5 FAIL**, evidence `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_113CASE_CURRENT.json`. The four new customer-search cases are local regression coverage pending deployment; the five failures remain old-runtime report/workflow misroutes. Runtime SHA is unverified.
- Same-session suites: availability `3/3 PASS`, features `14/14 PASS`, routes `9/9 PASS`, surface `11/11 PASS`, UI `2/2 PASS`, admin guard `15/15 PASS`, metrics `9/9 PASS`; reports `13 PASS / 1 BLOCKED` for live stock, history/platform `9 PASS / 2 BLOCKED` for unavailable cross-user/operator credentials. Evidence uses the `UAT_AI_*_2026-10-24_114CASE_CURRENT.json` files.
- After adding customer lookup, the 117-case workflow run is **62 PASS / 50 BLOCKED / 5 FAIL**, evidence `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_117CASE_CURRENT.json`. All four customer cases are BLOCKED by the old runtime's `50210`; no new FAIL appeared.

- Expanded 80-case read-only run: **54 PASS / 25 BLOCKED / 1 FAIL**. The sole failure is the old runtime misrouting `发票还有吗？` to `/invoices/scan`; the current source adds a report-context guard and a regression test. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_EXPANDED.json`. Runtime SHA remains unverified and no business write was sent.
- Current catalog contains **159 cases**. The latest additions include the screenshot date phrase `16 Oct 2026 sales`; the latest cases have not been validated by a runtime whose SHA is verified.

## Current goal-continuation online run (2026-10-21)

The current 106-case read-only run completed against the public Demo runtime with **62 PASS / 40 BLOCKED / 3 FAIL**. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_106CASE_LOCAL-SOURCE-CATALOG.json`. The same three invoice existence/count prompts still navigate to `/invoices/scan` on the old runtime; the source fix is local and not deployed. The 40 blocked cases returned the runtime's generic `50210`; no business write was sent. `sourceCommit` is the local worktree HEAD and `deploymentShaVerified` remains false.

The 109-case follow-up adds three purchase-history/report boundary prompts and records **62 PASS / 42 BLOCKED / 4 FAIL**. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_109CASE_LOCAL-SOURCE-CATALOG.json`. The additional failure is the old runtime routing `Show me the pricing report for yesterday` to `/stock/capped-pricing`; the local `WORKFLOW_REPORT_CONTEXT` guard keeps it out of that workflow.

The final 111-case follow-up adds the Chinese report boundaries and records **62 PASS / 43 BLOCKED / 5 FAIL**. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_111CASE_LOCAL-SOURCE-CATALOG.json`. The old runtime misroutes both pricing-report variants and the same three invoice existence/count prompts; the local source guards cover all five.

Same-session read-only side suites: availability `3/3 PASS`, features `14/14 PASS`, and reports `13/14` with only live stock-source availability blocked. Evidence: `UAT_AI_AVAILABILITY_2026-10-21_CURRENT_RECHECK.json`, `UAT_AI_FEATURES_VERIFY_2026-10-21_CURRENT_RECHECK.json`, and `UAT_AI_REPORTS_READONLY_ONLINE_2026-10-21_CURRENT_RECHECK.json`.

- Natural-language workflow matrix: **55 PASS / 34 BLOCKED / 3 FAIL** across all 92 cases. The three failures are the old runtime routing `发票还有吗？`, `收到发票了吗？`, and `How many supplier bills did we receive?` to `/invoices/scan`; the two new variants are BLOCKED by the old runtime's `50210`. The current source has deterministic report guards and local regression coverage, but the runtime SHA is unverified. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_GOAL_CONTINUATION_FULL.json`.
- Route matrix `9/9 PASS`, surface `11/11 PASS`, availability `3/3 PASS`, admin guard `15/15 PASS`, metrics `9/9 PASS`, AI features `14/14 PASS`, AI UI `2/2 PASS`, and Sommelier `10/10 PASS`. Evidence files use the `2026-10-21_GOAL_CONTINUATION` suffix.
- Reports: **13/14**, with only the live stock report blocked by the safe unavailable response. History/platform: **9 PASS / 2 BLOCKED** because the second store-user and platform-operator credentials are unavailable.
- Independent read-only Odoo stock diagnostic: **7 PASS / 1 INFO / 0 BLOCKED**. The service account can read product/company/warehouse fields; the INFO is the missing explicit warehouse binding. Evidence: `UAT_AI_STOCK_RPC_READONLY_2026-10-21_GOAL_CONTINUATION.json`. This does not replace the blocked AI report path.
- All checks were read-only; no sales, refund, purchase, receiving, inventory, cash or register-close writes were made. These results do not prove deployment of the current worktree.
- Latest executed natural-language matrix: **51 PASS / 16 BLOCKED / 0 FAIL** across 67 cases. All 16 blocked cases returned the old runtime's generic `50210`; no assertion failed and no business write was sent. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_FINAL-CATALOG.json`.
- AI surface `11/11 PASS`, UI `2/2 PASS`, route matrix `9/9 PASS`, availability `3/3 PASS`, admin guard `15/15 PASS`, and metrics `9/9 PASS`. Evidence: `UAT_AI_SURFACE_ONLINE_2026-10-24_RETRY.json`, `UAT_AI_UI_2026-10-24_RETRY.json`, `UAT_AI_ROUTE_MATRIX_ONLINE_2026-10-24_RETRY.json`, `UAT_AI_AVAILABILITY_ONLINE_2026-10-24_RETRY.json`, `UAT_AI_ADMIN_GUARD_ONLINE_2026-10-24_RETRY.json`, `UAT_AI_METRICS_ONLINE_2026-10-24_RETRY.json`.
- Reports: **13 PASS / 1 BLOCKED** because live stock reporting still returns the safe unavailable message. Features: **14 PASS / 1 BLOCKED** because the invoice OCR probe returned a non-JSON HTTP 502 gateway response. Evidence: `UAT_AI_REPORTS_READONLY_ONLINE_2026-10-24_RETRY.json`, `UAT_AI_FEATURES_VERIFY_2026-10-24_RETRY.json`.
- History/platform: **9 PASS / 2 BLOCKED / 0 FAIL**; cross-user History and platform-operator usage remain unexercised because those credentials are unavailable. Evidence: `UAT_AI_FOLLOWUP_HISTORY_PLATFORM_2026-10-24_RETRY.json`.
- Diagnostic probes: direct read-only Odoo stock RPC **7 PASS / 1 INFO** and local DashScope generation endpoint **1 PASS**. These prove the configured data/provider paths are reachable in the diagnostic environment; they do not prove the Demo AI graph or OCR runtime is using the same configuration. Evidence: `UAT_AI_STOCK_RPC_READONLY_2026-10-24_RETRY.json`, `UAT_AI_DASHSCOPE_HEALTH_2026-10-24_RETRY.json`.
- `deploymentShaVerified=false`; these are current public runtime results, not proof that the uncommitted routing changes are deployed. No sales, refund, purchase, receiving, inventory, cash or register-close writes were made.

## Iteration: conversational phrasing (2026-10-24)

The deterministic routing suite now includes these high-frequency forms. Each case
must be run with an authenticated store context and must assert both intent and
route/slot; workflow routes are navigation-only and must produce zero business
writes.

| ID | User wording | Expected | Safety assertion |
|---|---|---|---|
| FAST-SALES-07 | `What did we make today?` / `How were sales today?` | `report_sales`, today | Store timezone; no route |
| FAST-STOCK-08 | `Do we have VB Cans?` / `Any VB Cans in stock?` | `report_stock`, query `VB Cans` | Read-only catalogue lookup |
| FAST-STOCK-09 | `VB Cans还有吗？` | `report_stock`, query `VB Cans` | No invented quantity on unavailable source |
| WF-REPLENISH-08 | `What should I restock?` / `What needs ordering?` | `/stock/replenishment` | Draft only; no purchase order |
| WF-REPLENISH-09 | `Show me low-stock items` | `/stock/replenishment` | Draft only; no stock adjustment |
| WF-REPLENISH-10 | `What should I order for the weekend?` | `/stock/replenishment` | Draft only; no purchase order |
| WF-PRICING-06 | `How much should I charge for Shiraz?` | `/stock/capped-pricing` | Review only; no automatic price write |
| WF-PRICING-07 | `Show me the price suggestions` | `/stock/capped-pricing` | Positive control for pricing history/report boundary; no price write |
| WF-SOMMELIER-05 | `Pair a wine with lamb` / `晚餐喝什么酒` | `/sommelier` | Catalogue/current-stock bounds |
| WF-INVOICE-05 | `Scan this supplier bill` / `上传这张账单` | `/invoices/scan` | Preview only; no receiving |

Negative checks must remain in the same run: `How much red wine sold this week?`
stays in reporting, `How many invoices did we receive?`, `How many supplier bills did we receive?`, and `How much did we pay for this invoice?` stay in reporting, and
forged route or SQL prompts produce no UI route and no write request. The generic
stock shortcuts must also leave `Do we have any customers?` and `订单还有吗？`
untouched.

Purchase-cost boundaries also resolve without the classifier: `How much did we
spend on purchases last month?`, `What was our purchase history last week?`,
`What did we spend on replenishment last week?`, `上周采购记录是什么`, and
`本月补货花了多少钱` must remain `report_adhoc` with no workflow route. Keep
positive controls in the same suite: `What should I purchase?` and `What should
I reorder today?` go to replenishment; `How much should I charge for Shiraz?`
and `Show me the price suggestions` go to price review.

## Current execution snapshot (2026-10-21)

- Demo read-only natural-language matrix: **49/49 PASS**, including `Show me today's sales`, `How did we do today?`, `Is VB Cans in stock?`, `What is the inventory level for VB Cans?`, `Which products need reordering?`, `哪些商品库存低`, and `Find me a wine for steak`. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_CURRENT.json`.
- Demo report reconciliation: **14/14 PASS**. Store timezone, empty-day semantics, 7/30-day rows, explicit dates, Overview reconciliation, named catalogue stock fields and aggregate metrics all passed. Evidence: `UAT_AI_REPORTS_READONLY_ONLINE_2026-10-21_CURRENT.json`.
- Demo AI feature matrix: **14/14 PASS**; route matrix **9/9 PASS**; surface **11/11 PASS**; Admin guard **15/15 PASS**; availability **3/3 PASS**. Evidence: `UAT_AI_FEATURES_VERIFY_2026-10-21_CURRENT.json`, `UAT_AI_ROUTE_MATRIX_2026-10-19.json`, `UAT_AI_SURFACE_ONLINE_2026-10-21_CURRENT.json`, `UAT_AI_ADMIN_GUARD_ONLINE_2026-10-21_CURRENT.json`, `UAT_AI_AVAILABILITY_ONLINE_2026-10-21_CURRENT.json`.
- Demo History/platform suite: **9 PASS / 2 BLOCKED / 0 FAIL**. Cross-user isolation and platform-operator usage remain unexercised because those credentials were not available. Evidence: `UAT_AI_FOLLOWUP_HISTORY_PLATFORM_2026-10-21_CURRENT.json`.
- Deployment identity remains unverified: these are current public runtime results, not proof that Demo runs the latest `main` SHA. No sales, refund, purchase, receiving, inventory, cash or register-close writes were made.

## Follow-up snapshot (2026-10-22)

- Repeated Demo report check is **13 PASS / 1 BLOCKED / 0 FAIL**. Sales/date/timezone/Overview reconciliation still passes; the named stock question returns the safe message `I could not read live stock data right now...`, so it is correctly classified as unavailable rather than an empty result. Evidence: `UAT_AI_REPORTS_READONLY_ONLINE_2026-10-22_CURRENT_RECHECK.json`.
- Direct read-only Odoo stock diagnostic is **7 PASS / 1 INFO / 0 BLOCKED**. The service account can read the same company/product/stock fields and the single warehouse context; the remaining INFO is that the vendor binding has no explicit warehouse id. Evidence: `UAT_AI_STOCK_RPC_READONLY_2026-10-22_CURRENT.json`.
- This isolates the remaining stock issue to the AI report runtime path or its deployed configuration, not the Odoo account or catalogue RPC. Dokploy runtime SHA is still unverified, so do not mark the fix as deployed.

## UI follow-up (2026-10-23)

- Natural-language workflow matrix remains **49/49 PASS** and capability gates are **PASS**.
- AI UI initially exposed a timing-sensitive identify assertion at 1440px (`0` observed after a fixed 500 ms wait). A direct browser diagnostic returned 48 results; the UAT now waits for the first result item to become visible before counting. Recheck: **2/2 PASS** at 390px and 1440px. Evidence: `UAT_AI_UI_2026-10-23_RECHECK.json`.

## Current execution snapshot (2026-10-20)

- Local backend: Java 21 `mvn -B clean verify` → **238 tests, 0 failures, 0 errors** (2026-10-20, including Chinese explicit-date parsing).
- Online read-only baseline: workflow utterances `28/28` passed, including English/Chinese product search, named stock questions, explicit-date sales routing, and unsupported date comparisons. Report checks were `10/12` on the unverified runtime: a Chinese single-date question used today's date, and the comparison-refusal assertion initially failed to recognize the valid “can't run that custom comparison yet” copy. The date parser has since been fixed locally and the refusal assertion corrected; those fixes still require a runtime with the current backend SHA. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-20_FULL-055468B.json`, `UAT_AI_REPORTS_READONLY_ONLINE_2026-10-20_FULL-055468B.json`.
- Data source availability: sales reconciliation matched Odoo Overview across seven daily rows. The named stock question extracted `VB Cans` correctly, but the live Odoo report source returned its temporary-unavailable message; do not claim the stock quantity query passed end-to-end.
- Natural phrasing regression: fast-path coverage now includes “How much did we make/sell today?”, “What's our revenue today?”, yesterday variants, “Do we have any VB Cans left?”, and Chinese “VB Cans还剩多少？”. Odoo stock RPC fixture verifies company/warehouse context, `free_qty` result mapping, empty catalogue results, and safe RPC failure handling. Java 21 `mvn -B clean verify` passes 243 tests. This fixture does not resolve the still-blocked live Odoo stock source above.
- Latest follow-up on `8f58868`: AI features suite passed `14/14` checks (invoice probe is INFO); report suite passed `12` checks with `1` blocked (live Odoo stock report unavailable); History/platform suite passed `9` with `2` blocked (no second store-user or platform-operator credentials). The latest workflow utterance run remains `28/28 PASS` from the earlier same-day evidence. Evidence: `UAT_AI_FEATURES_VERIFY_2026-10-20_FOLLOWUP.json`, `UAT_AI_REPORTS_READONLY_2026-10-20_FOLLOWUP.json`, `UAT_AI_FOLLOWUP_HISTORY_PLATFORM_2026-10-20_RECHECK.json`, `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-20_FULL-055468B.json`.
- Local Playwright fixtures rechecked after fixing their tenant-host setup: voice release/cancel, voice provider failure, entity action safety, and diagnostics all pass; no business writes escaped the API intercepts. The entity fixture exposed duplicate DELETE requests on synchronous double-click; `SellAiPanel` now guards the request synchronously with a ref, and the rerun confirms one request per confirmation plus retry after failure. Evidence: `UAT_AI_VOICE_LOCAL_2026-10-20_RECHECK.json`, `UAT_AI_VOICE_FAILURE_LOCAL_2026-10-20_RECHECK.json`, `UAT_AI_ENTITY_INVALID_OP_LOCAL_2026-10-20_RECHECK.json`, `UAT_AI_DIAGNOSTICS_LOCAL_2026-10-20_RECHECK.json`.
- Full continuation regression: Java 21 `mvn -B clean verify` passed **243 tests** after stock RPC fixture and natural sales/stock aliases were added. Online suites: workflow baseline 28/28, feature verification 14/14, route matrix 9/9, assistant UI 2/2, surface 11/11, Admin guard 15/15, store metrics 9/9, capability loading 4/4, and AI enabled gate PASS. The expanded 37-case utterance run had 29 PASS and 8 BLOCKED (HTTP 200 / API code `50210`) on colloquial sales, named-stock, help, unknown and forged-route prompts; it had no assertion failures. `50210` is a sanitized catch-all for exceptions from `PosAssistantGraphService.ask`, so it does not identify a provider-specific cause. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-20_FULL-CONTINUATION2.json`, `UAT_AI_FEATURES_VERIFY_2026-10-20_CONTINUATION2.json`, `UAT_AI_ROUTE_MATRIX_ONLINE_2026-10-20_CONTINUATION2.json`, `UAT_AI_UI_ONLINE_2026-10-20_CONTINUATION2.json`, `UAT_AI_SURFACE_ONLINE_2026-10-20_CONTINUATION2.json`, `UAT_AI_ADMIN_GUARD_ONLINE_2026-10-20_CONTINUATION2.json`, `UAT_AI_METRICS_ONLINE_2026-10-20_CONTINUATION2.json`, `UAT_AI_CAPABILITY_LOADING_ONLINE_2026-10-20_CONTINUATION2.json`.
- Report reconciliation remains **12 PASS / 1 BLOCKED** because live Odoo stock lookup is unavailable even though `VB Cans` is extracted correctly; History/platform remains **9 PASS / 2 BLOCKED** without second-user and platform-operator credentials. Online config reports chat enabled and transcription disabled; the voice control is correctly unavailable. Local fixtures now cover both chat enabled and unavailable at 390/1440, voice hold/release/cancel and provider failure, invalid entity op/delete confirmation safety, and diagnostics with zero intercepted business writes. Evidence: `UAT_AI_REPORTS_READONLY_2026-10-20_CONTINUATION2.json`, `UAT_AI_FOLLOWUP_HISTORY_PLATFORM_2026-10-20_CONTINUATION2.json`, `UAT_AI_CAPABILITY_GATES_LOCAL_2026-10-20_COMPLETE.json`, `UAT_AI_VOICE_LOCAL_2026-10-20_CONTINUATION2.json`, `UAT_AI_VOICE_FAILURE_LOCAL_2026-10-20_CONTINUATION2.json`, `UAT_AI_ENTITY_INVALID_OP_LOCAL_2026-10-20_CONTINUATION2.json`, `UAT_AI_DIAGNOSTICS_LOCAL_2026-10-20_CONTINUATION2.json`.
- Product stock discoverability: the assistant greeting now explicitly invites a product-name stock question. The local fast path and unit cases now include colloquial English and Chinese variants ("Have we got … in the shop?", "店里还有 … 吗？", "帮我查下 … 还剩几件"). The expanded online run returned 29 PASS / 13 BLOCKED / 0 FAIL; BLOCKED responses used API code `50210`, which can represent any exception escaping the assistant graph and does not prove the classifier/provider was the failing component. The named stock report still extracts `VB Cans` but the AI report path returns a sanitized unavailable response. Evidence: `UAT_AI_REPORTS_READONLY_2026-10-20_USER-CONTINUATION.json`, `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-20_USER-CONTINUATION.json`. Java tests and build were not run per the local no-build instruction; backend changes must pass the repository Java 21 verify gate before push.
- Stock source isolation: the store-scoped product endpoint returned one match with numeric `qty_available` and `free_qty`; the same local Odoo service credentials read the AI product domain/fields both with and without the company's only warehouse context (**7 PASS / 1 INFO**). The authenticated AI report still reports Odoo unavailable. The vendor binding is `ready` but has no warehouse id configured; because the company has one warehouse and both direct query contexts pass, this alone does not explain the failure. Exact cause remains unverified without the running AI backend's Odoo environment and logs. Evidence: `UAT_AI_REPORTS_READONLY_2026-10-20_USER-CONTINUATION3.json`, `UAT_AI_STOCK_RPC_READONLY_2026-10-20_USER-CONTINUATION4.json`.
- Provider isolation: one direct, data-free request to the locally configured DashScope `qwen3.8-flash` multimodal endpoint returned HTTP 200 with text (**1 PASS**). This confirms only that the local credential/model/endpoint combination is reachable. It does not establish the Demo backend's environment, request payload, or graph execution as healthy, and does not explain the online `50210` catch-all. Evidence: `UAT_AI_DASHSCOPE_HEALTH_2026-10-20_CONTINUATION.json`.
- Goal continuation UAT: the latest Demo report run remains **13 PASS / 1 BLOCKED**; sales/date/Overview reconciliation passes, while the named stock report still returns the safe temporary-unavailable message. The expanded workflow run is **38 PASS / 1 FAIL / 3 BLOCKED**: the live runtime misroutes `帮我看看哪些商品需要调价` to `report_stock`, while help/unknown/forged-route prompts returned the generic `50210` graph error. The local fast-path fix now requires an explicit stock signal for the broad Chinese `看看...` form and adds regression coverage so pricing/replenishment requests reach workflow routing. Evidence: `UAT_AI_REPORTS_READONLY_2026-10-20_GOAL-CONTINUATION.json`, `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-20_GOAL-CONTINUATION.json`.
- Vision configuration diagnosis: the latest Demo feature run is **14 PASS / 1 FAIL**; invoice OCR returned HTTP 200 JSON business code `50213` (provider/model configuration failure). A local data-free provider comparison returned HTTP 200 for `qwen3.8-flash` with the native multimodal payload, while the same credential returned `InvalidParameter` for `qwen-vl-plus`. `application.yml` now defaults `AI_VISION_MODEL` to the configured `AI_DASHSCOPE_MODEL` (fallback `qwen3.8-flash`) while preserving explicit overrides. Evidence: `UAT_AI_FEATURES_VERIFY_2026-10-20_GOAL-CONTINUATION-DIAGNOSTIC.json`, local provider probes (response bodies omitted).
- Java 21 gate after the fast-path and vision-default changes: `mvn -B clean verify` passed **246 tests, 0 failures, 0 errors**. No frontend build was run. The current Demo runtime SHA remains unverified and predates these source changes; deployment and post-deploy UAT are still required.
- Historical UI source check: the assistant panel passed targeted ESLint and a full-source `tsc` using a temporary config. At that point standard `npm run typecheck` was blocked by malformed generated `.next` declarations; a later Next dev restart regenerated them, and the current standard typecheck now passes.
- Deployment identity: current runtime SHA and Dokploy build result remain unverified; webhook attempts for `055468b` and the latest pushed `0de4790` returned HTTP 301 `Branch Not Match`. Online evidence is for the runtime that served Demo at test time, not proof of the current backend source. Latest trigger evidence: `UAT_DEPLOYMENT_2026-10-20_0DE4790_BRANCH-BLOCK.json`.
- Read-only scope: no sales, purchase, receiving, inventory, cash or register-close data was written during online checks.

## Regression cases

| ID | Area | Scenario | Expected result | Current evidence / status |
|---|---|---|---|---|
| RPT-01 | Report dates | Ask `14,oct sales`; classifier supplies `2023-10-14` | Use 14 October of the current store business year; user's explicit date overrides model slots | Parser fix is in `bb9f4d4`. Read-only UAT on 2026-10-20 rechecked `14,oct` as `2026-10-14`; compact and explicit-year queries returned identical results and values. Evidence: `UAT_AI_REPORTS_READONLY_ONLINE_2026-10-20_RECHECK.json`. Runtime SHA remains unverified; see RPT-09 |
| RPT-02 | Report dates | `Oct 14`, `14 October 2024`, `14/10/2025`, ISO date | Resolve month names, explicit year, AU day-first date and ISO date to one inclusive business day | Unit cases cover month names, explicit years, AU dates, ISO dates and all 12 lowercase abbreviations; Java 21 verification passes |
| RPT-03 | Report dates | today/yesterday/week/month phrases with contradictory model slots | Text date phrase wins; boundaries use the store's Odoo company timezone and exclusive next midnight | 2026-10-20 post-push read-only UAT resolves the business date to `Australia/Adelaide`, uses `2026-10-20` for today, and passes the current-year `14,oct` case. Runtime SHA is not independently verified; see RPT-09 |
| RPT-04 | Report data source | Overview has Odoo completed sales and assistant queries the same outlet/date | Totals reconcile to Odoo for completed orders; refunds, demo seed filtering and business-day boundaries match | Latest follow-up passes the 14 Oct comparison (`$4,014.36` on both surfaces) and all 7 daily rows; 12 checks pass, with stock source availability separately blocked. Evidence: `UAT_AI_REPORTS_READONLY_2026-10-20_FOLLOWUP.json`. Runtime SHA remains unverified |
| RPT-08 | Report data range | Compare AI `Today's sales` with Overview's selected range | Compare matching periods; empty today is valid when the 24-hour overview also has zero transactions | 2026-10-20 online read-only recheck: Overview 24-hour transactions `0`; AI correctly returns no data for `2026-10-20`. Overview's `486` is the 30-day transaction count, not today's count. Evidence: `UAT_AI_REPORTS_READONLY_ONLINE_2026-10-20_RECHECK.json` |
| RPT-09 | Deployment identity | Trigger the configured Dokploy webhook, then inspect runtime behavior | Webhook acceptance is not deployment proof; report audit path and data must reflect the deployed Odoo implementation | Current webhook attempts return HTTP 301 `Branch Not Match`. Post-push live behavior passes RPT-04, but the running container SHA/build result cannot be attributed to a specific commit until Dokploy identity is independently read back |
| RPT-05 | Empty/error states | Empty day, unavailable source, unlinked store, missing permission, oversized and unsupported report | Distinct, truthful response for each; empty sales gives a wider-range suggestion and infrastructure failures are never reported as valid empty results | Added `ReportRespondNodeTest` for distinct responses, actionable empty-day guidance and audit recording on empty/error paths; Java 21 verification passes |
| RPT-06 | Tenant access | Query with current outlet, another outlet, no outlet and restricted report role | Only authorized outlet data is returned; missing binding/permission is explicit | Existing tenant binder, tenant context and SQL guard unit tests; integration matrix open |
| RPT-07 | Report safety | Ask for cost/margin or inject write SQL / unsupported tables | Cost permission required; unsafe SQL rejected; no write statement reaches DB | Existing SQL guard and tenant binder tests; add route-level no-write assertion |
| AST-01 | Intent and navigation | Product lookup, stock lookup, sell screen, create customer, unknown request; forged route/action fields | Known intents and enum slots are whitelisted; unknown intents produce no UI action; invalid route/action fields are dropped | Unknown intents now return empty UI/slot instructions. Explicit `entity_action` operations outside the configured enum now fail closed instead of silently falling through to list navigation; a genuinely missing operation can still open a list. Added backend cases for forged/valid route and action fields and supported/missing/unsupported entity operations. The frontend now independently allowlists the seeded dispatchable intent codes before consuming UI instructions. Online assistant UI checks pass at 390px and 1440px, but the forged-response dispatcher case is not exercised by the live UI suite. Java 21 `mvn -B clean verify` passes 232 tests with 0 failures/errors on the current worktree. Evidence: `UAT_AI_UI_2026-10-20_CODEX.json` |
| AST-02 | Entity actions | Create/update/delete entity intent, missing fields, cancel confirmation, retry, unsupported entity capabilities | Validate required slots; destructive action requires explicit confirmation; cancel sends no mutation; failed requests remain retryable; unsupported create/import/export actions explain the boundary and do not fall through to a list or edit route | Backend sanitizer rejects unsupported entity operations and permits a missing operation only as a list request. Frontend capability map now rejects unsupported create/import/export actions with an explicit message, and supplier `view` uses the read-only Odoo directory instead of an edit form. `SellAiPanel` synchronously guards the delete request against duplicate confirmation events. The expanded local fixture covers `archive`, `create balance`, `import balance`, `export balance`, supplier view, cancel, duplicate confirmation and retry; all APIs are intercepted locally. Evidence: `scripts/pilot-ai-entity-invalid-op-local-uat.mjs` and its generated `UAT_AI_ENTITY_INVALID_OP_LOCAL*.json` |
| AST-03 | Provider behavior | Disabled, missing key, invalid base URL, timeout, provider error, retry | Availability matches configuration; staff gets a safe actionable message; secrets/provider payloads stay hidden | ASR provider failures return a fixed retry message and log only status/type. Wine-label and invoice vision now parse only structured provider error codes; they do not convert full provider error bodies to text or expose provider messages/request IDs. `AiConversationMemoryTest` covers malformed Redis history, TTL and turn limits; `PosAssistantToolsTest` covers no-tenant fail-closed behavior. Report provider error paths remain open. Java 21 `mvn -B clean verify` passes 233 tests with 0 failures/errors on the current worktree |
| AST-04 | Workflow utterances | Replenishment, pricing, recommendations, store questions and invoice capture in English and Chinese, including colloquial variants and report-like negative cases | Intent maps to the correct read-only workflow; evidence, store scope and uncertainty are visible; no purchase, price, recommendation or receiving write is triggered | Deterministic router covers colloquial English/Chinese workflow variants, category quantity reports, explicit ranking/mixed-report questions, and read-only entity pages for classifications, customer groups, price lists, gift cards, buying periods, balances and bulk pricing. The local `卖得最好` rule routes to the safe `report_adhoc` refusal before the classifier; start/submit verbs are excluded from read-only navigation. Online recheck is historical runtime evidence and requires deployment for the current 144-case catalog. |
| VOI-01 | Speech input | Hold, release, cancel, empty audio, unsupported browser, ASR failure | Recording stops on release/cancel; transcript fills input once; cloud ASR failure shows a safe type/retry message and does not submit unintended text | Synthetic English and Chinese audio both transcribe expected store-question terms online (2/2 PASS); transcript omitted and not submitted. Online UI confirms capability and microphone control; empty guard returns 40010. Server rejects non-audio MIME and files over 5 MB. Unit tests cover MIME/size/error sanitization; local fixture covers release/cancel/track stop/no auto-submit and safe provider failure. Physical microphone, ambient noise and accent coverage remain open. Evidence: `UAT_AI_TRANSCRIPTION_ONLINE_2026-10-21_FULL-AI-CONTINUATION.json`, `UAT_AI_VOICE_LOCAL_2026-10-20_RECHECK.json`, `UAT_AI_VOICE_FAILURE_LOCAL_2026-10-20_RECHECK.json` |
| SOM-01 | Recommendations | Out-of-stock, wrong wine type, budget, food pairing, sparse catalogue | Exclude unavailable items; respect hard filters; return fewer results rather than inventing catalogue items | Existing `WineMatcherTest` covers core filters and tiers. Online read-only recommend flow returned 3 cards at 390px and 1440px; product identification returned results and pitch/similar requests completed. Edge filters and sparse-catalogue behavior remain unit-test scope. Evidence: `UAT_AI_UI_2026-10-20_CODEX.json`, `UAT_AI_FEATURES_VERIFY_2026-10-20_CODEX.json` |
| SOM-02 | Odoo catalogue | Odoo configured with empty catalogue or RPC failure | Odoo stays authoritative; do not fall back to stale Classic catalogue; show clear unavailable/empty state | `OdooWineCatalogClientTest` covers HTTP/RPC failure as safe retryable `50312`; `SommelierCatalogServiceTest` proves an empty configured Odoo catalogue does not fall back to Classic. Controller/UI response check remains open |
| SOM-03 | Label / explain | Clear, blurry, unrelated label; explain/pitch/similar requests | OCR uncertainty is explicit; matched product must exist in authorized catalogue and have valid current stock/price | Existing matcher/vision unit tests plus `SommelierControllerTest` disabled-provider guard; end-to-end no-hallucination and malformed-photo checks remain open |
| INV-01 | Invoice OCR | AU DD/MM/YYYY, GST/total, multiple lines, malformed JSON, unreadable photo | Parse supported fields; preserve uncertainty; reject invalid/empty extraction with retry guidance | `InvoiceVisionServiceTest` covers AU date/total/lines, malformed and empty provider output, invalid fields as null, and safe provider errors. `InvoiceScanServiceTest` covers available/disabled vision providers and multipart preview delegation. Live generated sample below passes. Multipart unreadable-photo API fixture remains open |
| INV-03 | Invoice OCR | Real provider reads a generated AU invoice containing 2 line items | Supplier, invoice number/date, quantities, unit prices, line totals, GST and payable total match known values; preview causes no purchasing write | 2026-10-21 Demo: `6/6 PASS`; supplier, invoice/date, both lines, GST and total match, with no supplier/purchase/receipt writes. Generated non-PII fixture only; real supplier layouts remain to be sampled. Evidence: `UAT_INVOICE_OCR_PREVIEW_ONLINE_2026-10-21_FULL-AI-CONTINUATION.json` |
| INV-02 | Invoice safety | Preview extracted supplier/lines; retry; user leaves page | Preview only; no supplier, RFQ, purchase or receipt write until a separately authorized workflow | `InvoiceScanServiceTest` now asserts `/receives/from-scan` fails closed before touching supplier, product, outlet or order dependencies. API/UI no-write integration and leave-page retry checks remain open |
| CFG-01 | Availability | AI disabled, key absent, feature provider unavailable, per-capability status | UI capability flags match effective backend readiness; disabled feature cannot be invoked | Online live config reports assistant, transcription, label vision and invoice vision available; route and idle UI guards pass for the current enabled store. The route matrix now waits for capability loading to settle before asserting the label-photo control, avoiding a false failure during the initial request. Evidence: `UAT_AI_ROUTE_MATRIX_2026-10-20_CONTINUATION.json`, `UAT_AI_FEATURES_VERIFY_2026-10-20_CODEX.json`, `UAT_AI_UI_2026-10-20_CODEX.json` |
| REP-01 | Saved reports | Save report, retrieve own report, request another user's/vendor's id | Snapshot contents match response; owner/vendor isolation enforced; empty results handled | `AiReportSnapshotServiceTest` verifies vendor/user/outlet binding, both owner keys on reads, missing-tenant `40100`, and not-found `40401`; `AiAssistantControllerTest` verifies `/reports/{id}` forwards the current tenant to the owner-scoped service. Full HTTP authorization integration remains open |
| MET-01 | Metrics / audit | Unauthorized user, valid admin, range limits; provider error | Admin/vendor scope enforced; audit excludes secrets; invalid range bounded | Metrics service enforces admin access, clamps ranges to 1-168 hours, and scopes mapper queries by vendor. `AiReportMetricsServiceTest` covers lower/upper range clamping, percentile output and vendor scope. `AiReportAuditServiceTest` asserts sensitive query text is absent from application logs. `AiAssistantControllerTest` covers provider failure sanitization and failed audit recording. Latest online read-only suite: store metrics shape and aggregate-only payload pass; both platform metric endpoints deny store-admin access; anonymous History returns 401. Cross-user History and platform-operator UI remain blocked for missing test accounts. Evidence: `UAT_AI_FOLLOWUP_HISTORY_PLATFORM_2026-10-20_RECHECK.json`. Runtime SHA remains unverified. |

## Execution gates

1. Run deterministic unit tests for each changed resolver, matcher, OCR parser or guard before merging. Local builds are intentionally omitted when the task specifies no local build.
2. Run authenticated demo checks only for reads (availability, product catalogue, sales/report reads). Do not create customers, products, sales, refunds, purchase orders, receipts, stock movements or register closes in production/demo.
3. Use mocked provider responses for deterministic UI/error-flow tests. Label them as mock evidence; separately record real provider availability and cost when explicitly run.
4. Treat report behavior as passing the current read-only data reconciliation (`9/9`), while keeping deployment identity separate: the runtime SHA and remote build are still unverified. Non-report AI feature UAT is `14/14 PASS`, but generated invoice OCR, voice hold/release/cancel and provider failure results do not certify arbitrary real invoices or every browser/device.

The read-only online report suite is `scripts/pilot-ai-report-readonly-uat.mjs`. It checks store-date resolution, empty-day semantics, 7/30-day rows, the `14,oct` year, and a day-level reconciliation against Overview.

### Short stock-list wording (2026-10-24)

Add these no-entity controls to the workflow matrix. They must navigate to the
read-only stock list with empty slots; they must not be interpreted as a product
lookup, replenishment command, or inventory mutation:

| ID | Utterance | Expected intent/route |
|---|---|---|
| N-13 | `Stock?` | `navigate` / `/stock/list` |
| N-14 | `What's in stock?` | `navigate` / `/stock/list` |
| N-15 | `How's our stock looking?` | `navigate` / `/stock/list` |
| N-16 | `Inventory status` | `navigate` / `/stock/list` |
| N-17 | `库存情况怎么样？` | `navigate` / `/stock/list` |
| N-18 | `有什么现货` | `navigate` / `/stock/list` |

Contrast controls remain `为什么查不到？` (clarification `qa`, product/barcode
required) and `Do we have <named product> in stock?` (read-only `report_stock`).
