# 门店助手、语音与历史：设计与实现

更新日期：2026-11-04；代码基线见[基线](../../../baseline.md)。负责人待指定。

## 业务与数据流

身份与门店上下文 → 确定性路由/Graph 分类 → 填充业务日期或商品槽位 → Odoo 受控只读查询 → 回答与卡片。语音先经 Gateway 转写，之后进入文本链路。会话记忆与历史列表/详情按用户和租户过滤。

## 接口与边界

入口：门店 Orithos AI 面板；POST /api/ai/assistant、POST /api/ai/transcribe、GET /api/ai/threads。

无商品标识先澄清，未知商品与零库存区分；相对日期按门店时区解释。AI 关闭、provider 超时、429 和数据不可用要明确降级。模型不决定租户、SQL、Odoo model 或任意 API 路径。历史/用量元数据持久化不属于业务账本写入。

模型、prompt/config 和线上开关未由本次盘点确认。每轮变更记录版本，不将当前源码默认值回填到旧测试。统一配额、降级和数据契约见[AI 架构](../architecture.md)。

## 答案来源与日期说明

对结构化销售和库存查询，助手在回答卡片下分别展示底层数据来源和查询路由：来源由已识别的只读业务意图映射（例如 Odoo POS 销售报表），`deterministic` / `llm` 只说明路由方式，不作为数据来源。销售报表另外展示请求日期范围、实际返回行日期范围及最新返回销售日；后端提供 `dataAsOf` 时再单独显示数据时间戳。不得把请求结束日或系统当前时间伪装成最新数据日期。

此说明只覆盖已识别的 `report_sales` 和 `report_stock` 意图；其他问法不推断数据源。销售行日期取自实际返回表格行，并校验日历日期。助手历史恢复保留后端路由与数据时间戳，但不从历史问句反推查询范围。实现与本地证据见[provenance session](../../../../test-sessions/2026-11-04-ai-answer-provenance.md)；线上两店验收另行登记。

## 代码与原设计

- [PosAssistantGraphConfig.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/config/PosAssistantGraphConfig.java)
- [ClassifyQueryNode.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/node/ClassifyQueryNode.java)
- [PosAssistantGraphService.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/PosAssistantGraphService.java)
- [AiTranscriptionService.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/AiTranscriptionService.java)
- [AiChatHistoryMapper.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/chat/AiChatHistoryMapper.java)

## 异常与兼容

遵守现有响应契约和 Odoo 门店权限；缺数据、源过期、源不可用分别说明。恢复或重试不能跨店兜底、重复提交或把未知改为零。发布前核对具体改动的 source/runtime SHA；本文不授予业务写入权限。
