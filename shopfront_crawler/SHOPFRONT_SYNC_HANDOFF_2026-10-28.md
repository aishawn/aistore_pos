# Shopfront 同步模块交接文档

## 2026-10-28 数据完整性复核与接手状态

以下是 2026-10-28 最近一次线上 API 核查结果；接手后必须重新请求状态接口，数量会随同步变化。

| 数据层 | 商品 | 库存 | 销售 | 销售行 | 缺名销售行 |
|---|---:|---:|---:|---:|---:|
| crawler 源库 | 10,882 | 10,838 | 112,887 | 220,621 | 9 |
| POS staging | 11,010 | 10,838 | 112,887 | 220,621 | 14,554 |
| Odoo 镜像（`aipos_uat`） | 11,011 | 10,888 | 112,887 | 220,624 | 8,678 |

- Sell 商品 API 抽样 500 个商品，名称缺失为 0；再用 25 个 Shopfront 商品名搜索，25 个均能精确命中。当前可售目录名称已同步；主要名称缺口在历史销售行。
- crawler 有 10,882 个商品，其中名称 10,882、描述 4,425、条码 10,822、SKU 4,609、分类 10,838、品牌 0、图片 0、多图 0、价格 10,846、成本 10,882。Shopfront 当前产品图片与 `alternateImages` 覆盖均为 0；目标端没有图片是源端缺数据，不能伪造或用占位图代替。
- crawler、POS staging 库存均有 10,838 行。Odoo 镜像有 10,838 个有效 source product/outlet 键，另有 50 条旧 `outlet_id=default` 镜像重复行。Odoo 清理过期镜像键的修复 `cee46f4` 已推送 `orithos_odoo` main；仍须确认 Dokploy 已部署，并由下一次完整库存快照验证。该修复不会改写或清零 `stock.quant`。
- 按 barcode 优先、SKU 兜底，10,832/10,882 个商品可匹配；50 个商品同时缺 barcode 和 SKU。另有 270 个匹配商品名称不一致，需要人工抽样确认；禁止只按名称自动改名或建立重复商品。
- Odoo 中当前 Shopfront 正式 POS 销售单为 0；112,887 条属于同步镜像数据，不得描述为已进入正式收银交易。
- 线上 crawler 健康，`skr` OAuth active。历史 job `25` 仍为 running，游标停在 `2024-10-04`，run `1435` 处理 `2024-10-04` 至 `2024-10-17`；销售修复 job `29` 仍 queued。销售修复 run `28` 曾因 PostgreSQL `could not serialize access due to concurrent update` 失败。**不要重复创建 history 或 sales-repair 任务。**
- 最近一次 `https://skr.orithos.com.au/api/public/version` 返回 POS frontend/backend commit `0892153f`；当时 crawler 仍未包含本次历史分片写锁修复。

### 本次修复

提交 `fix(shopfront): release writer between history chunks` 将历史写锁从整段历史任务缩小到单个分片及游标提交，并移除锁忙时直接返回的逻辑。目录/销售修复、全量快照仍使用同一写锁，因此等待中的 job `29` 可在历史分片边界执行，避免与同一 Sale/Product 并发写入。

修复已在最新 `origin/main` 基线上通过 crawler pytest 与 compileall；GitHub 推送及 Dokploy 部署状态以本节后续更新为准。部署后预期既有 queued job `29` 自动继续，history job `25` 在分片间释放 writer 并推进游标。

### 接手步骤

1. 查询 `/api/sync/status?store=skr`、`/api/sync/runs?store=skr&limit=10`，确认 job `25`、job `29` 没有被重建，并记录当前游标和最新运行状态。
2. 确认 crawler 部署 SHA 包含分片锁修复。轮询到 job `29` 完成；确认 job `25` 游标推进或最终完成。
3. 再查 `/api/sync/coverage?store=skr` 与 `/api/pos/coverage?store=skr`。POS staging/Odoo `sale_items_missing_name` 应从上述旧值显著下降；不能仅以任务状态 completed 作为验收。
4. 确认 Odoo `cee46f4` 已部署，再触发或等待一次完整库存快照；镜像 `default` outlet 行应归零，真实 `stock.quant` 数量不得因清理镜像行而改变。
5. 重新核对商品匹配、名称差异、无标识商品、库存 outlet 和 Sale 行名称；历史 Sale 导入正式 POS 需要另行验证，不要通过重复创建正式交易来补镜像。

不要取消 job `25`、重复启动全量历史、按名称自动匹配商品、直接删除商品、清零库存或 Fresh Volumes。

最后更新：2026-10-28  
适用目录：`orithopos-master/shopfront_crawler`  
线上 crawler：`https://shopfront.orithos.com.au`  
首个门店：`skr`（Shopfront vendor：`skr`）

## 1. 目标与边界

本模块负责把 Shopfront 的授权、销售、商品和库存同步到自己的同步库，并向 Orithos 提供受保护的导入入口。

当前阶段的链路是：

```text
Shopfront
  -> shopfront_crawler 自有数据库
  -> crawler 只读 API / POS staging
  -> Orithos 业务 API / Odoo
```

