# 交期与采购成本人工审核表

本表用于审核 `AI_LEADTIME_MANUAL_REVIEW_CANDIDATES_2026-11-04.md` 中的 Shopfront 采购候选。审核完成前不得回写 Odoo `product.supplierinfo`、供应商成本或自动采购参数。

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
