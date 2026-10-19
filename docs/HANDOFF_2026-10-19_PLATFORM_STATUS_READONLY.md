# 平台店铺状态只读回归

- 基线：`3afef08`
- 目标：`https://app.orithos.com.au/platform/stores/48`
- 证据：`docs/UAT_PLATFORM_STATUS_READONLY_2026-10-19_POST-3AFEF08.json`

结果：平台管理员登录、试用店详情 API、390px 详情页均通过。试用店状态显示为 `trial`，页面展示当前生命周期按钮：Suspend、Activate、Mark expired、Extend trial 14d。回归期间没有调用 PATCH/POST/DELETE，`nonGetRequests=0`。

这证明状态矩阵的页面展示和详情读取可用，不等于已验证状态写入、租户登录阻断或恢复流程。下一步需要在一次性隔离试用店执行一次状态变更，再恢复原状态并保存 API/登录结果。

