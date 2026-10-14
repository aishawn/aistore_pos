# 本轮验证记录

更新时间：2026-10-14

## 已验证

- `pos-ui`: `npm run typecheck` 通过。
- `pos-ui`: `npm run build` 通过，Next.js 成功生成 130 个页面和 API 路由。
- `pos-ui`: `npm run lint` 通过，0 errors；清理低风险未使用代码后剩余 48 条 warnings。
- 关键 UAT 脚本通过语法检查：`pilot-page-matrix.mjs`、`pilot-settings-mobile-uat.mjs`、`pilot-interaction-uat.mjs`、`pilot-odoo-autorecover-uat.mjs`。
- 本地 `next start` 运行态：`/login` 返回 200；未登录 `/api/odoo/session` 返回 `user:null`；未启动 Spring Boot 时 `/api/auth/me` 返回结构化 `50200 Backend service is unavailable`。
- 生产只读检查：`/login` 返回 200；匿名 `/api/auth/me` 返回 401；`/api/odoo/session` 返回 `autoRecoverConfigured:true`；`/settings/receipts`、`/settings/hardware`、`/purchases/odoo` 均正确重定向到登录页；本次未复现收据页 404。
- 生产匿名页面矩阵：21 条关键业务路由（POS、商品、历史、客户、供应商、采购、补货、报表、酒款助手、设置和关账）全部返回 307 登录重定向，`BAD_COUNT=0`，未发现未授权内容或 5xx。
- 生产浏览器渲染（390x844）：登录页 HTTP 200，标题为 `Orithos | Smart Point of Sale`，用户名/密码输入框 3 个、按钮 3 个，登录和移动工作区入口均存在。控制台仅有匿名认证请求的预期 401，无 page error。
- 交互观察：匿名点击 `Use mobile workspace` 会执行移动登录流程并提示 `Username and Password are required`，不会进入工作区；这是当前实现要求先提供凭据的行为，文案可能需要改为更明确的“Sign in to mobile workspace”。
- 已优化移动入口文案为 `Sign in to mobile workspace`；本地生产构建启动后浏览器确认该按钮可见，避免误导为无需登录即可进入。

## 发现与处理

- 删除了 customers 工具页未使用的 `FilterSelect` 导入。
- 删除了销售状态模块未使用的 `toLine` 函数。
- 删除了 `SellPad` 未使用的 `useEffect` 导入。
- lint warnings 主要是 React effect 中同步 setState、render 内声明组件和少量 Hook 依赖提示；这些属于行为相关重构，不做批量自动修复。

## 未完成验证

- `pos-api` 要求 Java 21；当前执行环境为 Java 8，未运行 Maven 测试或构建。
- 当前 Node 为 22，低于项目声明的 Node 24；前端命令实际通过，但仍需在 Node 24/CI 环境复跑作为发布证据。
- 生产 Dokploy SHA、班次现金实点/关账、真实采购收货、SMTP、打印机/钱箱和 AI 仍需外部环境或人工确认。
- 本地前端服务不能替代全栈认证验证；需要 Java 21 后端或已部署环境复跑登录、Odoo 连接和业务 API。

## 下一次复跑命令

```text
pos-ui: npm run check
pos-api: mvn test
```

复跑前必须确认 Node 24 和 Java 21，并将结果与 Dokploy 部署 SHA 一起记录。
