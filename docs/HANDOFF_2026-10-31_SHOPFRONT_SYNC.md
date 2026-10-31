# Shopfront `skr` 同步审计交接（2026-10-31）

## 当前结论

线上 crawler 健康，`skr` 门店 OAuth Token 为 active。历史全量任务仍在运行，不能把当前状态标记为“全部完成”。任务从持久化游标恢复，没有从历史起点重跑。

最近核查到的线上状态：

```text
history job: 70, running
cursor: 2025-01-27
target: 2024-01-01 .. 2026-10-30
current chunk: 2025-01-27 .. 2025-02-09
```

数据库快照（会随任务变化）：

| 数据 | 数量 |
| --- | ---: |
| crawler products | 10,891 |
| crawler sales | 155,112 |
| crawler sale items | 303,914 |
| crawler inventory | 10,839 |
| suppliers | 109 |
| purchase orders | 2,355 |

## 已验证

- crawler 缺失于 POS 的商品：`0`。
- POS-only 商品：`126`，全部有历史销售引用；无法解释的 POS-only：`0`。
- 销售行缺名称：`0`。
- 已完成且逐日对账通过的区间连续覆盖 `2024-01-01 .. 2025-01-26`。
- 最近完成分片 `2025-01-13 .. 2025-01-26`：2,332 笔销售、14 个汇总、`warnings=[]`、POS import completed。
- 该分片 14 天逐日 `difference=0`，`sale_items_missing_name=0`。
- 供应商和采购订单接口可读到 109 / 2,355 条。

商品的品牌、family、图片覆盖为 0，当前证据显示 Shopfront 源数据本身为空；不能用占位值补齐。

## 性能修复

提交 `edb6e551` 已推送到 GitHub `main`：

- 新增 `SYNC_SALE_COMMIT_BATCH_SIZE`，默认 `25`。
- 历史 Sale 写入由逐笔提交改为批次提交。
- 每个批次仍保存进度和心跳；取消在批次边界检查。
- 数据仍按 Shopfront Sale ID 幂等，重启最多回放一个批次，不会重复创建。
- crawler 测试：`32 passed`。

部署后 worker 已重启并从 `2025-01-13` 游标恢复，随后完成该分片并进入下一片，说明持久化恢复有效。

## 继续操作

1. 不要启动并行 history job，不要在任务运行中重复部署或取消任务。
2. 轮询：
   - `/api/sync/status?store=skr`
   - `/api/sync/runs?store=skr&limit=10`
   - `/shopfront-audit?store=skr`
3. 每个 14 天分片完成后，确认 `status=completed`、`warnings=[]`、`pos_import.status=completed`，再逐日调用：
   - `/shopfront-reconcile?store=skr&date=YYYY-MM-DD`
4. 最终游标达到 `2026-10-31` 后，再检查历史分片是否有未重试失败、覆盖范围、商品匹配、库存 outlet、供应商和采购订单数量。

## 证据边界

旧的 `failed` / `cancelled` run 记录包含过去的重启和操作取消；只有当同一日期区间没有后续 completed run 时才算未处理缺口。当前任务仍未完成，不能据此声称所有历史数据已经同步。

## 一致性复核补充

对旧的 warning 分片做强校验发现，部分日期确实存在报表汇总与 Sale 明细数量差异。例如 `2026-03-20..2026-03-23` 的差异分别为 `-240/-169/-128/-132`；`2026-01-09..2026-01-22` 也存在每日差异。销售行名称仍完整，但 Sale 记录不完整，不能视为已同步正确。

提交 `3c49a162` 增加同步一致性闸门：报告有数据而完整 Sale 查询为空，或报告与 GraphQL Sale 按营业日数量不一致时，分片抛错并由 worker 自动拆分重试，不再推进历史游标。提交已合并远端并推送到 `main`，线上 worker 已从持久化游标恢复。
