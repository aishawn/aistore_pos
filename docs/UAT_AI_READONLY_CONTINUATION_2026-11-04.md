# AI 只读回归续测与趋势缺日证据（2026-11-04）

## 线上只读回归

本轮使用 SKR 账号登录，仅执行销售问答、报表读取和补货 GET/只读接口；Demo 仅执行补货只读接口。没有创建、确认、收货或修改采购单，两个补货探测的 `writeRequests` 和 `nonGetOdooCalls` 均为空。

运行版本：前后端均为 `767c018809306d8cd7bec3327a09bce535a0ebb1`。

SKR 结果：

- 精确日期 `2026-10-16` 销售问答返回 `AUD 7738.14`，与 `sales-daily` 只读 API 的 `7738.14` 对账通过。
- `How much did we take last week?` 返回 `50210`，而直接报表为 `AUD 25571.92`，仍为 BLOCKED；本地 `last week` 路由修复尚未部署。
- 经营问答仍要求人工处理，补货卡片显示供应商数据不完整；采购模式为 `DRAFT_RFQ`。
- 页面错误数为 0。
- 原生库存快照为 4 个观测日、连续无缺口、商品和数量字段完整；交期覆盖为 0%，状态为 `REVIEW`。

Demo 补货结果：

- 接口返回 200，产品覆盖 `COMPLETE`，数据源版本为 `odoo_pos_order_line_local_complete_days_v2`。
- 预测商品 12,987 个，其中仅 2,096 个 `VALID`，10,891 个 `INSUFFICIENT_HISTORY`。
- 原生库存为 3 个观测日，交期覆盖为 0%，`reviewRequiredCount=12987`，仍为 `REVIEW`。
- 采购模式为 `DRAFT_RFQ`，没有业务写请求。

原始输出（本地忽略目录）：

- `.local/ai-eval/online-ai-readonly-continue-2026-11-04.json`
- `.local/ai-eval/replenishment-readonly-continue-2026-11-04.json`

## 同步任务终态

轮询确认 job `40` 已终态失败，不应继续等待：`phase=pos_import`、`attempts=7`、错误为 `history chunk failed: 2026-11-01..2026-11-03`。失败载荷显示只导入了 650 个商品和 113 条销售，不能作为完整历史同步结果。失败后 `/shopfront-audit?store=skr` 为 `active_job=null`，但审计计数仍包含 818 条 `INCOMPLETE` 销售。

失败后的只读覆盖计数为：商品 11,027、库存 10,849、销售 155,665、销售行 305,052、供应商 109、采购订单 2,356、客户 20。原始快照见 `docs/UAT_SHOPFRONT_SYNC_FAILURE_2026-11-04.json`。下一次同步应先定位 `pos_import` 的 113 条销售块失败原因，再重跑受控历史块；不应直接把当前计数标记为完整。

## 趋势接口缺日

只读请求：

`https://shopfront.orithos.com.au/api/reports/sales-trend?store=skr&from=2024-01-01&to=2026-11-04`

该范围返回 1,019 个有销售日期，缺少 19 个日历日期。对每个缺日调用 `/shopfront-reconcile?store=skr&date=YYYY-MM-DD`，19 天均为 `summary_transaction_count=0`、`sale_count=0`、`difference=0`、`status=ok`。这只能证明当前 crawler 源库没有交易，不能证明门店当日闭店。

已由店主确认闭店的 11 天：

- 2024-01-01 至 2024-01-05
- 2024-01-10
- 2024-01-14 至 2024-01-16
- 2024-01-19
- 2024-01-23

仍需店主或营业日历确认的 8 天：

- 2024-01-17
- 2024-01-21
- 2024-01-24
- 2024-03-29
- 2024-12-25
- 2025-04-18
- 2025-12-25
- 2026-04-03

在确认前，这 8 天统一标记为 `ZERO_SALES_UNCLASSIFIED`，不作为正常营业日零销量，也不作为闭店日写入需求模型。趋势 API 当前不会为无销售日期补零行，因此前端不得把缺行直接解释为零销售。

## 发布门禁结论

- 分群回测的绝对 WAPE 门槛仍未通过；不切换生产默认模型。
- 原生库存历史未达到 28 个连续业务日；不评估真实 stockout、fill rate、库存成本或节省金额。
- 交期、MOQ 和采购成本仍未完成人工核验；不回写供应商主数据，不自动采购。
- `last week` 修复仍需同一候选提交的远端 Java 21 `mvn -B clean verify` 通过后才能部署。
