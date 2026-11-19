# 门店助手、语音与历史：验证与效果

## 2026-11-19 滞销回答中文回归

提交 `e58b6bc6` 修复中文滞销回答的日期连接词及空结果英文文案；不改变查询口径。Java 21 `ReportRespondNodeTest` 35/35 PASS，`git diff --check` PASS。Demo、SKR 只读复测中英文问题均进入 deterministic `report_dead_stock`，无模型回退、无 POS 业务写请求；中文日期使用“至”，空结果保持中文。在线问答会生成常规审计/会话记录。

销售数据的新鲜度和完整性仍不能确认，接口状态保持 `incomplete`。组合查询没有可信 `dataAsOf`；不得用查询执行时间或单独的库存更新时间冒充销售来源水位，因此完整性验收 BLOCKED。详见[本轮记录](../../../../test-sessions/2026-11-19-ai-dead-stock-answer-copy.md)。

后续审计发现，空滞销列表会被通用逻辑误标为 `no_data`，即使缺少可信新鲜度信息。现已修正为无 `dataAsOf` 时 `report_dead_stock` 一律 `incomplete`，空结果回答明确表示无法确认是否确实没有滞销商品。Java 21 定向回归 46/46 PASS。Demo/SKR 公开版本接口均确认前后端运行 `66de47da`；本轮缺少已登录助手凭据且浏览器 URL 校验不可用，修复后的认证问答尚未在线复测。组合数据源仍无权威 `dataAsOf`，完整性保持 BLOCKED。

## 2026-11-18 Demo 毛利口径回归

Demo 只读复现源码/运行版本 `228166e8ba44ddde32ab21cec1547bbf94fa42bc` 的错误：Adelaide 2026-11-17 含 GST 销售额 AUD 4,241.48、GST AUD 364.92、成本 AUD 2,974.97；线上助手返回毛利 AUD 1,266.51，正确的税前毛利应为 AUD 901.59。中英文单日问法均把毛利描述为含 GST；请求没有 POS 业务写入。原始检查由本轮 Demo API 核查记录，助手查询会生成审计/会话记录。

候选修正覆盖聚合报表、AI 单日及双日期回答、税字段缺失处理和中英文口径。定向 Java 21 回归先在旧实现上失败 6 项，再在提交 `5de3529de60e31afc62097bc8c6baafc340f0401` 上通过 34/34（`NativeOverviewPayloadTest`、`ReportRespondNodeTest`）。Demo 当前前后端 SHA 为文档提交 `92f22c34ee57b7e38df44e31b286f19b97612a4e`，包含上述代码提交。Adelaide 2026-11-17 原生报表与英文“yesterday sales”、英文“yesterday gross profit”、中文“昨天毛利”三问均为 deterministic `report_sales`，毛利均为 AUD 901.59，状态 `available`；11 月 16/17 日英文双日对比回答毛利 AUD 926.99 / AUD 901.59，与两日原生报表一致。所有问答的 POS 业务写请求为空。完整 `mvn -B clean verify` 日志未取得。详见[本轮记录](../../../../test-sessions/2026-11-18-ai-gross-profit-tax-basis.md)。

## 2026-11-14 全目录答案断言覆盖审计

对 `.local/ai-eval/skr-utterances-full-expected-402-473e7b6f.jsonl` 的 402 条目录做离线覆盖检查。208 条属于需要核对答案内容的事实型意图，其中 151 条缺少正向 `answerIncludes` 或 `answerRegex`：`report_adhoc` 36、`report_stock` 37、`report_sales` 24、`qa` 30、`unknown` 8、`report_aov` 4、`search_product` 4、`search_customer` 4、`report_qty` 2、`report_dead_stock` 2。

历史在线结果 `.local/ai-eval/live-402-skr-eb7ed870.json` 的源码和运行 SHA 均为 `eb7ed870ca2201654794038dfb2fecf9337116f3`，402/402 通过当时的路由、槽位、确定性与只读检查；结果没有保留答案正文，不能离线重新验证答案是否非空或是否包含正确值。它不构成 402 条答案语义通过。答案断言门禁使缺断言用例为 `BLOCKED`，而已配置断言但路由/回答不符时仍为 `FAIL`。

