# Shopfront 同步模块交接文档

更新时间：2026-10-28

本文记录 `Shopfront -> shopfront_crawler -> Orithos POS/Odoo` 链路的当前实现、线上验证结果、运行方法和后续工作。本文不保存任何密码、OAuth Token、Client Secret、Webhook Signing Key、Dokploy Cookie 或数据库连接串。

## 1. 系统边界

```text
Shopfront
  -> https://shopfront.orithos.com.au
  -> crawler 自有数据库
  -> crawler POS 集成 API
  -> https://skr.orithos.com.au
  -> Odoo 业务数据
```

- crawler 不直连 Orithos MySQL，也不绕过业务 API 写库。
- Orithos 当前正式业务源是 Odoo。
- Shopfront 报表用于汇总；正式销售导入需要完整 Sale、销售行和支付信息。
- 首个门店为 `skr`；`demo` 后续按独立门店授权和映射接入。
- 门店业务日期使用 `Australia/Adelaide`。

## 2. 代码和部署位置

| 项目 | 位置 |
|---|---|
| Orithos 主仓库 | `C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master` |
| crawler | `C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master\shopfront_crawler` |
| POS 集成控制器 | `pos-api/src/main/java/com/orithos/modules/integration/ShopfrontIntegrationController.java` |
| GitHub | `https://github.com/aishawn/aistore_pos` |
| 部署分支 | `main` |
| crawler 线上地址 | `https://shopfront.orithos.com.au` |
| SKR POS | `https://skr.orithos.com.au` |

Dokploy Compose：

- composeId：`WvcUddxTnymK_K5RZPPtL`
- appName：`aistore-aistorepos-oqghkh`

## 3. 运行配置

敏感值只配置在本地 `.env` 或 Dokploy Secret 中，不能提交 Git。

### crawler 必需变量

```env
SHOPFRONT_CLIENT_ID=
SHOPFRONT_CLIENT_SECRET=
SHOPFRONT_REDIRECT_URI=http://localhost:8000/oauth/shopfront/callback
SHOPFRONT_SCOPES=
DATABASE_URL=sqlite:///./data/shopfront_crawler.db
TOKEN_ENCRYPTION_KEY=
SYNC_TIMEZONE=Australia/Adelaide
POS_IMPORT_ENABLED=false
```

线上还需要配置 Orithos 集成地址和专用 API Token，以及对应的 Shopfront Webhook signing key。变量名以 `shopfront_crawler/.env.example` 和 Dokploy 环境为准；不要把实际值写入本文。

### OAuth

授权入口：

```text
https://skr.onshopfront.com/oauth/authorize
```

本地回调：

```text
http://localhost:8000/oauth/shopfront/callback
```

OAuth `state` 必须一次性使用并校验。授权失败时优先检查 Application 中允许的 scope；`see_sales` 等不受支持的 scope 会导致 `invalid_scope`，不能靠爬虫绕过授权权限。

## 4. 已实现接口

### 健康、授权和同步

```text
GET  /healthz
GET  /auth/shopfront/{store_key}/start
GET  /oauth/shopfront/callback
GET  /api/stores
POST /api/stores/{store_key}/sync
GET  /api/sync/runs
GET  /api/sync/status?store=skr
POST /api/stores/skr/history/discover
POST /api/stores/skr/history/sync
POST /api/sync/runs/{id}/retry
POST /api/sync/runs/{id}/cancel
```

### 只读数据 API

```text
GET /api/reports/daily-sales?store=skr&report_date=YYYY-MM-DD
GET /api/reports/sales-trend?store=skr&from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/sales?store=skr&page=1&size=50
GET /api/sales/{shopfront_sale_id}
GET /api/products?store=skr
GET /api/inventory?store=skr
GET /api/sync/runs?store=skr
```

### POS 导入

```text
GET  /api/pos/mappings?store=skr
POST /api/pos/import/products?store=skr
POST /api/pos/import/inventory?store=skr
POST /api/pos/import/sales?store=skr
POST /api/stores/skr/pos/full-snapshot
```

