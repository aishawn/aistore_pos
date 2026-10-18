# Orithos POS — capability status

**Last updated:** 2026-10-18（当前仓库基线 `3b408d4`；Dokploy 运行 SHA、完整构建日志和容器状态仍待控制台独立回读）
**Source of truth for business data:** Odoo (via `pos-ui` `/api/odoo/*`).  
Classic Spring/MySQL POS remains in-repo as **reference only** (hidden from sidebar unless `NEXT_PUBLIC_SHOW_CLASSIC_POS=true`).

Statuses:

| Status | Meaning |
|---|---|
| **Accepted** | Implemented against Odoo and suitable for pilot acceptance testing |
| **In progress** | Code present; needs field validation or incomplete edge cases |
| **Planned** | Documented product intent; not a pilot commitment |

## 当前迭代快照：`3b408d4` / `2012146`

### 本轮已完成

- 商品详情页的 Tax rates、Families、Suppliers lookup 失败时显示逐项错误和 Retry；活动图失败时显示独立错误和 `Retry chart`，不再把读取失败静默显示为空值或零图。
- 客户合并、商品合并的最终错误条补齐 `role="alert"` 和 `aria-live="assertive"`，提交失败会被辅助技术主动播报。
- 商品/客户分配页增加商品搜索请求序号保护，旧响应不会覆盖快速输入后的新结果；分类依赖失败提供 Retry。
- Buying Period 创建弹窗增加日期、数量、成本校验，补齐 dialog/ARIA/焦点恢复，创建期间禁止取消和遮罩关闭。

### 本轮线上验证