Node `v22.22.2`：`node --test scripts/ai-eval/assistant-assertions.test.mjs` 18/18 PASS；`assistant-assertions.mjs` 与 `run-skr-live.mjs` 的 `node --check` PASS；`git diff --check` PASS。此次只做本地检查，没有在线请求、模型调用、POS 业务写入或部署。provider 历史账单不可读取，AUD 10 预算上限仍未验证。下一步先基于固定数据快照为 151 条用例补答案预期，再用同一运行 SHA 按批次在线验证；库存数量、销售/毛利、客单价及其他报表必须与同店同期间权威 API 对账。

## 2026-11-13 当前发布 SHA 全量构建与双店只读销售回归

提交 `d2f61cd1e5973d4a8d09bda3042ae4dfd98e798f` 在干净 detached checkout 执行 `mvn -B clean verify`，708/708 Java 测试通过并打包成功。SKR 与 Demo `/api/public/version` 的前后端均运行同一 SHA。两店各执行“昨天销售额如何？”与“昨天营业额怎么样？”：4/4 case 为 deterministic `report_sales`、`llmFallback=false`、`writeRequests=[]`；来源 `orithos_ledger`，期间 2026-11-12（Australia/Adelaide）。每店销售 AUD 5,173.94、毛利 AUD 1,985.28、185 笔，逐项与本店同期间 native overview 一致。原始 runner JSON 保存在忽略目录 `.local/ai-eval/online-cancel-followup-{skr,demo}-d2f61cd1.json`。

runner 顶层状态为 BLOCKED，仅因维护 checkout 有与这些 case 无关的未提交文件；selected cases 均 PASS 且 runtime 匹配源码。4 次请求均未触发模型 fallback；没有 provider 用量端点，故不推断总体模型费用。仅本组问法通过；语音、完整历史/清空、跨店隔离和其余完整话术目录仍未验收。

## 2026-11-13 用户取消请求回归

新增问答运行中的取消按钮；用户取消与硬超时使用不同状态，用户取消不追加超时/失败消息，硬超时仍走原重试提示。UI 全量单测 208/208、TypeScript `--noEmit` PASS，定向 ESLint 0 errors（4 条原有 effect 警告），`git diff --check` PASS。取消按钮本身只验证了本地实现；没有真实浏览器/API 取消验收。完整历史清空、语音识别质量、跨门店隔离和全话术目录仍未完成。

## 2026-11-13 高频昨日销售路由增量

Node `v22.22.2` 本地 POS UI 全量单测 207/207 PASS、`npm run typecheck` PASS。Java 21.0.12 单独编译当前 `AssistantFastPathRouter.java` PASS；JShell 在已编译类路径对 9 条中英文正例和 3 条负例（商品拆分歧义、无日期问法、伪造 `/admin` 提示）探测通过。`mvn -B -Dtest=AssistantFastPathRouterTest test` 未到测试阶段：本机脏工作树中的未提交 `PurchaseReportSnapshotService.java` 调用私有的 `ReportQueryService.requireReportOutlet(jdbc, ...)`，主源码编译失败；此采购报表文件未改动。故新增 JUnit 参数化回归尚未由 Maven 执行。项目文档检查在补充根 AGENTS.md 的事实库入口链接后通过。

源码 HEAD `cfe8c3cf5f4e13b408b06b7edf6ce8a67c683c81`；当前远端线上 SHA、模型/prompt/config 版本未在本轮确认；环境为本地 fixture/helper 与源码行为探测。POS 业务写入 0，部署/线上问答/权威数字对账 NOT RUN。证据与限制见[session](../../../../test-sessions/2026-11-13-ai-assistant-route-variants.md)。

## 2026-11-13 部署后昨日销售变体只读验收

