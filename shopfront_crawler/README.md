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
POST /api/sync/runs/{id}/retry
POST /api/sync/runs/{id}/cancel
GET  /api/pos/mappings?store=skr
POST /api/pos/import/products?store=skr
POST /api/pos/import/inventory?store=skr
POST /api/pos/import/sales?store=skr
```

每日任务默认在 `02:00 Australia/Adelaide` 执行，并重新同步前 3 个营业日。历史任务使用 14 天分片，每个分片独立记录，服务重启后可通过 `/api/sync/status` 和失败运行重试。

当历史任务正在运行时，可以单独执行 `pos/catalog-snapshot` 刷新商品、价格、条码、描述、图片、标签和库存；执行 `pos/sales-repair` 重新推送已保存销售并回填 SaleItem 名称。这两个任务使用持久化 job，支持通过 `/api/sync/status` 查看状态，不会重复创建历史任务或扣减库存。

POS 导入默认关闭（`POS_IMPORT_ENABLED=false`）。开启前必须配置专用 API Token，并通过 `/api/pos/mappings/{store}` 保存门店映射。公司/门店 ID 不放在环境变量中；缺失映射时只生成 `BLOCKED_MAPPING` staging 记录。确认 Shopfront Sale 查询包含 Sale ID、商品行和支付方式后，才允许销售导入。

当前 Orithos 生产业务源是 Odoo。crawler 不直连 MySQL，也不会绕过 Orithos 业务 API 写库；正式写入应先在隔离测试公司验证，再单独开启生产配置。

商品和库存 GraphQL 查询可通过 `SHOPFRONT_PRODUCTS_QUERY` 与 `SHOPFRONT_INVENTORY_QUERY` 覆盖；原始响应保存在 `raw_payload` 中。
如果需要逐笔 Sale 详情，可在确认当前账号 GraphQL schema 后设置 `SHOPFRONT_SALE_DETAIL_QUERY`，查询变量使用 `$id`。

注册 Webhook 后，把对应的 signing key 放入 `SHOPFRONT_WEBHOOK_SIGNING_KEY_SKR`。未配置签名密钥时，Webhook 接口会拒绝请求。

生产环境使用 PostgreSQL、HTTPS、独立 Application 和部署平台 Secret。不要提交 `.env`、client secret、OAuth token 或 Webhook signing key。
