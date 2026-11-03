# 门店助手、语音与历史：验证与效果

更新日期：2026-11-03。本页为历史证据复核，本期业务测试 NOT RUN，真实业务写入 0。

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