crawler 不直连 Orithos MySQL，不绕过 Odoo 业务逻辑写生产表。正式销售导入必须经过匹配、门店映射、支付映射和幂等校验。

## 2. 代码与部署位置

实际部署源代码位于：

```text
C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master\shopfront_crawler
```

外层目录下的 `shopfront_crawler` 是旧副本，后续修改不要放在那里。

主要文件：

| 文件 | 用途 |
| --- | --- |
| `app/main.py` | FastAPI 路由、启动任务、Webhook 和同步接口 |
| `app/shopfront.py` | OAuth、Token 刷新、Shopfront GraphQL/Reports 客户端 |
| `app/sync.py` | 快照、历史同步、分片、补偿任务 |
| `app/models.py` | Token、商品、库存、销售、同步运行记录 |
| `app/db.py` | SQLAlchemy、SQLite WAL、启动迁移 |
| `app/pos.py` | Orithos POS staging/import 调用 |
| `.env.example` | 配置模板，不包含任何真实密钥 |
| `README.md` | 快速启动和接口索引 |
| `tests/` | OAuth、同步、幂等和接口测试 |

Git 已推送到 GitHub `main`。近期关键提交：

- `c43b14b4`：修复旧 SQLite 数据库缺列导致接口 500；
- `e144cea7`：启用 SQLite WAL/busy timeout，并按销售批次提交，减少历史同步期间读接口阻塞。

## 3. 本地启动