生产代码提交 `584672d75719ff00429af421e8a7d12e7d335a5e` 已推送到 `main` 并由 Dokploy 自动部署；SKR 与 Demo 的 `/api/public/version` 均确认前端/后端运行同一 SHA。每店 9 条昨日销售中文/英文口语问法均 PASS：`report_sales`、`source=deterministic`、`llmFallback=false`、来源 `orithos_ledger`、期间 Adelaide `2026-11-12`、状态 `available`、`writeRequests=[]`。销售 AUD 5,173.94、毛利 AUD 1,985.28、185 笔分别与各店同期间 `native-overview` 相同。每店提示注入拒绝用例也 PASS（`unknown`、无 route、deterministic、无业务写入）。

在线 runner 结果文件：SKR `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_20261113T044953354Z_584672d7.json`、`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_20261113T045217109Z_584672d7.json`；Demo `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_20261113T045113211Z_584672d7.json`、`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_20261113T045259944Z_584672d7.json`。每份文件的选中用例均全部通过，但 runner 顶层状态是 BLOCKED，因为维护 checkout 中还存在与 AI 无关的未提交文件；这不推翻逐项在线检查结果。模型调用费用没有 provider 用量证据；本批用例均 `llmFallback=false`，因此助手没有调用问答模型。全功能目录、语音、完整历史清空/续问、取消/重试及其他安全和租户用例仍未验收。

## 2026-11-13 双店双语报表抽样与聚合日期文案

Java 21.0.12 AI 相关定向回归 245/245 PASS；Node 22.22.2 UI 全量单测 205/205 PASS、typecheck 和 provenance/history helper ESLint PASS。线上 SKR、Demo runtime 都是 `173dacfe1db75504187fac8f5a5ba24e21ea8c64`。两店 `sales last 7 days` 与 `昨天营业额怎么样？` 均为 `report_sales` / deterministic。前者 Adelaide 2026-11-07..13：销售 AUD 27,782.79、毛利 AUD 9,029.92、1,004 笔；后者 Adelaide 2026-11-12：销售 AUD 5,173.94、毛利 AUD 1,985.28、185 笔。每项均与同一门店同期间 `/api/reports/native-overview` 一致，四次 `writeRequests=[]`。

每个查询返回一个无日期列的聚合指标行；已上线 UI 错把它显示为“没有返回销售行”。这是实际观察到的前端缺陷。本地候选改为说明“已返回销售数据，但没有可识别的逐日日期”，并有中英文 helper 回归；还未部署。模型 provider 用量未取到，AUD 10 成本上限未证实。浏览器历史脚本在 dashboard SSR/auth 处受本地无后端配置阻断，历史、清空及续问的本轮浏览器证据缺失。完整范围见[session](../../../../test-sessions/2026-11-13-ai-assistant-bilingual-reconciliation.md)。

## 2026-11-13 本地来源元数据回归

本地 POS checkout 基线 `39eb296e`（工作树有其他未提交改动，落后 `origin/main` 3 个提交），Node `v22.22.2`。UI 全量单测 `npm run test:unit`：204/204 PASS；`npm run typecheck` PASS；assistant provenance/history/routing helper 定向 ESLint PASS；`git diff --check` PASS。包括 API 消息来源覆盖旧卡片来源，以及缺少可信数据时间时中英文明确显示未提供的测试。一次包含大型 `SellAiPanel.tsx` 的定向 ESLint 因本机进程繁忙运行超过一分钟后中止；因此该组件 lint 未验证。

源码候选为脏工作树，未生成可复现候选 SHA；未运行后端 Maven、未部署、未在线问答或报表对账，也没有进行 POS 业务写入。不能将此本地 UI 回归等同于全功能验收。

## 2026-11-13 持续目标本地回归

源码基线提交 `3f070701`（本地 main 比 origin/main ahead 1）；AI 助手候选仍在未提交工作树。Java `mvn -B clean verify` 通过：675 tests, 0 failures/errors/skips。POS UI `npm run test:unit` 通过：199 tests, 0 failures；`npm run typecheck` 与 `npm run build` 通过。回归覆盖高频中英文确定性问法、报表日期/成本与无数据边界、补货权限/资料缺口/超时提示、会话元数据恢复及无写请求。线上 SKR/Demo 当前前后端均为 `3a18364fa8dd05c9f2df0a236fbf56ebcd527329`，尚未包含候选改动；线上只读回归、UI 浏览器流程和模型费用证据尚未完成，不得将本地结果视为线上验收。

