# 交期与采购成本人工审核表

本表用于审核 `AI_LEADTIME_MANUAL_REVIEW_CANDIDATES_2026-11-04.md` 中的 Shopfront 采购候选。审核完成前不得回写 Odoo `product.supplierinfo`、供应商成本或自动采购参数。

## 来源与店主反馈（2026-11-04）

- 店主说明这些值来自 Shopfront 同步，但无法确认 `orderDate` 是否代表批准下单、`receivedAt` 是否代表实物到货，也无法确认 GST、箱/瓶单位、运费及费用口径；目前尚未提供可核对的供应商发票或送货凭证。因此 Shopfront 来源已知，业务事件语义和金额口径仍未验证，不能作为 Odoo 交期/成本主数据。
- crawler 的 `PURCHASE_ORDERS_QUERY` 读取 Shopfront `orderDate`、`createdAt`、`sentAt`、`receivedAt` 及采购行 `caseQuantity`、`orderedQuantity`、`receivedQuantity`、`baseCost`、`orderedCost`。同步代码把 `orderDate` 映射到镜像 `order_date`，保留去凭据后的原始响应于 `raw_payload`，并单独记录 crawler `synced_at`。这些字段只能证明来源链和可供复核的值，不定义供应商的业务事件含义。
- 本轮抽样 62 个采购单的 `orderDateRaw`、`receivedAtRaw`、箱规、数量和成本/费用候选字段均有值；62/62 的 `reviewerDecision` 与 `businessEvidence` 仍为空，`leadTimeEligibility=NEEDS_EVIDENCE`。日期字段存在不等于事件已获验证。
- 状态保持 `NEEDS_EVIDENCE`；不将 Shopfront 镜像值写入 Odoo，不用其计算正式供应商交期、真实成本、毛利或节省。后续需以供应商发票/送货凭证或书面字段定义、单位与税费约定补足证据。

## 每条样本必须确认

| 字段 | 审核值 | 证据/备注 |
|---|---|---|
| 门店/公司 |  |  |
| 供应商 |  |  |
| Shopfront 采购单号 |  |  |
| Odoo 采购单号（如有可靠关联） |  |  |
| 商品与条码 |  |  |
| 订单日期/时区 |  |  |
| 实际到货日期/时区 |  |  |
| 订单状态 |  |  |
| 订购数量 |  |  |
| 收货数量 |  |  |
| 箱规（每箱瓶/罐数） |  |  |
| 采购单位（箱/瓶/件） |  |  |
| 基础成本 |  |  |
| GST 是否含税 |  |  |
| 运费 |  |  |
| 付款费用 |  |  |
| 返利/折扣 |  |  |
| 实际可比单位成本 |  |  |
| 业务确认人和日期 |  |  |
| 判定 | `ACCEPT` / `REJECT` / `NEEDS_EVIDENCE` |  |

## 交期判定

只有在业务人员确认订单日期确实代表下单/批准事件、到货日期确实代表供应商交付完成，并且商品、供应商和单位都能可靠关联时，才允许计算：

`lead_time_days = local_date(actual_received_at) - local_date(order_approved_at)`

负数、超过 30 天、缺少时区或只有 `createdAt`/`scheduledDate` 的样本必须进入 `NEEDS_EVIDENCE`，不能用于中位数或 P90。至少每个主要供应商确认 10 条正常样本后，才可形成候选交期；写入主数据前仍需独立审批。

## 成本判定

`baseCost`、`fees`、`freight`、`paymentFees`、`rebate` 必须先确认 GST 口径和箱/瓶单位，再换算成同一商品单位。无法确认时标记 `COST_CONFIG_REQUIRED`，不得计算节省、毛利或库存持有成本。

## 当前安全门禁

- Odoo 供应商交期覆盖继续为 0%。
- 不得使用 POS/register 收货、stock move `create_date` 或 scheduled date 推断供应商交期。
- 不得创建、确认、收货 RFQ；采购建议保持人工审核和 `DRAFT_RFQ`/只读预览。