```powershell
cd C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master\shopfront_crawler
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[test]"
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

Shopfront Application 的回调地址必须与配置完全一致：

```text
http://localhost:8000/oauth/shopfront/callback
```

开始 `skr` 授权：

```text
http://localhost:8000/auth/shopfront/skr/start
```

## 4. 生产配置原则

真实值只放 Dokploy Secret/Environment，不提交 Git，不写入日志和交接文档。关键配置包括：

```text
SHOPFRONT_CLIENT_ID
SHOPFRONT_CLIENT_SECRET
TOKEN_ENCRYPTION_KEY
DATABASE_URL
POS_API_BASE_URL
POS_API_TOKEN
POS_IMPORT_ENABLED
SYNC_TIMEZONE=Australia/Adelaide
SYNC_DAILY_HOUR=2
SYNC_DAILY_MINUTE=0
SYNC_LOOKBACK_DAYS=3
```

`TOKEN_ENCRYPTION_KEY` 用 Fernet 生成。生产数据库建议 PostgreSQL；本地默认 SQLite。不要执行 Fresh Volumes，否则会删除同步库和授权状态。

公司和 outlet 映射不再依赖环境变量。应通过 crawler 的映射接口保存，并在导入前校验：

```text
GET  /api/pos/mappings?store=skr
POST /api/pos/mappings/skr
```

缺少映射时只能生成 `BLOCKED_MAPPING` staging 记录，不得写入正式销售。

## 5. 常用接口

```text
GET  /healthz
GET  /api/stores
POST /api/stores/skr/sync
GET  /api/sync/status?store=skr
GET  /api/sync/runs?store=skr&limit=20
GET  /api/products?store=skr
GET  /api/inventory?store=skr
GET  /api/sales?store=skr&page=1&size=50
POST /api/stores/skr/history/discover
POST /api/stores/skr/history/sync
POST /api/sync/runs/{id}/retry
POST /api/sync/runs/{id}/cancel
POST /api/pos/import/products?store=skr
POST /api/pos/import/inventory?store=skr
POST /api/pos/import/sales?store=skr
```

所有查询接口读取本地同步库，不在用户请求中直接访问 Shopfront。历史任务使用 14 天分片；每日任务在 `Australia/Adelaide` 本地时间 02:00 执行，并重新同步最近 3 个营业日。

## 6. 当前线上状态（2026-10-28）

已验证：

- `/healthz` 返回 200；
- `/api/stores` 返回 200，`skr` token 状态为 `active`；
- `/api/sync/status`、`/api/sync/runs`、`/api/products`、`/api/inventory`、`/api/sales` 可访问；
- 最近的快照任务 21、22、23、24 已完成；
- 数据库已有约 2247 个唯一商品，商品名称和售价已覆盖；
- 库存已有 50 条记录、20 条非零库存，来源 outlet 为 `Cellarbrations at St Kilda Road`。

未完成：

- 历史任务 ID `25` 仍为 `running`，范围 `2011-04-22` 至 `2026-10-27`；
- 当前游标停在 `2024-10-04`；
- 当前分片为 `2024-10-04` 至 `2024-10-17`，对应最近 run `1418`；
- run `1414` 至 `1417` 是 crawler 重启后产生的失败/重试记录，不代表数据已经完成；
- 在任务 25 完成前，不要重复启动 full history，也不要并行启动新的 snapshot。

查询命令：

```powershell
Invoke-RestMethod "https://shopfront.orithos.com.au/api/sync/status?store=skr" | ConvertTo-Json -Depth 8
Invoke-RestMethod "https://shopfront.orithos.com.au/api/sync/runs?store=skr&limit=5" | ConvertTo-Json -Depth 8
```

## 7. 数据完整性现状

当前商品字段覆盖抽样结果：

| 字段 | 覆盖 |
| --- | ---: |
| 名称 | 2247/2247 |
| 描述 | 2191/2247 |
| 条码 | 2234/2247 |
| 售价 | 2247/2247 |
| 成本 | 2247/2247 |
| 分类 | 50/2247 |
| SKU | 5/2247 |
| 品牌 | 0/2247 |
| 图片 | 0/2247 |

分类、SKU、品牌和图片缺失主要是 Shopfront 源数据本身为空，不能凭名称推测或伪造。原始 Shopfront payload 已保存，后续应先确认源端字段和权限，再决定是否补采。

POS shadow 快照曾统计到：商品 1880、库存 100、销售 105959、销售行 206648、支付 127324；其中销售行名称缺失 148103。该快照需要在历史任务完成后重新生成，不能作为最终验收结果。

## 8. 下一步操作顺序

### 8.1 先确认历史任务是否推进

每隔一段时间查看任务 25 和 run 1418 的游标、状态和结束时间。若游标变化，继续等待；若长时间不变，先查看 Dokploy crawler 日志，确认是 Shopfront 超时、限流、响应过大还是进程重启。不要直接取消任务。

### 8.2 历史任务完成后只执行一次快照

确认任务 25 已完成且没有 running 分片后，执行一次：

```text
POST https://shopfront.orithos.com.au/api/stores/skr/pos/full-snapshot
```

等待完成，再重新统计 POS 商品、库存、销售和销售行。

### 8.3 重新检查 POS 数据

使用 Dokploy 中的 integration token 调用：

```text
GET /api/integrations/shopfront/snapshot?storeKey=skr
GET /api/integrations/shopfront/match-status?storeKey=skr
GET /api/integrations/shopfront/data?storeKey=skr&type=products&page=1&size=500
GET /api/integrations/shopfront/data?storeKey=skr&type=sale_items&page=1&size=500
```

重点检查：

1. Sell 页面商品名称、条码/SKU、售价和库存是否显示；
2. 历史销售行是否能通过 source product ID 回填名称；
3. 条码匹配优先、SKU 兜底是否生效；
4. 同一个 Shopfront Sale 重跑是否只更新、不重复创建；
5. 未匹配商品是否进入待处理状态，而不是自动按名称创建商品。

### 8.4 再考虑正式导入

先选 1 至 3 个已核对营业日做小范围导入：商品和库存通过后，再导入销售。销售缺少 Sale ID、商品行或支付信息时必须阻断，不能用报表汇总伪造正式 POS 销售。

## 9. 排障规则

### 接口突然 500

先查 `/healthz` 和启动日志。旧 SQLite 数据库可能缺少新增字段；当前版本已包含启动迁移。确认部署使用的是实际 crawler 目录和最新 Git 提交，不要删除数据卷。

### 历史任务长时间 running

先读 `/api/sync/status`、`/api/sync/runs` 和 Dokploy 日志。若服务重启，旧运行会被标记失败并自动重试分片。不要重复提交 full history；必要时再针对失败 run 使用 retry。

### 商品有名称但 Sell 没有

先完成历史任务，再执行一次 full snapshot。检查 POS integration token、门店映射和 source product ID。能从 crawler 商品目录回填的名称应在 staging 重刷；Shopfront 源端没有名称的记录保留缺失状态。

### 图片、品牌、分类缺失

查看对应商品的 `raw_payload` 和 Shopfront GraphQL 权限/字段。源端为空时不生成默认图片、不猜品牌、不用名称自动创建分类。

### 线上升级

GitHub `main` 推送后由 Dokploy 构建部署。部署后立即验证 `/healthz`、`/api/stores`、`/api/sync/status`。确认没有误启用 Fresh Volumes，并保留数据库卷。

## 10. 安全与交接要求

- 不在 Git、Issue、日志或文档中记录 client secret、access token、refresh token、API token、密码、Webhook signing key、OAuth code/state；
- 用户提供的 Shopfront 登录密码只用于网页登录授权，不作为 crawler 配置；
- crawler 与 Orithos 之间使用独立 service token，不使用个人管理员 JWT；
- 生产导入前先做只读核对和小范围验证；
- 任何取消任务、重置数据库、替换生产库存的操作都要先确认影响范围；
- 修改 Java/POS API 时遵守 Java 21 构建门禁；本交接文档对应的近期改动仅涉及 Python crawler。

## 11. 完成判定

只有满足以下条件，才可以把本阶段标记为完成：

- 历史有效日期区间全部完成，或失败区间有明确人工清单；
- 没有长期 `running` 任务；
- crawler 汇总与 Shopfront 抽样一致；
- 商品、库存、Sale、SaleItem 和支付数量可解释；
- 重复同步不会产生重复 POS 销售；
- 缺少完整 Sale 明细时不会写入错误正式销售；
- 每日 02:00 任务可执行，失败可查看和重试；
- Sell 页面能显示已匹配商品、价格和库存；
- 未改变 Orithos 现有收银和库存业务逻辑。