这组本地结果不能证明候选已经部署，也不覆盖完整 393 条在线话术目录、真实麦克风、线上历史/清空/取消/重试或 SKR/Demo 同期间数据对账；线上费用上限仍需按实际模型调用证据确认。两店当前公开 runtime 为提交 `3a18364…`，与待验候选不同。

## 2026-11-13 客单价边界与构建日志复核

失败日志发生于 2026-11-12 23:17 +08。断言在 7 参数历史调用上失败；提交 `7a1d0bb4` 于 23:21 +08 将断言扩展为包含来源、数据时间、门店范围、期间、时区和数据状态的 15 参数调用，当前 `origin/main` 已包含此修正。不能把旧日志当作当前候选的验证结果。

候选 `c3afe76c024d73eee60592f1eb4a11829fe91925` 已推送。Java `mvn -B clean verify` 未运行。评估器 Node 测试 1/1 PASS，两个脚本 `node --check` PASS，`git diff --check` PASS。客单价新增 Java 用例和完整 Java 21 构建 NOT RUN；SKR/Demo 公开版本探测超时，运行 SHA、自动部署和线上报表对账未确认。详细范围见[session](../../../../test-sessions/2026-11-13-ai-assistant-aov-integrity.md)。

## 2026-11-13 本地候选全套回归

候选 `b62930bc` 已推送且两店前端已运行，但后端启动失败。脱敏启动日志显示 Spring 为 `ReportQueryService` 选择不存在的无参构造器；原因是新增缓存测试构造器后存在多个构造器且生产构造器未标注。修复候选添加 `@Autowired` 并新增 Spring 容器装配测试。Java 21 下定向测试 1/1、`mvn -B test` 660/660 PASS；POS UI 单测 201/201、TypeScript 检查 PASS，AI 洞察中的旧 Odoo 仪表盘/工作流提示已改为 Orithos。修复提交尚未推送/部署，完整范围见[session](../../../../test-sessions/2026-11-13-ai-assistant-readiness-followup.md)。

这些是本地测试，不构成精确候选远端构建或线上部署/对账证据。后续线上复核见下节；Demo 数值对账、模型调用费用、麦克风语音、完整历史/清空/取消/重试仍待验收。真实 POS 业务写入为 0。

## 2026-11-13 部署恢复与窄范围线上对账

Dokploy POS Compose 将 `695eee7d`（ReportQueryService Spring 注入修复）和后续 `da91a4a4` 部署标记为 Done。SKR 与 Demo 的 `/api/public/version` 均返回前端/后端 `da91a4a4bea832be67abc1a225fe0e63f0384bb6`；未认证 `/api/health` 返回 401，说明代理已到达受认证后端，初期 502 已消失。

SKR 只读登录后读取 2026-11-12 Adelaide `native-overview`，再分别提问 `What were sales yesterday?` 与已覆盖中文变体 `昨天销售额如何？`。两次均返回 `intent=report_sales`、`source=deterministic`、`llmFallback=false`、`reportDataStatus=available`、`Australia/Adelaide`，销售 AUD 5,173.94、毛利 AUD 1,985.28、`writeRequests=[]`；两项与同期间 overview 完全相同。中文 fast-path HTTP 200 / API code 0，实测耗时 531 ms。结果只证明 SKR 单日的这两种表达及数据口径。

此前在 SKR、Demo 各尝试中文 `昨天销售额是多少？`，PowerShell harness 未保留响应体或 HTTP 状态，字段读取结果为空，因此列为 INCONCLUSIVE；该确切表达不在显式 fast-path 变体列表，不能假定它不触发模型兜底。模型调用成本未取到，AUD 10 费用上限尚未被证明。没有执行 POS 业务写入。

尚未覆盖：Demo 英文金额对账、中文成功路径、7 日行日期和 UI 元数据、历史恢复/清空、多轮追问、麦克风真机与失败恢复、请求取消/重试、提示注入、跨门店隔离以及其他意图全目录。不能据此宣称 POS 助手所有功能已正常。

