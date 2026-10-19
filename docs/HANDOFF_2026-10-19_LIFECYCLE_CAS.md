# 平台租户生命周期并发保护交接

更新时间：2026-10-19

## 本批次改动

- `PATCH /api/admin/tenants/{id}/status` 改用数据库条件更新：只有数据库状态仍等于读取时的状态才会更新。
- `PATCH /api/admin/tenants/{id}/trial` 同样使用条件更新，避免延长试用期覆盖并发状态变化。
- 条件更新影响行数不是 `1` 时返回业务码 `40910`，提示刷新后重试，不返回过时的成功结果。
- 原有 operator、deleted、非法状态转换门禁保持不变。

## 测试

- `pos-ui/npm run typecheck`：通过。
- 平台详情页目标 ESLint：通过。
- `git diff --check`：通过。
- `AdminTenantLifecycleTest` 新增状态转换和试用期并发冲突断言；尚未在本机执行 Maven，因为当前 Java 8 不满足项目 Java 21 要求。
- 未运行 `npm run build`，遵循当前迭代约束。

## 部署与线上验证

- 本批次与前端/AI/平台改动一起提交后统一触发 Dokploy，webhook 返回 `HTTP 200 Compose deployed successfully`。
- 多店平台只读回归 `15/15 PASS`：平台登录、租户列表/详情、operator 生命周期保护、Demo Odoo binding、无 Odoo session 时 receive/cash 拒绝、Manage Cash/Purchases 页面均通过。证据：`docs/UAT_MULTISTORE_DEPLOY_2026-10-19.json`。
- AI 路由矩阵 `9/9 PASS`，全站页面 `264/264 PASS`（132 路由 × 390/1440），盘点只读 `PASS`，无横向溢出、无页面错误、无非 GET 盘点请求。证据：`docs/UAT_AI_ROUTE_MATRIX_2026-10-19_POST-335E1A1.json`、`docs/UAT_ALL_STATIC_PAGES_2026-10-19_POST-335E1A1.json`、`docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19_POST-335E1A1.json`。
- 本轮没有对 Demo `aipos` 执行销售、库存、采购或现金写入。
- Dokploy frontend/backend 实际运行 SHA、构建日志和容器健康状态仍需从控制台独立回读；以上 UAT 的 `sourceCommit` 只表示测试 runner 基线。

## 仍待验证

- Dokploy frontend/backend 实际运行 SHA、构建日志和容器健康状态。
- Java 21 Maven 单测的真实执行结果。
- 一次性隔离租户上的真实 suspend/activate/expire 生命周期写入与登录阻断回归。
