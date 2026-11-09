# 收银迁移验证

更新日期：2026-11-09；负责人：POS owner 待指定。

## 2026-11-09 Demo 原生 POS 路由

- Commit/runtime `f950b24199a5b07caa4e421a09cb06895680fa48` 已部署到 Demo、SKR、App；三处前后端 SHA 匹配。
- Demo `/`、`/sell`、`/register`、`/close` 返回原生 Orithos POS 页面；认证只读 API 返回 1 台 register、无当前 session、1 项商品。
- `NativePosGate` 未授权 Demo vendor `1`，quote 探针返回 403；线上业务写入为 0。
- Java 21 exact-SHA workflow `42515591253`：551/551 PASS；push workflow `42515783377`：PASS。前端 typecheck、209 单测和定向 ESLint 通过。
- 该发布只切换 Demo 页面路由。SKR 仍走 Odoo，且原生 POS 目前只支持现金；未验收销售/退款/关班、数据库集成或 Odoo 退役。
- 详见 [native POS Demo route cutover session](../../../test-sessions/2026-11-09-native-pos-demo-route-cutover.md)。

## 2026-11-09 部署后跟进

- 提交 `0132cf783717566db677736e4ea3984b2656b051`：付款方式限定到认证门店和当前收银机已配置的付款方式；缺少映射时拒绝 checkout。
- GitHub exact-SHA workflow `42505862273` 对候选运行 Java 21 `mvn -B clean verify`：PASS；push workflow `42506054596`：PASS。
- Dokploy 部署 `NdWD_jJXNZJGffKS6AZVd`：done。SKR、Demo、App 的 frontend/backend runtime 均匹配 `0132cf78`。
- Demo 登录只读冒烟：vendor `1` / outlet `1`；原生 register API 返回 1 台收银机、当前无班次；Sell 商品浏览返回 1 个 Demo 商品。业务写入 0。
- 本机 PostgreSQL 只读连接探针连接超时；没有数据库集成、支付或库存写入验收。主 POS UI 仍使用 Odoo，Odoo 尚未退役。

## 2026-11-09 Demo 原生开班-售-退-关班闭环

- Runtime SHA `1392e646`；`/api/public/uat-context`：`isolated=true`、`posTenantIsolated=true`、`posDatabaseVerified=true`。
- 业务写入：开班 session `#3` → 现金 checkout sale `#6`（$4.50 / GST $0.41）→ refund `#7` → 关班；checkout / refund / close 幂等重放均返回同一业务 id。
- 前置：为 product `1` 补 GST 税率与 `product_inventory` 数量 100（否则 quote/checkout 分别因缺税与缺库存失败）。
- 详见 [checkout loop session](../../../test-sessions/2026-11-09-demo-native-checkout-loop.md) 与 JSON 证据。

## 最近适用结果

- 环境：本地 Java 21，POS API unit/regression tests；source SHA `0474672b`；runtime SHA：不适用；数据库：不适用；业务写入：0。
- `mvn -B test`：537 tests, 0 failures, 0 errors, 0 skipped，PASS。
- 重点覆盖 checkout 金额意图幂等摘要、服务端门店定价、篡价忽略、无价/跨店商品拒绝、挂单读取门店范围、销售旧写入口在 Odoo-only filter 下退役。
- `git diff --check`：PASS。

## 未验证

- Demo 目录仍是种子数据（1 SKU），不是 Shopfront ~10849 对等。
- 物理收单、多 tender、现金舍入边界、SKR 门店切换：NOT RUN。
- 前端完整浏览器结账流与生产迁移导入：NOT RUN。

## 放行限制

Demo 原生现金闭环已通过，但不足以授权 SKR 切账或停用 Odoo。完整证据见 [checkout loop session](../../../test-sessions/2026-11-09-demo-native-checkout-loop.md)。
