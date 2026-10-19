# 平台 P0 多店回归

## 结果

- 基线部署：`a6d5a57`
- 证据：`docs/UAT_MULTISTORE_DEPLOY_2026-10-19.json`
- 结果：`15/15 PASS`

覆盖：

- 平台管理员登录。
- 店铺列表和详情 API。
- operator 店铺生命周期变更被拒绝。
- 平台 Stores 页面、详情页、列表链接和无 Sell chrome。
- Demo 登录、Odoo binding 读取。
- Demo 在无 Odoo session 时 receive/cash 的安全拒绝及 CSRF Origin 检查。
- Manage Cash 和 Purchases 页面可访问。
- 全程没有执行业务写入；operator PATCH 仅验证拒绝响应。

## 测试脚本改进

`pilot-multistore-deploy-verify.mjs` 现在请求最多 100 个租户，并优先选择 `subdomain=demo` 或未删除店铺，避免最近创建的已删除 UAT 店铺占满列表导致误报。证据中的 `sourceCommit` 也改为运行时读取，不再使用硬编码旧 SHA。

## 尚未覆盖

非 operator 临时试用店的真实 suspend/activate 写入和租户登录阻断仍未执行；现有试用店无法在状态变更后无损恢复为原始 `trial`，因此需要单独设计可清理的临时租户流程。

