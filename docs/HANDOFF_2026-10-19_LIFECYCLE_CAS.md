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

## 部署计划

该改动应与下一批已完成的前端/AI/平台回归一起提交后统一触发 Dokploy，减少重复构建缓存。部署后只读验证平台管理员状态页和 API；不对 Demo `aipos` 执行销售、库存、采购或现金写入。

## 仍待验证

- Dokploy frontend/backend 实际运行 SHA、构建日志和容器健康状态。
- Java 21 Maven 单测的真实执行结果。
- 一次性隔离租户上的真实 suspend/activate/expire 生命周期写入与登录阻断回归。
