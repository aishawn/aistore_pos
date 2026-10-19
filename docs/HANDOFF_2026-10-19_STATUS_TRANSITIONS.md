# 平台店铺状态转换交接

更新时间：2026-10-19

## 本批次改动

- 后端 `PATCH /api/admin/tenants/{id}/status` 增加显式状态转换表。
- 允许的生命周期路径：
  - `trial` → `trial`、`active`、`suspended`、`expired`
  - `active` → `active`、`suspended`、`expired`
  - `suspended` → `suspended`、`active`
  - `expired` → `expired`、`active`
- 不允许从 `deleted` 恢复，也不允许从 `suspended` 直接变为 `expired`。
- 非法转换返回业务错误码 `40910`，且不会调用数据库更新。
- 平台 operator store 的原有保护仍然优先执行。
- 平台店铺详情页只显示当前状态可执行的按钮，避免提交必然失败的操作。

## 已验证

- `pos-ui`: `npm run typecheck` 通过。
- `pos-ui`: `npx eslint app/platform/stores/[id]/page.tsx` 通过。
- 新增/保留后端单测覆盖：平台 operator 禁止变更、trial→suspended、suspended→expired 拒绝、expired→active、deleted 不可恢复。
- 未运行 Maven：当前执行环境为 Java 8，项目要求 Java 21。
- 未运行 `npm run build`，遵循当前迭代约束。

## 部署与线上验证

代码已提交并推送：`80e6311`。

本轮调用用户提供的 Dokploy webhook 返回 HTTP 301 / `{"message":"Branch Not Match"}`，没有生成可审计的部署任务，因此不能声称线上已运行 `80e6311`。需要在 Dokploy 控制台确认该 Compose 服务绑定的分支，或从控制台手动 Deploy 后再执行下面的线上检查。

部署后应使用平台管理员账号验证：

1. active 页面仅显示 Suspend / Mark expired。
2. suspended 页面仅显示 Activate。
3. expired 页面仅显示 Activate。
4. 每次成功转换后刷新详情，状态和按钮集合一致。
5. 对受保护的 deleted/operator 店铺不出现可写生命周期按钮。

该验证只涉及平台租户状态，不对 Demo `aipos` 执行业务写入。

## 当前发布状态

- GitHub：`origin/main` 当前为 `5392598`；状态转换代码提交 `80e6311` 和本交接提交均在其历史中。
- Dokploy：webhook 被分支匹配规则拒绝，未确认部署。
- 后端 Maven：未运行，本机只有 Java 8，项目要求 Java 21。
- 前端：`npm run typecheck` 和目标 ESLint 通过。
- build：按约束未运行。

