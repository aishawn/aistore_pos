# UI逐页检查与优化 — 2026-11-03

检查范围：POS 门店界面、平台后台、登录/密码入口、品牌站注册页面。源码共 179 个页面文件（156 个固定路由、23 个动态模板）。基线与复查累计 272 次页面访问；每次检查桌面 1440×1000 和手机 390×844，个别测试脚本失败已明确记录。

本轮是 UI 布局、加载/错误提示、只读导航检查，不代表销售、退款、库存调整等写入业务验收。SKR 只读；Demo 虽获准写测试，本轮未提交业务写入。数据库环境沿用 aipos_uat，不将两个商店称为隔离环境。账号仅从忽略的本地 env 读取。

## 已实现的修复

| 问题 | 证据与原因 | 优化 |
|---|---|---|
| Catalogue / Inventory / Payments 手机底部留白 | 390×844，分页到弹窗底部相距约 103 / 123 / 123px；共用表格上限 55dvh | 数据弹窗填满剩余高度、固定分页，桌面统一宽屏；表单弹窗保留原布局 |
| 搜索框在小屏被挤得过窄 | 共用工具栏输入框允许缩至 0 | 搜索框最小宽度 180px，空间不足时换行 |
| 重复且技术化的说明文字 | Payments 仍有 All-time records by default… | 删除冗余说明，Catalogue / Inventory 文案简化 |
| 平台后台会话读取失败后空白 | 基线 /api/auth/me 返回 502，PlatformShell 的 !user 分支返回 null | 明确会话错误、Retry 和 Sign in |
| 报表显示 Unexpected token / HTML 解析错误 | 重启期间 reporting-dashboard 返回非 JSON 网关响应 | 共用报表客户端返回可理解的重试提示 |
| app.* 账户页水合错误 | /settings/account 捕获 React #418，首次渲染按浏览器 host 改变结构 | useSyncExternalStore 保持服务端和首次水合 host 一致 |
| 推荐等待期间仍能重复操作 | 实测 disabledWhileLoading=false；空结果还有两个 Start over | 请求互斥、禁用选项/返回/重试、明确加载与错误状态、删除重复入口，次要按钮扩大至 44px 点击区 |
| 矮屏弹窗边缘可能超出可用高度 | h=96dvh 加外围留白会超出部分横屏视口 | 为记录/历史弹窗加视口减留白的最大高度 |

## 验证状态

- 本地：变更 TSX/TS 语法通过；定向 ESLint 无错误，AppShell 原有 set-state-in-effect 警告 1 条。报表响应回归检查 4/4：HTML 502 提示、JSON 成功透传、401 语义保留、202 无 taskId 的可重试提示。
- 未运行本地应用 build；按项目约定使用 Dokploy。完整本地 typecheck 仍受工作树缺失依赖限制。
- 基线运行版本 0e68c009；深入/补充复查运行版本 7b610666，SKR/Demo/app 前后端版本均记录在证据 JSON。首轮部分平台空白与部署重启重叠，复查正常页面与错误恢复需分开记录。
- 本轮修复尚待提交后的远程构建和上线验收，后续结果会追加。

## 仍需处理或不能宣称通过的项目

- 15 个固定旧入口仍请求返回 HTTP 410 的 Classic 接口（详见逐页表）。不恢复 Classic 写入；应由后续迁移将旧入口收敛至现有 Odoo 工作区，或明确停用。
- 平台 Failures 的 /api/admin/alerts 在复查中返回 500；UI 有错误反馈，服务端数据可用性未通过。
- 库存报表、补货和 Demo 概览出现待完成请求或 Odoo 401，数据验收记为 BLOCKED；这与整页布局溢出是不同问题。
- AI 只读问答 Explain what net sales means 得到命令解析 code 42220，显示 schema 错误；不能宣称问答能力通过。推荐接口 HTTP 200 + code 50312，同样不能宣称推荐结果通过；已确认无页面横向溢出。
- 动态页中 3 个模板从真实列表链接检查了现有记录；其余无实际记录链接的模板只做源码检查，不假设 ID，不宣称实体详情通过。
- 首轮购买子标签截图路径包含 ?，导致 Windows 文件名错误；补充脚本已改名并重跑这些标签。首个 AI 脚本误拦截只读命令解析，已纠正；这些脚本问题不能归因于产品。

