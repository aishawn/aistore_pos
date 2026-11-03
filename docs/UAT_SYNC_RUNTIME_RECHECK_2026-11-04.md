# SKR 同步运行时复核（2026-11-04）

## 只读观察

复核接口：

`https://shopfront.orithos.com.au/api/sync/status?store=skr`

| Job | 类型 | 当前状态 | 关键证据 |
|---:|---|---|---|
| 41 | history | `completed` | `2026-11-01..2026-11-03`，游标已到 `2026-11-04` |
| 43 | supply_chain | `running` | phase=`supply_chain`，最后心跳 `2026-11-03T21:43:02.782297` |
| 44 | extended_data | `queued` | 等待 worker 领取 |

在本次复核后等待 30 秒，job 43 的状态、phase 和心跳没有变化。`/healthz` 仍返回 200，但这只能证明 HTTP 进程存活，不能证明后台 worker 正在推进。因此不能把 43 当作活跃进度，也不应在没有查明部署/worker 状态前取消、重启或重复创建同类任务。

## 结论

- 历史销售块已由 job 41 成功补齐到请求范围；此前 job 40 的 `pos_import` 失败记录仍保留为历史审计事实。
- 当前源库/扩展数据覆盖仍不能宣称最终完整，因为供应链 job 43 停滞、扩展数据 job 44 尚未开始，且任务 40 曾留下 `INCOMPLETE` 销售。
- 下一次操作应先从 Dokploy/容器日志确认 worker 是否存活及 job 43 的最后异常，再决定是否恢复 worker。不得仅因 `/healthz=200` 就重跑任务。
- 在供应链和扩展数据终态、审计计数重新读取并通过后，才更新数据覆盖报告和 AI 预测输入快照。

## 候选构建证据

候选原始 SHA `9b46f9f8` 在本地 Temurin Java 21 执行 `mvn -B clean verify` 成功；随后合并包含同步重放和库存锁修复的 `origin/main`，合并提交为 `9fc7446b`，当前候选 HEAD 为 `d130c232`。合并后再次执行 `mvn -B clean verify`，结果为 511 个测试通过、0 failures、0 errors，生成 `pos-api-0.1.0.jar`；在 `shopfront_crawler` 包根目录执行 `python -m pytest -q tests`，结果为 56 passed。上述本地结果不替代 GitHub Actions 的远端构建；候选分支已推送到 `codex/assistant-provenance-ui`，尚未合并 `main` 或部署。

前端 `pos-ui` 合并后验证：`npm run test:unit` 为 153 passed、0 failed；`npm run typecheck` 正常结束。GitHub Actions API 在当前环境对该仓库返回 404，因此暂不能把本地结果写成远端 CI 通过。

趋势接口口径已在候选中补强：`/api/reports/sales-trend` 现在返回请求范围、实际返回日期、`missing_dates`，并明确 `missing_date_status=UNCLASSIFIED_NO_SUMMARY_ROW`；缺摘要不会被解释为闭店或零销售。crawler 测试复跑结果为 57 passed。

候选进一步为 `extended_data` worker 增加 15 秒独立心跳，避免长时间 Shopfront 请求期间 `heartbeat_at` 停止更新而无法区分“慢任务”和“停滞任务”。改动后 crawler 测试仍为 57 passed；该修复尚未部署线上。

线上 job 44 最终为 `partial`：1,873 条扩展记录已同步，唯一警告是 `saved_reports` 的多态 GraphQL 字段不兼容。候选已移除该不稳定字段，仅保留稳定公共字段；crawler 测试更新为 58 passed。该修复尚未部署，因此线上 job 44 的旧警告仍保留为审计事实。

## 约束

本复核所有线上请求均为 GET；没有创建、确认、收货或修改采购单，也没有重启或取消线上同步任务。
