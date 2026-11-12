# 门店助手、语音与历史：验证与效果

## 2026-11-13 客单价边界与构建日志复核

失败日志发生于 2026-11-12 23:17 +08。断言在 7 参数历史调用上失败；提交 `7a1d0bb4` 于 23:21 +08 将断言扩展为包含来源、数据时间、门店范围、期间、时区和数据状态的 15 参数调用，当前 `origin/main` 已包含此修正。不能把旧日志当作当前候选的验证结果。

候选 `c3afe76c024d73eee60592f1eb4a11829fe91925` 已推送。Java `mvn -B clean verify` 未运行。评估器 Node 测试 1/1 PASS，两个脚本 `node --check` PASS，`git diff --check` PASS。客单价新增 Java 用例和完整 Java 21 构建 NOT RUN；SKR/Demo 公开版本探测超时，运行 SHA、自动部署和线上报表对账未确认。详细范围见[session](../../../../test-sessions/2026-11-13-ai-assistant-aov-integrity.md)。

## 2026-11-13 本地候选全套回归

候选 `b62930bc` 已推送且两店前端已运行，但后端启动失败。脱敏启动日志显示 Spring 为 `ReportQueryService` 选择不存在的无参构造器；原因是新增缓存测试构造器后存在多个构造器且生产构造器未标注。修复候选添加 `@Autowired` 并新增 Spring 容器装配测试。Java 21 下定向测试 1/1、`mvn -B test` 660/660 PASS；POS UI 单测 201/201、TypeScript 检查 PASS，AI 洞察中的旧 Odoo 仪表盘/工作流提示已改为 Orithos。修复提交尚未推送/部署，完整范围见[session](../../../../test-sessions/2026-11-13-ai-assistant-readiness-followup.md)。

这些是本地测试，不构成精确候选远端构建或线上部署/对账证据。SKR/Demo 当前运行 SHA、真实数据报表一致性、模型调用费用、麦克风语音、完整历史/清空/取消/重试仍待验收；本轮未发送线上 AI 请求，业务写入为 0。

更新日期：2026-11-13。本页区分本地候选回归与历史线上证据；候选线上业务测试尚未运行，真实业务写入 0。

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
