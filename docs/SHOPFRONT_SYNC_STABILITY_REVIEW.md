# Shopfront 每日同步链路与稳定性复盘

## 当前链路

```text
真实门店 Shopfront
  -> shopfront-crawler OAuth token
  -> APScheduler（Australia/Adelaide，默认每天 02:00 / 10:00 / 18:00）
  -> SQLite 持久队列（SyncJob、游标、heartbeat）
  -> 分 14 天窗口读取产品、库存、销售报表与明细
  -> crawler 本地事实库（SQLite，WAL）
  -> 幂等分页写入 Orithos POS API（可选镜像）
  -> Odoo API（由 ODOO_BUSINESS_WRITE_ENABLED 单独控制）
  -> POS/AI 读取 Odoo；AI 只读快照另有独立定时任务
```

R2 曾经位于这条链路旁边：独立 worker 从对象存储下载 SQLite/CSV 归档，再通过共享卷提供历史查询。它不是实时商店同步，也不是 Odoo 的业务事实源，因此已移除 worker、共享卷、R2 环境变量和后台触发接口。历史 R2 文档和一次性导入脚本保留作审计记录，不再作为运行时依赖。

## 当前实际同步范围

- 默认调度由 `SYNC_DAILY_HOURS` 控制，当前默认值是 `2,10,18`；业务时区是 `Australia/Adelaide`。
- 每次 daily sync 默认覆盖结束日前 3 天，目的是补偿门店延迟入账、跨日和短暂失败；它不是从 2010 年开始的全历史重扫。
- 产品/库存首次同步会拉完整目录；后续通过 catalog checkpoint 增量更新。销售按 14 天窗口切片，写入本地事实库后再分页推送。
- 供应链默认关闭；开启后按 `SHOPFRONT_SUPPLY_CHAIN_INTERVAL_DAYS`（默认 7 天）运行。客户同步也不是每次 daily sync 自动运行，而是在历史任务完成后按配置排队。
- `POS_IMPORT_ENABLED` 控制 POS 镜像写入；`ODOO_IMPORT_ENABLED` 控制 Odoo 同步客户端；`ODOO_BUSINESS_WRITE_ENABLED` 再控制 Odoo 业务写入。三者必须分别观测，不能用一个“同步成功”替代。

因此，当前系统可以稳定地做“产品、库存、最近 3 天销售”的重复补偿同步；若“所有数据”包含客户、供应商、采购单和全量历史，当前默认配置还没有做到每日全量，需要在真实门店授权后单独开启并验证。

## 主要风险

1. **上游限流或报表超时**：窗口过大、多个门店同时跑、销售明细分页慢都会导致任务堆积。当前 14 天切片、单门店 writer lock 和重启游标能降低风险，但不能替代限流指标。
2. **重复/漏数**：daily window 是补偿策略，依赖 source id 幂等 upsert。必须每天对源端报表总数、crawler 入库数、POS/Odoo 成功数做三方核对；只看 HTTP 200 不足以发现部分导入。
3. **任务卡死**：worker 通过 heartbeat 和 stale 回收恢复；外部 API 未设置合理 timeout 或进程频繁重启时，可能长期处于 running。应报警 `running` 超过阈值和 queued backlog 增长。
4. **权限漂移**：Shopfront scopes、Odoo token、POS API token 任一失效都会导致某一阶段失败。要把 OAuth 过期、权限不足、业务写入关闭分别记录。
5. **SQLite 单点**：crawler 数据库在 `shopfront-crawler-data` 卷内，适合测试但仍是单实例单盘。卷损坏、磁盘满或并发锁会影响恢复；每天至少导出 job/run/checkpoint 摘要和数据库备份。
6. **数据边界混淆**：Odoo 是业务事实源，POS mirror 是同步结果，R2 归档已不参与运行时。任何 AI 查询都必须标注数据时间和来源，避免把 crawler 缓存当成实时 Odoo。

## 测试阶段每日验证清单

- 每个调度窗口记录：门店、起止日期、各阶段耗时、源端计数、入库计数、POS/Odoo 返回计数、失败原因和重试次数。
- 连续观察 7 天：`completed` 比例、P95 时长、queued backlog、stale job 数、数据库大小/磁盘余量、API 429/5xx、产品/库存/销售三方差异。
- 每天抽查一笔新销售、一笔退款/修改销售、一个库存变化、一个价格/税率变化，确认能在 crawler、POS 和 Odoo 逐层追踪。
- 首次启用供应链或客户同步时先单店、低频、只读验证权限，再把 `SHOPFRONT_ENABLE_SUPPLY_CHAIN` / `SHOPFRONT_ENABLE_CUSTOMERS` 提升到目标范围；不要直接把全历史重扫和高频 daily sync 叠加。
- 失败任务优先重试原窗口；只有在确认源端数据已修正后才扩展 lookback，避免盲目全量重跑造成限流。

## 稳定性结论

当前架构的强项是：源端读取与业务写入分阶段、任务有持久游标、窗口可重入、写入有幂等边界、Odoo 业务写入有独立开关。当前最大缺口是：默认 daily sync 不是“所有实体全量每日同步”，以及缺少可直接用于验收的三方计数/延迟/失败率监控。测试阶段应先把这些指标补齐，再决定是否把客户、供应链和更长历史窗口纳入日常调度。
