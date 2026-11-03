# 价格建议

更新日期：2026-11-03。功能 ID：CAP-AI-PRICING。负责人：pricing 模块 owner 待指定。

## 目标与入口

把成本、税、动销和库存转成可解释的调价候选，供员工审核。

技术类型：业务规则计算；模型解释为辅助。用户/接口入口：/stock/price-suggestions；/api/odoo/price-suggestions；/api/ai/decisions/pricing/preview。

## 当前能力与状态

Java PricingDecisionEngine 和 Odoo BFF 已有实现；预览、建议快照、反馈与回测入口存在。不能假设 Java 聊天建议与 BFF 页面切片在所有边界上完全相同。

已实现（主分支基线）；现有历史设计和测试报告可追溯；当前版本价格写入、生效及经营收益 NOT RUN。

## 验证与效果

基础设计说明约束与规则存在，不证明实际毛利提升。E-SUPPLIER 只证明公司 5 某次审计的字段覆盖：13,000 个可采购商品中仅 1,352 个符合基本成本售价条件，不能外推全店可信成本或盈利。成本审计之间还有范围/标签冲突，见 AI-D01。

## 阅读路径

[设计与实现](design.md) · [验证方法与证据](validation.md) · [进展与问题](progress.md) · [AI 全景](../README.md)
