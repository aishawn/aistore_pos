# Shopfront `skr` 同步交接文档

更新时间：2026-11-02（Asia/Shanghai）  
线上服务：`https://shopfront.orithos.com.au`  
门店：`skr`

## 1. 当前结论

本次 OAuth 已授权成功，crawler 当前状态为 `ready`，没有排队或运行中的任务。已完成客户、供应链、商品、库存和销售增量同步，并完成 crawler 与 POS Shopfront staging 的数量和 ID 核对。

当前没有发现产品、库存、客户、供应商或采购单缺失。仍有两项需要业务/技术后续处理：

1. POS 保留 6 笔 crawler 没有的历史销售，不能在没有业务确认的情况下删除。
2. POS 付款聚合数比 crawler 读取到的付款数多；尚未完成付款 ID 级对账，因此不能据此判断为漏同步。

## 2. 已完成的代码工作

### 客户 staging 镜像

- 新增 token 保护的 `POST /api/integrations/shopfront/customers:upsert`。
- 新增 `shopfront_customer` staging 表，幂等键为 `(store_key, source_id)`。
- 保存 Shopfront 外部客户 ID、client ID、code、姓名、联系方式、删除标记和原始 payload。
- 新增 POS snapshot/data 对客户的计数和读取支持。
- crawler 客户同步完成后按 250 条一批推送到 POS staging。
- 明确不写 POS 正式客户业务表，也不写 Odoo 客户业务表。

### 代码发布