POS 导入默认关闭。打开前必须使用专用 API Token，并完成 Shopfront outlet 到 Orithos company/outlet 的映射校验。公司和门店 ID 不要求放在环境变量中，可以保存在 crawler 的映射配置中；缺失映射时应阻止正式导入。

## 5. 当前已验证结果

### 服务和部署

- `https://shopfront.orithos.com.au/healthz` 返回 HTTP 200。
- `https://skr.orithos.com.au/api/public/version` 已恢复正常，backend 不再为 `null`。
- 当前已确认的线上 POS commit：`fa850d81657f02c5b520a099f50210ccf9b1b309`。
- 已推送的优化 commit：`0aa729ea perf(shopfront): avoid repeated catalog imports during history`。Dokploy 部署记录为 `done`，但当时仍需通过下一条历史分片或容器版本确认 crawler 已切换到该镜像。

### Shopfront 产品数据（抽样 50 个）

| 字段 | 结果 |
|---|---:|
| 名称 | 50/50 |
| 描述 | 50/50 |
| 条码 | 50/50 |
| 售价 | 50/50 |
| 成本 | 50/50 |
| 分类 | 50/50 |
| 税率 | 50/50 |
| `trackInventory` | 50/50 |
| `caseQuantity` | 50/50 |
| 价格数组 | 50/50 |
| 库存数据 | 50/50 |
| 图片 | 0/50 |

图片为空是当前 Shopfront 源数据状态，不是传输丢失。品牌、Family、补货字段在该抽样中也是源数据为空；不应在同步侧编造。

### 销售数据

- 抽样 200 条销售，包含 391 条销售行。
- 391/391 销售行都有商品名称。
- 支付记录可以正常返回。

### SKR Sell

使用 `shawn` 登录后，`/api/sell/search?q=ALFALFA` 已返回：

- `ALFALFA MUNG BEAN PUNNET`
- `ALFALFA SPROUTS PP`

其中 `ALFALFA MUNG BEAN PUNNET` 的 POS 商品 ID 为 5、条码为 5445、售价为 1.0；名称和售价已经同步到 Sell。

### POS mirror 统计

最近一次集成查询结果：

```text
products: 50
inventory: 100
sales: 76945
sale_items: 149226
payments: 92896
barcode_matched: 50
barcode_unmatched: 0
```

`sales_with_unmatched_items: 76944` 主要是历史销售引用了当前 Shopfront 产品目录中已经不存在的旧商品 ID。销售行仍保留名称、条码和原始 payload；销售导入逻辑应按源商品 ID 幂等创建历史商品，不能仅因为当前目录没有该 ID 就静默丢弃销售行。

## 6. 历史同步状态

当前历史任务：

```text
任务 ID：25
门店：skr
范围：2011-04-22 至 2026-10-27
状态：running
最近游标：约 2022-03-25
```

**不要重复启动任务 25。** 继续观察它的状态和最新分片。

优化前，历史任务的每个日期分片都可能重复推送 50 个产品和约 2550 条库存，导致任务看起来很慢。`0aa729ea` 已改为：

- 首个分片推送完整产品和库存；
- 后续分片只在有销售时推送销售；
- 空日期分片不重复写产品和库存。

确认优化生效的标志：后续非首个空分片应显示 `pos_import.products = 0`、`pos_import.inventory = 0`、`sales = 0`；有销售的分片只推送销售。

## 7. 日常操作

### 查看服务和同步状态

```powershell
Invoke-WebRequest 'https://shopfront.orithos.com.au/healthz' -UseBasicParsing
Invoke-WebRequest 'https://shopfront.orithos.com.au/api/sync/status?store=skr' -UseBasicParsing
Invoke-WebRequest 'https://shopfront.orithos.com.au/api/sync/runs?store=skr&limit=3' -UseBasicParsing
```

### 查询产品、库存和销售

```powershell
Invoke-WebRequest 'https://shopfront.orithos.com.au/api/products?store=skr' -UseBasicParsing
Invoke-WebRequest 'https://shopfront.orithos.com.au/api/inventory?store=skr' -UseBasicParsing
Invoke-WebRequest 'https://shopfront.orithos.com.au/api/sales?store=skr&page=1&size=50' -UseBasicParsing
```