## 逐页清单

结果中“布局通过”只表示本轮尺寸下没有检测到整页横向溢出、空白或前端异常；未涵盖所有按钮或写入行为。“首屏”表示只完成初始渲染检查。详情见 [机器证据](../UAT_UI_PAGE_AUDIT_2026-11-03.json)。

| 路由/模板 | 检查方式 | 结果/分析 |
|---|---|---|
| `/ai/identify` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/ai` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/assistant` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/auth/bootstrap` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/classifications/brand/[id]/assign` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/classifications/brand/[id]` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/classifications` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /products?dialog=categories |
| `/classifications/[type]/[id]/assign` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/classifications/[type]/[id]` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/close` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/customer-groups` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /customers?manage=groups |
| `/customer-groups/[id]/edit` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/customer-groups/[id]/view` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/customers/balances` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/customers/balances/statements` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /customers/balances |
| `/customers/merge` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /customers |
| `/customers/new` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/customers/odoo` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/customers` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/customers/[id]/edit` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/customers/[id]/payment` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/customers/[id]/view` | 实际记录链接，桌面/手机 | 布局通过；不含编辑/写入验收 |
| `/dashboard` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/dashboard/workspace` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/enterprise` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/finalise` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 / |
| `/forgot-password` | 等待数据/错误状态，桌面/手机 | BLOCKED 接口返回错误，布局已检查 |
| `/giftcards/import` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/giftcards` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/history/odoo` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/history` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/invoices/new` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/invoices` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /purchases?tab=invoices |
| `/invoices/scan` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /invoices/new |
| `/invoices/[id]` | 实际记录链接，桌面/手机 | 布局通过；不含编辑/写入验收 |
| `/login` | 等待数据/错误状态，桌面/手机 | BLOCKED 接口返回错误，布局已检查 |
| `/m` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/manage-cash` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/media` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/orders/credit/new` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/orders/manual` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/orders/new` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/orders` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/orders/receive/new` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/orders/return/new` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/orders/transfer/new` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/orders/[id]/edit` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/orders/[id]/view` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/overview` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /dashboard |
| `/overview/workspace` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /dashboard/workspace |
| `/` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/platform/audit` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/platform/demo-reset` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/platform/failures` | 等待数据/错误状态，桌面/手机 | BLOCKED 接口返回错误，布局已检查 |
| `/platform/operations` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/platform` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /platform/stores |
| `/platform/stores` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/platform/stores/[id]` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/platform/usage` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/pricelists` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/products/merge` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/products/new` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/products/odoo` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/products` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/products/[id]/edit` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/products/[id]` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/products/[id]/view` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/promotion/categories` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /products |
| `/promotions` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /products |
| `/purchases/odoo` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/purchases` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/recommend/grocery` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/recommend` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/register/classic` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /register/odoo |
| `/register/odoo` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/register` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/reports/actions` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /history |
| `/reports/advanced` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/reports/ai/metrics` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/reports/ai/[id]` | 实际记录链接，桌面/手机 | 布局通过；不含编辑/写入验收 |
| `/reports/closures` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /close |
| `/reports/closures/[id]` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/reports/daily-sales` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /reports/dashboard |
| `/reports/dashboard` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/reports/favourites` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/reports/inventory` | 等待数据/错误状态，桌面/手机 | BLOCKED 数据尚在加载；已检查当时布局 |
| `/reports/last-month-sales` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /reports/dashboard |
| `/reports/last-week-sales` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /reports/dashboard |
| `/reports/misc` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/reports/purchase` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/reports/sales` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /reports/dashboard |
| `/reports/this-month-sales` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /reports/dashboard |
| `/reports/transfer` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/reports/weekly-sales` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /reports/dashboard |
| `/reset-password` | 等待数据/错误状态，桌面/手机 | BLOCKED 接口返回错误，布局已检查 |
| `/security` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/sell` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/account` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/additional-information` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/company/general |
| `/settings/barcodes` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /utilities/barcodes |
| `/settings/company/currency` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/company/date-time |
| `/settings/company/date-time` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/company/general` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/company/general-display` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/company/general |
| `/settings/company/integrations` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/account?tab=connection |
| `/settings/company/login-after-sale` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/account |
| `/settings/company/miscellaneous` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/registers-outlets |
| `/settings/company/outlets` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/registers-outlets |
| `/settings/company/search` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/company/general |
| `/settings/company/sell-screen` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/registers-outlets |
| `/settings/customerdisplay` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/hardware |
| `/settings/data` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/devices` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/hardware` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/integrations` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/account?tab=connection |
| `/settings/keys` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/keys/[id]/edit` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/settings/loyalty` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/outlets/gift-cards` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /giftcards |
| `/settings/outlets/integrations` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/account?tab=connection |
| `/settings/outlets/miscellaneous` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/registers-outlets |
| `/settings/outlets` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/outlets/integrations |
| `/settings/outlets/transfers` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /stock/transfers |
| `/settings` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/company/general |
| `/settings/payment` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/pricesets` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /pricelists |
| `/settings/push` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/receipts` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/registers/customer-display` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/registers-outlets |
| `/settings/registers/general` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/registers-outlets |
| `/settings/registers/invoices` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/registers-outlets |
| `/settings/registers/miscellaneous` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/registers-outlets |
| `/settings/registers` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/registers/general |
| `/settings/registers/sell-screen` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/registers-outlets |
| `/settings/registers-outlets` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/roles` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/staff |
| `/settings/rules` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/staff` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/statements` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /customers |
| `/settings/store` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/surcharging` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/tax` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/settings/transferees` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /stock/transfers |
| `/settings/users` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/staff |
| `/signup` | 等待数据/错误状态，桌面/手机 | BLOCKED 接口返回错误，布局已检查 |
| `/sommelier/find` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/sommelier/identify` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/sommelier` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/sommelier/wine/[id]` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/stock/bulk-price-edit` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/stock/buying-periods` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/stock/capped-pricing` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/stock/external-stocktake` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/stock/import-supplier-products` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/stock/list` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/stock/more` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/stock/price-suggestions` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/stock/replenishment` | 等待数据/错误状态，桌面/手机 | BLOCKED 数据尚在加载；已检查当时布局 |
| `/stock/stocktake` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /products?tab=stocktake |
| `/stock/transfers/new` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /purchases?tab=transfer-new |
| `/stock/transfers` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /purchases?tab=transfers |
| `/stocktake/express` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/stocktake/express/[id]` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/stocktake/external` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/stocktake` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /stock/stocktake |
| `/suppliers/new` | 首屏，桌面/手机 | FAIL 旧入口仍调用已停用接口 HTTP 410 |
| `/suppliers/odoo` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/suppliers` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/suppliers/[id]/assign` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/suppliers/[id]/edit` | 源码检查 | NOT RUN 实体界面：无已验证记录样本 |
| `/tickets` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/utilities/barcodes` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/utilities/customers` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/utilities/future-costs` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /products |
| `/utilities/future-prices` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /products |
| `/utilities/mail-log` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/integrations |
| `/utilities/products` | 等待数据/错误状态，桌面/手机 | 布局通过 |
| `/utilities/trashed-items` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /products |
| `/utilities/vendor-connections` | 等待数据/错误状态，桌面/手机 | 布局通过；跳转 /settings/integrations |