- 客户镜像 PR：[#7](https://github.com/aishawn/aistore_pos/pull/7)，已合并。
- 候选 SHA `868d998144dd18d47e38bee9a64e56fae5751755` 已通过 Java 21 GitHub Actions：`mvn -B clean verify`。
- 主分支当前 SHA：`f95aab15b6df85494bca4af4a5e350a97f158523`。
- 交接文档更新 PR：[#8](https://github.com/aishawn/aistore_pos/pull/8)、[#9](https://github.com/aishawn/aistore_pos/pull/9)、[#10](https://github.com/aishawn/aistore_pos/pull/10)，均已合并。
- 没有运行本地 Maven；后端构建以远端 Java 21 workflow 为准。Dokploy 运行中的 Git SHA 未能从公开接口独立读取。

## 3. 实际同步记录

### OAuth 和权限恢复

- 早期客户任务 `16`、`20` 因缺少 `see_customers` 失败。
- 早期供应链任务 `19` 因缺少 `see_suppliers` 和 `see_stock_management` 部分失败。
- OAuth 重新授权后，客户任务 `23` 和供应链任务 `22` 均成功完成。

### 客户

- crawler 客户数：20。
- POS staging 客户数：20。
- 客户任务 `23`：`completed`，`pos_staged.customers=20`。

### 供应链

- 供应商：109，crawler 与 POS staging 一致。
- 采购单：2,355，crawler 与 POS staging 一致。
- 供应链任务 `22`：`completed`，错误数为 0。

### 商品和库存

- 商品：crawler 11,024，POS staging 11,024。
- 库存记录：crawler 10,846，POS staging 10,846。
- 商品 ID 全量对账：crawler 缺失 0，POS-only 0。
- POS 商品匹配：手工/映射记录 11,024；商品名缺失 0。
- POS 有 62 个条码未匹配，但这不是商品记录缺失；需要单独决定是否补商品条码映射。

### 销售

- 当天增量任务 `24` 覆盖 Adelaide 业务日期 `2026-11-02`。
- Shopfront 返回并处理 94 笔销售，POS staging 导入 94 笔，任务状态 `completed`。
- 当前 crawler 销售：155,496；POS staging 销售：155,502。
- 当前 crawler 销售明细：304,690；POS staging 销售明细：304,737。
- 之前逐 ID 对账确认：crawler-only 0，POS-only 6；共享销售的明细行一致，47 行差异来自这 6 笔 POS-only 销售。
- 这 6 笔 POS-only 销售未删除：

  - `11f11d0303a3f640833f0637e498780f`
  - `11f184c3d285e374b4f30acc671ac741`
  - `11f1ce64b5218ef694ce0affcc79ec71`
  - `11f1d34397b788b4baa206ffd5ef8421`
  - `11f1d4128eb6865a9ad506ffede3792f`
  - `11f1d4488dd3aaacafd402ffff2bbb27`

### 付款

- POS staging 付款数：187,392。
- crawler 的审计接口没有付款总数；一次只读销售分页统计约得到 186,653 条 source payment entries，期间出现过一次传输 EOF，且该接口没有稳定的总数元数据。
- 因此当前 739 条差异只是未完成的聚合对账项，不应直接判定为漏同步。
- 未删除付款，也未绕过外部 sale/payment key 进行覆盖。

## 4. 已执行的测试和验证

### 自动化和静态检查

- `git diff --check`：通过。
- `python -m py_compile shopfront_crawler/app/main.py shopfront_crawler/app/pos.py`：通过。
- Java 21 远端 `mvn -B clean verify`：候选后端 SHA 通过。
- 主分支后续 Java 21 workflow：通过。
- 未运行本地 Java/Maven，符合仓库约束。

### 线上只读验证

- crawler `/healthz`：正常。
- crawler `/api/sync/status?store=skr`：无活动任务。
- crawler `/shopfront-audit?store=skr`：`ready`，当前计数如上。
- crawler `/api/pos/coverage?store=skr`：能读取 POS staging snapshot 和匹配状态。
- crawler `/api/pos/products/reconcile?store=skr`：11,024 对 11,024，缺失和 POS-only 均为 0。
- 客户任务 `23`、供应链任务 `22`、当天增量任务 `24`：均已看到终态 `completed`。
- 所有同步均按外部 ID 幂等 upsert；没有执行删除 POS-only 历史销售的操作。

## 5. 尚未完成或不应自动完成的事项

1. **付款 ID 级对账**：需要分页读取 crawler 和 POS 的付款明细，按 `(external_sale_id, payment_key)` 集合比较，区分 POS-only、crawler-only 和同 key 内容差异。
2. **6 笔 POS-only 历史销售处理决定**：先查业务来源、发票和审计要求，再决定保留、标记或迁移；不建议自动删除。
3. **818 笔 `INCOMPLETE` 销售**：crawler 已保存，但不能声称已完成正式业务导入；需要 Shopfront 补齐详情或业务确认处理规则。
4. **62 个未匹配条码**：产品记录本身已同步，条码映射仍需商品主数据复核。
5. **178 个 catalog 产品的 `catalog_last_seen` 尚未确认**：它们有历史销售引用，不能当作缺失商品；应在下一次完整 catalog snapshot 或稳定 checkpoint 后复核。
6. **Dokploy 运行 SHA**：公开接口和现有 crawler coverage 无法独立证明容器运行的确切 Git SHA；如需发布审计，应在 Dokploy 控制台记录构建号、镜像 digest 和容器启动日志。
7. **正式客户业务导入**：本次只做 staging 镜像，尚未把 Shopfront 客户写入正式 POS/Odoo 客户业务表。

## 6. 后续建议

### 优先级 P0：完成付款逐 ID 对账

新增或临时运行只读导出，稳定分页读取两端付款明细；比较外部销售 ID、付款 key、金额、状态和 subtype。只有确认 crawler-only 或内容差异后，才决定是否重放对应销售；不要用总数差异触发删除或全量重写。

### 优先级 P1：处理不完整销售和 POS-only 历史销售

对 `INCOMPLETE` 销售按日期和原因分类，优先抽样核对 Shopfront 原始 Sale 详情。对 6 笔 POS-only 销售建立业务确认记录，保留原始审计链，避免把历史记录误判为重复数据。

### 优先级 P1：补齐商品主数据质量

复核 62 个未匹配条码和 178 个 catalog checkpoint 未确认项。商品 ID 已经对齐，因此后续应做映射/来源确认，不要重复创建商品或删除 POS 商品。

### 优先级 P2：加强可观测性和发布审计

- 在 crawler 审计输出中增加付款总数、付款 key 计数和同步批次结果。
- 在 Dokploy 部署后记录确切 Git SHA、镜像 digest、容器启动时间和健康检查结果。
- 保持任务心跳、阶段、批次计数和 POS import run ID 可查询。

### 运行纪律

- 不要同时启动同一门店的多个历史、日同步、供应链或客户任务。
- 保持同步接口的幂等 upsert 语义。
- 继续把客户数据留在 staging，直到单独批准正式客户业务导入和隔离环境验证。
- 不要使用 Fresh Volumes 或删除历史数据来处理同步差异。

## 7. 可复核接口

```text
GET /healthz
GET /api/sync/status?store=skr
GET /api/sync/coverage?store=skr
GET /api/pos/coverage?store=skr
GET /api/pos/products/reconcile?store=skr&preview=200
GET /shopfront-audit?store=skr
GET /api/sync/runs?store=skr&limit=10
```

本文件不包含密码、Token、Webhook 或数据库凭据。
