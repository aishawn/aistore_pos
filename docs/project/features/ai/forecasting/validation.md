# 销量预测与补货：验证与效果

更新日期：2026-11-04。本页为离线研究复核；线上业务测试本期 NOT RUN，真实业务写入 0。

## 最近适用结果

E-FC730：730 天、500 个高销量商品，7/14/28 天回测，间歇需求 TSB 相对基线改善 11.6%/11.3%/10.3%，但 WAPE 为 1.404/1.408/1.442，全部绝对门失败。研究未接可信缺货、原生库存、交期和实际采购成本。E-RO 原生快照仅 Demo 2 天、SKR 3 天，交期覆盖均为 0%。E-URGENT 已记录风险筛选 UI 的历史部署验证，但不开放自动采购。

2026-11-04 复跑 365 天、2,000 SKU 的 SKR 分群研究：新闭店日文件及优化后的评测器与既有主报告在所有指标/配置字段上差异 0；评测器显式模型快捷路径与引擎 18/18 预测区间一致。WAPE 发布门槛仍失败，stockout-aware 与 fill-rate 评估仍因原生库存标签不足而 BLOCKED。结果未触发线上/业务写入，也未改变模型策略。

## 证据与适用范围

- [E-RO](../../../../UAT_AI_READONLY_VALIDATION_2026-11-03.json)：元数据与限制见[证据登记](../../../evidence.md)。
- [E-FC730](../../../../UAT_AI_730D_SEGMENTED_BACKTEST_2026-11-03.json)：元数据与限制见[证据登记](../../../evidence.md)。
- [E-FC365](../../../../UAT_AI_365D_SEGMENTED_BACKTEST_2026-11-03.json)：元数据与限制见[证据登记](../../../evidence.md)。
- [E-SUPPLIER](../../../../UAT_AI_SUPPLIER_COST_AUDIT_2026-11-03.md)：元数据与限制见[证据登记](../../../evidence.md)。
- [E-LEAD](../../../../AI_LEAD_TIME_SOURCE_RECHECK_2026-11-03.md)：元数据与限制见[证据登记](../../../evidence.md)。
- [E-URGENT](../../../../UAT_AI_URGENT_RISK_DEPLOYMENT_2026-11-03.md)：元数据与限制见[证据登记](../../../evidence.md)。
- [2026-11-04 评测器优化与复跑 session](../../../../test-sessions/2026-11-04-forecast-evaluator-fast-path.md)：脚本 SHA、日历 SHA、结果一致性与限制。

## 测试方法

新增 AI-004 对应离线质量与安全（见测试目录）；使用 ai_forecast_segmented_eval.py / ai_forecast_walkforward_eval.py、forecast-service/tests 和快照校验器。验证无泄漏、营业日连续性、负库存、缺成本/交期、零销量、冷启动、箱规及失败不转零；真实采购需 PUR-001 独立验收。

## 效果指标与基线

WAPE=Σ|预测−实际|/Σ实际；Bias 保留评测器定义，不能混用逐日与窗口累计 WAPE。按门店、分群、7/14/28 天报告、固定基线、独立 holdout 和数据排除项。零总需求组单列误报。真实经营指标需缺货天数、fill rate、持有/缺货/过期成本和人工采纳率。

同版本对照数据缺失时先建立基线；BLOCKED 单列，不从分母悄悄排除再宣称全量通过。任何质量/收益阈值需评测前由业务和 QA 确认，本库不追认未记录阈值。

## 验收与限制

provider 真实调用、fixture、离线研究和线上只读分别报告；数据/代码/模型/prompt/config 版本按[登记表](../../../evidence.json)保留，未知为 null。当前源码未重新验收，经营收益未验证。新测试按[测试目录](../../../../TEST_CATALOG.md)和[session 模板](../../../../TEST_SESSION_TEMPLATE.md)归档，不覆盖旧结果。