### 手动触发 POS 全量快照

历史任务完成后再运行：

```powershell
Invoke-WebRequest `
  'https://shopfront.orithos.com.au/api/stores/skr/pos/full-snapshot' `
  -Method Post -UseBasicParsing
```

不要在历史任务运行期间反复触发全量快照。

### Dokploy 部署

部署必须使用 `main` 分支和仓库根目录的 `docker-compose.yml`。触发部署所需的 Cookie 或 webhook 只从本机忽略文件/环境变量读取，不写入命令日志或文档。部署后必须核对：

1. Dokploy 状态为 `Done`；
2. 构建 SHA 包含目标 commit；
3. crawler 和 POS 健康检查通过；
4. 线上版本接口返回的 SHA 与目标代码一致；
5. 再做只读接口验证。

## 8. 每日同步预期

每日任务应在 `02:00 Australia/Adelaide` 执行，并重新同步最近 3 个营业日，以覆盖修改、取消、退款和延迟上传。流程应包含：

1. upsert 销售汇总、Sale、SaleItem；
2. 同步商品和当前库存快照；
3. 将变更加入 POS 导入队列；
4. 失败任务保留并在下一次运行重试；
5. 记录汇总、销售、商品、库存、POS 创建/更新/失败和错误数。

历史销售导入不应重复扣库存。日常库存以 Shopfront 当前库存快照覆盖；历史库存重建必须作为单独、明确批准的任务执行。

## 9. 后续排查顺序

### A. 历史任务长时间不动

1. 查询 `/api/sync/status` 和 `/api/sync/runs`；
2. 确认没有第二个历史任务；
3. 查看最新分片的日期、游标、错误、重试时间和 `pos_import` 统计；
4. 确认 crawler 运行版本是否包含 `0aa729ea`；
5. 只重试失败分片，不重新创建全量历史任务。

### B. Sell 没有商品

1. 查询 crawler `/api/products`；
2. 查询 POS mirror 的产品和匹配状态；
3. 确认 POS 商品导入已启用且门店映射通过；
4. 用条码优先、SKU 兜底检查匹配；
5. 不按名称自动创建正式商品，未匹配项进入待处理队列。

### C. Sell 没有销售额

1. 先确认 Shopfront Sale 明细是否有稳定 Sale ID、销售行和支付；
2. 确认销售状态和支付方式可映射；
3. 检查 POS 导入状态和错误字段；
4. 抽样对比 Shopfront 报表、crawler Sale 和 Orithos 销售；
5. 信息不完整时禁止写入正式销售，等待权限或 GraphQL 查询修复。

### D. 图片为空

检查 Shopfront 产品原始 GraphQL payload。若源数据没有图片 URL，应向 Shopfront 侧补充图片后再同步；不要在 crawler 中生成或猜测图片。

## 10. 安全和数据约束

- 不提交 `.env`、数据库文件、Token、密码、Cookie、Webhook key 或真实 API 响应中的敏感字段。
- 不使用个人管理员 JWT 作为 crawler 长期凭证；使用独立服务账号/API Token。
- 不把历史导入直接写入生产 Odoo，先在隔离测试公司验证。
- 不创建测试销售来验证线上链路；优先使用只读接口、镜像统计和已有数据抽样。
- 不把 Shopfront 登录密码用于爬虫登录；OAuth 失败应修复 scope、回调和 Application 配置。

## 11. 待完成清单

- [ ] 确认历史任务 25 完成，或列出明确失败区间。
- [ ] 确认 `0aa729ea` 已运行在线上 crawler。
- [ ] 历史完成后执行一次受控的 `full-snapshot`。
- [ ] 抽样核对 Shopfront 与 Orithos 的销售汇总、销售行和支付。
- [ ] 验证取消、退款和销售修改的幂等更新。
- [ ] 验证每日 `02:00 Australia/Adelaide` 任务在进程重启后仍能恢复。
- [ ] 确认未匹配历史商品的处理清单。
- [ ] 如需图片，在 Shopfront 源侧补齐后重新同步。
- [ ] `demo` 门店单独完成 OAuth、映射、只读验证，再开启导入。

