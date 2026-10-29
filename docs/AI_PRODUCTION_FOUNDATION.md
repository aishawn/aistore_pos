# AI 生产化基础层

本轮为商业化 AI 方案落地了第一批基础契约，保持现有问答和 Odoo 写入行为不变。

## 已落地

- `pos-api/.../ai/gateway` 定义 `AiGateway`、`AiTenantContext`、`AiTask`、`PromptVersion` 和 `AiCompletion`。
- Gateway 契约把租户上下文、任务类型、提示词版本、模型、token、延迟和 fallback 结果统一为可审计结构。
- `AiGatewayPolicy` 对模型输入做长度和受限控制字段校验。租户、门店、SQL、Odoo model 和 API 路径不能由模型提供。
- `PricingDecisionEngine` 只生成可解释的价格建议，支持库存、动销、成本、最低毛利、促销锁定、最大涨跌幅和价格步进。
- `ReplenishmentDecisionEngine` 使用交期需求、安全库存、在途、欠单、覆盖天数和箱规计算建议数量；缺少供应商时返回 `INCOMPLETE_DATA`。

这些类均不调用 Odoo 写接口，也不创建采购单。后续接入 Odoo 时，Adapter 必须把 `Decision` 转成预览结果，经过权限和人工确认后才允许写入，并在写入后回读核对。

## 接入顺序

1. 在现有 `PosAssistantGraphService` 和命令服务外增加一个 `AiGateway` 实现，统一 provider 重试、429/5xx 熔断、租户配额和成本指标。
2. 为 Odoo 商品、销售、库存、价格、供应商和采购增加只读同步任务；同步行带 `tenant_id`、`outlet_id`、来源 ID、事件时间、采集时间和数据质量状态。
3. 由定时任务调用定价和补货引擎生成建议快照，页面只展示证据和数据时间戳。
4. 先在隔离门店回测和人工审批，稳定后再接入现有 command preview/confirm 流程。

## 生产门禁

- Odoo 是业务事实源；本地建议快照不能替代 Odoo。
- 问答评测和建议生成必须保持 `writeRequests=[]`。
- 每次评测和发布记录 source SHA、runtime SHA、模型、prompt 版本和配置版本。
- 数据不足返回明确缺口，不得用零值代替未知值。
- 价格和补货首期不做强化学习或自动写入。