- 全站静态矩阵：`131` 路由 × `390/1440`，`262/262 PASS`，无 HTTP 失败、横向溢出或页面错误；证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-18_3b408d4.json`。
- 综合交互：`14/14 PASS`，覆盖移动导航、弹窗焦点、商品/客户只读流程、补货、报表和 AI 助手；证据：`docs/UAT_INTERACTION_2026-10-14.json`。
- 商品详情 lookup 故障注入：首次 Tax rates GET `503`，页面显示依赖错误，点击 Retry 后恢复；390px 无溢出、无页面错误、写请求 `0`；证据：`docs/UAT_PRODUCT_VIEW_RETRY_2026-10-18.json`。
- 本地检查：`npm run typecheck`、目标 ESLint、`node --check`、`git diff --check` 通过；按约束未运行本地 Next/Docker build。

### 当前主要功能范围

- Odoo 收银：商品/客户搜索、开班、Cash/Card 模拟收款、找零、GST/现金舍入、收据、退款、库存回读、Cash in/out 和关班读取保护。
- 商品与客户：目录、详情、编辑、新建、CSV 预览导入、分类/供应商分配、合并工作区、图片展示、客户付款/账单/销售历史。
- 采购与库存：供应商、RFQ、收货/退货/调拨表单、补货计划、库存列表、盘点、外部盘点、采购周期、批量调价和封顶价。
- 平台与设置：店铺列表/详情、租户恢复、价目表、角色权限、用户、Outlet/Register、税率、收据、支付和公司设置。
- 报表与 AI：Odoo Overview、Reporting Dashboard、销售/采购/库存等页面；AI 助手和 Sommelier 的页面状态、权限和匿名鉴权保护。

### 尚未完成或尚未验收

- Dokploy 实际运行 SHA、frontend/backend 完整构建日志、容器状态和部署时间尚未从控制台独立保存；公网 200 不能替代部署身份。
- 生产 DashScope AI 仍为 `AI_ENABLED=false`；真实语音转写、酒标识别、发票 OCR 未验收。
- 实体刷卡终端、打印机、钱箱、离线 POS、分单/多支付方式未实现或未验收；Card 仅为 Odoo payment method 模拟。
- SMTP 邀请/密码重置邮件、正式现金差异审批、财务对账和采购财务流程未完成正式运营验收。
- 多数创建、编辑、合并、销售、退款、收货、现金和关班写入回归使用隔离租户或 mock；Demo 租户禁止写入，不能把只读/mock 结果当成生产业务验收。

## 2026-10-18 迭代快照

### `5569fbd` 供应链竞态线上回归

- 记录 `7cd0652` 的供应链商品搜索竞态修复已完成线上回归：订单 `16/16`、综合交互 `14/14`、全站静态矩阵 `262/262` 通过；未执行供应链写入。
- 证据：`docs/UAT_ORDER_PAGES_2026-10-14.json`、`docs/UAT_INTERACTION_2026-10-14.json`、`docs/UAT_ALL_STATIC_PAGES_2026-10-15.json`。Dokploy 控制台运行 SHA、构建日志和容器状态仍待独立回读。

### `7cd0652` 供应链商品搜索竞态

- Supply Chain 设置面板为商品搜索分配请求序号；清空查询或快速输入时，旧的商品响应不会覆盖当前结果。
- 部署后订单 `16/16`、综合交互 `14/14`、全站静态矩阵 `262/262` 通过；未执行供应链写入。

### `d277698` 管理表单依赖恢复

- Orders 筛选的供应商、调拨方、Outlet、商品和用户 lookup 失败时显示逐项错误和 Retry。
- Customer Make Payment 在支付方式读取失败时显示 Retry，并禁用记录支付；View Statements 模板读取失败可 Retry，弹窗补齐 dialog/焦点语义；Bulk Price Edit 分类读取失败可 Retry。
- 本地 `npm run typecheck`、目标 ESLint、`git diff --check` 通过；ESLint 仅报告已有 `setState` effect warning，无 error。
- 部署后管理列表 `8/8`、设置页 `27/27`、订单 `16/16`、综合交互 `14/14`、全站静态矩阵 `262/262` 通过；订单 `pageErrors: []`、`mutatingApiRequests: []`。

### `73e67fd` AI 可用状态线上验证

- 增加 AI 可用状态专项 UAT：认证配置 `enabled=false` 时，收银 AI 助手在发起请求前显示明确的关闭说明；本地收银快捷入口仍可用。
- 专项 `3/3 PASS`，并与 AI surface `10/10`、AI UI `2/2`、Sommelier `10/10` 一起复验；没有模型、反馈或业务写入。
- 证据：`docs/UAT_AI_AVAILABILITY_2026-10-18.json`、`scripts/pilot-ai-availability-uat.mjs`。Dokploy 控制台实际运行 SHA、构建日志和容器状态仍待独立回读。

### `9a845bd` AI 可用性提示

- 收银 AI 助手读取客户端 AI 配置；当店铺 AI 关闭时，入口明确显示 `AI is disabled for this store`，避免把关闭能力显示成可用助手。
- 代码变更已推送；生产 AI 仍保持关闭策略，端点匿名鉴权证据见 `docs/UAT_AI_ANONYMOUS_2026-10-18.json`。

### `ff110de` 外部盘点弹窗恢复批次

- 外部盘点导入弹窗补齐 dialog 语义、焦点管理、模板下载 loading/error 状态和可见错误提示。
- 外部盘点导出弹窗补齐 dialog 语义、焦点管理、outlet 读取错误和 `Retry outlets`。
- 本地 `npm run typecheck`、目标 ESLint、`git diff --check` 通过；线上 Playwright 注入验证 `2/2 PASS`，390px，无导入/导出业务写入。
- 证据：`docs/UAT_EXTERNAL_STOCKTAKE_DIALOG_2026-10-18.json`。Dokploy 控制台运行 SHA、构建日志和容器状态仍待独立回读。

### `16d854e` 匿名 AI 端点鉴权回归

- 未登录访问配置、assistant、report、Sommelier、语音转写和酒标识别等 AI 端点均返回 `401`，共 `11/11 PASS`，没有业务写入。
- 证据：`docs/UAT_AI_ANONYMOUS_2026-10-18.json`。生产 AI 仍保持关闭策略；Dokploy 控制台运行 SHA、构建日志和容器状态仍待独立回读。

### `92b0316` 结算完成计时稳定性

- `FinaliseSalePage` 使用稳定的 `useCallback` 绑定自动完成收款回调，并将其纳入计时器 effect 依赖，避免自动完成流程捕获旧回调。
- 该批次线上订单 `16/16`、综合交互 `14/14`、AI surface `10/10`、AI UI `2/2` 通过；动态页面 HTTP `200` 且 `Cache-Control: no-store, private`、Cloudflare `DYNAMIC`。
- 证据：`docs/UAT_DEPLOYMENT_2026-10-18_92b0316.json` 与 `docs/HANDOFF_2026-10-18_7544d03.md`。Dokploy 控制台实际运行 SHA、完整构建日志和容器状态仍待独立回读。

### `ca8855e` 库存与盘点恢复批次

- 库存列表 CSV 导出失败不再静默；显示导出中状态、错误提示和 `Retry export`，并保留当前筛选条件。
- 库存分类读取失败显示独立错误条和 `Retry categories`，不再把分类下拉框静默显示为空。
- 新建盘点弹窗显示 outlet 读取错误并提供 `Retry outlets`；新建盘点写请求不自动重试，避免重复创建。
- Express stocktake 对已有盘点的加载增加请求序号保护和 Retry；产品搜索失败与“无结果”分开显示，并支持 `Retry search`。
- 本地 `npm run typecheck`、目标 ESLint、`git diff --check` 通过；未运行本地 build、Next.js build 或 Docker build。
- 推送后线上回归：管理列表 `8/8`、设置页 `27/27`、综合交互 `14/14`、订单页 `16/16`、角色权限 Retry `PASS`、Ops 只读 `3/3`、全站静态矩阵 `262/262`；订单 `pageErrors: []`、`mutatingApiRequests: []`，专项无 Demo 业务写入。
- 证据：`docs/UAT_ADMIN_LIST_BATCH_2026-10-17.json`、`docs/UAT_SETTINGS_MOBILE_2026-10-14.json`、`docs/UAT_INTERACTION_2026-10-14.json`、`docs/UAT_ORDER_PAGES_2026-10-14.json`、`docs/UAT_ALL_STATIC_PAGES_2026-10-15.json`、`docs/UAT_ROLE_PERMISSION_RETRY_2026-10-18.json`、`docs/UAT_OPS_READONLY_2026-10-13.json`。Dokploy 控制台实际运行 SHA、构建日志和容器状态仍待独立回读。

### `7a60b0e` Odoo 连接卡片响应竞态批次

- `OdooPosConnectionCard` 为刷新、连接和断开流程分配请求序号；旧的 session/bootstrap 响应、错误和 loading 结束状态不会覆盖当前连接状态。
- 本地 `npm run typecheck`、`git diff --check` 通过；未运行本地 build、Next.js build 或 Docker build。
- 推送后线上设置页、角色权限 Retry、Ops 只读和管理列表回归通过：设置页 `27/27 PASS`，角色权限 Retry `PASS`，Ops `3/3 PASS`，管理列表 `8/8 PASS`；专项请求均未写入 Demo 业务数据。
- 证据：`docs/UAT_ROLE_PERMISSION_RETRY_2026-10-18.json`、`docs/UAT_OPS_READONLY_2026-10-13.json`、`docs/UAT_ADMIN_LIST_BATCH_2026-10-17.json`。公网行为已验证，但 Dokploy 控制台实际运行 SHA、构建日志和容器状态仍待独立回读。

### `02f0103` 角色权限编辑竞态批次

- Roles 编辑器为每次角色权限读取分配 revision；连续打开不同角色、切换到新建角色或关闭编辑器时，旧权限响应不会覆盖当前编辑状态。
- 线上角色权限 Retry 专项：`PASS`，权限读取 2 次，写请求 `0`；设置页 390/1440 视口 `27/27 PASS`。
- 证据：`docs/UAT_ROLE_PERMISSION_RETRY_2026-10-18.json`、`docs/UAT_SETTINGS_MOBILE_2026-10-14.json`。
- 发布后全站静态矩阵复验：`131` 条路由 × `390/1440` 两个视口，`262/262 PASS`，无失败项。

### `ae374ba` 关班读取竞态批次

- `OdooCloseRegisterPage` 的 register/session bootstrap 读取增加请求序号保护；快速 Refresh 或关班后重读时，旧响应不会覆盖当前 register 状态，旧请求也不会提前关闭 loading。
- 线上关班恢复专项 `2/2 PASS`、Ops 只读专项 `3/3 PASS`；没有执行关班、现金或其它业务写入。
- 证据：`docs/UAT_CLOSURE_RECOVERY_2026-10-18.json`、`docs/UAT_OPS_READONLY_2026-10-13.json`。
- 部署后扩展回归：订单页 `16/16 PASS`（`pageErrors: []`、`mutatingApiRequests: []`）、综合交互 `14/14 PASS`、管理列表 `8/8 PASS`。

### `4852850` 补货计划请求竞态批次

- 补货页在 coverage 目标切换时为读取分配请求序号；旧计划的迟到响应、错误和 loading 结束状态不会覆盖当前目标。
- 新增 `scripts/pilot-replenishment-race-uat.mjs`；线上 mock 验证请求顺序 `21 → 7 → 28`，延迟的 7 天计划不会覆盖最终 28 天计划，业务写请求 `0`。
- 证据：`docs/UAT_REPLENISHMENT_RACE_2026-10-18.json`。首次部署冷启动期间曾出现一次探针时序失败，等待后串行重跑通过。

### `d9b3647` Overview 请求竞态批次

- Overview 首页的 Odoo 报表读取增加请求序号保护；旧时间范围的迟到响应、错误和 loading 结束状态不会覆盖当前范围。
- 新增 `scripts/pilot-overview-race-uat.mjs`；线上 mock 让 24 小时请求延迟，确认请求顺序 `720 → 24 → 168` 后，最终 UI 保留 7 天数据，业务写请求 `0`。
- 证据：`docs/UAT_OVERVIEW_RACE_2026-10-18.json`。报表 Dashboard 竞态证据仍见 `docs/UAT_REPORTING_RACE_2026-10-18.json`。

### `699dab0` / `1634b38` 报表请求竞态批次

- `OdooReportingDashboard` 为每次读取分配请求序号；旧范围的迟到响应、错误和 loading 结束状态不会覆盖当前最新范围。
- 新增 `scripts/pilot-reporting-race-uat.mjs`，让 24 小时响应延迟、7 天响应快速返回，验证最终页面仍显示最新 7 天数据。
- Dokploy 部署后线上证据：报表竞态 `PASS`（请求顺序 `8 → 24 → 168`，业务写请求 `0`）；正常报表 `2/2 PASS`；关班恢复 `2/2 PASS`；管理列表 `8/8 PASS`；综合交互 `14/14 PASS`。
- 证据：`docs/UAT_REPORTING_RACE_2026-10-18.json`、`docs/UAT_REPORTING_2026-10-14.json`、`docs/UAT_CLOSURE_RECOVERY_2026-10-18.json`。公网行为已验证，但 Dokploy 控制台运行 SHA、构建日志和容器状态仍未独立回读。

### 待部署批次：共享数据恢复与平台店铺管理

代码已完成、尚未完成 Dokploy 线上复验：

| 功能域 | 本批次改动 | 本地证据 |
|---|---|---|
| 认证/租户切换 | `useApi` 在请求路径变为 `null` 时立即清理旧数据和错误，避免登出或租户切换期间短暂显示上一份响应 | `npm run typecheck`、目标 ESLint、`git diff --check` 通过 |
| 平台店铺详情 | 详情读取增加请求序列保护，防止快速切换店铺时旧响应覆盖新店铺；首次读取失败提供原地 `Try again`；增加可感知加载骨架 | 同上 |
| 价目表删除 | 删除失败时确认框保留当前对象并直接显示错误，可立即重试；共享 `ConfirmDialog` 新增可选错误区域 | 同上 |

部署后应补充：平台店铺列表/详情只读回归、详情 503 → Retry 故障注入、价目表删除失败 mock（写请求必须拦截为 `0`），以及设置页移动端回归。

本批次线上验证已完成：平台/价目表专项 mock `2/2 PASS`（`docs/UAT_PLATFORM_RECOVERY_2026-10-18.json`），管理列表 `8/8 PASS`，设置页 `27/27 PASS`，角色权限 Retry `PASS`，综合交互 `14/14 PASS`，订单页 `16/16 PASS`；订单探针 `pageErrors: []`、`mutatingApiRequests: []`。专项探针所有业务写请求为 `0`。这些结果证明公网行为恢复正常，但仍不能替代 Dokploy 控制台的实际运行 SHA、构建日志和容器状态。

### 2026-10-18 `383c8a5` 删除恢复批次

- 促销分类、供应商连接删除失败时，确认框保留当前记录并显示错误，允许立即重试。
- 平台店铺列表和详情 Refresh 在请求期间禁用并显示加载状态，避免重复请求。
- Dokploy 部署后专项 mock 从 `2/2` 扩展为 `4/4 PASS`；管理列表 `8/8`、综合交互 `14/14`、订单页 `16/16` 均通过，订单 `pageErrors: []`、`mutatingApiRequests: []`。

### 2026-10-18 `556923d` 商品删除恢复批次

- 商品单条删除/停用和批量删除失败时，确认框保留当前上下文并显示错误，支持立即重试；移除可能与确认框叠加的二次错误弹窗。
- Dokploy 部署后平台恢复专项扩展为 `5/5 PASS`（新增商品删除），管理列表 `8/8`、综合交互 `14/14`、订单页 `16/16` 继续通过；所有专项写请求为 `0`。

### 2026-10-18 `5871dbc` 关班报表恢复验证

- 关班列表增加可见 Refresh/loading 状态；详情页增加请求序列保护、加载骨架和禁用中的 Refresh，避免快速刷新或切换时旧响应覆盖当前记录。
- 关班专项 mock：`2/2 PASS`，列表数据/刷新控件和详情 `503 → Retry → 恢复` 均通过，写请求为 `0`。

### 2026-10-18 线上复验快照

功能代码基线为 `9daca44`；`main` 已推送。创建/采购表单 Retry `7/7`、供应商移动端 mock、发票扫描 mock、Gift Cards filter Retry `1/1`、角色权限 Retry、AI surface `10/10`、AI UI `2/2`、Sommelier `10/10`、全站静态矩阵 `262/262` 均通过，所有探针写请求为 `0`。Customer Balances 当前线上路径仍是明确的“未接入 Odoo”状态页，不计入 filter Retry 能力。UAT JSON 中的 `deployment` 字段由脚本写入本地 Git HEAD，不能作为 Dokploy 运行身份；Dokploy 完整 SHA、构建日志和容器状态仍待独立回读。仍不能把只读/UI 验证当作真实业务写入、硬件、生产 AI 或正式财务验收。

### 已完成能力

| 功能域 | 已完成内容 | 线上证据 |
|---|---|---|
| Odoo 收银 | 客户搜索支持 combobox、ArrowUp/ArrowDown、Enter 选中、Escape 取消过期结果；商品搜索支持 combobox/listbox、键盘选中、Escape 清空，并保留条码 Enter 查找 | POS `2/2`、综合交互 `14/14`；额外浏览器探针确认商品/客户活动项与 Escape，业务写入 `0` |
| 关班 | Close Register 确认弹窗接入统一焦点初始聚焦、Tab 约束、Escape 取消和焦点恢复 | `pilot-ops-readonly` `3/3`；缺少现金时 API 返回 `422`，没有 Odoo 写入 |
| 目录/采购/销售/补货/概览表格 | 所有列标题补齐 `scope="col"`，表格补齐明确 `aria-label` | 管理列表 `8/8`、订单 `16/16`、综合交互 `14/14` |
| 搜索控件 | 商品目录、采购订单、销售历史搜索框补齐稳定 `aria-label` | 管理列表、订单和交互专项通过；订单探针 `pageErrors: []`、`mutatingApiRequests: []` |
| 报表趋势图 | 趋势图容器增加基于当前数据的非视觉摘要，并通过 `aria-describedby` 关联；保留逐柱 `role="img"` 与键盘聚焦 | 本次提交 `36bcfdf` 后综合交互 `14/14`、订单页 `16/16`、AI UI `2/2` 通过 |
| 供应商新增弹窗 | 接入统一焦点初始聚焦、Tab 约束、Escape 取消和关闭后恢复触发按钮焦点；移除会与焦点恢复竞争的原生 `autoFocus` | `pilot-supplier-create-mock` PASS；管理列表 `8/8`、综合交互 `14/14`、订单页 `16/16` |
| 新建客户/商品弹窗 | 名称字段通过 `useDialogFocus` 的 `initialFocusRef` 获得初始焦点；移除原生 `autoFocus`，确保取消后焦点恢复稳定 | 综合交互 `14/14`；客户和商品创建专项均通过且无业务写入 |
| CSV 导入弹窗 | 分类数据加载完成后自动把焦点补到可用文件选择控件，避免首次打开时控件 disabled 导致键盘焦点停在关闭按钮 | `70cf8d2` 后综合交互 `14/14`；CSV 预览取消，无产品写入 |
| 商品图片 | Odoo 商品图片安全读取 API、JPEG/PNG/WebP 上传压缩、目录/收银搜索/购物车缩略图和无图片分类 fallback | 图片只读探针：目录页 `54` 个图片元素、`13` 次请求、`0` 个 `5xx`、`0` 页面错误；无图商品 `404` 后正常 fallback |
| 收银焦点 | 销售备注、折扣和 Finalise Sale 客户选择弹窗使用显式 `initialFocusRef`；移除原生 `autoFocus`，避免关闭后无法恢复触发按钮焦点 | POS 弹窗 `2/2`、串行综合交互 `14/14`；订单 `16/16`、无写请求 |
| 收银弹窗恢复 | `useDialogFocus` 排除 `aria-hidden`/`inert` 后代；原触发控件 disabled 时恢复到 Register 选择器 | 部署后 POS 弹窗 `2/2`、综合交互 `14/14`；未产生业务写入 |
| 采购/销售详情恢复 | Odoo 详情读取失败时保留当前记录并提供原地 Retry，避免返回列表重新定位 | `ca11348` 后采购详情 mock `PASS`；订单 `16/16`，无页面错误、无写请求 |
| 商品目录分类恢复 | 分类 API 临时失败时提供独立 Retry，恢复筛选和 CSV 导入所需的分类数据 | `97b99ee` 后管理列表 `8/8`、综合交互 `14/14`、订单 `16/16`；无写请求 |
| POS 分类恢复 | 收银页分类 API 临时失败时提供独立 `Retry categories`，恢复收银分类筛选 | 线上注入首个 `503` 后点击 Retry，请求次数 `2` 并恢复；无业务写入 |
| POS 错误条移动布局 | 分类和客户搜索错误条允许长错误文案换行，Retry 操作在 390px 仍可见 | `fafe8eb` 后综合交互 `14/14`、POS 弹窗 `2/2`；无写请求 |
| POS Retry 状态反馈 | 分类、客户和商品搜索 Retry 请求期间禁用重复点击并显示 `Retrying…` 与加载图标 | `18c9a1b` 后综合交互 `14/14`、POS 弹窗 `2/2`；订单 `16/16`，无写请求 |
| 管理弹窗焦点 | 分类创建、分类编辑、价目表创建使用显式输入框初始焦点，移除原生 `autoFocus` 竞争 | `4e707f0` 后综合交互 `14/14`；分类创建移动焦点与触发按钮恢复通过 |
| 新建盘点弹窗焦点 | 新建盘点弹窗补齐 `role=dialog`、`aria-modal`、标题关联和统一初始/恢复焦点 | `2c4d01c` 后综合交互 `14/14`；未执行盘点提交 |
| 页面稳定性 | utility 动态页面使用 `dynamic = "force-dynamic"` 与 `fetchCache = "force-no-store"`；移除显式 `revalidate` 导出，避免 Next.js 16 将客户端同名函数误当路由配置 | `/utilities/future-costs`、`/utilities/future-prices` 已线上复验 HTTP 200、`no-store`；故障注入后 Retry 恢复 |
| 合并选择器焦点 | 客户合并和商品合并选择器接入统一 `useDialogFocus`，补齐 dialog 语义、标题关联、Escape/Tab 和关闭后恢复焦点；移除原生 `autoFocus` | 本轮线上综合交互 `14/14`、全站静态矩阵 `262/262`；未执行合并写入 |
| 全屏创建表单焦点 | 商品创建、供应商创建全屏表单接入统一 dialog 语义和显式名称字段初始焦点；保留未保存离开确认 | 本轮线上综合交互 `14/14`、管理列表 `8/8`；未执行商品/供应商写入 |
| Sommelier Identify 请求状态 | 搜索/拍照请求期间禁用重复提交，输入框暴露 `aria-busy`，文本搜索失败提供原地 `Retry search` | AI UI `2/2 PASS`；Sommelier 只读回归 `10/10 PASS`，AI 关闭/匿名保护不变 |
| POS 客户搜索竞态 | 为客户搜索请求增加序列号，过期响应不再覆盖最新输入结果 | POS 弹窗 `2/2 PASS`、综合交互 `14/14 PASS`；未产生销售或客户写入 |
| POS 商品/促销浏览竞态 | 为商品目录和促销筛选增加请求序列保护，旧响应不再覆盖最新文件夹、周期或筛选词；加载状态仅由最新请求结束时解除 | `d8c99f1` 后 POS 弹窗 `2/2 PASS`、综合交互 `14/14 PASS`；未产生销售或库存写入 |
| POS 商品/促销错误恢复 | 商品/促销浏览失败时区分错误态与空结果，显示可操作的 `Retry`，并复用当前目录/周期/筛选条件 | `66ddc46` 后 POS 弹窗 `2/2`、综合交互 `14/14`、订单页 `16/16 PASS`；无页面错误或变更请求 |
| CSV 导入焦点时序 | 分类加载刚结束时，使用布局阶段立即聚焦可用文件控件，并保留动画帧重试，避免焦点短暂停在关闭按钮 | `9b1031c` 后综合交互串行 `14/14 PASS`；CSV 预览取消，无产品写入 |
| 创建向导依赖错误恢复 | 客户分组、商品 family/tag 读取失败时提供原地 `Retry`，保留当前向导表单，不要求关闭重开 | `0e89492` 后综合交互 `14/14`、管理列表 `8/8`、订单页 `16/16 PASS`；无创建写入 |
| Sommelier 读取错误恢复 | 推荐失败提供 `Retry recommendation`；酒款详情加载失败提供 Retry 并重新读取当前商品 | `c4ef5a4` 后 AI UI `2/2 PASS`、Sommelier 只读 `10/10 PASS`、综合交互 `14/14 PASS`；匿名保护和 Odoo 价格/库存一致性通过 |
| Legacy 读取页面 Retry | Promotion categories/promotions、客户余额、关班与销售报表、支付方式/角色/税率/用户、邮件日志、回收站、供应商连接，以及 Future Costs/Future Prices 在读取失败时提供原地 Retry；客户余额桌面/移动视图共用同一 reload | `4d7b4c4` 部署后管理列表 `8/8`、综合交互 `14/14`；故障注入探针 `UAT_LEGACY_RETRY_2026-10-18.json` 为 `5/5 PASS`、写请求 `0` |
| Gift Cards 过滤依赖恢复 | Outlet 读取失败时保留 Gift Cards 页面和其它筛选，显示依赖错误与原地 Retry；恢复后继续使用当前页面 | `docs/UAT_FILTER_DEPENDENCY_RETRY_2026-10-18.json`：首次 Outlet GET 注入 `503` 后 Retry 恢复，`1/1 PASS`，写请求 `0` |

### 最新只读回归结果

| 探针 | 结果 | 范围 |
|---|---:|---|
| POS 弹窗 | `2/2 PASS` | 390/1440，帮助弹窗、Sales Keys/Parked 键盘切换 |
| 综合交互 | `14/14 PASS` | 移动导航、筛选、弹窗、表单保护、补货和报表 |
| 管理列表 | `8/8 PASS` | 商品、客户、供应商、采购及 utility 列表 |
| 订单页面 | `16/16 PASS` | 订单/采购/销售历史，0 页面错误、0 写请求 |
| 动态路由部署后复验 | `3/3 PASS` | `/`、`/utilities/future-costs`、`/utilities/future-prices` HTTP 200；`no-store` 响应头；运行身份未独立回读 |
| 设置页面 | `27/27 PASS` | 390/1440，设置只读视图与无溢出 |
| AI surface/UI | `10/10`、`2/2 PASS` | 2026-10-18 线上只读复验；AI 保持关闭时的配置、权限和匿名保护 |
| 本轮定向回归 | `14/14`、`16/16`、`2/2 PASS` | `36bcfdf` 部署等待后；订单 `pageErrors: []`、`mutatingApiRequests: []` |
| 供应商焦点批次 | `PASS`、`8/8`、`14/14`、`16/16` | `adc9fe0` 部署等待后；mock API 拦截，无 Odoo 写入 |
| 客户/商品焦点批次 | `14/14 PASS`、供应商 `PASS` | `e46e134` 部署等待后；新增名称字段初始焦点和触发按钮恢复断言 |
| CSV 焦点时序修复 | `14/14 PASS` | `70cf8d2` 部署等待后；CSV 文件控件等待可用并正确获得焦点 |
| 商品图片批次 | `14/14`、`8/8`、`16/16 PASS` | `b494552` 部署等待后；商品图片只读探针无服务端失败、无页面错误 |
| 收银弹窗焦点批次 | `2/2`、`14/14`、`16/16 PASS` | `c65b186` 部署等待后；并发收据探针一次超时，串行重跑通过，未产生业务写入 |
| 全站静态矩阵 | `262/262 PASS` | 131 路由 × 390/1440，无横向溢出和页面错误 |
| `5272b88` 批次串行回归 | `14/14`、`2/2`、`8/8`、`16/16`、采购 mock `PASS` | 综合交互、POS 弹窗、管理列表、订单页和采购详情恢复；订单无页面错误/变更请求 |
| `f92dc1c` 搜索稳定性批次 | AI UI `2/2`、Sommelier `10/10`、POS `2/2`、综合交互 `14/14 PASS` | 首轮 AI UI 遇 504，串行重跑通过；Sommelier 价格/库存一致性和匿名 401 通过；无业务写入 |
| `d8c99f1` POS 浏览竞态批次 | POS `2/2`、综合交互 `14/14 PASS` | 客户/商品/促销浏览旧响应保护；无业务写入 |
| `66ddc46` POS 错误恢复批次 | POS `2/2`、综合交互 `14/14`、订单 `16/16 PASS` | 商品/促销请求失败显示 Retry；订单 `pageErrors: []`、`mutatingApiRequests: []` |
| `9b1031c` CSV 焦点批次 | 综合交互 `14/14`、AI surface `10/10`、AI UI `2/2`、Sommelier `10/10`、POS `2/2`、订单 `16/16 PASS` | 首轮综合交互 `13/14` 的 CSV 焦点时序失败已修复；AI UI 首轮 networkidle 超时后串行重跑通过；无业务写入 |
| `0e89492` 向导依赖恢复批次 | 综合交互 `14/14`、管理列表 `8/8`、订单 `16/16 PASS` | 首轮登录瞬态失败，串行重跑通过；客户/商品创建仅验证错误恢复和表单保护，无业务写入 |
| `c4ef5a4` Sommelier Retry 批次 | AI UI `2/2`、Sommelier `10/10`、综合交互 `14/14 PASS` | AI UI 首轮导航超时，重跑通过；无模型写入、反馈写入或业务数据写入 |
| `25bff27` 部署后回归 | AI UI `2/2`、Sommelier `10/10`、综合交互 `14/14 PASS` | webhook 返回 200，等待约 5 分钟后串行回归通过；无业务写入 |
| `23aa88e` utility 构建修复 | 待部署后复验 `/utilities/future-costs`、`/utilities/future-prices` | 本地检查通过；不把静态代码检查当作线上构建成功证据 |
| `c76233d` 全站与 Retry 回归 | 全站 `262/262`、legacy Retry 故障注入 `3/3`、AI surface `10/10`、AI UI `2/2`、Sommelier `10/10`、综合交互 `14/14`、订单 `16/16` | 线上只读/故障注入通过；无业务写入；订单首轮一次导航 `ERR_ABORTED` 后串行重跑通过 |
| `4d7b4c4` utility 错误态回归 | Future Costs/Future Prices 不再把读取失败显示为空数据；邮件日志、回收站、促销列表和两个 utility 页面故障注入 `5/5` | Retry 恢复通过、写请求 `0`；管理列表 `8/8`、综合交互 `14/14`；Dokploy 运行 SHA 仍待控制台独立回读 |
| `48f4dd1` 详情读取恢复 | 订单查看/编辑、销售键编辑、客户账单、客户组详情、客户/商品合并选择器、商品详情和 AI 报表结果页在读取失败时提供原地 Retry；客户组子列表支持独立重试 | 线上订单 `16/16`、AI UI `2/2`、综合交互 `14/14`、全站静态矩阵 `262/262 PASS`；无业务写入 |
| Sommelier Retry 故障注入 | 推荐和酒款详情首次读取注入 503，点击 Retry 后均恢复 | 推荐请求次数 `2`、详情请求次数 `2`；无业务写入 |
| `257f764`/`7f9e3c0` 管理读取恢复批次 | 批量调价、封顶价、库存、分类/供应商分配、采购周期、客户/商品详情、客户收款、客户组/商品编辑的主数据和子面板接入原地 Retry；同步更新功能清单与交接 | 推送后管理列表 `8/8`、综合交互 `14/14`、订单页 `16/16`、Legacy Retry 故障注入 `5/5`、全站静态矩阵 `262/262`；写请求 `0`；Dokploy 实际 SHA 尚未从控制台独立确认 |
| `2f9149b`/`7602720` 创建表单依赖 Retry | 手工订单、收货、退货、信用单、调拨、商品创建和客户创建表单的供应商/Outlet/分类/family/tag/客户分组/价目表读取失败可原地 Retry，保留已填写表单，不需要刷新页面 | `docs/UAT_CREATE_FORM_RETRY_2026-10-18.json`：故障注入 `7/7 PASS`，首次 503 后第二次读取恢复，业务写请求 `0`；后续订单页 `16/16`、综合交互 `14/14` 复验通过 |

### 仍未放行

- Dokploy frontend/backend 实际运行 SHA、构建日志和容器状态尚未从控制台独立确认；本次手动 webhook 返回 `Branch Not Match`，不能作为部署成功证据。
- 生产 AI、实体支付终端、打印机/钱箱、SMTP、分单支付和离线 POS 仍未完成验收或未实现。
- 正式门店现金差异审批、财务对账和正式运营流程仍需店主/财务验收。
- 以上回归均为只读或 UI 语义验证；业务写入必须继续使用隔离 Odoo 测试公司/数据库。

### 交接状态

- **已通过：** 隔离租户基础 POS、采购收货、退款/库存回滚、现金管理/关班、多租户隔离，以及线上只读稳定性和 Retry 故障恢复。
- **未覆盖：** Dokploy 运行身份独立证据、生产 AI、真实硬件、SMTP、正式财务/运营流程。
- **产品未实现或延期：** 分单/多支付方式收款、离线 POS、视频损耗防范 AI、Banner/买方组价格文件。
- **放行结论：** `NO-GO`，直到上述关键证据和产品边界完成复核。

## Register & sales

| Capability | Status | Notes |
|---|---|---|
| Open sell screen (Odoo products / scan / cart) | Accepted | Browser UAT: session `orithos_store1/00004`, two DEMO wines, category filter Red/White only, quote `$28.60`, Finalise disabled until quote ready. 2026-10-16 refinement adds register context persistence, safe register switching, explicit product/customer search loading/error/retry states, delayed status for slow product/quote/checkout requests, cart-bound Retry quote after tax failure, offline protection, contextual POS recovery help, and a per-user/register active cart draft that survives refresh, expires after 24 hours, and is re-quoted by Odoo. Deployed via `997d404`/`8bb6d45`/`518e796`; online smoke confirmed normal restore and stale-draft discard. Commit `1ba41f6` distinguishes an initial Odoo/session read failure from an unauthenticated state and exposes Retry; normal and simulated-failure online smoke passed with no page errors. Full payment regression remains pending. |
| Park / resume sale (terminal localStorage) | Accepted | Park + discard confirmed on production terminal; not server-synced. Local 2026-10-16 refinement remembers the selected register and scopes parked sales to that register; requires deployment and browser regression. |
| Checkout with GST + cash rounding | Accepted | Browser Card (`260-1-000009` / `$28.60`) and Cash (`260-1-000010` / `$38.39`) Finalise on `00004`; on-screen Sale complete receipt shown; stock moved 12→11 then restored by refunds. No live card terminal or drawer. No POS pricelist configured |
| Pricelist rules & customer pricelist | Accepted | Checkout calls Odoo `_get_product_price`; FX mismatch still blocked |
| Bottle / case pack factor | Accepted | Pack ×1/6/12/24 on cart lines (UI confirmed) |
| Full-sale refund from history | Accepted | Browser refund of this-round receipts `260-1-000009` and `260-1-000010`; Odoo independent refunds `000009 REFUND` / `000010 REFUND`; free qty back to 12. Refunded receipts now explain the prior refund and hide the duplicate full-refund action (app `1673384`). Sales history exports the currently visible Odoo rows as CSV and supports read-only status filters (completed, refunded, cancelled, draft) through a server allowlist; online authenticated smoke confirmed Export visible and Last refreshed. Commit `3ccff72` adds desktop/mobile first-load skeleton rows while preserving search, filters, Refresh, and archive context; delayed-read smoke passed with no page errors and no refund action submitted. |
| Close register (Odoo session) | Accepted | API/UI require counted cash for cash-enabled registers; missing count returns 422 before Odoo writes. Live isolated tenant UAT completed Cash sale `260-77-000035`, counted cash `790.80`, Odoo session state `closed`, expected cash `790.80`, difference `0`, then tenant deletion and post-delete auth `402`. Evidence: `docs/UAT_CLOSE_REGISTER_INCOME_ACCOUNT_FIX_LIVE_2026-10-17.json`. |
| Manage Cash (Odoo cash in/out) | Accepted | Live write on `orithos_store1/00004` via `/api/odoo/session/cash` + UI (`5fa78d5`); commit `2000ad0` adds a layout-preserving first-load skeleton and a real error/Retry state when bootstrap cannot be read. Online normal and simulated-failure smoke passed; no cash write was performed in this pass. Odoo 18 `try_cash_in_out` with partner/extras |
| Purchase receive (Odoo) | Accepted | Isolated-company live UAT confirmed PO confirmation, partial receipt with backorder, final receipt, duplicate receipt rejection, and inventory delta +4; evidence: `docs/UAT_PURCHASE_RECEIVE_LIVE_2026-10-16.json` on deployment `822f36b`. Supplier creation is now also live and tenant-scoped; see `docs/UAT_SUPPLIER_ISOLATION_LIVE_2026-10-17.json`. |
| Credit sales / multi-tender split | Planned | |
| Offline-first sell | Planned | Competitor hard requirement; deferred |

## Stock & purchasing

| Capability | Status | Notes |
|---|---|---|
| Product catalogue (Odoo) | Accepted | `/products/odoo` shows DEMO wines; browser matrix re-check after hydrate shows SKUs and on-hand 12. The catalogue shows the last successful refresh time and labels retained rows as potentially stale when a refresh fails; online authenticated smoke confirmed Last refreshed. Commit `036580c` adds desktop/mobile first-load skeleton rows while preserving search and refresh controls; delayed-read smoke passed with no page errors or write action. |
| Supplier directory (Odoo) | Accepted | `/suppliers/odoo` reads and creates tenant-scoped Odoo suppliers with ABN duplicate blocking. Live isolated tenant UAT passed invalid email 400, unique supplier 201, duplicate ABN 409, and Odoo company readback; evidence: `docs/UAT_SUPPLIER_ISOLATION_LIVE_2026-10-17.json`. Supplier writes now force the active tenant company context. |
| Purchases / RFQ list | Accepted | `/purchases/odoo` shell + Odoo list API; commit `6a8a393` adds layout-preserving first-load skeleton rows and keeps search/status controls visible while reads are pending. Online delayed-read smoke passed without exposing or submitting write actions. |
| Explainable replenishment suggestions | Accepted | Rules-based velocity; row-level reasons |
| Approve → draft RFQ (human gated) | Accepted | Never auto-confirms PO |
| Replenishment approval audit | Accepted | Live isolated-company UAT created a draft RFQ and read back one internal Odoo chatter audit containing the forecast method, target coverage, suggested/ordered quantities and reason; zeroed suggestions remain audit-only and are excluded from PO lines. Evidence: `docs/UAT_REPLENISHMENT_AUDIT_LIVE_2026-10-17.json`. RFQ remains draft and is never auto-confirmed. |
| Supplier invoice OCR → receive draft | In progress | OCR preview only when AI enabled; commit `459a243` makes the preview-only boundary explicit, removes the Classic MySQL `Save as received order` action, and links staff to Odoo Purchases / Replenishment. Production AI remains disabled and no invoice write is available from this page. |
| Banner / buyer-group price files | Planned | |

## Reporting & AI

AI remains disabled in production. The tenant report database account has no source-controlled default password; configuring `AI_REPORT_RO_PASSWORD` is required before outlet report access can be provisioned.

| Capability | Status | Notes |
|---|---|---|
| Odoo reporting dashboard | Accepted | `/reports/dashboard` browser UAT pass; 2026-10-16 refinements add a layout-preserving skeleton, retryable first-load and refresh failure states, explicit data-through vs loaded timestamps, and hide comparisons on low prior-period baselines. Commit `83815f2` is deployed and authenticated read-only smoke passed. |
| Cashier assistant / NL reports | In progress | Spring Graph; report permissions now resolve from the active DB role on every request (`8721a08`); 113 Java 21 build tests pass. Production AI remains disabled until budget, so no live report call UAT yet |
| Wine / sommelier assistant | In progress | Odoo remains authoritative even when its response is empty, preventing stale Classic MySQL fallback; page copy no longer claims AI is doing deterministic matching. Recommendation/detail price and free-stock parity passed 6/6 production read-only checks on `da508ce`; see `docs/UAT_SOMMELIER_REGRESSION_2026-10-13.json`. Still not verified against register-specific warehouse context or tax/pricelist customer totals. Image recognition and model-backed behavior remain off/unverified. |
| Video loss-prevention AI | Planned | Explicitly post-MVP |

## Ops / integration

| Capability | Status | Notes |
|---|---|---|
| Odoo manual connect | Accepted | Manual Connect remains available; commit `4059f13` adds a layout-preserving connection skeleton and an explicit Retry status check after transient failures. Online delayed-read and simulated-session-failure smoke passed without login/logout writes. |
| Odoo session auto-recover | Accepted | Production `autoRecoverConfigured:true`; cookie removal recovers Replenishment on first request, and an already-open Products page recovers/retries its read-only records POST after Refresh. Only safe reads replay after recovery; checkout, RFQ, product/customer writes and close are never replayed. POS session `00004` remains open — `docs/UAT_ODOO_AUTORECOVER_2026-10-13.json` (6/6) |
| Deploy currency (`83bdafb`+) | Accepted | Production shows **Open Odoo POS** on closed-register empty state |

## Classic MySQL stack

| Capability | Status | Notes |
|---|---|---|
| Full Classic POS modules | Reference | Do not pilot as writable SoT |
| Dual-write Classic ↔ Odoo | Not planned | Product design forbids dual SoT |

## Store setup and account administration

| Capability | Status | Notes |
|---|---|---|
| Odoo session integration | Accepted | Auto-recover on; Orithos logout clears Odoo cookie / protected APIs return 401 |
| Users / roles | Accepted | `fe9b163`: role CRUD with permission checkboxes; users invite shows role select + SMTP copy-link messaging; production create/delete role exercised (cleanup deleted `Pilot Clerk *`). Users and Roles now preserve their list shapes during first load and expose independent Retry actions for user, role, permission, and staff reads. |
| Payment / tax / outlet / register setup | Accepted | Odoo read-only views; browser matrix pass. Payment Methods and Tax Rates now keep their list structure visible during first load and expose Retry on transient read failures. Price Sets also preserves its configuration list shape during first load and exposes Try again on read failure. |
| Company settings | Accepted | Honest status page (not connected to Odoo); live links to Integrations / Payment / Tax / Registers |
| Sale keys | Accepted | Honest status page; removed from pilot sidebar |
| Receipt / hardware setup | Accepted | Honest not-connected status pages; printer/drawer still unimplemented |

## How to read README vs this file

- README may describe architecture and module maps.
- **Pilot promises and marketing copy must follow this tri-state table.**
- Prefer saying “In progress” over implying Accepted when field acceptance has not run.

## 2026-10-13 browser UAT (session `00004`)

- Deployed app commit `effcb7e` (includes cash-count close guard, AI report credential hardening, role permissions, honest company/Sale Keys status pages, and duplicate-refund status explanation).
- Page matrix evidence: `docs/UAT_PAGE_MATRIX_2026-10-13.json` (24/24 routes pass after waiting for Odoo catalogue hydration; the inventory assertion now matches the displayed `12Units` format).
- Role CRUD evidence: production UI created a temporary role, selected `AI Report Cost`, showed the saved grant in the role list, and deleted the role. API confirmed the grant; no test role remains. Earlier leftover `Pilot Clerk 344840` was also removed.
- Odoo auto-recovery regression: after production Odoo session DELETE, navigating directly to Replenishment restored the session through its first data request, without visiting Integrations or pressing Connect; POS bootstrap returned `orithos_store1/00004` as opened. After Orithos logout, anonymous Odoo session GET returned 401.
- Interaction evidence: `docs/UAT_INTERACTION_2026-10-13.json` records 8/8 passing read-only interactions, including refunded receipt `260-1-000009` showing prior-refund status and no duplicate full-refund action, catalogue search/edit prefill, form guards, CSV preview/cancel, replenishment coverage, and reporting range change. No product/customer, sale, RFQ, refund, or register-close write was performed in this pass.
- Operations evidence: `docs/UAT_OPS_READONLY_2026-10-13.json` confirms connected auto-recovery status, direct close API rejection without counted cash, session `00004` still open, and the purchase status filter. No draft RFQs currently exist, so purchase detail/receipt viewing remains unverified; no purchase or close write was performed.
- Write evidence: Card `$28.60` receipt `260-1-000009`, Cash `$38.39` receipt `260-1-000010`, refunds created, stock restored to 12/12 — `docs/UAT_WRITE_2026-10-13.json`.
- AI remained off; SMTP still unconfigured (invite/reset copy-link path verified in UI copy).
- Session `orithos_store1/00004` left **opened** after net-zero this-round sales/refunds.
