# SKR 销量趋势缺日诊断（2026-11-04）

## 结论

本次只读检查了 `shopfront.orithos.com.au` 的 SKR 趋势接口和逐日 reconcile 接口。`/api/reports/sales-trend` 直接读取 `DailySalesSummary`，再通过 `preferred_summary_rows()` 选择有 outlet 的明细行，接口不会为没有销售的日期补一行零值，也没有在该响应中返回营业日历状态。

2024-01-01 至 2024-01-31 共返回 17 个有销售日期，缺少 14 天：

- 已由店主确认闭店：2024-01-01 至 2024-01-05、2024-01-10、2024-01-14 至 2024-01-16、2024-01-19、2024-01-23，共 11 天。
- 尚未确认营业日历状态：2024-01-17、2024-01-21、2024-01-24，共 3 天。

对这 3 天调用 `/shopfront-reconcile?store=skr&date=...`，结果均为 `summary_transaction_count=0`、`sale_count=0`、`status=ok`。这证明当前 crawler 数据库没有销售记录，不能证明闭店，也不能证明同步完整。它们应暂列为 `ZERO_SALES_UNCLASSIFIED`，不得直接填成正常营业零销量或闭店。

## 源查询定位

- `shopfront_crawler/app/main.py:2701` 的 `sales-trend` 只查询 `DailySalesSummary`。
- `preferred_summary_rows()` 只处理同一天的 outlet 总计与明细重复，不会制造日期，也没有发现因 outlet/null-outlet 去重而丢失上述 3 天的证据。
- `shopfront-reconcile` 将摘要行与按 `Australia/Adelaide` 本地日边界筛选的 `Sale` 记录对账；3 天两边均为 0。
- 当前 SKR history worker 仍在运行：job 40，`daily_sync`，phase `sales:fetched:396`，from `2026-11-01`，to `2026-11-03`。本次状态读取时间为 2026-11-04；不得据此假设全历史任务已完成。

## 处理决定

1. 已确认的 11 个闭店日应写入门店营业日历，编码为 `CLOSED`，不计入需求暴露分母。
2. 2024-01-17、01-21、01-24 保留为待核实日；在得到营业时间表、Shopfront closure 事实或店主逐日确认前，不用于正式需求率验收。
3. 趋势 API 后续应返回显式日历状态（`CLOSED`、`OPEN_ZERO_SALES`、`OPEN_WITH_SALES`、`DATA_GAP`），或由上层在展示/预测前按营业日历补齐日期。当前只读接口不应把缺行解释成 0 销售。

## 证据范围与限制

- 所有请求均为 GET，只读，`writeRequests=[]`；没有创建、确认或收货采购单。
- 证据来源是当前线上 crawler API；没有把本地重建库存或第三方数据当作事实源。
- 本文只定位日期缺行的来源，不改变生产代码，也不宣布历史同步完整。