## 2026-11-13 高频问法与历史界面续验

对当前线上 runtime `173dacfe1db75504187fac8f5a5ba24e21ea8c64`，在 SKR 与 Demo 各执行一次只读浏览器问答 `昨天销售额是多少？`。两店均返回 `intent=report_sales`、`source=deterministic`，期间为 Adelaide 2026-11-12；销售 AUD 5,173.94、毛利 AUD 1,985.28、185 笔与各自同期间 `native-overview` 一致，`writeRequests=[]`。因此该问法的线上路由和业务数值通过，先前“不确定”已被本次证据替代。

两店 UI 均显示“没有返回销售行”，但 API 含一条 `sales/grossProfit/transactions` 聚合行，仅不含逐日日期字段。日期说明检查失败，整体状态为 REVIEW；不影响数值对账通过。修正已在本地候选及单测中，需部署后复验。

本地 Windows Chrome + `127.0.0.1:3100`，API 全部由固定 fixture 拦截：桌面/平板/手机 1440、1024、768、390px 的历史会话 UI 用例全部通过，包含历史详情来源、期间、时区、状态和数据时间，刷新恢复、续问、报表链接、新建清空、返回/前进、空/失效历史；无页面错误。Java 21 助手/路由/补货定向回归 62/62、UI 单测 205/205、`npm run typecheck` 和三个 UAT 脚本 `node --check` 均通过。此 fixture 不代表真实历史 API、语音、取消/重试或线上 UI。

provider 用量/费用不可见；AUD 10 上限未证实。完整 utterance catalog、Demo/SKR 其他意图、提示注入、跨店隔离及麦克风真机仍未验收。

## 2026-11-13 API 空元数据优先级与组件级历史回归

卡片字段采用消息元数据字段存在性判断。消息显式返回 `null` 时不再从旧卡片缓存恢复该值；旧历史消息完全没有此字段时保留缓存兼容。新增两项单测分别覆盖显式缺失和旧记录兼容。

POS UI 全量 `npm run test:unit` 207/207 PASS，`npm run typecheck` PASS；本地 Chrome fixture 在 1440/1024/768/390px 全部 PASS。fixture 使用 `report_sales` 有效聚合行（无日期）、API `dataAsOf=null` 及带旧时间戳的缓存卡片；四个视口均显示“Sales data was returned without readable daily dates”与“Data timestamp unavailable”，未显示卡片旧来源/时间，无页面错误。三个脚本语法检查 PASS。改动文件 ESLint 启动后超过一分钟没有输出，已停止，故未验证。真实 SKR/Demo 仍运行 `173dacfe`，因此线上 UI 旧文案未解决到部署环境。无业务写入。

### 2026-11-13 部署后 SKR/Demo 回归

提交 `3ebc29e41dc4bd31a62d55352d6d31eb691fe2f3` 已推送至 `main`，SKR 与 Demo 的 `/api/public/version` 均确认前后端运行该 SHA。

两店各以只读浏览器问答 `昨天销售额是多少？` 复验，7 项检查全部 PASS：来源 `orithos_ledger`、请求期间和实际报表期间、时区、状态、数据时间、deterministic 路由、聚合行缺少逐日日期时的诚实说明；销售 AUD 5,173.94、毛利 AUD 1,985.28、185 笔与各自 Adelaide 2026-11-12 `native-overview` 完全一致，`writeRequests=[]`。生产业务写入为 0。模型 provider 用量不可见，AUD 10 上限仍未证实；其他能力不由本次窄范围通过推断。

更新日期：2026-11-13。本页区分本地候选回归与线上只读问题；真实 POS 业务写入 0。

## 2026-11-04 本地来源说明回归

候选源码 `8f9c91718445f4eccc1a0ee018b93a10ccb0b541`，Node `v24.19.0`：UI 全量单测 153/153 PASS（含 provenance helper 8 项），`tsc --noEmit` PASS，改动文件 ESLint 0 errors / 3 warnings（均位于 SellAiPanel 既有 effect 行），只读验收脚本语法和 `git diff --check` PASS。完整记录：[session](../../../../test-sessions/2026-11-04-ai-answer-provenance.md)，机器证据 E-AI-PROVENANCE-LOCAL。

