# 销量预测与补货：设计与实现

更新日期：2026-11-03；代码基线见[基线](../../../baseline.md)。负责人待指定。

## 业务与数据流

Odoo 按商品/门店/营业日只读聚合 → 日销售与库存快照 → forecast-service 多模型选择 → 需求/置信度/缺口 → 交期需求+安全库存−当前库存−在途等约束 → 人工审核。箱规、MOQ、欠单和时间窗口按具体链路核对。

## 接口与边界

入口：/stock/replenishment；/api/ai/forecast/sales、/risks；/api/ai/decisions/replenishment/preview。

缺货导致的销量删失不能当零需求；缺交期、成本、历史、可靠库存均应 REVIEW。历史 qty_available(to_date) 是研究代理，不能冒充独立实盘。模型选择不得看到 holdout；较长历史不自动消除数据质量问题。RFQ 草稿、确认和自动采购分别门禁，默认人工审阅。

模型、prompt/config 和线上开关未由本次盘点确认。每轮变更记录版本，不将当前源码默认值回填到旧测试。统一配额、降级和数据契约见[AI 架构](../architecture.md)。

## 代码与原设计

- [forecast_engine.py](../../../../../forecast-service/app/forecast_engine.py)
- [schemas.py](../../../../../forecast-service/app/schemas.py)
- [ForecastClient.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/forecast/ForecastClient.java)
- [route.ts](../../../../../pos-ui/app/api/odoo/replenishment/route.ts)
- [README.md](../../../../../scripts/ai-eval/README.md)
- [AI_REPLENISHMENT_DECISION.md](../../../../AI_REPLENISHMENT_DECISION.md)

## 异常与兼容

遵守现有响应契约和 Odoo 门店权限；缺数据、源过期、源不可用分别说明。恢复或重试不能跨店兜底、重复提交或把未知改为零。发布前核对具体改动的 source/runtime SHA；本文不授予业务写入权限。
