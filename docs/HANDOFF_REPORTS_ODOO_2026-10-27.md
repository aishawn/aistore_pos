# Reports Odoo 迁移交接记录

日期：2026-10-27

## 目标

报表页面统一使用 Odoo 工作流。Classic POS Reports API 已退休，前端不再把 SQL-like 查询发送到 `/api/reports`。

## 已完成改动

- `reports/inventory`：使用 Odoo 产品和库存目录。
- `reports/purchase`：使用 Odoo purchase orders。
- `reports/transfer`：使用 Odoo stock transfers。
- `reports/actions`：使用 Odoo 销售历史和退款工作流。
- `reports/advanced`、`reports/misc`：移除伪造的 Classic 查询，显示明确的 Odoo 未接入状态，不展示虚构数据。
- 报表导航：移除无实际审计数据源的 `Audit Log`，将 actions 入口改为 `Sales history & refunds`。
- 删除无引用的前端 `ReportBuilder`。
- 修复 AI metrics PostgreSQL 查询：`ai_report_audit.allowed` 使用 boolean 条件，初始化迁移默认值同步为 `FALSE`。
- 报表导航去除空壳 `Sales`、重复 `Operations` 顶层 tab；移除会跳回 Dashboard 的销售周期入口、未接入的 Saved/Custom 入口和重复的 sales history 入口。
- `/reports/actions` 保留为旧书签兼容路由，统一重定向到唯一的 Odoo 销售历史页面 `/history`；旧抽屉中的死链接同步移除。

## 代码与部署

- 主修复提交：`c0479a0a`，已推送 `origin/main`。
- Dokploy 跟踪分支：`codex/ai-release`。
- Dokploy 最终部署提交：`581c6a5da867d5e973b6f113fd328d1e4c69c05d`。
- 线上版本接口确认 frontend/backend 均为 `581c6a5d`，部署状态为 `done`。

## 线上验证

账号：`skr` 商店只读验证。

路由矩阵：

`/reports/dashboard`、`/reports/inventory`、`/reports/purchase`、`/reports/transfer`、`/reports/actions`、`/reports/advanced`、`/reports/misc`、`/reports/favourites`、`/reports/ai/metrics`

每个路由均验证 1440×900 和 390×844：

- 无 `Classic POS API is retired` 文案。
- 无 `/api/reports` 请求。
- 无 Application error、ChunkLoadError、Hydration 错误。
- 无横向溢出。
- inventory、purchase、transfer、actions 分别请求 Odoo session/records/purchase-orders/transfers；dashboard 请求 Odoo reporting dashboard；AI metrics 请求 `/api/ai/metrics`。
- 最终矩阵脚本退出码为 0，AI metrics 返回 HTTP 200。

## 已知运行时噪音

- 部分 Odoo 商品没有图片，`/api/odoo/products/{id}/image` 返回 404；库存数量和产品数据正常，后续可补充默认图片或改成无图占位。
- 全局 gift-card capability 请求在无权限时返回 401，不影响报表主体。

## 后续建议

1. 为 `advanced` 和 `misc` 设计明确的 Odoo 数据契约后再接入真实指标。
2. 补充商品缺失图片的默认占位策略。
3. 保持报表路由回归矩阵，禁止重新引入 `ReportBuilder` 或 `/api/reports`。
## 2026-10-27 Navigation and Dashboard AI iteration

- Reports navigation is now a single horizontal row with five business tabs: Overview, AI Insights, Sales History, Inventory, and Purchasing & Transfers.
- Sales History is a first-class tab backed by `/history`; duplicate report history paths remain compatibility redirects.
- AI Insights is embedded in the Odoo Dashboard. It uses the selected dashboard period and loaded Odoo metrics, and only calls the AI Assistant after the operator clicks **Analyse dashboard**. The prompt covers sales trend, comparison, basket size, refunds, product/category mix, inventory signals, and read-only next actions.
- `/reports/ai/metrics` remains an admin-only AI Query Health page under Setup and is no longer presented as the business insights tab.
- Classic POS API and `/api/reports` are not used. Odoo remains the sole business data source.

### Release and verification

- Candidate was rebased onto the latest `origin/main`; final release commit is `2bf183c935abe05889ed03518601ebacde0544ec`, pushed to `main`.
- Fixed nested sidebar subgroup typing so the production build can handle Stock > Pricing groups. `npm run typecheck` passes in `pos-ui`; `git diff --check` passes.
- Dokploy deployment `tLVyV5gj73IrlvRaNIvV1` completed with status `done`. Both `skr.orithos.com.au` and `demo.orithos.com.au` report frontend/backend runtime commit `2bf183c9` from `/api/public/version`.
- Authenticated browser verification at `skr.orithos.com.au/reports/dashboard` confirmed all five report tabs share one row (`y=50`, height `48`), Sales History points to `/history`, and clicking Analyse dashboard keeps the URL unchanged while calling `/api/ai/assistant` and rendering the result.
