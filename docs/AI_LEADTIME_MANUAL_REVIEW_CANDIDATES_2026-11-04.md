# 交期与采购成本人工审核候选（2026-11-04）

## 范围

本次通过 SKR crawler 的只读接口 `/api/purchase-orders?store=skr` 分页读取 2,356 条 Shopfront 采购镜像（每页 500 条，读取时间 2026-11-04）。没有调用 Odoo 写接口，也没有创建、确认或收货采购单。

## 字段覆盖与初步统计

| 项目 | 结果 |
|---|---:|
| 采购订单 | 2,356 |
| `RECEIVED` 订单 | 2,306 |
| 已收采购行 | 31,513 |
| 已收订单有 `receivedAt` | 2,306 / 2,306 |
| 采购行有供应商 | 31,513 / 31,513 |
| 采购行有 `caseQuantity` | 31,513 / 31,513 |
| 采购行有基础成本 `baseCost` | 31,513 / 31,513 |
| 采购行有 `receivedQuantity` | 31,513 / 31,513 |
| 订单日期到收货日期的中位差 | 1 天 |
| 订单日期到收货日期范围 | -29 至 316 天 |

`raw_payload` 同时包含 `orderedQuantity`、`receivedQuantity`、`baseCost`、`fees`、`freight`、`paymentFees`、`rebate`、供应商、商品和条码字段。这里的覆盖率是 Shopfront 镜像字段覆盖率，不是 Odoo 供应商交期覆盖率。

## 人工审核队列

优先抽取以下样本，不回写主数据：

1. `RECEIVED` 订单中订单日到收货日为负数的全部 8 条，确认日期字段是否跨时区、纠正录入或订单拆分。
2. 交期超过 30 天的订单，逐单核对实际到货凭证、订单状态和是否为补录历史订单。
3. 每个主要供应商至少抽取 10 个正常范围订单，覆盖啤酒、葡萄酒、烈酒和不同箱规。
4. 对每条样本核对：供应商、采购单、`orderDate`、`receivedAt`、商品/条码、箱规、订购量、收货量、基础成本、GST/费用、运费、返利和付款费用。

## 口径与门禁

- `receivedAt - orderDate` 只能作为人工审核候选交期；在确认它们分别代表下单和实际收货的业务事件前，不得写入 `supplierinfo.delay` 或用于生产补货计算。
- `baseCost`、`fees`、`freight` 等字段尚未完成 GST 包含/不含和箱/瓶单位核对，不能直接计算真实采购成本节省。
- Shopfront 采购镜像订单与 Odoo `purchase.order` / `stock.picking.purchase_id` 当前没有可靠关联；因此不能把这批统计替代 Odoo 原生 lead-time 覆盖率。
- 当前 Odoo 交期覆盖门禁继续保持 0%，采购建议保持人工审核和 `DRAFT_RFQ`/只读预览。

## 证据限制

本报告是只读候选清单，不是业务确认结果。原始订单 JSON 未复制进 Git，也未记录账号、密码、token 或数据库连接串。确认完成前不修改 Odoo 主数据。