这只是本地静态/fixture 验证，不证明远端构建、部署或在线 UI 行为。安装依赖的 npm audit 报告 37 项已知漏洞（2 low、23 moderate、11 high、1 critical）；本次未执行依赖升级。在线验收需分别固定 SKR 与 Demo runtime SHA，并比较可见来源、路由、请求区间、实际返回日期和 API 数据时间戳；不能以请求结束日代替实际最新销售日。

## 最近适用结果

2026-11-03 报表记录 E-RO 为 Demo/SKR 各 23/23；其 runtime 为 28a433a9，不能外推为本基线验收。同日 a6d5c7b0 的 390 条整轮：Demo 379 PASS/11 BLOCKED，SKR 382 PASS/8 BLOCKED；SKR 工作树脏，均未获候选接受。定向重试分别 11/11、8/8 检查通过，但总状态仍 BLOCKED（非全量）。ASR 合成样本 4/4，runtime 未记录，不证明真实麦克风。历史 round-trip 有确定性报表成功及 fallback 失败的并存记录。

## 证据与适用范围

- [E-RO](../../../../UAT_AI_READONLY_VALIDATION_2026-11-03.json)：元数据与限制见[证据登记](../../../evidence.md)。
- [E-WF-DEMO](../../../../UAT_AI_WORKFLOW_FULL_EXACT_SHA_2026-11-03_DEMO.json)：元数据与限制见[证据登记](../../../evidence.md)。
- [E-WF-SKR](../../../../UAT_AI_WORKFLOW_FULL_EXACT_SHA_2026-11-03_SKR.json)：元数据与限制见[证据登记](../../../evidence.md)。
- [E-RETRY-DEMO](../../../../UAT_AI_WORKFLOW_EXACT_SHA_RETRY_2026-11-03_DEMO.json)：元数据与限制见[证据登记](../../../evidence.md)。
- [E-RETRY-SKR](../../../../UAT_AI_WORKFLOW_EXACT_SHA_RETRY_2026-11-03_SKR.json)：元数据与限制见[证据登记](../../../evidence.md)。
- [E-ASR](../../../../UAT_AI_TRANSCRIPTION_ONLINE_2026-10-23_GOAL-RECHECK.json)：元数据与限制见[证据登记](../../../evidence.md)。
- [E-HISTORY](../../../../UAT_AI_CHAT_HISTORY_DEFAULTS_REPAIR_ONLINE_2026-11-03.json)：元数据与限制见[证据登记](../../../evidence.md)。

## 测试方法

AI-001、AI-002、AI-003、RPT-001、TEN-001；复用 pilot-ai-workflow-utterances-online-uat.mjs、pilot-ai-report-readonly-uat.mjs、pilot-ai-transcription-online-uat.mjs、pilot-ai-history-platform-uat.mjs。先固定 runtime 与问法目录；正向加未知商品、缺标识、越权、中文日期和 provider 失败负向用例。

## 效果指标与基线

路由/实体/日期准确率＝正确用例/全部有效可评用例，另列 BLOCKED；数值对账逐项比 Odoo，不能只匹配关键词。语音 WER＝替换+删除+插入词数除以参考词数，另测关键商品/金额命中、噪声和真实设备。会话验证保存→列表→详情→重开→续问，核对用户隔离。

同版本对照数据缺失时先建立基线；BLOCKED 单列，不从分母悄悄排除再宣称全量通过。任何质量/收益阈值需评测前由业务和 QA 确认，本库不追认未记录阈值。

## 验收与限制

provider 真实调用、fixture、离线研究和线上只读分别报告；数据/代码/模型/prompt/config 版本按[登记表](../../../evidence.json)保留，未知为 null。当前源码未重新验收，经营收益未验证。新测试按[测试目录](../../../../TEST_CATALOG.md)和[session 模板](../../../../TEST_SESSION_TEMPLATE.md)归档，不覆盖旧结果。
