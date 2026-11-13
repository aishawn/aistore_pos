# 门店助手、语音与历史：设计与实现

更新日期：2026-11-13；代码基线见[基线](../../../baseline.md)。负责人待指定。

## 业务与数据流

身份与门店上下文 → 确定性路由（命中则跳过模型）/未命中规则时 Graph 分类 → 填充业务日期或商品槽位 → Orithos 固定报表模板/只读目录查询 → 回答与卡片。销售额、毛利和客单价复用 `ReportQueryService.nativeOverview`，不让模型计算业务金额。语音先经 Gateway 转写，之后进入文本链路。会话记忆与历史列表/详情按用户和租户过滤。

## 接口与边界

入口：门店 Orithos AI 面板；POST /api/ai/assistant、POST /api/ai/transcribe、GET /api/ai/threads。

无商品标识先澄清，未知商品与零库存区分；相对日期按门店时区解释。AI 关闭、provider 超时、429 和数据不可用要明确降级。模型不决定租户、SQL、数据源或任意 API 路径。历史/用量元数据持久化不属于业务账本写入。

模型、prompt/config 和线上开关未由本次盘点确认。每轮变更记录版本，不将当前源码默认值回填到旧测试。统一配额、降级和数据契约见[AI 架构](../architecture.md)。

销售指标以 Orithos 权威报表为准。客单价按已完成销售额除以销售笔数；零笔销售返回无销售记录，交易数或平均值缺失时标为数据不完整，不得填零。

## 答案来源与日期说明

对结构化销售和库存查询，助手优先展示 API 返回的 `dataSource`、报表期间、时区、数据状态和 `dataAsOf`；`deterministic` / `llm` 只说明查询路由，不作为数据来源。销售报表另外展示用户请求范围、实际返回行日期范围及最新返回销售日。历史详情接口持久化并恢复相同元数据。不得把请求结束日或系统当前时间伪装成最新数据日期。

昨日销售高频路由须同时覆盖中英文口语顺序变体；仅能识别出明确“昨日 + 销售指标”的问法时走固定销售报表模板。商品拆分、同比等额外维度仍交由后续分类/澄清，不能被短路成单日总额回答；伪造路径提示必须拒绝导航。

来源字段缺失时不猜测或从问题文本生成来源。销售行日期取自实际返回表格行，并校验日历日期；接口期间与用户请求范围分开显示。实现与本地证据见[provenance session](../../../../test-sessions/2026-11-04-ai-answer-provenance.md)及[本轮回归](../../../../test-sessions/2026-11-13-ai-assistant-readiness-followup.md)；线上两店验收另行登记。

## 代码与原设计

- [PosAssistantGraphConfig.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/config/PosAssistantGraphConfig.java)
- [ClassifyQueryNode.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/node/ClassifyQueryNode.java)
- [PosAssistantGraphService.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/PosAssistantGraphService.java)
- [AiTranscriptionService.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/AiTranscriptionService.java)
- [AiChatHistoryMapper.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/chat/AiChatHistoryMapper.java)

## 异常与兼容

遵守现有响应契约和 Orithos 租户/门店权限；缺数据、源过期、源不可用分别说明。恢复或重试不能跨店兜底、重复提交或把未知改为零。发布前核对具体改动的 source/runtime SHA；本文不授予业务写入权限。
