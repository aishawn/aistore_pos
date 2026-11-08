# 收银班次验证

更新日期：2026-11-09。负责人：POS owner 待指定。

## 最近结果

- 环境：本地 Java 21 Maven 测试；source 为基于 `0e97658e` 的 dirty worktree；runtime 不适用；业务写入 0。
- `mvn -B test`：541 tests, 0 failures, 0 errors, 0 skipped，PASS。
- 新增测试覆盖：开班幂等、跨门店拒绝、现金/非现金关班差额和相同/冲突关班重放；Odoo-only filter 中的新旧 register 路由边界。
- 测试不执行 MyBatis SQL、不启动 PostgreSQL、不覆盖锁的真实并发。

## 线上观察

- 2026-11-09 只读访问 `https://skr.orithos.com.au/api/public/version` 返回 runtime `5dc69fdf`；与当前工作区基线不同。
- `https://demo.orithos.com.au/api/public/version` 的 PowerShell TLS 握手失败；SKR `/api/health` 返回 401。
- 本候选未提交、未推送、未构建、未部署；无线上业务写入。

## 放行限制

本结果只能证明本地 Java 代码和 mocked service behavior 通过。完成数据库集成、POS UI 迁移、精确 SHA Java 21 远程构建、隔离租户闭环及匹配 runtime 验收前，不允许启用 Orithos 生产收银或停用 Odoo。
