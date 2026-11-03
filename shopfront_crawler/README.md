# Shopfront Crawler

独立的 Shopfront OAuth、销售同步、商品/库存同步和 Webhook 服务。第一阶段只读 Shopfront 并保存到自己的数据库，不写入 Orithos Odoo 或 Classic POS。

## 本地运行

```powershell
cd C:\shawn\1code\1project-new\aistore_pos\v1\shopfront_crawler
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[test]"
Copy-Item .env.example .env
# 填写 Shopfront Application 的 client id/secret 和 TOKEN_ENCRYPTION_KEY
uvicorn app.main:app --reload --port 8000
```

开始 SKR 授权：

```text
http://localhost:8000/auth/shopfront/skr/start
```

Shopfront Application 的 Redirect URI 必须是：

```text
http://localhost:8000/oauth/shopfront/callback
```

## 常用接口

```text
GET  /healthz
GET  /api/stores
POST /api/stores/skr/sync
GET  /api/reports/daily-sales?store=skr&report_date=2026-10-24
GET  /api/reports/sales-trend?store=skr&from=2026-10-01&to=2026-10-24
GET  /api/sales?store=skr&page=1&size=50
GET  /api/products?store=skr
GET  /api/inventory?store=skr
GET  /api/sync/runs?store=skr
POST /api/stores/skr/history/discover
POST /api/stores/skr/history/sync
POST /api/stores/skr/pos/catalog-snapshot
POST /api/stores/skr/pos/sales-repair
GET  /api/sync/status?store=skr
GET  /api/sync/coverage?store=skr
GET  /api/pos/coverage?store=skr
GET  /api/pos/products/reconcile?store=skr
POST /api/stores/skr/supply-chain/sync
GET  /api/suppliers?store=skr&page=1
GET  /api/purchase-orders?store=skr&page=1
POST /api/sync/runs/{id}/retry
POST /api/sync/runs/{id}/cancel
GET  /api/pos/mappings?store=skr
POST /api/pos/import/products?store=skr
POST /api/pos/import/inventory?store=skr
POST /api/pos/import/sales?store=skr
```

商品对账按 Shopfront 外部 ID 比较。POS 返回的唯一 ID 数与分页总数不一致时，对账会失败关闭，不会报告不完整差异，也不会自动删除商品。供应商与采购订单以只读影子镜像保存，不会创建 Odoo 供应商、采购单或收货。需要在 Shopfront Application 获得 `see_suppliers`、`see_stock_management` 权限后设置 `SHOPFRONT_ENABLE_SUPPLY_CHAIN=true` 并重新授权；未启用时不把可选 scopes 加入 OAuth 请求。

每日任务默认在 `02:00、10:00、18:00 Australia/Adelaide` 执行，每次重新同步前 3 个营业日。可通过 `SYNC_DAILY_HOURS` 调整小时列表。首次目录同步是全量；之后使用 Shopfront 支持的 `updatedAfter` 和 `lastStocktakedAfter` 过滤器，只合并变化的商品和库存，并在下游镜像确认后推进 checkpoint。历史任务使用 14 天分片，每个分片独立记录。

长任务全部写入 `sync_jobs`，由内置持久 worker 每 2 秒领取；服务重启后会重新排队遗留任务，心跳超过 `WORKER_STALE_AFTER_SECONDS` 的任务会自动回收。需要拆分 Dokploy 服务时，可运行 `python -m app.worker`，它与 Web 服务共用同一数据库队列。

当历史任务正在运行时，可以单独执行 `pos/catalog-snapshot` 刷新商品、价格、条码、描述、图片、标签和库存；执行 `pos/sales-repair` 重新推送已保存销售并回填 SaleItem 名称。这两个任务使用持久化 job，支持通过 `/api/sync/status` 查看状态，不会重复创建历史任务或扣减库存。

POS 导入默认关闭（`POS_IMPORT_ENABLED=false`）。开启前必须配置专用 API Token，并通过 `/api/pos/mappings/{store}` 保存门店映射。公司/门店 ID 不放在环境变量中；缺失映射时只生成 `BLOCKED_MAPPING` staging 记录。确认 Shopfront Sale 查询包含 Sale ID、商品行和支付方式后，才允许销售导入。

当前 Orithos 生产业务源是 Odoo。crawler 不直连 MySQL，也不会绕过 Orithos 业务 API 写库；正式写入应先在隔离测试公司验证，再单独开启生产配置。

商品和库存 GraphQL 查询可通过 `SHOPFRONT_PRODUCTS_QUERY` 与 `SHOPFRONT_INVENTORY_QUERY` 覆盖；原始响应保存在 `raw_payload` 中。
如果需要逐笔 Sale 详情，可在确认当前账号 GraphQL schema 后设置 `SHOPFRONT_SALE_DETAIL_QUERY`，查询变量使用 `$id`。

注册 Webhook 后，把对应的 signing key 放入 `SHOPFRONT_WEBHOOK_SIGNING_KEY_SKR`。未配置签名密钥时，Webhook 接口会拒绝请求。

生产环境使用 PostgreSQL、HTTPS、独立 Application 和部署平台 Secret。不要提交 `.env`、client secret、OAuth token 或 Webhook signing key。
