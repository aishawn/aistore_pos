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

候选 SHA `9b46f9f8` 在本地 Temurin Java 21 执行 `mvn -B clean verify` 成功：511 个测试通过、0 failures、0 errors，生成 `pos-api-0.1.0.jar`。该结果不替代 GitHub Actions 的远端构建；候选分支已推送到 `codex/assistant-provenance-ui`，尚未合并 `main` 或部署。

## 约束

本复核所有线上请求均为 GET；没有创建、确认、收货或修改采购单，也没有重启或取消线上同步任务。
