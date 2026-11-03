# 价格建议：设计与实现

更新日期：2026-11-03；代码基线见[基线](../../../baseline.md)。负责人待指定。

## 业务与数据流

Odoo 商品、成本、税、库存及销售 → 毛利/动销/上限/价格步进等规则 → 建议与原因 → 人工复核。聊天建议应关联完整工作台，执行价格变更通过独立业务流程。

## 接口与边界

入口：/stock/price-suggestions；/api/odoo/price-suggestions；/api/ai/decisions/pricing/preview。

默认建议不自动写 list_price。缺失或无效成本/税额返回不足或待审核，不以零代替未知。含税售价和未税毛利计算分开；促销锁定、最低毛利、最大涨跌、旧价格冲突及权限需保护。

模型、prompt/config 和线上开关未由本次盘点确认。每轮变更记录版本，不将当前源码默认值回填到旧测试。统一配额、降级和数据契约见[AI 架构](../architecture.md)。

## 代码与原设计

- [PricingDecisionEngine.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/pricing/PricingDecisionEngine.java)
- [OdooPriceSuggestionClient.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/pricing/OdooPriceSuggestionClient.java)
- [route.ts](../../../../../pos-ui/app/api/odoo/price-suggestions/route.ts)
- [AI_PRODUCTION_FOUNDATION.md](../../../../AI_PRODUCTION_FOUNDATION.md)

## 异常与兼容

遵守现有响应契约和 Odoo 门店权限；缺数据、源过期、源不可用分别说明。恢复或重试不能跨店兜底、重复提交或把未知改为零。发布前核对具体改动的 source/runtime SHA；本文不授予业务写入权限。
