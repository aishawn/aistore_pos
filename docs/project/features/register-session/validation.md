# 收银班次验证

更新日期：2026-11-09。负责人：POS owner 待指定。

## Payment method read API candidate

- Candidate base: `ccee075fb4e157bc72c63aa8f498e59479bb0823`; code changes are local and not yet deployed. Current Demo/SKR/App runtime remains `9703508f`.
- Adds a tenant-scoped `GET /api/retail/payment-methods` protected by `settings.view`; the response states whether native POS is enabled and includes only register assignments for the authenticated vendor/outlet.
- The Payment Methods page reads Orithos when the store gate is on and keeps the existing Odoo read only for stores not yet cut over.
- Verification: Node 22 `npm run typecheck` PASS; full POS UI unit suite 211/211 PASS; `npx eslint app/settings/payment/page.tsx` PASS; `git diff --check` PASS. Exact-SHA Java 21 Maven verification and runtime checks are pending.
- Database integration and business writes: NOT RUN. No payment configuration or transaction was changed.

## 2026-11-09 Demo 原生收银路由发布

- Source/runtime SHA：`f950b24199a5b07caa4e421a09cb06895680fa48`；Demo、SKR、App 前后端 SHA 一致。
- GitHub exact-candidate Java 21 `mvn -B clean verify` run `42515591253`：551 tests, 0 failures/errors/skips；push workflow `42515783377`：PASS。
- Frontend `npm run typecheck` PASS；`npm run test:unit` 209/209 PASS；定向 ESLint 0 errors / 1 existing warning。
- Demo 登录只读检查：1 台 register、无 open session、商品浏览返回 1 项；`/`、`/sell`、`/register`、`/close` 均返回原生页面标记。
- 空 checkout quote 探针被 `NativePosGate` 以 403 拒绝；没有开班、销售、库存或其他业务写入。门禁仍未授权 Demo vendor `1`。
- 检查仅通过页面 HTML 和 API 响应；没有真实浏览器交互、PostgreSQL 集成、退款/支付或关班验收。详细记录见 [Demo route cutover session](../../../test-sessions/2026-11-09-native-pos-demo-route-cutover.md)。

## 2026-11-09 部署后只读验证

- Runtime：`0132cf783717566db677736e4ea3984b2656b051`；SKR、Demo、App frontend/backend 版本匹配。
- Demo 登录认证为 vendor `1` / outlet `1`；`GET /api/retail/registers` 返回 1 台收银机，当前 session 为空；`GET /api/sell/products/browse` 返回 1 个商品。
- 未创建班次、销售、支付或库存变更。SKR 只读版本探针同 SHA；SKR 没有执行业务写入。
- 本机 PostgreSQL 只读连接探针超时，因此 SQL 聚合、事务锁、真实并发和备份恢复未验证。
- 原生 Sell UI / Odoo BFF 脱钩未完成；不能据此宣布 POS 账本切换。

## 最近结果

- 环境：本地 Java 21 Maven 测试；source 为基于 `0e97658e` 的 dirty worktree；runtime 不适用；业务写入 0。
- `mvn -B test`：541 tests, 0 failures, 0 errors, 0 skipped，PASS。
- 新增测试覆盖：开班幂等、跨门店拒绝、现金/非现金关班差额和相同/冲突关班重放；Odoo-only filter 中的新旧 register 路由边界。
- 测试不执行 MyBatis SQL、不启动 PostgreSQL、不覆盖锁的真实并发。

## 旧线上观察（部署前）

- 2026-11-09 只读访问 `https://skr.orithos.com.au/api/public/version` 返回 runtime `5dc69fdf`；与当前工作区基线不同。
- `https://demo.orithos.com.au/api/public/version` 的 PowerShell TLS 握手失败；SKR `/api/health` 返回 401。
- 本候选未提交、未推送、未构建、未部署；无线上业务写入。

## 放行限制

本结果只能证明本地 Java 代码和 mocked service behavior 通过。完成数据库集成、POS UI 迁移、精确 SHA Java 21 远程构建、隔离租户闭环及匹配 runtime 验收前，不允许启用 Orithos 生产收银或停用 Odoo。
