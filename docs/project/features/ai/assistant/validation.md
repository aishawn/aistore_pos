# 门店助手、语音与历史：验证与效果

## 2026-11-13 高频昨日销售路由增量

Node `v22.22.2` 本地 POS UI 全量单测 207/207 PASS、`npm run typecheck` PASS。Java 21.0.12 单独编译当前 `AssistantFastPathRouter.java` PASS；JShell 在已编译类路径对 9 条中英文正例和 3 条负例（商品拆分歧义、无日期问法、伪造 `/admin` 提示）探测通过。`mvn -B -Dtest=AssistantFastPathRouterTest test` 未到测试阶段：本机脏工作树中的未提交 `PurchaseReportSnapshotService.java` 调用私有的 `ReportQueryService.requireReportOutlet(jdbc, ...)`，主源码编译失败；此采购报表文件未改动。故新增 JUnit 参数化回归尚未由 Maven 执行。项目文档检查在补充根 AGENTS.md 的事实库入口链接后通过。

源码 HEAD `cfe8c3cf5f4e13b408b06b7edf6ce8a67c683c81`；当前远端线上 SHA、模型/prompt/config 版本未在本轮确认；环境为本地 fixture/helper 与源码行为探测。POS 业务写入 0，部署/线上问答/权威数字对账 NOT RUN。证据与限制见[session](../../../../test-sessions/2026-11-13-ai-assistant-route-variants.md)。

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
