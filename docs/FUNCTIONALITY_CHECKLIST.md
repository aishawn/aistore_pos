## 2026-10-23 全站本地路由烟测与收货 UI 遮挡修复

- [x] 当前源码 SHA `fbd2871e`（dirty worktree）在正式 `pos-ui/app` 中重跑 141 个静态页面 × 390px / 1440px：**282/282 PASS**；HTTP 200、无浏览器运行时异常、无横向溢出，AI 入口与当前视口可交互控件无重叠。
- [x] Route fixture 覆盖身份、Overview、采购计划、Odoo stocktake 和 5 个只读 records POST；业务写请求 0，生产业务写入 0。Node `v24.19.0` Playwright runner；未运行本地 build。证据：`docs/UAT_LOCAL_STATIC_ROUTE_MATRIX_2026-10-23.json`。
- [x] 浏览器截图复核发现收货表单 AI 浮钮挡住 Internal Reference。收货新建/盘点页改为顶栏 AI 入口；Admin action footer 在手机和平板宽度均预留浮钮空间。复验截图：`docs/screenshots/2026-10-23-local-static-route-matrix/390-orders_receive_new.png`。
- [x] 前端单测 **21/21 PASS**、TypeScript typecheck PASS；全站路由证据：`docs/UAT_LOCAL_STATIC_ROUTE_MATRIX_2026-10-23.json`。
- [x] Odoo stocktake 独立操作回归 **5/5 viewport PASS**（320/390/768/1024/1440px）：地点失败重试、无效数量拦截、取消不写入、确认载荷和单次提交均通过；4 个模拟 apply 请求只到本地 fixture。证据：`docs/UAT_ODOO_STOCKTAKE_LOCAL_2026-10-23_CURRENT.json`。

- [x] 收货新建表单窄屏补测 **320/390/1440px 3/3 PASS**；AI 入口与 Internal Reference、sticky Cancel/Create 均无遮挡，截图目视通过；API 写请求 0。证据：`docs/UAT_RECEIVE_FORM_RESPONSIVE_LOCAL_2026-10-23.json`。

## 2026-10-24 POS 收银结账闭环本地回归

- [x] `/register/odoo` Playwright fixture **9/9 PASS**：空购物车不可结账、现金不足拦截、现金找零和收据、非现金外部终端确认、未知结果状态恢复且不重放支付、刷新后恢复订单 UUID/草稿、忙碌期间双击只提交一次、收据五视口适配及浏览器错误/写入隔离。
- [x] 视口覆盖 320/390/768/1024/1440px，无横向溢出；320px 和 1440px 收据截图已目视复核。所有 API 由本地 fixture 截获，模拟 checkout POST 仅 1 次，Odoo 真实业务写入 0。
- [x] `/close` Playwright fixture **6/6 PASS**：必填/负数/上限校验、面额点钞和模式切换保值、差额复核与取消、失败后显示错误并保留金额、重试成功、处理中防重复与 Escape 锁定；320/390/768/1024/1440px 无横向溢出。测试发现并修复 Review 接受无效金额、失败弹窗遮住错误/重试入口、AI 悬浮入口遮挡固定 Review 按钮，以及切换点钞方式会丢失某一录入草稿的问题。
- [x] Node `v24.19.0` 前端单测 **23/23 PASS**、`tsc --noEmit`、Close Register 定向 ESLint、两项 UAT `node --check` 均通过。Node 24 浏览器 runner 重跑结账 **9/9**、关班 **6/6 PASS**；模式专项验证先输入面额 $90、切到手动输入 $88.50，再切回并分别恢复 $90 / $88.50。证据：`docs/UAT_POS_CHECKOUT_LOCAL_2026-10-24.json`、`docs/UAT_CLOSE_REGISTER_LOCAL_2026-10-24.json`；截图：`docs/screenshots/2026-10-24-pos-checkout-local/`、`docs/screenshots/2026-10-24-close-register-local/`。
- [ ] 该回归使用 API fixture，不代表线上部署、Odoo 成交入账、税额/退款/班次现金对账已验收。当前候选仍 dirty，含 `pos-api` 修改；冻结同一 SHA 并通过 Dokploy Java 21 `mvn -B clean verify` 后才可部署。真实交易继续受隔离 attestation 门禁限制，Pilot **NO-GO**。

## 2026-10-24 采购与供应商本地交互复验

- [x] 当前 SHA `fbd2871e`、Node `v24.19.0`：采购确认/收货延迟响应、失败重试和成功反馈 **66/66 PASS**；Vendor Connections 列表/表格 **5/5 PASS**；供应商新增 **69/69 PASS**，覆盖必填校验、重复 ABN、失败恢复、刷新与五视口；供应商编辑表单 **13/13 PASS**，覆盖 390/1440px 和空名称阻断。
- [x] 手机/桌面截图抽查供应商新增、编辑、连接列表和采购收货详情，未见字段/操作区遮挡；测试写请求均被 fixture 拦截，供应商创建模拟写请求 10 次，真实 Odoo 业务写入 0。
- [x] 证据：`docs/UAT_PURCHASE_BUSY_LOCAL_2026-10-24_GOAL-RERUN.json`、`docs/UAT_VENDOR_CONNECTIONS_RESPONSIVE_LOCAL_2026-10-24_GOAL-RERUN.json`、`docs/UAT_SUPPLIER_CREATE_LOCAL_2026-10-24_GOAL-RERUN.json`、`docs/UAT_SUPPLIER_EDITOR_LOCAL_2026-10-24_GOAL-RERUN.json`；截图目录均为 `docs/screenshots/2026-10-24-*-goal-rerun/`。
- [ ] 以上是本地 fixture 交互验证，不代表真实供应商写入、部分/超量收货、发票匹配或财务对账。Demo 隔离门禁仍未通过；本轮没有线上业务写入，也未部署。

## 2026-10-24 AI 问法扩展：库存口语解析（当前源码）

- [x] 新增 9 条中英文库存口语：`stock of/for`、`how much stock`、`库存里有`、`有库存吗` 等，统一解析为商品名后执行只读 `report_stock`；避免把 `stock of` 当作商品名传给数据源。
- [x] 新增 3 条无商品名空库存问法：`Why can't I see anything?`、`Why can't I see anything in inventory?`、`Nothing appears in inventory`。统一返回 `qa`，要求用户提供商品名或条码，不猜测库存数量、不跳转写入流程。
- [x] 可执行问法目录扩展至 **357 条唯一用例**；中英文、正向查询与安全边界成对维护。
- [ ] 本轮 `pos-api` 修改尚未运行本地 Maven；必须先冻结候选 SHA，通过 Java 21 Dokploy `mvn -B clean verify`，再部署并按 runtime SHA 重跑线上矩阵。当前整体仍按 NO-GO 处理。

## 2026-10-23 采购/补货故障恢复与供应商状态文案

- [x] 修复补货页 RFQ 供应商读取失败时仍显示 “No suppliers available” 的误导文案；失败状态现在显示 “Supplier list unavailable”，与真正的空供应商列表区分。
- [x] Node 24 本地 Playwright fixture 在 320/390/768/1024/1440px 覆盖供应商读取失败重试、原数量保留、单供应商自动选择、RFQ 提交失败后的同载荷重试、覆盖周期刷新期间阻止提交及失败恢复：**80/80 PASS**。截图：`docs/screenshots/2026-10-23-replenishment-supplier-recovery-final/`。
- [x] 采购确认/收货延迟响应与失败恢复同样覆盖五个视口：**66/66 PASS**，包括 pending 时禁用重复操作、Escape 不能误关处理中对话框、失败保留已审数量、重试载荷一致和收货成功后的详情刷新反馈。截图：`docs/screenshots/2026-10-23-purchase-busy-recovery-node24-recheck/`。
- [x] `npm run test:unit` **19/19 PASS**、`npm run typecheck`、补货组件定向 ESLint、两份 UAT `node --check` 与目标 `git diff --check` 通过；未运行本地 build/Maven。
- [ ] 所有请求由本地 fixture 接管；不代表线上源码或真实 Odoo 业务验收。当前 Demo runtime `0e4a48ea` 与 dirty source 不匹配；真实部分/超量收货、供应商账单匹配和财务对账仍待隔离 UAT。

## 2026-10-23 库存与定价增量复验

- [x] 当前 Demo 前后端 runtime `/api/public/version` 同为 `0e4a48ead3e32c57623ed726e3583cee5945d0ca`；库存/定价四页 390/1440px 在线只读复验 **8 PASS / 2 BLOCKED / 0 FAIL**。无 JS 错误或横向溢出，被阻断业务写请求 0。两个阻断是 Capped Pricing 缺 Odoo price rules。版本证据：`docs/UAT_RELEASE_IDENTITY_2026-10-23_CURRENT-RUNTIME.json`。
- [ ] 线上截图仍显示 Stock List/Bulk Price Edit 的 R2 导入前缀；友好名称修复只在未部署的 dirty 候选 `e21a7943`。证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-23_RUNTIME-0E4A48EA-RECHECK.json`，截图：`docs/screenshots/2026-10-23-pricing-runtime-0e4a48ea-recheck/`。本地 fixture PASS 不代表线上已修复。
- [x] Stock List、Capped Pricing、Bulk Price Edit 五视口浏览器矩阵 **15/15 PASS**；三个页面都以原始 R2 导入名作为 fixture，断言显示为简洁名称且 title 保留原名。未编辑名称失焦不会触发 PATCH；员工明确改名时 PATCH body 仅含其输入值，五个视口均通过。证据：`docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-23_R2-NAME-ALL-PAGES.json`。
- [x] Price Suggestions 手机/桌面以原始 R2 商品名为 fixture，断言页面仅显示简洁名称且 title 保留 Odoo 原名；连同价税/毛利、人工确认和未知保存结果恢复共 **14/14 PASS**。证据：`docs/UAT_PRODUCTIZATION_UI_LOCAL_2026-10-23_R2-NAME-ALL-PAGES.json`。
- [x] 桌面 Stock List 四位小数价格完整可见；价格建议/手动确认/结果恢复 fixture **12/12 PASS**；库存与封顶定价保存失败提示、保留输入和重试恢复 PASS。
- [x] Node `v24.19.0` 下 `npm run test:unit` **19/19 PASS**、`npm run typecheck`、四个定向组件 ESLint、响应式 UAT 脚本 `node --check`、`git diff --check` PASS。本轮未运行 build/Maven。
- [ ] 证据均为本地 fixture，写请求没有进入 Odoo；线上 runtime/source 尚未匹配。真实价格写入及 POS 生效仍待隔离环境验收。证据：`docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-23_R2-NAME-ALL-PAGES.json`、`docs/UAT_PRODUCTIZATION_UI_LOCAL_2026-10-23_R2-NAME-ALL-PAGES.json`、`docs/UAT_STOCK_PRICING_SAVE_GUARD_LOCAL_2026-10-22_NAME-EDIT-RECHECK.json`。

## 本轮授权后快速复验（2026-10-23，上海时间）

- [x] Node 24 `npm run test:unit` **19/19 PASS**；`npm run typecheck`、变更前端文件定向 ESLint、119 个 UAT `.mjs` 的 `node --check` 均 PASS。未运行本地 build/Maven。
- [x] 当前源码本地 Playwright：POS 商品搜索 **7/7**、客户目录 **26/26**、客户分组 **22/22**、Overview **15/15 PASS**；覆盖响应式视口、搜索竞态/重试、角色权限、顶栏 AI 入口，真实业务写入 0。报告：`UAT_POS_PRODUCT_SEARCH_LOCAL_2026-10-24_CURRENT-RERUN.json`、`UAT_CUSTOMER_DIRECTORY_LOCAL_2026-10-24_CURRENT-RERUN.json`、`UAT_CUSTOMER_GROUPS_LOCAL_2026-10-24_CURRENT-RERUN.json`、`UAT_OVERVIEW_LAYOUT_LOCAL_2026-10-24_CURRENT-RERUN.json`。
- [x] Overview 异步竞态补测：延迟 24 小时请求晚于 7 天请求返回时，最新 7 天结果保持显示；3 个 GET 顺序均被观察到，无 API 写入。Node 24 本地 fixture PASS；证据：`UAT_OVERVIEW_RACE_LOCAL_2026-10-23.json`，截图：`docs/screenshots/2026-10-23-overview-race-local/overview-race.png`。
- [x] Demo 只读 AI availability **3/3**、AI 功能面 **14/14**、合成税务发票 OCR **9/9 字段存在**通过；该 runtime 是 `0e4a48ea`，不匹配当前 dirty HEAD `e21a7943`。合成 OCR 结果不等同真实供应商票据准确率。证据：`UAT_AI_AVAILABILITY_ONLINE_2026-10-24_CURRENT-ALLOW.json`、`UAT_AI_FEATURES_VERIFY_ONLINE_2026-10-24_CURRENT-ALLOW.json`、`UAT_AI_VALID_INVOICE_OCR_ONLINE_2026-10-24_CURRENT-ALLOW.json`。
- [ ] Demo 严格 AI 卡片合约 **0/9**，属于旧 runtime 与候选 SHA 不匹配下的部署观察；隔离写入门禁 **HTTP 409 / isolated=false**。本轮业务写入 0。证据：`UAT_AI_CARD_CONTRACT_ONLINE_2026-10-24_CURRENT-ALLOW.json`、`UAT_ISOLATION_WRITE_GATE_ONLINE_READONLY_2026-10-24_CURRENT-ALLOW.json`。
- [ ] 不得把 dirty 候选部署：先冻结包含 `pos-api` 的准确 SHA，跑同 SHA Dokploy Java 21 `mvn -B clean verify`，成功后再推送部署并核对前后端 runtime。销售/退款/GST/关班、收货/库存/定价真实写入只允许在隔离 attestation PASS 后执行。总体 **NO-GO**。

## 2026-10-23 当前线上即时复测

- [x] 本地 UI 复验发现并修复客户目录/客户分组少量结果时列表面板被撑满视口的问题；平板/手机改为内容高度和页面滚动。客户分组 AI 入口统一移到顶栏，Overview fixture 加强为验证入口真实位于 header。
- [x] 当前工作树 Node 24 浏览器 fixture：Overview **15/15**（320–1440px）、客户目录 **26/26**、客户分组 **22/22**（390/768/1024/1440px）；截图目视检查通过。模拟写请求由 fixture 截获，线上业务写入 0。证据：`docs/UAT_OVERVIEW_LAYOUT_LOCAL_2026-10-23_RECHECK2.json`、`docs/UAT_CUSTOMER_DIRECTORY_LOCAL_2026-10-23_RECHECK2.json`、`docs/UAT_CUSTOMER_GROUPS_LOCAL_2026-10-23_RECHECK2.json`。
- [x] Node 24 单测 **17/17**、typecheck、影响组件 ESLint、三项 UAT 脚本 `node --check`、`git diff --check` 通过；未运行 build/Maven。UI 当前源码尚未部署。

- [x] Demo runtime frontend/backend 均为 `0e4a48ead3e32c57623ed726e3583cee5945d0ca`；当前 HEAD `e21a794356594de3aed15805664dc0fcac482c5f` 且工作树 dirty，**不是同一版本**。证据：`docs/UAT_RELEASE_IDENTITY_2026-10-23_NOW.json`。
- [x] 线上只读：AI availability 3/3、feature surface 14/14、route matrix 9/9、report checks 23/23、高风险中英文问法 19/19、双语语音转写 4/4、合成税务发票 OCR preview 9/9 均 PASS；无 Odoo 业务写入。证据文件均以 `2026-10-23_NOW.json` 结尾。
- [x] 本地 Node 24 单测 17/17、TypeScript typecheck、目标 ESLint 均通过；未运行 build/Maven。
- [x] AI 卡片本地浏览器 fixture 最新 **35/35 PASS**；修正侍酒模拟响应的诊断意图后，35/35 标签断言正确，手机/桌面 CTA 与跳转正常。证据：`docs/UAT_AI_CARD_UI_LOCAL_2026-10-23_RECHECK-INTENT.json`；截图：`docs/screenshots/2026-10-23-ai-card-ui-intent-recheck/`。这是本地 fixture，不等于线上候选验收。
- [ ] 线上严格 AI 卡片合约 0/9、手机/桌面 UI CTA 检查 0/1：部署 runtime 缺少当前候选的结构化 CTA，侍酒卡 label 仍为旧式 generic CTA。它们是旧 runtime `0e4a48ea` 的观察；候选 UI 尚未部署验收。候选本地 35/35 fixture 不替代线上验收。
- [ ] Demo UAT context HTTP 409 / `isolated=false`，继续阻止业务写入；本轮无业务写入。需先证明专用 Odoo UAT database/stack 隔离。
- [ ] `pos-api` dirty 候选没有同一冻结 SHA 的 Java 21 `mvn -B clean verify` 日志；未推送、未部署。Pilot 保持 **NO-GO**。

## 最新线上与本地验收续跑

- [x] 当前 Demo `/api/public/version` 前后端均运行 `0e4a48ead3e32c57623ed726e3583cee5945d0ca`；当前源码 HEAD 为 `78e908ff94bc7bdae202f828a112f8aeb8eae0a8`，`origin/main` 仍为 `0e4a48ea`，分支领先 13 个提交且工作树有未提交改动。`78e908ff` 仅是测试记录的 Git HEAD，不代表包含 dirty 工作树的完整候选；线上证据不得视为当前源码已部署。
- [x] 匹配 runtime 的 Assistant API-only 问法 **323/323 PASS**、AI 功能面 **14/14 PASS**、销售/库存报表 **22/22 PASS**、有效合成税务发票 OCR 预览 **9/9 PASS**；以上为只读，无 Odoo 业务写入。证据见对应 `UAT_AI_*_RUNTIME-0E4A48E*.json`。
- [x] 当前 runtime 运营只读浏览器回归 **13/13 PASS**：390/1440px 盘点搜索防抖、补货模拟 GET 503 后 Retry 恢复真实 Odoo 读取、无 JS 错误/横向溢出；业务写入 0。证据：`docs/UAT_OPERATIONS_RUNTIME_ONLINE_2026-10-23_FINAL.json`。
- [x] Overview 当前源码 fixture **10/10 PASS**；客户目录 **13/13 PASS**、客户分组 **11/11 PASS**。新增延迟搜索测试确保旧客户/分组行在新查询和失败状态期间不可编辑；响应式与原有表单/CRUD/权限场景继续通过。API 写请求仅由 fixture 模拟，生产业务写入 0。证据：`docs/UAT_OVERVIEW_LAYOUT_LOCAL_2026-10-24.json`、`docs/UAT_CUSTOMER_DIRECTORY_LOCAL_2026-10-23_SEARCH-RACE.json`、`docs/UAT_CUSTOMER_GROUPS_LOCAL_2026-10-23_SEARCH-RACE.json`。
- [x] 截图目视发现并修复 Overview AI 浮钮遮挡指标卡/收银操作的问题，改用顶栏入口；扩展浏览器 fixture 后 **15/15 PASS**，覆盖 320/390/768/1024/1440px、打开/关闭对话框、趋势切换与无溢出。证据：`docs/UAT_OVERVIEW_LAYOUT_LOCAL_2026-10-23_AI-HEADER.json`；未产生业务写入。
- [x] Node 24 `tsc --noEmit`、客户页面定向 ESLint、现有单测 **4/4**、UAT 脚本 `node --check`、能力摘要 `--check` 和 `git diff --check` 通过；未运行本地 build。
- [x] 已对当前 Demo runtime `0e4a48ea` 重跑全站路由矩阵 **141 路由 × 390/1440px = 282/282 PASS**；HTTP 状态、page error 和横向溢出均通过，失败和 expected unavailable 均为 0。证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-23_RUNTIME-0E4A48E.json`。此结果不覆盖超前线上 4 个提交的本地候选改动。
- [ ] Overview、客户目录/分组及 AI 助手卡片修改未部署；HEAD `0e4a48ea` 的 Java 21 Dokploy exact-SHA `mvn -B clean verify` 完整日志仍待归档。不得把本地 fixture 结果记为线上验证。
- [ ] 真实供应商发票字段准确率、GST 有效商品销售/退款/关班完整对账、隔离采购收货与库存调整、第二租户跨租户授权、备份恢复仍未完成。Demo `/api/odoo/uat-context` 返回 409、`isolated=false`，不能在该环境继续业务写入；整体 **NO-GO**。

## 2026-10-23 AI assistant card verification

- [x] 本地 AI 卡片目的页浏览器矩阵 **35/35 PASS**：7 种卡片 × 320/390/768/1024/1440px，验证 CTA 延迟导航、目的页样例出现、安全拒绝外站链接、无横向溢出及无 page error；业务写入 0。证据：`docs/UAT_AI_ACTION_DESTINATIONS_LOCAL_2026-10-23_RECHECK2.json`；截图：`docs/screenshots/2026-10-23-ai-card-odoo-dest-local-recheck2/`。
- [x] Node 24 `npm run typecheck`、`npm run test:unit` **13/13 PASS**、受影响文件 ESLint、UAT 脚本 `node --check` 与 `git diff --check` 通过；未运行本地 build。
- [ ] 以上是本地 fixture 验收；Demo strict API 卡片合约仍为旧 runtime **0/9 PASS**，不能证明新候选已部署。仍需 exact-SHA Java 21 门禁、匹配 SHA 部署验收及隔离业务闭环。
- [x] Node 24 `npm run typecheck`、定向 ESLint、`npm run test:unit` **6/6 PASS**、AI 卡片 UAT `node --check` 通过；未运行本地 build。
- [x] Demo 只读 AI 卡片 API 合约最新严格检查 **0/9 PASS**，`writeRequests=[]`。当前 runtime 的 5 种既有卡片仅返回 legacy CTA 字段，没有新要求的 structured CTA；4 个 `guided_action` 卡片也不可见。较早的 legacy-only 断言为 5/9 PASS。证据：`docs/UAT_AI_CARD_CONTRACT_ONLINE_2026-10-23_HEAD-78E908F.json`、`docs/UAT_AI_CARD_CONTRACT_ONLINE_2026-10-23_CURRENT-TEST.json`。
- [ ] 当前卡片合约只验证类型、状态和 CTA 路由，没有验证价格建议的 Odoo 成本、GST 与毛利计算；定价数值准确性仍需隔离数据回归。
- [ ] 当前 Demo runtime `0e4a48ea` 与最新测试记录的 Git HEAD `78e908ff` 不匹配，且被测工作树含未提交变更；失败不能归因到当前候选代码。须先冻结候选、完成同一候选 SHA 的 Java 21 `mvn -B clean verify`，再部署并按 runtime SHA 匹配后复测。
- [ ] 浏览器 UI 的 AI Action guide 卡片线上回归 0/1：旧 runtime 未显示该新卡片，等待超时；证据 `docs/UAT_AI_UI_ONLINE_2026-10-23_GOAL-CURRENT.json`。本轮无销售、库存、采购、退款或关班写入；真实业务闭环仍未完成。

## 2026-10-23 Price suggestion tax and recovery verification

- [x] 提取可测试的简单税额拆分纯函数；含税/未税、GST 五分货架价向上取整、叠加百分比税、毛利下限和复杂税拒绝均由单测覆盖。完整 Node 24 unit suite **17/17 PASS**；`typecheck`、目标 ESLint 和脚本语法通过。
- [x] API route handler + in-memory Odoo transport **31/31 PASS**：税价计算及复杂税 fail-closed、权限/公司隔离、分页/陈旧价格拒绝、收银 pending 防重、采购收货恢复与盘点位置/并发保护；无线上 Odoo 请求。证据：`docs/UAT_PRODUCTIZATION_LOCAL_2026-10-23_RECHECK.json`。
- [x] 价格建议到人工确认/回读恢复 fixture **12/12 PASS**，覆盖 390/1440px、提示税价口径、确认前不写、回读确认和未知结果防重放/保留输入。修复手机端 bulk edit SKU 搜索框被操作按钮挤窄，并加入最小可用宽度断言。模拟写请求由 fixture 截获，真实业务写入 0。证据：`docs/UAT_PRICE_SUGGESTIONS_PRODUCTIZATION_LOCAL_2026-10-23_RECHECK4.json`；截图：`docs/screenshots/2026-10-23-price-suggestions-productization-recheck4/`。
- [ ] 纯函数和 UI fixture 不能替代 Odoo 税组/位置税的端到端价税对账，也未在真实 Odoo 保存价格；需隔离 UAT 数据验收。未运行本地 build。

## 2026-10-24 Demo AI + Customer 验收

- [x] Demo 前后端 runtime 同为 `bcbf3d4c178973558ab801fb343bce6aec3789d3`。已部署 AI surface matrix **14 PASS / 0 BLOCKED / 1 FAIL**；唯一失败为发票 OCR preview `50213 provider/model configuration failure`。证据：`docs/UAT_AI_FEATURES_VERIFY_ONLINE_2026-10-24_DEPLOYED-BCBF3D4.json`。
- [x] 已部署 runtime 的 Assistant API-only 目录 **321 PASS / 0 FAIL / 1 BLOCKED（322 条）**；唯一阻断 `asdfghjkl` 的 HTTP 502 在单例重测中 **1/1 PASS**。发票上传中文/英文与安全边界用例通过；`writeRequests=[]`，无 Odoo 业务写入。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_DEPLOYED-BCBF3D4.json`、`docs/UAT_AI_UNKNOWN_GIBBERISH_ONLINE_2026-10-24_DEPLOYED-BCBF3D4.json`。
- [x] 客户目录/分组当前源码 fixture **10/10 + 9/9 PASS**；写请求全部由 fixture 截获，生产写入 0。Node 24 typecheck、目标 ESLint、既有单测 4/4 和脚本语法通过。
- [ ] AI OCR 的线上环境变量未能从会话读取。本地 `.env` 有 `AI_VISION_MODEL=qwen-vl-plus` 对 `AI_DASHSCOPE_MODEL=qwen3.8-flash` 的独立覆盖；直接 provider 健康探针本机网络 `ECONNRESET`，不能替代 Dokploy 服务端验证。需确认视觉模型在当前 Key/地域可用，重部署配置后重测。真实 OCR 字段准确率、真实 Odoo 业务写入闭环未验收；整体仍 NO-GO。

## 2026-10-24 Customer Odoo 页面验证续跑

- [x] 客户目录 fixture **10/10 PASS**；客户分组 fixture **9/9 PASS**，均在 Node `v24.19.0` 的隔离 Next.js Webpack dev server 运行，覆盖 390/1440px、客户新建失败重试、分组管理员 CRUD 与员工只读。
- [x] 两套 fixture 的 API 写请求共 10 个，全部由浏览器拦截并在内存模拟；生产业务写入为 0。手工抽查手机截图无横向溢出或控件重叠。
- [x] `tsc --noEmit`、目标 ESLint、既有单测 **4/4**、两份脚本 `node --check`、目标 `git diff --check` 通过。
- [ ] 未运行生产 build / Docker build；未对真实 Odoo 执行客户或分组读写。线上 runtime SHA 未核验，真实业务验收未完成。
- 证据：`docs/UAT_CUSTOMER_DIRECTORY_LOCAL_2026-10-24_NODE24.json`、`docs/UAT_CUSTOMER_GROUPS_LOCAL_2026-10-24_NODE24.json`；截图：`docs/screenshots/2026-10-24-customer-directory-node24/`、`docs/screenshots/2026-10-24-customer-groups-node24/`。

## 2026-10-23 AI 在线复验与候选门禁

- [x] Demo runtime `9e61de5d` 上 320 条 Assistant API-only 问法：**316 PASS / 0 BLOCKED / 4 FAIL**，运行时 SHA 与测试 source SHA 匹配；原始证据 `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_CURRENT-9E61DE.json`。
- [x] 当前口径 4 条焦点复验：**2 PASS / 0 BLOCKED / 2 FAIL**。英文发票上传两种表达均走 `guided_action` 到 `/invoices/scan`，已按只开预览页的安全行为分类；仍失败的是价格复核问法意图类型和批量改价入口路由。焦点证据 `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_FOCUS-CURRENT-9E61DE.json`。
- [x] AI 功能只读面：**14 PASS / 0 BLOCKED / 1 FAIL**；发票 OCR preview 返回 `50213` provider/model configuration failure，其他列出的功能与保护检查通过。证据 `UAT_AI_FEATURES_VERIFY_ONLINE_2026-10-23_CURRENT-9E61DE.json`。
- [ ] `main` / `origin/main` 当前均为 `fbcea34e`，含已提交的价格查询修复；工作区另有未提交中文发票上传规则和 322 条问法用例。Demo 仍运行 `9e61de5d`。Java 21 exact-SHA `mvn -B clean verify` 未运行；`pos-api/Dockerfile` 的 `mvn -B clean package -DskipTests` 不执行测试。
- [ ] 待固定候选 SHA 并通过 Java 21 门禁、部署后，重跑完整 322 条并确认中文上传边界。线上助手 UAT 业务写入为 0；真实 Odoo 交易闭环仍须隔离环境验收。

## 2026-10-23 Customer Odoo 页面验证

- [x] 客户目录：移动端/桌面 Playwright fixture **10/10 PASS**；创建失败保留输入可重试，成功请求提交客户组和价目表字段。所有写请求被 fixture 截获，线上业务写入为 0。
- [x] 客户组：管理员列表及新建/改名/删除、员工只读入口、390px/1440px 无横向溢出：**9/9 PASS**。所有 CRUD 请求被 fixture 截获，线上业务写入为 0。
- [x] `npm run typecheck`、目标 ESLint、两份 UAT 脚本语法、目标文件 diff check 通过；截图已复核。
- [ ] 真实 Odoo 读写尚未验收；UAT 测试源为 `d62b596e`，之后 HEAD 前进至 `110f5852`（Close Register 模态尺寸调整）；Demo runtime `b4719e7c` 与当前 source 不匹配。Java 21 exact-SHA 后端门禁及部署后线上复验未完成。
- [ ] 未运行单测、生产 build/Docker build；本机 Node 22.22.2，项目要求 Node 24+。
- 证据：`docs/UAT_CUSTOMER_DIRECTORY_LOCAL_2026-10-23_CURRENT.json`、`docs/UAT_CUSTOMER_GROUPS_LOCAL_2026-10-23_CURRENT.json`。

## 2026-10-23 AI 用户问法回归续迭代

- [x] 复核最新保存的 310 条 Assistant API-only Demo 结果：266 PASS / 36 BLOCKED / 8 FAIL；BLOCKED 均为 50210，0 业务写入。线上 `b4719e7c` 与 source `8a4c56e5` 不匹配，结果用于归类旧服务问题。
- [x] 扩展候选规则/回归用例：价格动作有定价复核 route；发票是否到货走只读问数；口语商品计数走 `product_count`；till 关闭步骤走 `qa` 且不导航。目录增加 10 条中英文变体及正反例，共 320 条。
- [ ] 尚未执行 Java 测试或 Java 21 `mvn -B clean verify`；不得把静态契约标记为通过。需同 SHA 门禁后匹配部署，再跑完整 320 条 UAT；整体仍 NO-GO。

## 2026-10-23 Demo 库存与定价只读复验

- [x] Demo 前后端 runtime 同为 `b4719e7c51c2ffebdcd8b0916e7186480c55201d`；与本地源码不同。UAT 执行时 source HEAD 为 `c7452e93fc95dfbd79e5d7266e8473debafd0079`，工作树有未提交改动。
- [x] Stock List、Capped Pricing、Bulk Price Edit、Price Suggestions：390/1440px 共 **8 PASS / 0 FAIL / 2 BLOCKED**；阻断是 Demo 未配置 Odoo price rules。浏览器写请求拦截器记录 0 次业务写入。证据：`UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-23_SOURCE-C7452E9.json`。
- [x] 抽查截图无横向溢出；旧筛选文案、R2 测试商品标记及重复定价导航属于旧 runtime 观察，等待候选 SHA 部署后复验。
- [x] 前端 typecheck、定向 ESLint、单元测试 4/4 通过；未运行 build。POS session 现金余额字段类型已补齐。
- [ ] 本地 Java 8，后端候选 Java 21 exact-SHA `mvn -B clean verify` 未执行；含 `pos-api` 改动，不得推送或部署。价格写入和交易闭环需隔离 Odoo 环境验收。

## 2026-10-22 AI 全量在线续验（最新）

- [x] 304 条助手问法只读回归：**265 PASS / 33 BLOCKED / 6 FAIL**；runtime `b4719e7c` 与 dirty source `d7ae6395` 不匹配。33 个 BLOCKED 为 `50210`，6 个旧 runtime 路由差异为 3 个调价确认 route 缺失及 3 个发票到货口语误开扫描页。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_20261022T151353424Z_d7ae6395.json`。
- [x] Availability 3/3、route 9/9、surface/auth 11/11、UI 2/2、transcription 4/4、metrics 9/9、capability/enabled gates PASS。Features 14 PASS / 1 FAIL（OCR probe HTTP 500/50000）；Reports 15/16（实时库存 unavailable）；History/platform 9 PASS / 2 BLOCKED；stock RPC 4 PASS / 5 BLOCKED / 1 INFO。
- [x] 本地发票预览 mock 6/6 PASS，Node 24 TypeScript 检查通过；这不等于真实 OCR 验收。未执行本地 build/Maven，后端 exact-SHA Java 21 门禁和匹配 runtime 复验待完成，整体 NO-GO。

## 2026-10-22 当前候选跨模块 UI 回归包

- [x] HEAD `8a4c56e51e40317bd16183ee8ebb7148e9841082` 的当前工作树本地 Playwright fixture：**99/99 PASS / 0 FAIL / 0 BLOCKED**，覆盖库存/定价响应式、价格建议未知结果恢复、报表 503/401、盘点边界、平台审计与故障重试、采购确认/收货恢复、发票 OCR 预览。
- [x] 业务数据库写入为 0；完整套件和逐项证据：`docs/UAT_LOCAL_UI_REGRESSION_PACK_2026-10-22_CURRENT-GOAL.json`。
- [x] 人工抽查 4 张手机/桌面截图，未见重叠或横向溢出；本批截图：`docs/screenshots/2026-10-22-goal-stock-8a4c56e/`、`docs/screenshots/2026-10-22-goal-productization-8a4c56e/`、`docs/screenshots/2026-10-22-goal-purchase-busy-8a4c56e/`。
- [x] Stock List 遗留 Classic 筛选文案已替换为 Odoo 商品搜索/分类术语；响应式 UAT 在五个视口验证 `stockOnly=true` 查询及准确文案，`15/15 PASS`。证据：`docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-22_SHA-8A4C56E.json`。
- [ ] Node `22.22.2` 运行的是本地 webpack dev server（项目声明 Node 24+），不是 production build。真实 Odoo/DashScope 验收未覆盖。
- [ ] 在线 runtime `b4719e7c` 与当前 dirty worktree（HEAD `8a4c56e5`）不匹配；pos-api Java 21 exact-SHA 门禁尚未完成，暂不能部署此候选。

## 2026-10-22 发票 OCR Odoo-safe 预览修复（当前）

- [x] OCR 前端从退役的 Classic `/api/orders/receives/scan` 切换到管理员专用 `/api/ai/invoice/preview`；不匹配或写入供应商、商品、采购、收货和库存记录。
- [x] 本地 Playwright mock 6 项 PASS，覆盖能力探测重试、OCR 重试、字段和图片预览、商品行编辑、采购引导链接；业务写入 0。证据：`docs/UAT_INVOICE_SCAN_MOCK_LOCAL_2026-10-22.json`。
- [x] UI typecheck、目标 ESLint、3 个 OCR 脚本语法检查、`git diff --check` 通过。
- [ ] Java 21 `mvn -B clean verify` 尚未在同一候选 SHA 运行（本机只有 Java 8）；真实在线模型调用、部署 runtime SHA 和真实发票字段精度仍待验收。整体 NO-GO。

## 2026-10-23 Customer 五级 Odoo 面

- [x] 生产导航：Customers / Customer Groups / Price Lists / Balances / Gift Cards（Odoo）。
- [x] `/customers/odoo` 加深：价目表、分组、应收、地址/ABN/类型。
- [x] `/customer-groups` → `res.partner.category`；`/pricelists` → `product.pricelist`；`/customers/balances` → credit + open invoices。
- [x] `/giftcards` 模块探测；未安装 Loyalty/Gift Card 时诚实未就绪（不回落 Classic）。
- [ ] 线上只读 UAT + 部署 runtime SHA 核对；Gift Cards 需在 Odoo 安装模块后才能列卡。

## 2026-10-22 AI 聊天摘要 + CTA / 可读性（源码）

- [x] 补货 / 调价 / 侍酒：聊天 Top‑3 摘要 + 底栏 CTA；不自动跳页、不写入。能力卡 [`AI_QA_CAPABILITY_CARD.html`](AI_QA_CAPABILITY_CARD.html)。
- [x] 可读性：`whitespace-pre-wrap`、清洗 `[R2-…]`/`R2 TEST |`、价格 `$X.XX`（约 `2d3c96a8`）；Java 21 `mvn -B clean verify` 已通过。
- [ ] Demo 部署后抽检三条问法（补货 / 调价 / 红酒推荐）答案形态与 CTA；未核验 runtime SHA 前不记为线上通过。

## 2026-10-22 最新 AI 回归摘要

- [x] Demo AI 只读回归：247 条自然问法 `247/247 PASS`；availability 3/3、route 9/9、surface/auth 11/11、metrics 9/9、AI UI 2/2。
- [ ] Features `14 PASS / 1 BLOCKED`（旧 OCR `41001`）；Reports `15/16`（实时库存源不可用但安全提示正确）；History/platform `9 PASS / 2 BLOCKED`；transcription `2 PASS / 2 BLOCKED`。
- [x] 本轮无销售、采购、收货、库存、调价、退款或关班写入。证据：`docs/UAT_*_2026-10-22_POST-ROUTE.json`。
- [ ] Demo runtime `582b92fb` 未与当前 source/HEAD 绑定，不能作为最新候选部署验收；整体仍 NO-GO。

## 2026-10-22 报表与 Odoo 空态 UI 批次（本地待部署）

- [x] Odoo 报表临时 `503` 与未连接 `401` 分支：`2/2 PASS`；503 保留 Retry/Request ID，401 显示连接引导，390px 无横向溢出。
- [x] 产品目录、补货和报表的移动错误/空态按钮补齐键盘焦点样式。
- [x] 商品编辑/导入/新建和补货 RFQ 弹窗的主要操作控件补齐键盘焦点状态；typecheck、定向 ESLint 和 `git diff --check` 通过。
- [x] 补货 `503` 只读可恢复错误、供应商重试、数量保持和 RFQ 提交失败重试：`60/60 PASS`，无非预期业务写入。
- [x] Platform Audit/Failures fixture：`4/4 PASS`（390/1440px），重试恢复、无页面错误、无业务写入。
- [ ] 待与下一批前端改动合并后部署 Dokploy，再执行 Demo 线上报表 503/401 语义和平台路由复验。
- 证据：`docs/UAT_REPORTING_ERROR_LOCAL_2026-10-22_UI-BATCH.json`、`docs/UAT_PLATFORM_AUDIT_FAILURES_LOCAL_2026-10-22_UI-BATCH.json`。
- 证据追加：`docs/UAT_REPLENISHMENT_SUPPLIER_RECOVERY_2026-10-22_UI-BATCH.json`。
- [ ] 候选 `1cd417c3` 已推送，但 webhook 返回 `301 Branch Not Match`；版本端点仍是 `582b92fb`，尚未取得候选 runtime 身份。

## 2026-10-22 交互 UAT 最终分类（线上 e0a867b runtime）

- [x] 交互只读回归：`10 PASS / 0 FAIL / 4 BLOCKED`，证据：`docs/UAT_INTERACTION_2026-10-22_RUNTIME-E0A867B-BLOCKED-DATA-FINAL.json`。
- [x] 导航、账户菜单、设置侧栏、分类弹窗焦点、商品/客户表单保护、CSV 预览、报表周期和旧报表边界通过；业务写入 `0`。
- [ ] 商品搜索/编辑、销售退款收据、补货覆盖计算待在有 Odoo 商品与销售夹具的隔离环境复验；当前 Demo 空数据只记为 BLOCKED。
- [x] 用户确认 Dokploy 最新部署成功；当前可归属运行 SHA 为前后端 `e0a867b0387c7760c1dfc1bea9a5c374debb0930`。本地新增 UAT 分类脚本和文档尚未部署。

### 2026-10-24 公网只读全站续验

- [x] 定价四页双视口：`8/8 PASS`，业务写入 `0`。
- [x] 全站页面矩阵：`272/276 PASS`；4 个失败均为未部署 Platform Audit/Failures 的 404。
- [x] 交互：`14/14 PASS`。
- [x] 设置：`28/28 PASS`，390/1440 无横向溢出。
- [x] 表格与可访问性：`14/14 PASS`，`unexpectedWrites=0`。
- [x] Sommelier 只读：`10/10 PASS`。
- [x] 运营只读：`3/3 PASS`，未执行业务写入。
- [ ] AI features：`13 PASS / 1 BLOCKED`，价格建议上游 502；OCR 探针仅 INFO。
- [ ] AI 报表：`15/16`，实时库存数据源不可用。
- [x] Odoo 价格建议/报表代理错误响应保留关联 ID：本地 `2/2 PASS`，无业务写入。
- [x] 价格建议/报表错误界面显示 Request ID：本地 fixture `5/5 PASS`，页面错误 `0`。
- [ ] Platform Audit/Failures：390/1440 均 `404`，等待同候选前端与后端门禁后部署。
- [ ] 以上公网结果的 runtime SHA 仍未由版本端点确认。

### 2026-10-21 门店端续验

- [x] 采购 AI 入口布局：本地 `3/3 PASS`，无收货按钮遮挡；`UAT_PURCHASE_AI_PLACEMENT_LOCAL_2026-10-21_CURRENT.json`。
- [x] 补货供应商恢复：本地 `60/60 PASS`；`UAT_REPLENISHMENT_SUPPLIER_RECOVERY_LOCAL_2026-10-21_CURRENT.json`。
- [x] 盘点搜索竞态：本地 `39/39 PASS`；`UAT_STOCKTAKE_SEARCH_RACE_LOCAL_2026-10-21_CURRENT.json`。
- [ ] Dokploy 页面状态为成功，但 runtime SHA 尚未核验；本地 fixture 通过不等同于线上发布验收。

## 2026-10-21 `dfe74b0` AI 与只读 UAT 工具扩展

- 已推送 12 个 UAT 脚本改进，覆盖 AI availability、能力门禁、features、reports、route matrix、182 条问法、目录、交互、OCR、隔离写入、设置和表格可访问性。
- Node 24 `node --check` **12/12 PASS**，staged diff check 通过；此提交不改变应用运行代码，也没有业务写入。
- 线上结果仍需等 Dokploy 修正 `Branch Not Match` 后，使用当前脚本重新绑定新 runtime SHA。## 2026-10-21 `5f3976a` replenishment metadata追踪补齐

补货建议路由遗漏的商品与公司元数据 RPC 已补齐 correlation ID 传递。`pos-ui npm run typecheck` 通过；提交只涉及前端，未执行真实补货或 RFQ 写入。Dokploy Source/Git 分支阻塞仍待修正。## 2026-10-21 `6812e40` replenishment 关联追踪

补货建议路由的 Odoo session、销量和商品 RPC 已纳入 correlation ID 传播。`pos-ui` 类型检查此前已通过；提交只涉及前端，未执行真实补货/RFQ写入。Dokploy 分支绑定仍阻止线上构建。## 2026-10-21 `b37e6b3` Price Suggestions 关联追踪

- Price Suggestions 路由的 Odoo session、商品、销售、税务和税额计算 RPC 现在统一传递 correlation ID。
- `pos-ui npm run typecheck` 通过；未运行 build、未执行真实价格写入。
- 已推送 `b37e6b3`，但 Dokploy Source/Git 的 `Branch Not Match` 仍阻止线上构建，需控制台修正后再验收价格建议上游 502 是否改善。## 2026-10-21 `94f5ed7` 验收工具与运营只读复验

- 已推送 `94f5ed74a18810fb7c7f684068d8f99345801a23`，新增并固化租户审计、版本身份、产品化路由、AI stock RPC、ASR 和运营只读 UAT 工具；8/8 脚本语法通过。
- Demo 运营只读脚本首轮登录返回 404，重试后 Odoo session、盘点搜索、补货读取与故障恢复 **13/13 PASS**，业务写入 0。证据：`UAT_OPERATIONS_RUNTIME_ONLINE_94F5ED7_RETRY.json`；首轮失败 `UAT_OPERATIONS_RUNTIME_ONLINE_94F5ED7.json` 保留。
- 该提交仅为测试工具，不改变应用代码；Dokploy `Branch Not Match` 仍未解决，线上结果不绑定该 SHA。## 2026-10-21 `43ade21` Odoo RPC 关联追踪批次

- 已推送 `43ade2183378b2ea84cb166d2c021c33cb1f9737`，仅修改前端报价、POS bootstrap、采购列表、销售详情和现金操作路由；将请求关联 ID 传递到 Odoo RPC，便于定位超时和网关错误。
- Node 24 `tsc --noEmit`、产品化路由 `31/31 PASS`、脚本语法检查和 staged diff check 通过；未运行本地 build，未执行真实业务写入。
- Dokploy Source/Git 仍为 `Branch Not Match` 阻塞；本批尚未取得线上构建或 runtime 身份，公网旧版本结果不归因于本批。## 2026-10-21 `19b1293` 前端可靠性批次

- 已推送 `19b1293566a54f0a18c538eb3652242a957fde41`，仅包含 `pos-ui` 与本地 UAT 脚本；没有 `pos-api` 文件。
- 主要内容：结账 5xx 后按 `orderUuid` 只读恢复并防止重复收款；采购确认/收货的 busy、失败保留、已提交未知结果保护；Odoo API 错误带 correlation ID；平台 Operations 页面和租户/公司边界；盘点与目录请求恢复。
- 本地验证：`tsc --noEmit`、前端定向 ESLint、产品化路由 `31/31`、产品化 UI `12/12`、采购确认/收货 `40/40`、盘点搜索竞态 `39/39`、补货供应商恢复 `60/60`，均无真实 Odoo 写入。
- Dokploy webhook 仍返回 `301 Branch Not Match`；版本端点构建时间仍为上一批，说明 `19b1293` 尚未部署。定价线上复验重试为 `8/8 PASS`，只能代表当前公网旧 runtime 行为。
- 后端 Java 21 门禁、真实 Odoo 交易闭环和 Dokploy Source/Git 修正仍未完成。## 2026-10-21 `83a6044` 前端版本端点复核

- 纯前端候选 `83a6044f8770f8ba67b8dec7deff67dee17fe2aa` 已推送远端；公网 `/api/public/version` 已返回 200，前端服务和构建时间可读。
- Dokploy 未注入 `SOURCE_COMMIT`，所以前端 commit 仍为空；后端版本服务也未返回。该结果只证明前端版本端点上线，不证明完整双服务 runtime SHA。
- webhook 仍返回 `301 Branch Not Match`，需修正 Dokploy Source/Git 分支绑定；后端候选仍须 Java 21 `mvn -B clean verify`。# Orithos 功能清单与验证状态

## 2026-10-21 Dokploy 成功后线上复验更新

- 定价页双视口 **8/8 PASS**：`UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19.json`；手机卡片、搜索宽度、Header AI 单入口均通过，业务写入 0。
- 全站矩阵 **272/272 PASS**（136 路由 × 390/1440）：`UAT_ALL_STATIC_PAGES_AFTER_DEPLOY_2026-10-21_HONEST.json`；`/platform/operations` 的两个租户域名 404 已明确标记为预期隔离，不计为失败。
- AI 功能只读 **13 PASS / 1 BLOCKED / 0 FAIL**：`UAT_AI_FEATURES_VERIFY_AFTER_DEPLOY_2026-10-21.json`；唯一阻断为价格建议上游 502，页面和 Retry 入口可用。
- 以上是公网行为证据；`/api/public/version` 仍无法提供前后端 runtime SHA，不能据此证明候选源码已被 Dokploy 构建运行。真实 Odoo 写入和后端 Java 21 门禁仍未完成。

## 2026-10-21 盘点/采购/补货批次已推送（最新）

`f7a7288fe295ce82f27a5fdbb9e88da32e937e37`已推送main并核对远端；3个前端文件，不含任何后端工作树改动。发布范围与Git blob见 `RELEASE_OPERATIONS_UI_BATCH_2026-10-21.json`。

- 盘点搜索39/39、计数边界20/20、五视口5/5，已纳入本批。
- 采购/收货34/34：busy Escape和关闭保护、数量锁定、失败编辑保留/同负载重试、成功提示及详情读取失败后的恢复。
- 补货综合60/60：供应商原地重试保留数量、RFQ失败重试、首次503恢复、覆盖天数更新/失败后禁用旧建议、更新状态。320/390/1024/1440px均覆盖。
- 上述158项为本地fixture验证，无真实Odoo业务写入；Node24 TypeScript/三个前端ESLint/五脚本语法通过，无本地build。本批线上生效及真实隔离业务闭环待验；整体仍NO-GO。
- 用户要求的 `../docs/功能说明.html` 与交接已同步。已推送不等于Dokploy构建成功或runtime SHA验证。

## 2026-10-21 续验最新结果：库存定价8/8，盘点搜索已本地修复

- Demo四个库存定价页面×390/1440px **8/8 PASS**，新手机卡片、宽搜索与顶部AI均已观察到；证据 `UAT_UI_BATCH_DEMO_RUNTIME_RECHECK_2026-10-21_1897D8B.json`。替代较早4/8作为当前页面行为基线，运行SHA仍未核验。
- Demo盘点只读 **12/12 PASS**，但wine搜索为空；没有明确库存位置绑定，唯一仓库回退且写入关闭，未验证真实添加或库存调整。证据 `UAT_STOCKTAKE_DEMO_RUNTIME_BASELINE_2026-10-21_1897D8B.json`。
- Demo目录/AI助手 **44/44 PASS**，320/390/1024/1440px三类目录深链、空状态/清空恢复、顶部AI五条快捷问句和焦点/Escape恢复通过；无模型提交/业务写入/JS错误。证据 `UAT_DIRECTORIES_ASSISTANT_DEMO_2026-10-21_1897D8B_CORRECTED.json`；首轮脚本文案/只读POST拦截及加载时序问题已纠正，不作为产品失败计数。
- 新修复的盘点搜索防抖旧结果/旧错误及busy/expanded问题：有效修复前18 PASS / 15 FAIL；修复后扩展矩阵 **39/39 PASS**。等待Enter、晚响应、快速改回原词和草稿保留均覆盖。证据 `UAT_STOCKTAKE_SEARCH_RACE_LOCAL_2026-10-21_FULL.json`；仅fixture，尚未发布。
- 原盘点数据保护 **20/20**、五视口 **5/5** 继续通过，证据文件后缀 `SEARCH_REGRESSION`。Node24 TypeScript/目标ESLint/脚本语法通过，无本地build。
- 进展同步到父工作区 `../docs/功能说明.html` 与本仓库交接；HTML 390/1440px无页面错误/溢出，锚点和证据链接有效。新修复待合批发布，后端候选/真实业务闭环门禁保持未完成。

## 2026-10-21 当前发布/线上验收状态（覆盖下方历史批次状态）

前端 `1897d8b2f65946ddedef63f1dbe7437548851ca5` 已推送main；用户报告Dokploy成功，部署/运行SHA未核验。完整功能、测试和未完成事项见 `HANDOFF_2026-10-19_CURRENT.md` 顶部及 `RELEASE_UI_BATCH_2026-10-21.md`。

- 已发布代码范围：库存/定价响应式、目录深链与路由、盘点数据保护、Vendor Connections平板布局、AI入口/快捷问句/焦点/语音恢复。后端工作树不在本批。
- 本地fixture通过：库存定价15/15、价格建议30/30、目录深链及空状态各15/15、盘点5/5及边界20/20、库存保存8/8、批量保存三视口各8/8、AI能力10/10及焦点5/5、连接5/5。Node24静态检查通过，无本地build。
- 最新Demo只读矩阵 **4/8 PASS**：桌面四项通过，手机四项仍呈现旧布局而失败；HTTP均200，JS错误0，业务写入0。证据 `UAT_UI_BATCH_DEMO_RUNTIME_BASELINE_2026-10-21_1897D8B.json`。先核对构建/运行SHA与域名目标，再判断代码回归。
- 尚未完成：本批新布局线上生效确认、目录/盘点/AI线上交互复验、真实Odoo业务闭环、真实设备语音及后端Java21同候选SHA远程验证。fixture通过不等于业务放行，整体仍NO-GO。

更新时间：2026-10-23

## 2026-10-21 盘点数据保护与平板布局补强

- 浏览器复现：390/1024px 均可通过扫码添加第 41 项，且 Clear count 会直接丢弃已录入数量。有效修复前证据：`docs/UAT_STOCKTAKE_COUNT_BOUNDARIES_LOCAL_2026-10-21_BEFORE_SYNCED.json`（10 PASS / 4 FAIL）。现将 40 项上限放在所有添加入口共用的函数内，显示上限说明，并为清空增加确认与取消。
- 修复后边界专项 `20/20 PASS`：40 项扫码上限、上限提示、清空取消保留、确认清空无 API 写入、提交 busy 禁止重复确认、503 后保留数量、取消后重试负载一致、成功后清空草稿均通过。证据：`docs/UAT_STOCKTAKE_COUNT_BOUNDARIES_LOCAL_2026-10-21_AFTER.json`。
- 盘点行在 1280px 以下改为卡片，解决侧栏占宽后平板表格差异/删除列不可见的问题；320/390/768/1024/1440px fixture `5/5 PASS`，新增检查表格容器内部横向滚动。位置读取失败恢复、数量上限、取消保护、写入关闭门禁与顶部 AI 入口继续通过；页面错误为 0。证据：`docs/UAT_ODOO_STOCKTAKE_LOCAL_2026-10-21_FIVE-VIEWPORTS.json`；截图：`docs/screenshots/2026-10-21-stocktake-five-viewports/`。
- 本轮使用 Node `24.19.0`，TypeScript、目标 ESLint、两个脚本语法与 diff 格式检查通过；没有本地 build。全部 API 由 Playwright 拦截，真实 Odoo 调整与部署验证仍待完成；当前工作树尚未推送/部署。

## 2026-10-21 保存失败恢复与盘点移动端复验

- Stock List / Capped Pricing 的模拟 `PATCH 503`、重复失焦保护、保留编辑值及重试共 `8/8 PASS`；Bulk Price Edit 的失败提示、回滚与重试共 `7/7 PASS`。所有价格写请求均由 Playwright 拦截，未写入 Odoo。证据：`docs/UAT_STOCK_PRICING_SAVE_GUARD_LOCAL_2026-10-21_CONTINUATION_RETRY.json`、`docs/UAT_BULK_PRICE_EDIT_SAVE_GUARD_LOCAL_2026-10-21_CONTINUATION.json`。库存脚本首轮因响应式页面存在两个同名输入而定位失败，已改为只定位可见输入；首轮失败证据由重跑结果取代。
- Odoo Stocktake 在 390/768/1440px 的本地 fixture `3/3 PASS`：位置读取失败重试、超大数量禁用、取消不写入、确认负载、只读门禁、页面错误和横向溢出均检查通过。模拟确认请求 2 次，全部由 Playwright 拦截。390px 截图发现浮动 AI 按钮遮挡盘点行操作，现改为顶部 AI 单入口；三视口均验证顶部入口可开关、浮动入口隐藏。证据：`docs/UAT_ODOO_STOCKTAKE_LOCAL_2026-10-21_AI-PLACEMENT.json`；截图：`docs/screenshots/2026-10-21-stocktake-ai-placement/`。
- 本轮 Playwright 与 TypeScript 检查由当前 shell 的 Node `22.22.2` 执行；`npm run typecheck`、目标 ESLint、脚本 `node --check` 和 `git diff --check` 通过。项目声明 Node 24+，发布环境仍需按该版本验证。这些结果仅证明本地交互与请求负载；真实 Odoo 库存调整、Demo 布局及运行 SHA 仍需部署后在批准的隔离环境验证。未运行本地 build。

## 2026-10-21 平板视口响应式补强

- 新增 768/1024px 断点复验发现：库存与定价页在侧栏占宽后仍显示宽表格，部分关键列需要横向滚动。Stock List、Capped Pricing、Bulk Price Edit 行布局断点统一调整至 1280px；窄于该宽度使用字段卡片，桌面保持表格。
- 本地 Next dev fixture UAT：库存定价 3 页 × 320/390/768/1024/1440 共 `15/15 PASS`；Price Suggestions `30/30 PASS`；商品/客户/供应商目录深链和空状态各 `15/15 PASS`，新增/编辑表单 `15/15 PASS`。无页面错误、视口溢出或 fixture 业务写入。
- 截图抽查：768px Capped Pricing 卡片字段完整；1024px Bulk Price Edit 搜索/筛选/数量档输入均在视口内。证据：`docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-21_FULL-MATRIX-RETRY.json`、`docs/UAT_PRICE_SUGGESTIONS_RESPONSIVE_LOCAL_2026-10-21.json`、`docs/UAT_AI_ENTITY_DIRECTORIES_RESPONSIVE_LOCAL_2026-10-21.json`；截图目录：`docs/screenshots/2026-10-21-stock-pricing-full-matrix-retry/`、`docs/screenshots/2026-10-21-price-suggestions-full-matrix/`、`docs/screenshots/2026-10-21-entity-directories-full-matrix/`。
- Node `24.19.0` 下 `npm run typecheck`、3 个定价组件 ESLint、3 个 UAT 脚本 `node --check` 和 `git diff --check` 通过；未运行本地 build。所有请求由 fixture 拦截，未验证真实 Odoo 写入。
- 同批尝试重跑 Demo 四页 × 390/1440 只读基线，但登录请求在 TLS 建连前断开（`0/1`，`blockedWrites=0`）；没有进入页面，不能当作线上 UI 失败或通过。证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_PRE-RESPONSIVE-BATCH.json`。
- 此批仅在本地工作树，尚未部署 Demo；线上运行 SHA 未核验。Dokploy Source/Git 绑定仍需控制台确认，且既存 `pos-api` 改动必须先对精确候选 SHA 通过 Java 21 `mvn -B clean verify`。

## 2026-10-21 Vendor Connections 平板布局

- Vendor Connections 在 1280px 以下使用卡片、1280px 起显示表格，避免 768px 侧栏布局下 720px 最小表格宽度遮住操作列。
- 本地 fixture 五视口 UAT `5/5 PASS`：320/390/768/1024px 检查连接名称、sender code、customer ID、Connected 状态和 Edit/Delete；1440px 检查表格与记录。无视口溢出、页面错误或 API 写入。
- 证据：`docs/UAT_VENDOR_CONNECTIONS_RESPONSIVE_LOCAL_2026-10-21_FULL-MATRIX.json`；截图：`docs/screenshots/2026-10-21-vendor-connections-full-matrix/`。该项仍未部署，真实集成管理和生产运行 SHA 未验证。

## 2026-10-21 AI 助手平板与焦点回归

- AI 能力门禁覆盖 `320/390/768/1024/1440px × chat on/off` 共 `10/10 PASS`：chat 可用性和语音禁用提示与能力配置一致，快捷问句请求与预期匹配；ASR 请求、意外 API 写入、页面错误均为 0。证据：`docs/UAT_AI_CAPABILITY_GATES_LOCAL_2026-10-21_FULL-MATRIX.json`。
- 助手对话框覆盖五个视口 `5/5 PASS`：模态语义、composer 位于 dialog 内、禁用态、语音控件禁用、焦点留在弹窗、Escape 后返回触发按钮均通过；助手/转写请求和拦截写入均为 0。修正旧 UAT 中已过时的 “Open sell” 按钮期望，改验仍存在的 “Today's sales” AI 快捷问句。320px 截图另发现标题副文案被截断，已缩为 “AI chat is off” 并新增实际文本宽度断言，五视口全部通过。证据：`docs/UAT_AI_FOCUS_LOCAL_2026-10-21_FULL-MATRIX.json`；截图：`docs/screenshots/2026-10-21-ai-focus-full-matrix/`。
- 合成麦克风可用态与云端 ASR 故障恢复均 `PASS`：释放仅转写一次且不自动发给助手；取消时不转写、清空输入并停止两条轨道；模拟转写失败时提示改为手动输入，无伪造文本或助手提交。证据：`docs/UAT_AI_VOICE_LOCAL_2026-10-21_AFTER-HEADER-FIX.json`、`docs/UAT_AI_VOICE_FAILURE_LOCAL_2026-10-21_AFTER-HEADER-FIX.json`；真实麦克风/provider 质量仍未验证。
- 两项均为本地 fixture，不调用真实模型或业务 API；Node `24.19.0` 的两个脚本 `node --check` 通过。未运行本地 build，尚未部署 Demo。

## 2026-10-21 Demo 定价页回归差异

- 强化后的公网定价 UAT `5/8 PASS`：1440px 四页及 390px Price Suggestions 通过；失败均在 390px 的 Stock List、Capped Pricing、Bulk Price Edit。页面 HTTP 200、`pageErrors=0`、`blockedWrites=0`，属于线上旧版布局尚未包含本地改动，不是数据/API 失败。
- Stock List 手机卡片宽 `282px`，顶部 AI 按钮缺失且浮动入口仍显示；Capped Pricing 仍是横向滚动桌面表格，未渲染手机卡片；Bulk Price Edit 同样未渲染卡片，搜索框宽仅 `110px`。对应本地修复已由 fixture UAT `6/6 PASS` 验证，但尚未部署。
- 新证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_LAYOUT-AUDIT.json`；截图：`docs/screenshots/2026-10-21-pricing-online-layout-audit/`。该结果 supersede 旧脚本因缺少卡片断言而给出的 `8/8 PASS`。
- 修复线上验收前置：解决 Dokploy Source/Git 分支绑定；部署时将库存/定价移动端卡片、Header AI 单入口和强化 UAT 同批发布。发布后重跑四页双视口专项、核对 runtime SHA；价格保存仍需隔离 Odoo 环境。

## 2026-10-21 Demo 全站 UI 回归（运行 SHA 未核验）

- 页面矩阵：生产 `pos-ui/app` 中 135 个静态路由 × 390/1440 视口，共 `270/270 PASS`；HTTP 均为 200，无横向溢出或页面错误。证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-21_GOAL_RESUME.json`。
- 真实只读交互：`14/14 PASS`，覆盖移动导航/键盘焦点、商品和客户表单保护、CSV 预览取消、退款单查看、补货周期和报表筛选。未提交产品/客户/销售/退款/采购/收银写入。证据：`docs/UAT_INTERACTION_2026-10-21_GOAL_RESUME.json`。
- 设置页：13 个设置页面 × 390/1440，共 `26/26 PASS`，覆盖 Odoo 绑定信息、未接入能力说明与响应式布局。证据：`docs/UAT_SETTINGS_MOBILE_2026-10-21_GOAL_RESUME.json`。
- 表格与可访问性：`14/14 PASS`，4 个非 GET `/api/odoo/records` 查询由只读脚本拦截，`unexpectedWrites=0`。证据：`docs/UAT_TABLE_A11Y_ONLINE_2026-10-21_GOAL_RESUME.json`。
- 这四项针对 `https://demo.orithos.com.au` 当前公网运行版本；Dokploy runtime SHA 未核验，不能作为工作区改动已部署的证明。Node `24.19.0` 执行；不涉及本地 build。

## 2026-10-21 库存/定价移动端全宽复验

- Stock List、Capped Pricing、Bulk Price Edit 在手机视口采用可读卡片/字段布局，扩大可用内容区；库存/定价密集页改由 Header AI 单入口控制助手，收起态不再遮挡分页或价格输入。桌面仍保持原有表格和列对齐。
- Node `24.19.0` 本地浏览器 fixture UAT：3 页 × 390/1440 共 `6/6 PASS`；无横向溢出、表格列不重叠、标题不溢出，顶部助手可开关；`blockedWrites=0`。所有 API 由 fixture 接管，此结果不代表真实 Odoo 保存或线上验收。
- 复验证据：`docs/UAT_STOCK_PRICING_FULL_WIDTH_LOCAL_2026-10-21_RECHECK.json`；截图：`docs/screenshots/2026-10-21-pricing-mobile-full-width-recheck/`。`pos-ui` typecheck 和 7 个相关文件的目标 ESLint 通过；未运行 production build。
- 该批 UI 仍待 Dokploy 部署、核对运行 SHA 后进行真实线上只读回归；价格保存写入需要隔离 Odoo UAT 环境。

## 2026-10-21 商品/客户/供应商目录深链复验

- `OdooProductCataloguePage` 手机工具栏使用两列布局，Export、Import、New product、Refresh 在 390px 均完整可见且不重叠；桌面工具栏保持横向排列。Import products from CSV 和 New product 对话框均通过打开、关键输入控件可见及取消关闭检查，没有提交任何写请求。
- 截图发现供应商页曾将浮动 AI 预留空间放在右侧，390px 视口的搜索框只有约 278px；改为底部安全留白后搜索框扩至 358px。UAT 增加移动搜索宽度断言，供应商/客户/商品三页现均为 358px。
- 截图另发现客户和商品页的 AI 浮动入口遮挡 Next 分页按钮；两页也改为底部安全留白。UAT 在 390px 检查分页与 AI 按钮不相交，三个目录全部通过，更新截图中分页控件完整可用。
- supplier/customer/product 深链在 390/1440 共 `6/6 PASS`：搜索框预填正确、相应 fixture 记录已渲染、页面无横向溢出；手机显示卡片，桌面显示表格。
- AI guard 同批通过：不支持的 balance create/import/export 会明确拒绝且不导航；supplier view 打开只读 Odoo 目录；删除取消不发请求、失败保留确认框、重复提交受保护、重试成功。`pageErrors=0`、`blockedBusinessWrites=0`；所有 API 由 fixture 接管，删除请求仅为 fixture。
- 客户/供应商表单在 390/1440 弹窗均位于视口内；新增姓名必填校验、取消关闭通过，供应商姓名输入自动聚焦；客户编辑表单保留现有姓名。全部取消，无表单提交。
- 空结果与恢复 `6/6 PASS`：三个目录在 390/1440 都显示相应无匹配提示；Clear search / Clear filters 会清空查询值。目录 API 使用 fixture，没有业务写入。
- 商品/客户/供应商目录汇总：双视口深链 `6/6`、空结果/清除 `6/6`、客户/供应商表单 `6/6`；商品 Import/Create 对话框、工具栏几何、AI action guard 和删除失败重试通过。证据中的 `pageErrors=0`、`blockedBusinessWrites=0`。
- 证据：`docs/UAT_AI_ENTITY_DIRECTORIES_LOCAL_2026-10-21.json`；六张截图：`docs/screenshots/2026-10-21-odoo-directories-followup/`。Node `24.19.0`、`pos-ui npm run typecheck`、目录页 ESLint、UAT 脚本 `node --check` 通过；未运行 production build。
- 当前仅是本地 fixture 回归，尚未部署；真实 Odoo 目录数据、商品导入/导出/编辑和线上运行 SHA 仍待验证。

## 2026-10-21 本轮公网只读复测

- 全站响应式页面矩阵 `135 routes x 390/1440 = 270/270 PASS`：所有页面均 HTTP 200，无横向溢出或 pageerror。新脚本现在严格要求 200，并记录 source commit 与独立 deployment 状态。证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-21_CONTINUATION.json`。
- 浏览器交互回归 `14/14 PASS`：覆盖导航/焦点、商品搜索/编辑、商品和客户必填校验、CSV 预览取消、客户移动卡片、退款历史查看、补货周期和报表筛选。业务写入为 0。证据：`docs/UAT_INTERACTION_2026-10-21_CONTINUATION.json`。
- 设置页专项 `26/26 PASS`（13 个设置/能力页面 × 390/1440），覆盖 Odoo source 提示、设备/条码/附加费/对账单未接入状态及响应式表格/卡片。只读、无 Odoo 写入。证据：`docs/UAT_SETTINGS_MOBILE_2026-10-21_CONTINUATION.json`。
- 表格与可访问性专项 `14/14 PASS`，覆盖用户/角色/AI metrics/商品/盘点/供应链/发票页面；表格名称、列标题 scope、未命名控件、清空搜索残留和页面错误均通过。4 个 `POST /api/odoo/records` 被只读脚本拦截，`unexpectedWrites=0`。证据：`docs/UAT_TABLE_A11Y_ONLINE_2026-10-21_CONTINUATION.json`。
- AI feature API 专项 `14 PASS / 0 FAIL / 0 BLOCKED`：NLQ、Sommelier identify/recommend/pitch/ask/similar、ASR/酒标空输入守卫、价格建议只读 API（`writeEnabled=false`）、补货页和匿名助手 `401` 通过。发票 OCR 探针为 `INFO`：provider 返回 `50212`，测试图没有发票字段，尚不能验收真实字段抽取。无 Odoo 业务写入。证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-21_CONTINUATION.json`。
- AI 实体动作本地浏览器回归 `PASS`：不支持的 customer balance create/import/export 显示限制且不导航；supplier view 打开只读 Odoo 目录；删除取消无请求、重复点击受保护、失败后重试可完成。全 API 由 fixture 拦截，业务写入为 0。证据：`docs/UAT_AI_ENTITY_INVALID_OP_LOCAL_2026-10-21_FINAL.json`。
- 客户/供应商/商品目录查询深链本地浏览器回归 `3/3 PASS`：supplier AI view 和 customer/product `?q=` 导航后，搜索框分别预填 `Acme Wines`、`Alex Example`、`VB Cans`；与 AI guard UAT 合并执行时整体逻辑全部通过。API 全部 fixture 拦截，无业务写入。证据：`docs/UAT_AI_ENTITY_SEARCH_PREFILL_LOCAL_2026-10-21.json`。
- 上述深链回归已扩展为 `6/6 PASS`（3 个目录 × 390/1440）：三类查询均正确预填且没有横向溢出；同批 AI guard 全部通过，pageErrors=0、业务写入=0。以此替代仅覆盖单视口的前一证据。证据：`docs/UAT_AI_ENTITY_SEARCH_PREFILL_LOCAL_2026-10-21_RESPONSIVE.json`。
- AI 入口路由矩阵 `9/9 PASS`：Overview、用户设置、Odoo 采购、补货、Sommelier、商品查找、酒标识别、发票扫描、盘点页面均 HTTP 200；助手入口可见，无横向溢出或页面错误。证据：`docs/UAT_AI_ROUTE_MATRIX_2026-10-21_RESUMED.json`。
- Demo 当前配置 `AI enabled=true`、`labelVisionAvailable=true`，酒标拍照按钮可用。该结果仅反映公网当前运行行为；部署 SHA 未核验，不作为本地改动已上线的证明。检查无销售、采购、库存、现金等业务写入。
- 页面、交互、设置、表格四类 UAT 脚本均分别记录 source commit 和 deployment 状态；缺失部署 SHA 时明确标记未核验。可指定独立输出文件，避免覆盖旧证据。Node `v22.22.2` 运行通过；项目要求 Node 24+，需在 Node 24 环境补做运行时确认。
- AI feature UAT 现在支持进程环境的 `INITIAL_ADMIN_PASSWORD`，证据明确记录未核验 deployment SHA，敏感响应脱敏规则已修正；脚本语法检查和本轮线上执行通过。
- AI 实体动作提示把内部实体 `balance` 映射为店员可理解的 `customer balance`，创建/导入/导出提示统一；本地 fixture UAT、`npm run typecheck`、目标 ESLint 通过。此源码改动尚未部署。
- 本轮 UI 静态验证：`pos-ui` `npm run typecheck` 通过；针对客户、供应商、商品目录页面及 `ai-entity-actions.ts` 的 ESLint 通过；路由 UAT `node --check` 和 `git diff --check` 通过。未运行 Next/Docker build。

## 状态说明

- **已实现**：代码路径存在，且有对应静态检查或 UAT 证据。
- **旧线上基线**：公网当前版本通过，但未证明来自最新提交。
- **待部署验证**：代码已推送，尚未进入可核验的 Dokploy 镜像。
- **明确未接入**：页面保留真实边界说明，不使用假数据或假写入。

## 功能清单

| 模块 | 当前能力 | 状态 | 主要证据 |
| --- | --- | --- | --- |
| 登录与租户路由 | 管理员登录、host 到 tenant、未认证 API 拒绝 | 旧线上基线 | `UAT_AUTH_REPLAY_*.json`、匿名 `401` |
| POS 销售 | Odoo 商品搜索、客户、报价、税额、支付前锁定；刷新时保留当前 register/支付方式并忽略过期 bootstrap 响应 | 待部署验证 | `UAT_POS_DIALOG_*`、`UAT_ORDER_PAGES_*`；本地 typecheck/ESLint 通过 |
| 商品目录 | Odoo 商品分页、搜索、分类、编辑、创建、CSV 导入/导出 | 待部署验证 | 当前提交 `dd5253d`；typecheck/ESLint 通过 |
| 客户目录 | Odoo 客户查询、分页、创建、编辑、移动端卡片 | 当前公网交互只读验证通过；写入行为在表单中取消，runtime SHA 未核验 | `UAT_INTERACTION_2026-10-21_GOAL_RESUME.json`、`UAT_TABLE_A11Y_ONLINE_CURRENT.json` |
| 供应商与采购 | Odoo 供应商、采购单详情、收货边界 | 旧线上基线 | `UAT_SUPPLIER_*`、`UAT_PURCHASE_*` |
| 库存与补货 | 库存列表、价格建议、补货建议、盘点只读；Stock List/Capped Pricing/Bulk Price Edit 手机卡片布局及密集页 Header AI 单入口 | 本地 fixture `6/6 PASS`；Demo 新断言 `5/8 PASS`，旧线上版仍有三页手机布局差异 | `UAT_STOCK_PRICING_FULL_WIDTH_LOCAL_2026-10-21_POST-ONLINE-AUDIT.json`、`UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_LAYOUT-AUDIT.json`、`UAT_ODOO_STOCKTAKE_*` |
| 报表 | Overview、销售/库存/采购报表、Odoo 绑定时区 | 部分通过，库存 AI 报告阻断 | 最新 `UAT_AI_REPORTS_READONLY_ONLINE_2026-10-22_CURRENT_RECHECK.json` 为 `13/14`；独立 Odoo stock RPC `7/7 PASS`，运行 SHA 未核验 |
| AI 助手 | 语音按住说话、意图路由、实体操作 allowlist、错误脱敏、多轮记忆/工具调用、cashier history、平台 AI usage、常见报表/工作流确定性快捷路由、库存字段权限降级和错误指引 | 部分线上通过，最新路由待部署验证 | `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_GOAL_CONTINUATION_RETRY.json`：`55 PASS / 32 BLOCKED / 3 FAIL`；route/surface/availability/admin/metrics/features/UI/Sommelier 专项通过；当前源码最新路由改动待 Dokploy 镜像 |
| AI Sommelier | 商品识别、酒标识别、推荐、相似酒款 | 旧线上基线 | `UAT_SOMMELIER_*`；租户 Odoo context 待部署验证 |
| 发票 OCR | 预览识别，禁止预览阶段写供应商/采购/收货；图片类型/10 MB 边界、连续换图竞态保护 | 待部署验证 | `UAT_INVOICE_SCAN_MOCK_*`、`UAT_INVOICE_OCR_PREVIEW_*`；本地 typecheck/ESLint/node check 通过 |
| 账户与设置 | 公司、门店、用户、角色、税务、支付设置页面；Tax Rates 主动刷新；设置表格可访问名称；现金进出金额前端边界与忙状态 | 当前公网 390/1440 只读复验通过；runtime SHA 未核验 | `UAT_SETTINGS_MOBILE_2026-10-21_GOAL_RESUME.json`、全站矩阵 |
| 全站页面 | 135 路由在 390/1440 下 HTTP 200、无页面错误或横向溢出 | 当前公网只读复验 `270/270 PASS`；runtime SHA 未核验 | `UAT_ALL_STATIC_PAGES_2026-10-21_GOAL_RESUME.json` |
| 条码工具 | 明确未连接打印；提供真实 Odoo 商品和集成状态入口 | 明确未接入/待部署 UI | 当前提交 `dd5253d` |
| 旧版 Utilities 假列表 | 不展示假商品、假客户或假库存；引导到 Odoo 页面 | 明确未接入 | `/utilities/products`、`/utilities/customers` |

## 2026-10-21 本地定价页响应式验证

- Capped Pricing 与 Bulk Price Edit 在 390px 手机视口改为卡片式字段布局，显示原表格的产品、价格集/来源、日期/箱规、数量档价格、封顶价、当前价和毛利；1440px 仍使用表格。
- 现有价格输入、校验和 blur 保存行为复用不变；手机内容区为固定 AI 助手按钮预留空间。
- 本地 Next dev fixture UAT（Node `24.19.0`）：Stock List、Capped Pricing、Bulk Price Edit 在 390/1440 共 `6/6 PASS`；页面错误 `0`、横向溢出 `0`、fixture 写请求 `0`。价格输入原值编辑/失焦、Imported CSV 上传入口、新增数量档及搜索控件宽度检查通过；所有 API 请求均由 fixture 接管。
- 证据：`docs/UAT_STOCK_PRICING_CARDS_LOCAL_2026-10-21.json`；截图：`docs/screenshots/2026-10-21-pricing-mobile-cards/`。证据标记当前提交基线 `60a0394` 与 dirty working tree；这不是已部署或 Odoo 写入验收。
- `pos-ui npm run typecheck`、定价页目标 ESLint、UAT `node --check`、`git diff --check` 通过；未运行本地 production build。

## 2026-10-21 当前公网只读复测

- 全站实际扫描 `135` 路由 × `390/1440`，共 `270/270 PASS`；AI features `14/14`、AI reports `14/14`、Sommelier `10/10`、AI UI `2/2`、设置 `28/28`、价格/库存 `8/8`、表格/表单 `14/14` 均通过。
- 所有本轮专项均只读，意外业务写入为 `0`；证据使用 `docs/UAT_*_2026-10-21_CURRENT.json` 文件。
- 以上只证明当前公网运行版本的页面/API行为，尚未核对 Dokploy 运行 SHA；不能把它当作最新代码的 post-deploy 证据。

## 当前已验证

- 2026-10-21 AI 完整只读复测：自然语言工作流 `55 PASS / 32 BLOCKED / 3 FAIL`（90 条）；route `9/9`、surface `11/11`、availability `3/3`、admin guard `15/15`、metrics `9/9`、features `14/14`、UI `2/2`、Sommelier `10/10`；报表 `13/14`，History/platform `9 PASS / 2 BLOCKED`。所有检查无业务写入，运行 SHA 未核验。

- `npm run typecheck`：通过。
- 目标 ESLint：`OdooProductCataloguePage`、`SellAiPanel`、`ai-entity-actions`、条码页通过。
- 相关 UAT 脚本 `node --check`：通过。
- `pos-api` Java 21 `mvn -B clean verify`：通过，当前批次 243 tests、0 failures。
- 发票 OCR mock/线上脚本、价格建议、盘点脚本 `node --check`：通过；本批次未运行 Next/Docker build。
- 公网只读基线：AI UI `2/2`、价格/库存 `8/8`、表格/表单 `14/14`、全站 `268/268`；意外业务写入 `0`。
- 2026-10-21 当前公网只读复测：全站 `270/270`、AI features `14/14`、AI reports `14/14`、Sommelier `10/10`、设置 `28/28`、价格/库存 `8/8`、表格/表单 `14/14`；意外业务写入 `0`。这组结果是较早运行版本基线。
- 2026-10-22 最新报表复测为 `13 PASS / 1 BLOCKED`，唯一阻断为 AI stock report；独立 Odoo stock RPC 为 `7 PASS / 1 INFO`，不能证明 warehouse 配置是根因。
- 2026-10-23 AI UI 识别结果竞态复测为 `2/2 PASS`；测试脚本等待识别列表首项可见后，390/1440 均得到 48 条识别结果、3 张推荐卡、零页面错误。
- AI natural-language workflow `49/49 PASS`、管理员配置保护 `15/15 PASS`、availability `3/3 PASS`、surface/auth guard `11/11 PASS`；metrics `9 PASS / 2 BLOCKED`，跨店 metrics 需要 platform-operator 凭据才能完成。
- 本轮公网只读复测：AI UI `2/2`、未接入页面诚实边界 `18/18`、表格/表单 `16/16`、POS help/keyboard `2/2`；意外业务写入 `0`。
- Sell 刷新竞态修复后：`npm run typecheck`、`npx eslint src/components/OdooRegisterPage.tsx`、`git diff --check` 通过；未运行 Next/Docker build。

## 尚未验证

- 本地 Next/Docker build：按用户要求未运行；后端 Java 21 Maven 门禁已运行并通过。
- 最新提交中的产品分类重试、价格/名称边界、条码导航、价格建议交互、发票 OCR 图片边界/竞态、Sell AI 指针取消和非法操作提示：等待新镜像。
- Dokploy backend/frontend 构建日志、健康状态和运行容器 SHA：尚未取得。
- 真实 DashScope 质量、真实麦克风、真实酒标照片和真实发票照片：不能用 mock 或页面可达性替代。
- Dokploy #38 的 `AiProviderConfig` 错误未在当前源码复现；当前 Java 21 编译通过，部署前需核对 Dokploy 分支绑定和运行 SHA。
- 本轮 `OdooRegisterPage` 刷新竞态修复尚未进入可核验 Dokploy 镜像；需部署后在 demo 的 Sell 页面验证切换 register、刷新、断网恢复和草稿保留。
- Tax Rates、Payment Methods、Registers & Outlets 的设置页改动尚未进入可核验 Dokploy 镜像；需部署后验证主动刷新、移动/桌面布局和 Odoo 读取失败 Retry。

## 下一次部署后

1. 在 Dokploy 修正 Compose 的仓库/分支绑定，确认目标为 `main`。
2. 部署当前 `main`（`24f9e44` 或其后提交），并回读 frontend/backend 构建日志、健康状态、运行 SHA。
3. 重跑 AI UI、AI features、Sommelier、AI reports、产品/价格、表格/表单和全站矩阵。
4. 只把运行 SHA 与目标提交一致的结果标为 post-deploy；写入类 UAT 继续使用隔离 Odoo 数据库。

## 2026-10-21 增量复测（源码 `435ec47`，公网运行 SHA 未核验）

| 范围 | 结果 | 证据/限制 |
| --- | --- | --- |
| 设置页（390/1440） | `28/28 PASS` | `UAT_SETTINGS_MOBILE_2026-10-21_CURRENT.json`；只读、无写入 |
| 表格/表单语义 | `14/14 PASS` | `UAT_TABLE_A11Y_ONLINE_2026-10-21_CURRENT.json`；拦截非 GET 请求 |
| 未接入能力诚实边界 | `16/16 PASS` | `UAT_ACTIVE_ROUTE_HONESTY_ONLINE_2026-10-21_CURRENT.json`、`UAT_ADMIN_LIST_BATCH_2026-10-21_CURRENT.json` |
| AI 自然语言工作流 | `51 PASS / 8 BLOCKED / 0 FAIL` | `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_CONTINUATION3.json`；8 项为旧镜像返回 `50210`，不能代表当前源码修复失败 |
| UI 静态类型 | `PASS` | `pos-ui npm run typecheck`；未运行 Next build |

全站只读页面矩阵复核：`135 routes x 390/1440 = 270/270 PASS`，无页面错误或横向溢出。证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-21_CURRENT_RECHECK.json`。该结果验证的是当前公网运行版本，未验证最新源码已部署。

交互与运营安全复核：交互 `14/14 PASS`，运营只读 `3/3 PASS`；覆盖移动导航/焦点、商品搜索编辑、表单/CSV 预览、客户卡片、历史退款单、补货/报表筛选、关班现金门禁和采购状态筛选。证据：`docs/UAT_INTERACTION_2026-10-21_CURRENT.json`、`docs/UAT_OPS_READONLY_2026-10-21_CURRENT.json`。没有创建销售、退款、采购、收货、库存或关班业务数据。

API/AI 网关错误体验已改善：普通 API、发票 OCR、语音转写和酒标识别遇到非 JSON 的 `502/503/504` 时显示可操作的暂时不可用提示；发票页额外引导到 Odoo Purchases。401 和后端业务错误仍保留原有处理。`pos-ui` typecheck、目标 ESLint 通过，待下一次部署后用真实网关响应复验。

当前源码已增加 8 个阻断问法的确定性路由；必须在 Dokploy 分支绑定修正后，用 Java 21 构建并核对运行 SHA，再将这些项重新标为线上通过。

## 2026-10-24 当前复核补充

### 2026-10-21 AI 182 条问法复测与写入意图保护

- 当前可执行目录为 **182 条唯一用例**（174 条只读 + 8 条写入安全）。最新 Demo 复测为 **76 PASS / 90 BLOCKED / 16 FAIL**，证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_182CASE_RECHECK.json`。
- 5 条 FAIL 为旧 runtime 将执行型问法误导航到只读工作流；源码现已在 `ClassifyQueryNode` 模型调用前 fail-closed，并有 8 条节点回归覆盖。Java 21 远程门禁和 runtime SHA 尚未完成，保持待部署。

### 2026-10-21 AI 174 条问法全量复测补充

- 当前工作区自然语言目录为 174 条唯一只读问法；Demo 全量复测为 `76 PASS / 87 BLOCKED / 11 FAIL`，证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-174CASE-CURRENT.json`。
- 87 个 BLOCKED 均为 `50210`；11 个 FAIL 是旧 runtime 的定价历史、发票存在/数量、批量改价和补货支出历史误路由。当前源码已有对应确定性边界，但 runtime SHA 未核验，不能标为 post-deploy。
- 新增 8 条补货、价格复核和酒类搭配口语专项为 `4 PASS / 4 BLOCKED / 0 FAIL`，证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_NEW-8CASES.json`。

- 工作流公网只读复核：`51 PASS / 16 BLOCKED / 0 FAIL`；证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_CURRENT_RECHECK.json`。阻断均为旧 runtime `50210`，源码路由待部署验证。
- 全站页面公网复核：`135 routes x 390/1440 = 270/270 PASS`；证据 `docs/UAT_ALL_STATIC_PAGES_2026-10-24_CURRENT_RECHECK.json`。该结果不绑定当前源码 SHA。
- 本轮通过：`pos-ui npm run typecheck`、`npx eslint src/lib/api.ts --no-cache`、工作流脚本 `node --check`、`git diff --check`；未运行本地 Next/Docker/Maven build。
- 当前仍需：Dokploy 修复 Source/Git 的 `Branch Not Match`，完成 Java 21 `mvn -B clean verify`、容器健康检查、runtime SHA 核对，再重跑 AI 工作流、AI features、AI UI、报表、设置和全站矩阵。
- Odoo API 错误体验已集中增强：502/503/504 且没有后端业务消息时，统一显示 `Odoo is temporarily unavailable. Try again shortly.`；业务校验、权限和明确的后端消息保持原样。改动待 Dokploy 镜像验证。
- Odoo 错误类静态审计：`23` 个 `OdooApiError` 调用点均传入 HTTP 状态或明确的 `502` fallback；没有发现缺少状态参数的调用点。
- AI 报表复测（2026-10-21）：`13 PASS / 1 BLOCKED / 0 FAIL`；销售报表和 Odoo Overview 对账通过，库存报表实时数据源不可用并显示安全提示。证据 `docs/UAT_AI_REPORTS_READONLY_ONLINE_2026-10-24_RESUMED.json`，运行 SHA 未验证，不能归因于本地源码。
- AI features 复测：`14/14 PASS`，覆盖 AI config、NLQ、ASR/图像空输入保护、Sommelier、价格建议、补货入口及匿名保护；OCR 探针 `INFO`（provider 可达，探针图片无发票字段）。Sommelier 只读 `10/10 PASS`，推荐和详情与 Odoo 价格/free stock 一致，匿名接口 `401`。证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-21_RESUMED.json`、`docs/UAT_SOMMELIER_READONLY_2026-10-21_RESUMED.json`；运行 SHA 未核验。

## 2026-10-21 Price Suggestions 移动端复验续轮

- Price Suggestions 本地 fixture UAT 重跑为 `18/18 PASS`：商品/SKU 搜索、状态筛选、空结果、商品与批量编辑深链、只读 CSV 导出、390px 可用内容宽度、无横向溢出及 Header AI 开关均通过。390px 内容宽度为 `358px`；`pageErrors=0`、API/业务写入 `0`。
- 证据：`docs/UAT_PRICE_SUGGESTIONS_MOBILE_LOCAL_2026-10-21_RECHECK.json`；390/1440 截图：`docs/screenshots/2026-10-21-price-suggestions-mobile-recheck/`。Node `24.19.0`、`tsc --noEmit`、目标 ESLint、`git diff --check` 通过；未运行 Next/Docker production build。
- 最新 Demo 定价四页双视口只读审计为 `4/8 PASS`：1440px 四页通过，390px 四页均有失败；本轮 Price Suggestions 手机留白改动及其他本地定价布局尚未部署。证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_LAYOUT-AUDIT-2.json`，线上业务写入 `0`、页面错误 `0`，runtime SHA 未核验。此证据取代较早的 `5/8` 布局审计结果。
- 发布前仍需解决 Dokploy Source/Git 对齐、整理不含未验证 `pos-api` 工作区更改的候选变更集，并按 Java 21 门禁要求核对精确候选 SHA；价格真实保存仅能在隔离 Odoo UAT 验证。

## 2026-10-21 库存定价与 Odoo 目录 UI 本地复验续轮

- Stock List、Capped Pricing、Bulk Price Edit 本地双视口 fixture 回归 `6/6 PASS`；手机卡片字段、输入控件和分页可用，桌面表格列对齐，无页面错误或横向溢出，写入拦截 `0`。证据：`docs/UAT_STOCK_PRICING_BATCH_LOCAL_2026-10-21_RECHECK.json`；截图：`docs/screenshots/2026-10-21-pricing-batch-recheck/`。
- 供应商、客户、商品目录复验通过：390/1440 深链 `6/6`，空结果/清除 `6/6`，新增/编辑弹窗校验与取消 `6/6`；导入/新建对话框、工具栏、AI 不支持动作保护及删除取消/失败重试均通过。`pageErrors=0`、业务写入 `0`，API 使用 fixture。证据：`docs/UAT_AI_ENTITY_DIRECTORIES_LOCAL_2026-10-21_RECHECK.json`；截图：`docs/screenshots/2026-10-21-directories-batch-recheck/`。
- 截图抽检确认手机卡片和工具栏未互相遮挡、目录分页可见、桌面/手机布局符合预期。以上为本地 fixture 行为，不代表真实 Odoo 写入或已部署；未运行 production build。
- 最新公网基线重跑仍为 `4/8 PASS`，证据 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_AFTER_LOCAL_CONTINUATION.json`。四页均 HTTP 200，1440px 全通过，390px 全失败；Stock List 与 Price Suggestions 仍显示浮动 AI 并挤占内容宽度，Capped/Bulk Price Edit 仍是移动横向滚动表格，Bulk 搜索宽度 `110px`。页面错误及拦截写入均为 `0`，runtime SHA 未验证。

## 2026-10-21 320px 小屏复验与商品字段修复

- Stock List、Capped Pricing、Bulk Price Edit 覆盖 320/390/1440px fixture 回归 `9/9 PASS`；Price Suggestions `22/22 PASS`。手机内部横向滚动、页面溢出、标题/助手入口问题均无新增失败，写入 `0`。
- Odoo supplier/customer/product 目录覆盖 320/390/1440px：深链 `9/9`、空结果/恢复 `9/9`、客户/供应商新增/编辑表单各视口通过；320px 搜索宽度 `288px`，分页和商品工具栏安全。报告：`docs/UAT_AI_ENTITY_DIRECTORIES_320_LOCAL_2026-10-21.json`。
- 320px 截图发现商品卡片两列字段截断 “Uncategorised” 和条码。商品目录卡片在 `<360px` 改为单列，新增 UAT 检查 `dd` 内容宽度；重跑后 320/390 商品卡片字段完整 `PASS`，截图 `docs/screenshots/2026-10-21-directories-320-local/product-320.png`。
- 证据：`docs/UAT_STOCK_PRICING_320_LOCAL_2026-10-21.json`、`docs/UAT_PRICE_SUGGESTIONS_320_LOCAL_2026-10-21.json`、`docs/UAT_AI_ENTITY_DIRECTORIES_320_LOCAL_2026-10-21.json`。Node `24.19.0` typecheck、目录 ESLint、三脚本语法和 `git diff --check` 通过；没有运行 production build。

## 2026-10-21 续验补充
- [x] 目录/助手实际视口 320/390/1024/1440：44/44（UAT_DIRECTORIES_ASSISTANT_DEMO_2026-10-21_ACTUAL_VIEWPORTS.json）。
- [x] 盘点搜索与补货 Retry，完成 Odoo session warmup 后 390/1440：13/13（UAT_OPERATIONS_RUNTIME_DEMO_2026-10-21_WARM_SESSION.json）。
- [ ] 冷入口 Odoo session 401 的首次页面恢复仍需产品级复核；对应失败证据保留在 UAT_OPERATIONS_RUNTIME_DEMO_2026-10-21_ACTUAL_VIEWPORTS.json。
- [x] 采购 AI 入口不遮挡收货按钮：本地 40/40；待下批推送。

- [x] Odoo 只读 GET 401 会话恢复并安全重放：2/2 fixture。
- [x] 采购详情头部 AI 入口与收货按钮无浮层遮挡：390/1024/1440，3/3 fixture。
- [ ] c0368b9 尚待 Dokploy 部署后线上冷入口复验。

- [x] c0368b9 Demo 盘点只读复验：12/12（390/1440，无库存写入）。
- [x] c0368b9 Demo 采购列表 AI 布局：2/2（390/1440，无采购/收货写入）。
- [x] c0368b9 Demo 目录/助手实际视口：44/44（320/390/1024/1440）。
- [ ] 真实采购详情/收货订单未在本轮 Demo 找到可点击订单；runtime SHA/API version 仍未核验。

- [x] Demo 盘点冷入口 Odoo session 自动恢复：1/1 PASS，非 GET 全部拦截。
- [ ] Dokploy checkout/runtime SHA 仍未由版本端点确认（HTTP 500）。

- [x] 定价四页 Demo 双视口复验：8/8 PASS（9027428）。
- [x] 新 Odoo Bulk Price Editor 移动端列表、搜索和数字编辑器通过实际页面验收。
- [ ] 隔离 Odoo 真实价格保存仍待批准环境验证。

- [x] 全站页面矩阵：135 路由 × 390/1440，270/270。
- [x] 全站交互：14/14。
- [x] 设置双视口：PASS。
- [x] 表格与可访问性：14/14，unexpectedWrites=0。

## 2026-10-21 Odoo 读取链路发布记录

- [x] 前端 Odoo 读取链路统一传递 correlation ID：提交 `1cf20c5`，已推送 `origin/main`。
- [x] Node 24 `pos-ui` typecheck 通过；6 个目标文件 ESLint 通过。
- [ ] Dokploy checkout/build/runtime SHA 尚未核对；用户反馈部署成功不等于当前提交已运行。
- [ ] 部署后需重跑 Odoo 目录、销售详情、报表和全站只读回归；本批次未验证真实 Odoo 写入。

## 2026-10-21 correlation ID 代理边界续批次

- [x] 提交 `d9c5622` 已推送：版本诊断、密码重置、R2 管理员只读、UAT context、租户 binding 代理均保留 correlation ID。
- [x] Node 24 typecheck、目标 ESLint、diff check 通过。
- [x] Fixture UAT：会话恢复 `2/2`、盘点搜索 `39/39`、补货供应商恢复 `60/60`、Price Suggestions PASS，写入 `0`。
- [ ] Dokploy 构建 SHA/runtime SHA 尚未核对；真实 Odoo 写入仍未验证。

## 2026-10-21 d9c5622 后续只读验收

- [x] 全站 390/1440 页面矩阵通过；交互 `14/14`；设置 `28/28`；表格/可访问性 `14/14`，unexpected writes `0`。
- [x] 定价四页双视口 `8/8 PASS`，AI UI `2/2 PASS`。
- [x] AI features `13 PASS / 1 BLOCKED / 0 FAIL`；阻断已记录，未执行业务写入。
- [ ] Dokploy runtime commit 仍为空，尚未完成 SHA 绑定验收；真实 Odoo 写入仍待隔离环境。
- 证据：`UAT_ALL_STATIC_PAGES_2026-10-15.json`、`UAT_INTERACTION_2026-10-14.json`、`UAT_SETTINGS_MOBILE_2026-10-14.json`、`UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19.json`、`UAT_AI_UI_2026-10-19_AUTHFIX.json`、`UAT_AI_FEATURES_VERIFY_2026-10-19.json`、`UAT_TABLE_A11Y_ONLINE_CURRENT.json`。

- [ ] 发布身份：Dokploy 必须注入目标 40 位 `SOURCE_COMMIT`；当前线上版本端点仍为 `frontend.commit=null`、`backend=null`。
- [ ] Platform Audit：页面和后端接口仍在未提交 WIP，未计入线上功能清单。
- [ ] 后端发布门禁：当前 62 个 Java/资源/测试文件没有同 SHA 的 Java 21 远程 `mvn -B clean verify` 证据；不得推送或部署该候选批次。
- [ ] 最新线上版本复核仍未提供 commit：两个域名版本端点均为 `builtAt=2026-10-21T08:19:13.701Z`、frontend/backend commit 为空；不能把平台 WIP 标记为线上通过。
- [x] Platform Audit 前端 fixture：桌面/390px、搜索、分页、刷新通过，`pageErrors=0`、无横向溢出；Node `v24.19.0` typecheck/目标 ESLint 通过；证据 `docs/UAT_PLATFORM_AUDIT_LOCAL_2026-10-21.json`。
- [x] Platform Failures 前端 fixture：桌面/390px、搜索、分页、刷新通过；新增平台导航后移动端横向溢出已修复；证据 `docs/UAT_PLATFORM_OPERATIONS_LOCAL_2026-10-21.json`。
- [x] 门店详情 provisioning history 前端 fixture：门店资料、AI KPI、操作历史、步骤时间线和 390px 布局通过；证据 `docs/UAT_PLATFORM_STORE_PROVISIONING_LOCAL_2026-10-21.json`。
- [x] 门店详情 provisioning history 前端 fixture：门店资料、AI KPI、操作历史、步骤时间线和 390px 布局通过；证据 `docs/UAT_PLATFORM_STORE_PROVISIONING_LOCAL_2026-10-21.json`。

## 2026-10-21 公网只读续验结果

- [x] AI 路由矩阵 `9/9 PASS`；证据 `docs/UAT_AI_ROUTE_MATRIX_2026-10-19.json`。
- [x] Sommelier 只读 `10/10 PASS`、运营只读 `3/3 PASS`；证据 `docs/UAT_SOMMELIER_REGRESSION_2026-10-13.json`、`docs/UAT_OPS_READONLY_2026-10-13.json`。
- [ ] AI 报表 `15/16`，库存实时数据源 `BLOCKED`；证据 `docs/UAT_AI_REPORTS_READONLY_ONLINE.json`。
- [ ] 本轮 `deploymentShaVerified=false`、`runtimeCommit=null`，Dokploy runtime SHA 尚未绑定。
- [x] 平台门店 provisioning history 时间戳解析修复：兼容 UTC、带偏移和无时区值，避免重复追加 `Z`；Node 24 typecheck、定向 ESLint、diff check 通过。
- [ ] 该 UI 修复仍依赖未通过 Java 21 门禁的后端候选，尚未推送或线上验证。
- [x] Platform Audit/Failures 时间解析和请求竞态修复：快速筛选/翻页不会被旧响应覆盖；Node 24 typecheck、定向 ESLint、diff check 通过。
- [ ] Audit/Failures 仍为本地 fixture/未提交 WIP，后端门禁和线上权限验收未完成。
- [x] Audit/Failures 日期范围校验和 UTC 显示：`From > To` 被前端阻止并提示，列表时间明确标注 UTC；typecheck/定向 ESLint/diff check 通过。
- [x] Audit 390px 浏览器 fixture：反向日期校验、无额外 API 查询、无横向溢出、`pageErrors=0`；证据 `docs/UAT_PLATFORM_FILTER_VALIDATION_LOCAL_2026-10-21.json`。
- [x] Audit/Failures 日期错误可访问性：输入带 `aria-invalid`，错误提示通过 `aria-describedby` 关联；Node 24 typecheck/ESLint/diff check 通过。
- [x] Failures 390px 浏览器 fixture：反向日期校验、无额外 API 查询、`aria-invalid=true`、无横向溢出；合并证据 `docs/UAT_PLATFORM_FILTER_VALIDATION_LOCAL_2026-10-21.json`。
- [x] Audit 390px 可访问性 fixture：`aria-invalid=true`、错误描述关联正确、无额外 API 查询、无横向溢出；合并证据同上。
- [x] 价格建议移动端完整 fixture：`320/390/768/1024/1440`、搜索/筛选/空态/CSV/深链/AI 入口全部通过，写入 `0`；证据 `docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-21_RECHECK_CURRENT.json`。
- [ ] 该价格建议证据绑定本地 HEAD `5afdf2c`，不等于 Dokploy runtime 已运行该 SHA。
- [x] Stock List/Capped Pricing/Bulk Price Edit 响应式 fixture 更新后串行复验 `15/15 PASS`（320/390/768/1024/1440），无横向溢出、页面错误或业务写入；证据 `docs/UAT_STOCK_PRICING_RESPONSIVE_LOCAL_2026-10-21_RECHECK_CURRENT.json`。
- [x] Bulk Price Edit Odoo 未确认结果保护 `PASS`：只读回查、保留待确认状态、无自动 PATCH 重试；证据 `docs/UAT_BULK_PRICE_EDIT_SAVE_GUARD_LOCAL_2026-10-21_RECHECK_CURRENT.json`。
- [ ] 本轮 fixture 工具修改尚未部署；公网定价页面仍需 runtime SHA 绑定后的线上复验。
### 2026-10-24 `b211284` 部署后复核

- [x] 前端 Odoo 错误响应关联 ID：线上未登录路径返回匹配 UUID。
- [x] 定价页面双视口：`8/8 PASS`，`blockedWrites=0`。
- [ ] AI price suggestions：部署后仍因上游 `502` 阻断。
- [ ] Dokploy runtime SHA：版本端点 commit 字段仍为空。
- [x] `d729d91`：价格建议/报表错误态显示 Request ID；本地 390px 502 fixture `7/7 PASS`，页面错误 `0`、横向溢出 `0`、业务写入 `0`。
- [ ] `d729d91` 已推送但未确认部署；Dokploy webhook `301`，版本端点 builtAt 未变化且 runtime SHA 为空。

## 2026-10-21 Odoo 错误关联 ID 续验

- [x] 本地 390px 价格建议/报表错误 fixture：请求前 UUID、发送关联头、缺少响应头时显示请求 ID，Retry 生成新 UUID 且显示正确 ID，`13/13 PASS`，页面错误 0、无横向溢出、业务写入 0。
- [x] Node 24.19.0 typecheck、两个目标组件 ESLint、UAT 脚本语法和 diff check 通过；未运行 Next production build。
- [ ] Demo 价格建议 API 返回 `502`，线上请求未见 `X-Correlation-ID`；报表 API 为 `200`。面板显示部署成功，但 runtime SHA 为空，不能确认本轮代码运行中。证据 `docs/UAT_ODOO_ERROR_CORRELATION_ONLINE_CURRENT.json`。

## 2026-10-21 `e7dc67d` 部署后回归

- [x] Dokploy 部署记录 `Done`，source SHA `e7dc67ddcc7c61e5f3b225be84457e142ef914a7`；Demo builtAt 更新。应用 version endpoint 未提供 runtime commit 字段。
- [x] 价格建议与报表关联 ID 线上 390px `11/11 PASS`：价格建议仍返回 502，但请求 UUID、错误态展示和 Retry 新 UUID 均通过；报表 API 200。
- [x] 全站静态路由 390px/1440px 共 `272/276 PASS`；交互 `14/14 PASS`；设置 `26/26 PASS`；表格/可访问性 `14/14 PASS`。
- [ ] `/platform/audit` 与 `/platform/failures` 两页在两个视口均 404，未包含在部署 SHA；后端依赖须先过 Java 21 同 SHA `mvn -B clean verify` 门禁。
- [ ] 价格建议上游 `502` 仍待 Cloudflare/origin 日志定位；本轮无业务写入。

### 2026-10-21 平台审计与故障页本地回归

- [x] Failures 错误态提供页内 Retry，临时错误恢复后重新显示故障分组。
- [x] Audit/Failures 双视口 fixture：390/1440 共 `4/4 PASS`，首次错误、Retry 恢复、页面错误、横向溢出和非 GET 写入均已检查；证据 `docs/UAT_PLATFORM_AUDIT_FAILURES_LOCAL_2026-10-24.json`。
- [x] Node 24.19.0 typecheck、定向 ESLint、UAT 脚本语法和 diff check 通过；未运行 production build。
- [ ] 后端接口/数据库迁移尚未通过 Java 21 同候选 SHA `mvn -B clean verify`，Audit/Failures 尚未部署或线上登录态验收。

### 2026-10-21 Demo 管理列表线上只读回归

- [x] Purchases、Mail Log、Trashed Items、Platform Stores 在 390/1440 两个视口共 `8/8 PASS`；HTTP 200、标题、无横向溢出、搜索空态/清除和 Stores 创建入口均通过。
- [x] 真实公网回归未执行销售、退款、采购收货、库存、价格、现金或关班写入；证据 `docs/UAT_ADMIN_LIST_BATCH_2026-10-17.json`。
- [ ] 该脚本未能读取 runtime SHA（`sourceCommit/deployment=null`），所以行为通过不等于当前候选已部署。

### 2026-10-21 Operations/AI Usage 本地回归

- [x] Operations 与 AI usage 错误态新增页内 Retry，并禁止请求期间重复提交。
- [x] 两页 390/1440 双视口 fixture `4/4 PASS`；覆盖错误恢复、AI usage 时间窗口切换、页面错误、横向溢出和非 GET 写入；证据 `docs/UAT_PLATFORM_OPERATIONS_USAGE_LOCAL_2026-10-24.json`。
- [ ] 线上健康探针和 AI usage 的部署 SHA、后端 Java 21 门禁仍未核验。

### 2026-10-21 Operations/AI Usage 公网只读验收

- [x] app 控制台 Operations、AI usage 在 390/1440 两个视口共 `4/4 PASS`；HTTP 200、标题可见、页面错误 0、无横向溢出、无业务写入。
- [x] Operations 的 runtime/dependency 区域和 AI usage 的窗口选择均可加载；证据 `docs/UAT_PLATFORM_OPERATIONS_USAGE_ONLINE_2026-10-24.json`。
- [ ] runtime SHA 仍为空，无法证明本地 Retry 优化已部署；线上错误态 Retry 仍需在已识别候选 SHA 上注入/验证。

### 2026-10-22 自动构建后的控制面阻断

- [ ] Audit/Failures/Operations/AI usage 认证回归：`8` 个检查均因 `/api/auth/login` HTTP `502` 阻断，未产生页面验收结论；证据 `docs/UAT_PLATFORM_OBSERVABILITY_ONLINE_2026-10-22.json`。
- [ ] `/api/public/version` builtAt 已更新，但 frontend/backend SHA 仍为空；部署身份和容器健康仍待核验。
- [ ] Dokploy webhook 返回 `301` 后未重复触发；需修正/核对 Source/Git 或读取构建日志，再继续线上验收。

### 2026-10-22 推送恢复后的状态

- [x] `3a2ca5f` 已推送到 `origin/main`。
- [ ] 推送后 builtAt 未变化，frontend/backend SHA 仍为空；不能确认 Dokploy 已运行该提交。
- [ ] app 登录 HTTP `502` 仍阻断 8 个平台页面认证检查；需源站日志和容器健康证据后再继续。

### 2026-10-22 `1c36a11` 后端修复后复核

- [x] `1c36a11` 已触发新构建，Demo builtAt 更新为 `2026-10-21T16:14:31.063Z`。
- [ ] SecurityConfig bean-cycle 修复后 app 登录仍为 HTTP `502`；Audit/Failures/Operations/Usage 认证检查 `0/8`，runtime SHA 仍为空。

### 2026-10-22 用户确认 Dokploy 成功后的最终状态记录

- [x] 用户确认 Dokploy 面板最新部署状态为成功；仅记录面板状态，未取得可核验 commit SHA。
- [ ] 重新执行线上平台可观测性验收仍为 `8/8 BLOCKED`：`/api/auth/login` HTTP `502`，四页在认证阶段未进入页面断言；证据 `docs/UAT_PLATFORM_OBSERVABILITY_ONLINE_2026-10-22.json`。
- [ ] Demo `/api/public/version` 仍为 `frontend.commit=null`、`backend=null`、`builtAt=2026-10-21T16:14:31.063Z`；部署身份、容器健康和源码对齐未证实。
- [x] 本地已实现并验证平台四页 Retry、加载/错误/恢复状态、日期校验和可访问性；Audit/Failures `4/4` fixture、Operations/Usage `4/4` fixture 均通过。
- [ ] 生产验收仍缺 backend 登录 502 根因、Java 21 `mvn -B clean verify` 候选门禁、runtime SHA 回读，以及登录恢复后的四页线上复验。

### 2026-10-22 `ff32021` 前端 Retry 与移动定价批次

- [x] 列表错误态 Retry 现在防重复点击，显示进行中状态和 spinner，并保留键盘/屏幕阅读器状态。
- [x] Capped Pricing / Bulk Price Edit 移动端输入控件、筛选区和标题响应式优化；Capped Pricing tabs 增加 `aria-pressed`。
- [x] Node `24.19.0` typecheck、目标 ESLint、`git diff --check` 通过；库存定价响应式 fixture `15/15 PASS`，价格建议、平台错误恢复、实体目录保护 fixture 均 PASS，业务写入 `0`。
- [x] `ff32021` 已推送到 `origin/main`，仅前端/UAT 脚本。
- [ ] 未运行本地 production build；Demo runtime SHA 未核验，线上登录 HTTP `502` 仍阻断部署后页面验收。
- [ ] `ff32021` 推送后 Dokploy webhook 返回 HTTP `301`，未重复触发；线上定价只读脚本在登录 HTTP `502` 阶段阻断，证据 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19.json`。

### 2026-10-22 共享管理页壳响应式批次

- [x] `AdminPageLayout` 筛选栏换行、操作 footer 换行安全、工具栏按钮触控高度统一。
- [x] Node `24.19.0` typecheck/目标 ESLint/diff check；产品化 UI、AI 焦点/能力门禁、供应商连接、盘点边界 fixture 均通过，业务写入 `0`；汇总证据 `docs/UAT_SHARED_ADMIN_LAYOUT_LOCAL_2026-10-22_FF32021.json`。
- [ ] 尚未取得该共享壳线上 runtime SHA；线上登录 `502` 和 Dokploy `301` 阻断部署后验证。

### 2026-10-22 `3845bf2` 部署后线上复核

- [x] Dokploy deployment `3845bf2` 显示 Done，Compose 成功，backend started，MySQL/Redis healthy；构建日志记录 Maven/frontend 层为 cached，SOURCE_COMMIT 为空。
- [x] 平台四页线上 `8/8 PASS`；全站静态页面 `276/276 PASS`；交互 `14/14 PASS`；表格/可访问性 `14/14 PASS`；无业务写入。
- [ ] 定价页：`0 FAIL / 6 BLOCKED / 2 可继续`；Classic POS API 退役与价格建议 Cloudflare 502 待处理。
- [ ] AI features：`13 PASS / 2 BLOCKED / 0 FAIL`；发票 OCR 路由 410/41001、价格建议 502 待处理。
- [ ] Settings 移动专项在 live Odoo register card 数据断言处 BLOCKED，不把数据缺失误记为 UI FAIL；证据 `docs/UAT_SETTINGS_MOBILE_2026-10-22_3845BF2_BLOCKED.json`。
- [ ] runtime frontend/backend commit 仍为空；必须补充 SOURCE_COMMIT 注入和新鲜 exact-SHA 构建证据。

### 2026-10-22 `a4740ff` 最新平台复核

- [x] 最新 Dokploy 文档部署及前一项 backend schema 部署均显示 Done。
- [x] 平台 Operations/Usage/Audit/Failures 最新复核 `8/8 PASS`，无页面错误、溢出或业务写入；证据 `docs/UAT_PLATFORM_OBSERVABILITY_ONLINE_2026-10-22_A4740FF.json`。
- [ ] runtime frontend/backend commit 仍为 null，不能完成源码与镜像 exact-SHA 绑定。

### 2026-10-22 Stock List Odoo 数据源迁移

- [x] Stock List 已从退役的 Classic POS `/api/stock-list` 和分类接口迁移到 Odoo `products` / `posCategories` 只读桥接；搜索、分类、库存筛选、分页、移动卡片和 Odoo CSV 导出继续可用。
- [x] Stock List 产品名与 Odoo list price 编辑改为调用 `/api/odoo/products/:id`，保留价格乐观并发校验；Odoo 未提供采购成本时显示为不可编辑，避免把缺失成本写成虚假数据。
- [x] Odoo records API 增加 `stockOnly` 校验和 `qty_available > 0` 过滤；产品更新桥接允许受控名称修改。
- [x] Node `24.19.0` typecheck、目标 ESLint、UAT 脚本 `node --check`、`git diff --check` 通过；库存定价响应式 fixture `15/15 PASS`，`blockedWrites=0`，且 `forbiddenLegacyRequests=[]`。证据：`docs/UAT_STOCK_LIST_ODOO_LOCAL_2026-10-22.json`。
- [x] 本批已部署并完成 Demo 只读验证；真实价格写入仍需隔离 Odoo UAT。线上导出按钮未在本轮触发下载，需后续单独验证大目录导出。

### 2026-10-22 `c031989` Stock List 部署后复验

- [x] Dokploy deployment `c031989a36554083d376984e4eb151cfa2b4de25` 显示 Done，构建完成；公开版本端点 frontend/backend runtime SHA 均匹配该提交。
- [x] Demo Stock List 390px/1440px 双视口 `2/2 PASS`：HTTP 200、标题可见、页面错误 0、无横向溢出、Odoo records 请求正常、旧 Classic Stock List/分类请求 `0`、业务写入 `0`；CSV 导出下载 `demo-products.csv` 通过。证据：`docs/UAT_STOCK_LIST_ODOO_ONLINE_2026-10-22_C031989.json`。
- [ ] Capped Pricing 仍为 `2/2 BLOCKED`，页面明确提示 Classic POS API 已退役；定价批次总计 `6 PASS / 2 BLOCKED / 0 FAIL`，后续需迁移 Odoo price list item 工作流。
- [x] **Current update:** Capped Pricing migration is now implemented on Odoo price-list rules (`e0e3bfc` through `2f63f0c`); the previous Classic POS statement above is historical.
- [x] Odoo pricing local fixture: `15/15 PASS`, `blockedWrites=0`, retired Classic requests `0`; online read-only pricing recheck `8/8 PASS` with no business writes.
- [ ] Demo currently has no Odoo price rules (`items=[]`), so real rule editing, concurrency conflict handling against a live rule, and POS effective-price impact remain data-blocked.
- [ ] Price Suggestions remains blocked by upstream Cloudflare `502`; AI OCR remains `410/41001`; live inventory AI report remains unavailable.
- [ ] Complete isolated business-write UAT, Java 21 backend gate, exact runtime SHA readback, cash close, procurement reconciliation, device and offline POS tests before changing pilot status from NO-GO.

## 2026-10-22 frontend reliability batch

- [x] Odoo records pagination now exposes `hasNext`; Stock List no longer guesses whether a full page is the final page.
- [x] Stock List, Capped Pricing and Odoo Bulk Price Edit expose clear search/filter controls with keyboard and aria support.
- [x] Odoo Bulk Price Edit uses the server `hasNext` signal for Next-page enablement.
- [x] Responsive fixture `15/15 PASS` across five viewports; no page errors, overflow, or business writes.
- [x] Odoo save failure/retry fixture `7/7 PASS`; all PATCH calls were intercepted locally and no real Odoo business data was changed.
- [ ] Online post-deploy verification of these changes and exact runtime SHA remains pending.
- [ ] Current online baseline is not the new batch: version endpoint is `c4585ad` vs source `91cd5e2`; pricing read-only baseline is `8 PASS / 2 BLOCKED`, with Capped Pricing blocked by the old retired path. Dokploy returned `301`, so post-deploy verification must wait for Source/Git binding correction.
- [x] Productization route fixture `31/31 PASS`: GST calculations are rounded to cents and price-suggestion pagination asserts the current 10-item page/continuation contract; all network calls intercepted, no live writes.
- [x] Odoo Bulk Price Edit action buttons (Refresh, Save, Previous, Next) have visible keyboard focus outlines; local productization fixture `12/12 PASS` including focus assertions. Evidence: `docs/UAT_PRODUCTIZATION_UI_LOCAL_2026-10-22_KEYBOARD_FOCUS.json`.
- [ ] The keyboard-focus batch has not yet been verified on the deployed Demo runtime; read `/api/public/version` after deployment.
- [ ] Deployment attempt for candidate `cfd6967` returned Dokploy webhook HTTP `301`; Demo remains on runtime `3edd72d84f514856923c0c0d50b01fe7b015e120`.
- [x] Platform Failures degrades gracefully when operational alerts are unavailable; local Audit/Failures fixture `4/4 PASS` across mobile and desktop, with zero writes. Evidence: `docs/UAT_PLATFORM_AUDIT_FAILURES_LOCAL_2026-10-22_ALERT-FALLBACK.json`.
- [x] Invoice preview availability and scan retry flow remain read-only; mock fixture passed with zero business writes. Evidence: `docs/UAT_INVOICE_SCAN_MOCK_2026-10-22_CURRENT.json`.
- [ ] Platform alert backend persistence/status actions are present in candidate `14b8d81`, but remain unverified because the Java 21 exact-SHA `mvn -B clean verify` gate has no recorded result.
- [ ] Candidate `f5a2948` is not present in Demo runtime; webhook returned HTTP `301` and `/api/public/version` remains `3edd72d84f514856923c0c0d50b01fe7b015e120`.
- [x] Stock List export/category retry controls have visible keyboard focus styles; responsive stock/pricing fixture `15/15 PASS`, five viewports, `blockedWrites=0`. Evidence: `docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-22_FOCUS-CONTROLS.json`.
- [ ] Current `main` is `a5511fc`, but Dokploy returned HTTP `301`; Demo frontend remains `3edd72d84f514856923c0c0d50b01fe7b015e120` and backend runtime is `null`.
- [x] Login, Manage Cash, Platform Operations and AI Usage primary/retry actions have visible keyboard focus styles; platform fixture `4/4 PASS`, and login 390px smoke passed.
- [x] Current Demo runtime table/accessibility read-only suite `14/14 PASS`; `unexpectedWrites=0`. Evidence: `docs/UAT_TABLE_A11Y_ONLINE_2026-10-22_CURRENT_RUNTIME.json`.
- [ ] Candidate `a37ef77` deployment returned HTTP `301`; Demo frontend/backend remain `3edd72d84f514856923c0c0d50b01fe7b015e120`.
## 2026-10-22 Dokploy 成功部署后复核

- [x] Demo 前后端运行 SHA 均为 `3edd72d84f514856923c0c0d50b01fe7b015e120`，与本地 `main` 一致；证据 `UAT_RELEASE_IDENTITY_2026-10-22_SUCCESS_RECHECK.json`。
- [x] 库存/定价四页 390/1440px 线上只读页面与布局检查：8 PASS、0 FAIL；业务 API 写入拦截数 0。证据 `UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-22_SUCCESS_RECHECK.json`。
- [ ] Capped Pricing 两个视口的数据验收仍阻断：门店未配置 Odoo price rules，页面显示空状态。不能将空状态计为真实规则、筛选或改价流程通过。
- [x] 同 SHA 助手自然问法 216/216 PASS；运营只读交互 13/13 PASS。助手 API 可能产生审计/usage 记录，但没有业务写入。
- [x] 本地未部署 UI 改进：Stock List 成本管理状态标签完整适配 320/390/768/1024/1440px，并提供完整屏幕阅读器说明；Odoo Bulk Price Edit 搜索清除按钮名称精确且有键盘焦点状态。库存/定价五视口 UI fixture 15/15，价格建议确认与失败恢复 fixture 12/12；证据 `UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-22_COST-LABEL-PASS.json`、`UAT_PRODUCTIZATION_UI_LOCAL_2026-10-22_BATCH_RECHECK.json`。
- [ ] 新 UI 改动尚未部署线上；当前 `3edd72d` runtime 不包含这些本地差异。
- [ ] AI Stock RPC 仍有 5 项 BLOCKED（测试公司/仓库查询无匹配行）；AI 实时库存报表、价格建议上游可用性及真实业务写入闭环未完成。
- [ ] 试点仍 NO-GO：跨租户授权、第二租户运营账号、备份恢复、设备现场验收以及隔离环境销售/退款/采购收货/库存/价格/关班对账尚未完成。

### 2026-10-23 AI assistant runtime verification

- [x] Demo frontend/backend runtime SHA `3edd72d84f514856923c0c0d50b01fe7b015e120` matches the source commit used by the UAT runner.
- [x] Complete assistant utterance catalog: `216/216 PASS`, `0 BLOCKED`, `0 FAIL`; representative smoke: `5/5 PASS`.
- [x] Assistant-only run issued zero sales, inventory, purchase, receiving, pricing or register writes. Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_FULL-216.json`.
- [ ] Real Odoo transaction acceptance and companion feature gaps remain separate release gates.
@@
### 2026-10-22 Settings Data focus consistency

- [x] Settings Data Retry, Remove sample data, Import products, Export products, and Download template controls now expose visible `focus-visible` outlines.
- [x] Local source accessibility evidence: `docs/UAT_SETTINGS_DATA_FOCUS_LOCAL_2026-10-22.json`; Node 24 typecheck, targeted ESLint, and `git diff --check` passed. No production build was run and no business write was issued.
- [ ] The broader authenticated Settings mobile script was attempted but stopped at an existing `/settings/users` mobile-card assertion timeout; this is a blocked regression check, not evidence against Settings Data.
- [ ] The focus batch is not online-verified. Demo `/api/public/version` must match the candidate SHA before claiming deployment.
### 2026-10-22 Settings Data deployment identity

- [x] Candidate `fb67f43` pushed to `origin/main`.
- [ ] Webhook returned HTTP `301` (`Branch Not Match`); no retry. Dokploy Source/Git binding must be checked before another deployment.
- [ ] Demo runtime remains `a5511fc...`; Settings Data focus changes remain local-only.
### 2026-10-22 Settings Users focus consistency

- [x] Settings Users roles retry, invite, copy-link, reset-link, mobile reset, and desktop reset controls now expose visible `focus-visible` outlines; all seven buttons retain 44px minimum touch sizing.
- [x] Local source evidence: `docs/UAT_SETTINGS_USERS_FOCUS_LOCAL_2026-10-22.json`; typecheck, targeted ESLint, and diff check passed. No production build or business write.
- [ ] Online verification remains pending. The prior Settings script was blocked by the old runtime's mobile user-card assertion; rerun after exact candidate SHA deployment.
### 2026-10-22 Roles and Permissions focus consistency

- [x] Roles & Permissions page retry, permission retry, mobile/desktop edit-delete, and role-editor Cancel/Save controls now have visible keyboard focus states.
- [x] Local source evidence `docs/UAT_SETTINGS_ROLES_FOCUS_LOCAL_2026-10-22.json`; typecheck, targeted ESLint, and diff check passed with no business writes.
- [ ] Online verification remains pending until the grouped Settings candidate is deployed with an exact runtime SHA.
### 2026-10-22 Core Settings focus consistency

- [x] Account Save, Payment Retry, Registers & Outlets Retry, and Tax Retry now expose visible keyboard focus states.
- [x] Local evidence `docs/UAT_SETTINGS_CORE_FOCUS_LOCAL_2026-10-22.json`; typecheck, targeted ESLint, and diff check passed with no business writes.
- [ ] These controls remain online-unverified until the grouped candidate reaches Demo with an exact runtime SHA.
### 2026-10-22 grouped Settings deployment status

- [x] Grouped Settings focus batch is pushed at candidate `0a1a19c`.
- [ ] Webhook returned HTTP `301` (`Branch Not Match`); no retry. Online UI verification is pending Dokploy Source/Git correction and exact SHA readback.
### 2026-10-22 Stocktake and cash workflow focus consistency

- [x] Manage Cash Retry and Stocktake/Express Stocktake recovery, clear, add, remove, and review actions now expose visible keyboard focus states.
- [x] Existing local Odoo Stocktake fixture passed all five viewports (`320/390/768/1024/1440`) with no overflow/page errors; count-boundary fixture passed `20/20`, with zero real business writes. Evidence summary: `docs/UAT_STOCKTAKE_CASH_FOCUS_LOCAL_2026-10-22.json`.
- [ ] Demo verification remains pending until Dokploy accepts the grouped candidate and `/api/public/version` matches its exact SHA.
### 2026-10-22 stocktake/cash deployment status

- [x] Candidate `3bc4b9f` pushed after the Settings and stocktake/cash batches were consolidated.
- [ ] Dokploy returned HTTP `301` (`Branch Not Match`) again; no retry. Online verification remains pending Source/Git correction and exact runtime SHA.
### 2026-10-22 Reports and utilities recovery focus consistency

- [x] Register closures, daily/weekly/monthly sales reports, Mail Log, Trashed Items, and Vendor Connections Retry actions now expose visible keyboard focus states.
- [x] Existing Clear search/Clear filters focus behavior remains intact. Local typecheck, targeted ESLint, and diff check passed; no business writes. Evidence: `docs/UAT_REPORTS_UTILITIES_FOCUS_LOCAL_2026-10-22.json`.
- [ ] These changes remain online-unverified until the Dokploy branch binding is corrected and exact runtime SHA is read back.
### 2026-10-22 reports/utilities deployment status

- [x] Candidate `876f8b3` pushed after the report/utility focus batch.
- [ ] Webhook returned HTTP `301` (`Branch Not Match`); no retry. Exact runtime SHA and online UI verification are pending.
### 2026-10-22 Entry and platform focus consistency

- [x] Signup wizard, Reset Password, Products menu/batch delete, Platform Stores retry, and Platform Audit search/clear/retry controls now expose visible keyboard focus states.
- [x] Local Platform Audit/Failures fixture passed `4/4` at 390/1440px; Product detail retry fixture passed with zero writes. Typecheck, targeted ESLint, and diff check passed. Evidence: `docs/UAT_ENTRY_PLATFORM_FOCUS_LOCAL_2026-10-22.json`.
- [ ] Demo verification remains pending exact runtime SHA deployment.
### 2026-10-22 entry/platform deployment status

- [x] Candidate `d2346f9` pushed after the entry/platform focus batch.
- [ ] Dokploy returned HTTP `301` (`Branch Not Match`); no retry. Online UI verification is pending.
### 2026-10-22 runtime identity and platform read-only recheck

- [x] Demo version endpoint now reports frontend/backend runtime `c905902f4020180095646cdeeaf638d78a0ded2d`; evidence `docs/UAT_RELEASE_IDENTITY_2026-10-22_C905902.json`.
- [x] Platform Operations, Usage, Audit, and Failures passed `8/8` read-only checks at 390/1440px with no page errors, overflow, or non-GET requests. Evidence: `docs/UAT_PLATFORM_OBSERVABILITY_ONLINE_2026-10-22.json`.
- [ ] Runtime does not match latest source `177eea3d`; Settings, stocktake/cash, reports/utilities, and entry/platform latest focus changes remain unverified online.
- [ ] Settings mobile suite still blocks at the old runtime's `/settings/users` mobile-card assertion; preserve this as a blocked regression rather than a Settings Data failure.
### 2026-10-22 Platform Store detail and Settings diagnostics

- [x] Platform Store detail status, trial, owner, Odoo, delete, and refresh controls now have visible focus states. Local evidence: `docs/UAT_PLATFORM_STORE_DETAIL_FOCUS_LOCAL_2026-10-22.json`.
- [x] Settings mobile UAT now emits a structured `BLOCKED` result instead of aborting when the deployed runtime lacks mobile cards/table headers. Runtime `c905902` produced 26 passed checks and 2 blocked users-layout checks; evidence: `docs/UAT_SETTINGS_MOBILE_2026-10-22_RUNTIME-C905902-BLOCKED.json`.
- [ ] The users layout gap remains online-unverified for the latest source until a matching runtime is deployed.
### 2026-10-22 platform detail deployment status

- [x] Candidate `1df9b718` pushed after Platform Store detail and Settings diagnostics work.
- [ ] Webhook returned HTTP `301` (`Branch Not Match`); no retry. Exact runtime SHA is still older than this candidate.
### 2026-10-22 runtime queue follow-up

- [x] Demo runtime advanced to `c941a617...`; this confirms deployment queue movement but not the latest application candidate.
- [ ] Current source/runtime alignment is still missing; Platform Store detail and later UI batches remain online-unverified.
### 2026-10-22 Platform detail pagination and closure detail focus

- [x] Platform Store detail owner-link copy and operation/setup pagination controls now have visible keyboard focus states.
- [x] Register closure detail Retry now matches the report-list recovery focus treatment.
- [ ] These latest UI changes remain online-unverified while Demo stays on an older runtime and Dokploy webhook returns `301`.

### 2026-10-22 deployment status recheck

- [x] Dokploy deployment was reported successful by the user.
- [x] Demo version endpoint readback: frontend/backend `e8cac11ea1284f57dcb5ff4c6d203011ba10b79d`.
- [ ] Current candidate `f4d4106488a3177f79c0584f350bc8e8120e5d82` is not the running SHA; latest Platform Store detail and Register Closure detail changes remain pending online verification.
- [ ] Next gate: confirm Dokploy source is `aishawn/aistore_pos`, branch `main`, root `/`, compose `docker-compose.yml`, then redeploy and read `/api/public/version` again before claiming acceptance.

### 2026-10-22 Price Suggestions focus batch

- [x] Candidate `f2e7d659` adds visible focus states to Price Suggestions refresh/retry, export, links, filters, explanation and pagination controls.
- [x] Local Price Suggestions fixture: `PASS`, `failed=0`, `writes=0` (`docs/UAT_PRICE_SUGGESTIONS_FOCUS_LOCAL_2026-10-22.json`).
- [x] Local stock/pricing responsive fixture: `15/15 PASS`, `blockedWrites=0` (`docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-22_CURRENT.json`).
- [x] Online old-runtime Settings recheck recorded `BLOCKED` users layout at 390/1440px, with no business writes (`docs/UAT_SETTINGS_MOBILE_2026-10-22_E8CAC11_RECHECK.json`).
- [ ] Online verification of `f2e7d659` remains pending exact runtime SHA.

### 2026-10-22 Price Suggestions push follow-up

- [x] Price Suggestions and documentation commits were pushed to `origin/main`; remote top was `7af1b7e0` at the time of verification.
- [ ] Demo `/api/public/version` still reports `e8cac11`; this batch is not post-deploy verified.
- [ ] Dokploy webhook cannot be retried from the current environment (`DOKPLOY_WEBHOOK_URL` missing; prior `301 Branch Not Match`). Source/Git binding correction is required.

### 2026-10-22 Close register and sales history focus batch

- [x] Candidate `bc33d480` adds visible focus states to close-register and sales-history recovery/receipt actions.
- [x] Typecheck, targeted ESLint, and diff check passed; no local production build or business write.
- [x] Old Demo interaction baseline: `10 PASS / 4 FAIL`; evidence `docs/UAT_INTERACTION_2026-10-22_OLD-RUNTIME-RECHECK.json`.
- [ ] Exact-SHA online verification remains pending; current Demo runtime is still `e8cac11`.

### 2026-10-22 exact-SHA deployment verification: e0a867b0

- [x] `/api/public/version` matched frontend/backend `e0a867b0387c7760c1dfc1bea9a5c374debb0930`; release identity `PASS`.
- [x] Pricing/stock read-only suite: `8 PASS / 4 BLOCKED / 0 FAIL`, `blockedWrites=0`; Price Suggestions passed 390/1440 layout checks.
- [x] Price Suggestions 390px DOM audit: no overflow and all visible page-content controls exposed `focus-visible` styling.
- [x] Interaction suite: `10 PASS / 4 FAIL`; failures are product catalogue, sales-history data, and replenishment loading timeouts, with no business writes.
- [ ] Complete sales-history and replenishment behavior coverage still requires populated Odoo read-only data; do not treat timeout results as UI focus regressions.

## 2026-10-22 客户、供应商与采购目录焦点批次

- [x] 客户目录错误 Retry、桌面联系方式、客户弹窗 Cancel/Submit 补充可见 `focus-visible` 状态。
- [x] 采购订单错误 Retry、移动端订单引用、收货弹窗 Go back/Refresh receipt status/Confirm receive 补充可见 `focus-visible` 状态。
- [x] 供应商目录错误 Retry 补充可见 `focus-visible` 状态；已有新增供应商弹窗动作保持一致。
- [x] Node 24 `npm run typecheck`、三文件定向 ESLint、`node --check` 和 `git diff --check` 通过；未运行 production build，未执行业务写入。
- [x] 当前公网目录只读回归：`44/44 PASS`，覆盖 320/390/1024/1440px、客户/供应商/商品搜索清除、AI 入口焦点陷阱和 Escape 恢复；证据：`docs/UAT_DIRECTORIES_ASSISTANT_ONLINE_2026-10-22_DIRECTORY-FOCUS.json`。
- [ ] 本批源码尚未取得匹配的 Dokploy runtime SHA；公网回归只作为旧 runtime 基线，不能标记为本批线上验收。
- [ ] 候选 `71318249` 的 Dokploy webhook 返回 `301 Branch Not Match`；Demo 仍为 `582b92fb`，需修正 Source/Git 后再部署验收。

## 2026-10-22 隔离业务闭环启动

- [x] 已确认 `aipos_uat` 隔离 Odoo 数据库存在，本地隔离变量一致。
- [x] 隔离销售/退款脚本通过数据库门禁后启动；因线上 Demo 登录超时在写入前停止，`sales=[]`、`refunds=[]`，业务写入为 0。证据：`docs/UAT_ISOLATION_WRITE_2026-10-22.json`。
- [ ] 需要独立 UAT runtime 同时证明 `aipos_uat`、admin 登录和候选 exact SHA 后，才能继续销售、退款、采购收货、库存、改价和关班写入验收。
- [x] 线上只读交互回归修正测试定位后为 `14/14 PASS`；覆盖导航、客户、商品、销售历史、补货和报表，业务写入为 0。证据：`docs/UAT_INTERACTION_2026-10-22_POST-DEPLOY-RECHECK-FIXED.json`。
- [ ] 该回归的 runtime SHA 仍未核验，版本接口仍为 `582b92fb`，不能作为 `76835aeb` 的线上发布证明。
## AI 助手自然问法回归

- [x] 265 条唯一用户问法目录，包含中英混合、收银员短句、日期/指标变体、能力问答、提示注入和执行型安全用例。
- [x] 新增侍酒推荐自然表达、自动下单能力问答和数量型补货执行拦截的源代码回归断言。
- [x] node --check、git diff --check 通过。
- [ ] 运行时回归、Java 21 exact-SHA 门禁和部署身份复核待完成；整体试点仍 NO-GO。
## 2026-10-22 当前回归批次

| 模块 | 当前结果 | 证据 | 业务写入 |
|---|---:|---|---:|
| 价格建议产品化与结果恢复 | 12/12 PASS | `UAT_PRODUCTIZATION_UI_LOCAL_CURRENT.json` | 0 |
| 报表 401/503 错误恢复 | 2/2 PASS | `UAT_REPORTING_ERROR_LOCAL_CURRENT.json` | 0 |
| 采购忙状态与失败恢复 | 40/40 PASS | `UAT_PURCHASE_BUSY_RECOVERY_LOCAL_CURRENT.json` | 0 |
| 补货供应商/RFQ 恢复 | 60/60 PASS | `UAT_REPLENISHMENT_SUPPLIER_RECOVERY_LOCAL_CURRENT_RECHECK.json` | 0 |
| 盘点数量边界 | 20/20 PASS | `UAT_STOCKTAKE_COUNT_BOUNDARIES_LOCAL_CURRENT.json` | 0 |
| 库存/定价响应式与 AI 入口 | 15/15 PASS | `UAT_STOCK_TABLES_RESPONSIVE_LOCAL_CURRENT_RECHECK2.json` | 0 |
| 平台 Audit/Failures | 4/4 PASS | `UAT_PLATFORM_AUDIT_FAILURES_LOCAL_CURRENT_RECHECK.json` | 0 |
| AI 助手 UI fixture | 2/2 PASS | `UAT_AI_UI_LOCAL_CURRENT.json` | 0 |

本批为本地 fixture/只读验证，不能替代 Dokploy exact-SHA 运行验证和 `aipos_uat` 真实业务闭环。生产销售、退款、采购收货、库存调整、改价和关班仍未执行。

## 2026-10-22 AI 助手面板可访问性批次（本地待部署）

- [x] 快捷操作按钮的 `aria-expanded` 与实际展开状态保持一致，并关联快捷操作容器。
- [x] AI 历史、刷新、返回、清空、CTA、快捷操作和卡片 CTA 补齐 `focus-visible` 键盘焦点反馈；历史列表增加可识别标签。
- [x] `pos-ui npm run typecheck` 通过；`npx eslint src/components/SellAiPanel.tsx` 通过；目标脚本语法检查通过。
- [x] 独立 tenant dev 实例 `http://demo.localhost:3200` 已恢复；AI 面板焦点/ESC/禁用态 `5/5 PASS`，价格产品化 `12/12 PASS`，库存/定价响应式 `15/15 PASS`，报表 401/503 恢复 `2/2 PASS`。
- [ ] AI 开启态快捷问法 fixture 在请求等待阶段超时，仍需修正测试契约后复验；这不影响上述禁用态和只读 UI 结果。
- [ ] 本批尚未运行 production build，尚未部署 Dokploy；部署前需与下一批 UI 改动合并并完成线上 390/1440px 复验。
- 证据：`docs/UAT_VERIFICATION_2026-10-22_CURRENT.json`。

## 2026-10-22 AI 路由候选基线

- [x] 当前目录 `287` 条；线上抽样 `2 PASS / 3 FAIL / 0 BLOCKED`，全部 Assistant API-only，业务写入 `0`。
- [ ] 失败集中于产品总数中文/英文变体和数值改价安全边界；运行时仍为旧 `582b92fb`，等待候选 exact-SHA 部署后复测。
- [ ] `pos-api` 候选仍需 Java 21 `mvn -B clean verify`；未通过前禁止推送或 Dokploy 部署。
- 证据：`docs/UAT_AI_GATES_2026-10-22_287_CURRENT-GOAL.json`。

## 2026-10-22 快速复验

- [x] 前端 `npm run typecheck`
- [x] 关键 UAT 脚本 `node --check`（4/4）
- [x] 线上 `/api/public/version` HTTP 200，记录 runtime SHA `582b92fb`
- [x] AI availability 3/3、capability gates PASS
- [ ] 完整 AI 问法回归：本轮超时中止，沿用最近完整证据，不新增通过结论
- [ ] Java 21 exact-SHA Maven gate、候选部署、部署后全量复验

## 2026-10-22 AI 写入安全边界修复

- [x] 明确写入问法（改价、补货、下单）返回 `unknown`，不带业务页 route。
- [x] 只读补货/价格建议导航逻辑保持不变。
- [x] 前端 typecheck、AI UAT 脚本语法检查、diff check。
- [ ] Java 21 `mvn -B clean verify` exact-SHA gate。
- [ ] Dokploy 部署后 9 条失败问法和完整 AI 目录线上复验。
- [x] 旧 runtime 安全边界定向复测已留证：`0 PASS / 9 FAIL / 0 BLOCKED`，无业务写入；该结果用于部署后对照。

## 2026-10-22 前端批次部署核验

- [x] 前端/UI 批次提交 `84d23803` 已推送。
- [ ] Dokploy webhook：`301 Branch Not Match`，未形成构建。
- [x] 线上版本探针仍为 `582b92fb`，因此本批尚未线上验证。
- [ ] 修正 Dokploy Source/Git 后再部署并重跑 UI/AI 只读验收。

## 2026-10-22 前端可访问性复验

- [x] AI Quick actions `aria-expanded` / `aria-controls` / controlled region。
- [x] AI disabled/focus fixture：`5/5 PASS`，五种视口。
- [x] 价格建议产品化 fixture：`12/12 PASS`，390/1440px。
- [x] TypeScript、定向 ESLint、脚本语法检查。
- [ ] Dokploy 线上 UI 验证，受 Source/Git `301 Branch Not Match` 阻断。

## 2026-10-22 最新前端提交

- [x] `e9c126e4` 已推送，前端 UI 和本地测试证据已纳入。
- [ ] 线上 `/api/public/version` 尚未出现 `e9c126e4`。
- [ ] Dokploy Source/Git 配置修正后重新部署和线上验收。

## 2026-10-22 后端 AI 安全边界整理

- [x] 清除 `writeRoute` 作用域错误。
- [x] 明确写入问法 `unknown + 空 route` 契约。
- [x] 更新 Java 测试断言和前端静态检查。
- [ ] Java 21 `mvn -B clean verify` exact-SHA gate。
- [ ] Dokploy 部署及线上 9 条安全问法复验。

## 2026-10-22 后端候选 `3a9c47da`

- [x] 清除 `writeRoute` 未定义引用。
- [x] 写入问法 `unknown + 空 route` 契约。
- [ ] Java 21 `mvn -B clean verify` exact-SHA gate。
- [ ] 推送、Dokploy 部署、线上安全问法复验。

- [x] 候选追加 `192fedb7`：目录问法规范化、隔离 UAT 登录重试和上下文探针。

## 2026-10-22 线上只读复验（当前 runtime）

- [x] AI availability：3/3 PASS；capability gates：PASS；surface/auth：11/11 PASS。
- [x] 库存/定价页面：8 PASS，2 BLOCKED；阻断项为实时数据不可用，不是 HTTP/布局失败。
- [x] 运营搜索竞态：390/1440px 均通过；错误恢复场景可见。
- [ ] 补货真实 Odoo 读接口返回 503，需恢复 Odoo 连接后复验。
- [ ] 所有结果来自线上旧 runtime `582b92fb`，当前候选 `2721e015e9f102abe1229b6ef0be0cfe78505ab0` 尚未部署。
- [ ] Java 21 exact-SHA gate、Dokploy Source/Git 修正、候选部署和 `aipos_uat` 真实业务闭环仍未完成。

## 2026-10-22 通用交互回归

- [x] 线上只读交互 `14/14 PASS`：移动导航、账户弹层、设置侧栏、商品搜索/编辑/导入保护、客户、销售历史、补货覆盖期、报表周期和 AI 面板。
- [x] 创建/导入/编辑场景均未提交业务写入，必填校验和取消路径通过。
- 证据：`docs/UAT_INTERACTION_2026-10-14.json`。

## 2026-10-22 b4719 runtime AI 复验

- [x] `/api/public/version` 前后端精确匹配 `b4719e7c51c2ffebdcd8b0916e7186480c55201d`。
- [x] 关键 AI 问法 `4 PASS / 2 FAIL / 0 BLOCKED`，业务写入 `0`；证据：`docs/UAT_AI_WORKFLOW_B4719_CURRENT_RECHECK.json`。
- [ ] “提交补货建议” route 与“供应商账单数量”报表问句仍有线上失败。
- [x] 本地候选 `a176a10747e1ec1a78477c2d8ea0dc8676a3c216` 已修复两类路由问题并补断言。
- [ ] 候选尚未通过同 SHA Java 21 gate、推送和部署；完整 290 条目录需在修复 runtime 上重跑。

## 2026-10-22 b4719 完整 AI 目录

- [x] 290 条 Assistant API-only：`251 PASS / 14 FAIL / 25 BLOCKED`，业务写入 `0`。
- [x] 14 个 FAIL 已对应到写入引导 route 和供应商账单报表边界；候选 `a176a107` 已完成修复。
- [ ] 25 个 BLOCKED 需在新候选 runtime 上复测，不能直接计为代码失败。
- 证据：`docs/UAT_AI_WORKFLOW_B4719_FULL_RECHECK.json`。

## 2026-10-22 设置员工目录错误态

- [x] 识别 `/api/users` HTTP 410 时的响应式结构缺口。
- [x] 移动端显示员工目录不可用状态卡，桌面端保留六列表头和 Retry，不伪造用户数据。
- [x] 前端 typecheck、定向 ESLint、diff check 通过；提交 `e990cc49`。
- [ ] 尚未部署；线上仍为 `b4719e7c`，需下一次集中 Dokploy 部署后复验 390/1440px。

## 2026-10-22 全路由静态矩阵

- [x] 138 条静态路由 × 390/1440px：`276/276 PASS`，无横向溢出、页面错误或失败路由。
- [x] 最新本地候选 `78488e6e` 已合并 AI CTA、结果卡片和 guided-action 回归批次。
- [ ] 候选仍待 Java 21 exact-SHA gate、推送和 Dokploy 部署；线上当前仍为 `b4719e7c`。
- 证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-15.json`。

## 2026-10-22 当前只读验收追加

- [x] 认证页面矩阵 `44/44 PASS`：核心 POS、库存、采购、客户、供应商、报表、设置、侍酒和发票路径可访问并满足页面内容契约。
- [x] AI 入口 UI：Checkout、Products、Customers、Reporting 均能打开/关闭助手；Overview 390px 无横向溢出。
- [x] Odoo session recovery：首次 reporting 请求未见 401；页面矩阵无未授权响应。
- [x] 角色 CRUD 默认安全门禁：线上矩阵显示 `SKIP_UNSAFE_WRITE_GATE`，本轮权限/业务写入 `0`。
- [ ] 线上 runtime 仍为 `b4719e7c`，当前候选 `d3ec7165` 尚未部署；Java 21 exact-SHA gate、完整 AI 目录和 `aipos_uat` 写入闭环仍未完成。

## 2026-10-22 AI 报表和路由追加

- [x] AI route matrix `9/9 PASS`，无页面错误、横向溢出或业务写入。
- [x] AI 报表只读检查 `15/16 PASS`，失败项 `0`；唯一 BLOCKED 为实时库存数据不可用。
- [x] 7 天无成交的明确空结果已纳入正确测试契约，不再要求虚构 rows。
- [ ] 新候选尚未部署；Java 21 exact-SHA gate、source-matched AI 完整目录和 `aipos_uat` 业务闭环仍未完成。

## 2026-10-22 AI UI 专项追加

- [x] AI UI 390px/1440px：`2/2 PASS`。
- [x] 侍酒推荐卡片、酒标识别结果、助手可用性、发送按钮、底部安全间距和 pageErrors 均通过。
- [x] 该轮为 authenticated read-only，业务写入为 `0`。
- [ ] 仍需在候选部署后执行 source-matched UI 验收。

## 2026-10-22 AI 定向问法追加

- [x] 7 条高风险问法回归：`3 PASS / 4 FAIL / 0 BLOCKED`，Assistant API-only，业务写入 `0`。
- [x] 失败已定位为旧 runtime 与源码 SHA 不匹配导致的路由差异，不作为当前候选的最终结论。
- [ ] 候选部署后必须重跑补货、调价、采购三类人工复核路径，并确认旧 runtime 的 4 个差异归零。

## 2026-10-22 提交前静态门禁

- [x] 前端 typecheck、AI 面板定向 ESLint、关键 UAT 脚本语法和 diff check 通过。
- [ ] 后端 exact-SHA Java 21 `mvn -B clean verify` 尚未完成，因此尚未推送或部署。

## 2026-10-22 AI provider 健康追加

- [x] DashScope generation endpoint：HTTP 200、有文本响应、约 807ms。
- [x] 健康探针不记录响应正文或密钥，业务写入 `0`。
- [ ] 仍需候选 source-matched 部署和 `aipos_uat` 隔离证明。

## 2026-10-22 最新 AI 功能矩阵

- [x] AI feature matrix：`14 PASS / 1 BLOCKED / 0 FAIL`。
- [x] Invoice OCR HTTP 410 已记录为 route deprecated，不宣称 OCR 可用。
- [x] Transcription：`2 PASS / 2 BLOCKED / 0 FAIL`，阻断为缺少 synthetic audio fixture。
- [ ] 最新候选 `bc4159c3` 仍待 Java 21 exact-SHA gate、Dokploy 部署和 source-matched 回归。

## 2026-10-22 全静态页面矩阵

- [x] `138` 路由 × `390/1440px`：`276/276 PASS`，失败和 expected unavailable 均为 0。
- [x] 核心 POS、运营、报表、设置、平台和 AI 页面均通过静态可达性与布局检查。
- [ ] 当前候选已推进至 `d7ae6395`，仍待 Java 21 exact-SHA gate、Dokploy 部署和线上 source-matched 验收。

## 2026-10-22 d7ae 静态门禁

- [x] 前端 typecheck、AI 面板 ESLint、feature/transcription 脚本语法和 diff check 通过。
- [ ] `d7ae6395` 的 Java 21 exact-SHA Maven gate 尚未完成，尚未推送或部署。

## 2026-10-22 d7ae AI 功能矩阵复跑

- [x] 当前候选关联只读矩阵：`14 PASS / 1 BLOCKED / 0 FAIL`。
- [x] 唯一阻断为已废弃的 invoice OCR 路由，其他 AI/NLQ/侍酒/价格/补货/匿名鉴权检查通过。
- [ ] 仍需 Java 21 门禁和部署后 source-matched 复验。

## 2026-10-22 库存/定价响应式 fixture 回归

- [x] Stock List、Capped Pricing、Bulk Price Edit：`5` 个视口 × `3` 个页面，`15/15 PASS`。
- [x] 无横向溢出或页面错误；筛选、移动卡片字段、桌面列对齐及 AI 面板入口通过。
- [x] Fixture 拦截业务写请求，写入为 `0`。证据：`UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-22_RECHECK3.json`。
- [ ] 仅为本地 UI/fixture 验证，不代表线上 runtime 或真实 Odoo 业务验收。

## 2026-10-22 AI 双语语音转录回归

- [x] 转录探针使用仓库内固定英文/中文 WAV 夹具，默认可复现，无需手动提供音频路径。
- [x] 英文、中文转录均 HTTP 200 且通过关键词断言：`4 PASS / 0 BLOCKED / 0 FAIL`；未提交助手请求或业务写入。
- [x] 脚本 `node --check` 通过。证据：`UAT_AI_TRANSCRIPTION_2026-10-22_FIXTURE-DEFAULT-RECHECK.json`。
- [ ] 线上前后端仍是 `b4719e7c`；该回归不证明候选 `d7ae6395` 的部署状态。
## 2026-10-23 AI 卡片 UI 与路由边界验收

- [x] 7 种卡片场景 × 5 个视口（320/390/768/1024/1440px）：**35/35 PASS**，覆盖客户创建、商品编辑、收货、价格保存、legacy 商品计数、legacy 侍酒 generic CTA 和外部 URL 拒绝。
- [x] 正常 CTA 点击前不导航、点击后到达正确业务页；外部 CTA 不渲染且页面停留在 Overview。无横向溢出及浏览器 page error；fixture 拦截所有 API，业务写入 **0**。
- [x] 站内 URL/query/hash 保留，拒绝外站、协议相对 URL、反斜杠和控制字符。Node 24 单测 **12/12 PASS**、typecheck、定向 ESLint、脚本语法检查通过。
- [x] 目视检查 320px 与 1440px 截图，未见内容遮挡或布局溢出。证据：`docs/UAT_AI_CARD_UI_LOCAL_2026-10-23_CURRENT.json`；截图：`docs/screenshots/2026-10-23-ai-card-ui-local/`。
- [ ] 这只证明本地 UI fixture。Demo 旧 runtime AI strict card contract 为 0/9；待候选冻结、后端 exact-SHA Java 21 Maven gate、部署和 source-matched 线上复验。
- [ ] 定价成本/GST/毛利准确性、Demo 隔离写入门禁（仍 409 / `isolated=false`）及完整销售/退款/采购闭环仍未验收；不得对 Demo 执行业务写入。

## 2026-10-24 收银商品搜索与 AI 入口回归

- [x] `/register/odoo` 商品搜索：本地 Playwright fixture 验证输入即时显示、220ms 防抖只请求最终查询、旧慢响应不能覆盖新结果、清空后回到默认目录；均通过。
- [x] 320/390/768/1024/1440px 无横向溢出；header AI 入口可见，固定悬浮入口不再遮住底部 POS 操作。浏览器验收 **7/7 PASS**；截图复核通过。
- [x] Node **24.19.0** 单测 **19/19 PASS**、`tsc --noEmit`、Odoo register/AI placement 定向 ESLint、UAT `node --check`、`git diff --check` 均通过；未运行本地 build。
- [x] API fixture 截获所有请求，业务写入 0，浏览器 page error 0。证据 `UAT_POS_PRODUCT_SEARCH_LOCAL_2026-10-24.json`，截图 `docs/screenshots/2026-10-24-pos-search-race/`。
- [ ] 以上仅是本地 fixture 验证，不代表线上已部署或 Demo 业务验收；本轮未执行销售、结账或任何真实 Odoo 写入。

## 2026-10-23 Vendor Connections 响应式复验

- [x] 本地 fixture 在 320/390/768/1024/1440px 验证供应商连接页标题、供应商记录、移动列表/字段/操作、桌面表格、页面无溢出及无 JS 错误：**5/5 PASS**。
- [x] API 请求由 fixture 拦截，非 GET 写请求为 0；截图已抽查 390px，卡片内容和操作按钮清晰可见。证据：`docs/UAT_VENDOR_CONNECTIONS_RESPONSIVE_LOCAL_2026-10-23_CURRENT.json`；截图：`docs/screenshots/2026-10-23-vendor-connections-responsive/`。
- [x] Node `24.19.0` 前端单测 **19/19 PASS**、`tsc --noEmit` PASS、runner `node --check` 与目标 `git diff --check` PASS。
- [x] 实际路由 `page.tsx` 定向 ESLint PASS；runner 由 Node `--check` 验证（pos-ui ESLint 配置忽略仓库外部 scripts 路径）。本地 fixture 结果不代表线上 runtime、供应商服务端 CRUD 或真实 Odoo 业务验收。未运行本地 build。
- [x] 线上只读隔离门禁复验为 **BLOCKED**：`/api/odoo/uat-context` HTTP 409、`isolated=false`；前后端 runtime 均为 `0e4a48ea`，与源码 `e21a7943` 不匹配。证据：`docs/UAT_ISOLATION_WRITE_GATE_ONLINE_READONLY_2026-10-23_CURRENT-GOAL.json`；业务写入 0。
- [x] 线上 AI 卡片合约 **0/9 PASS、9/9 FAIL**：接口 HTTP 200，但结构化 CTA/引导卡片未满足当前协议；每项 `writeRequests=0`。证据：`docs/UAT_AI_CARD_CONTRACT_ONLINE_2026-10-23_CURRENT-GOAL.json`。由于 runtime/source SHA 不匹配，这只确认线上旧 runtime 状态，不裁定当前候选源码。
- [ ] 当前未冻结候选、未完成同 SHA Java 21 Dokploy Maven gate、未部署匹配 runtime；业务 UAT 继续等待隔离 attestation 通过。

## 2026-10-23 Odoo Supplier Directory 新增流程

- [x] `/suppliers/odoo` 本地 fixture 覆盖 320/390/768/1024/1440px，布局断点、空态、新增对话框尺寸、初始焦点、Escape 关闭与焦点恢复、无效邮箱拦截、重复 ABN 错误及表单保留、成功新增后的目录刷新、慢请求竞态、无结果及清除筛选恢复：**69/69 PASS**。
- [x] 手机供应商卡片电话/邮件操作可见；慢的旧搜索结果不能覆盖新查询结果；390px 与 1440px 截图已复核。新增 API 仅写入本地 fixture，其他非 GET 写请求 **0**，真实 Odoo 写入 **0**。证据：`docs/UAT_SUPPLIER_CREATE_LOCAL_2026-10-23_CURRENT.json`；截图：`docs/screenshots/2026-10-23-supplier-create-local/`。
- [x] Node `24.19.0` 前端单测 **19/19 PASS**、`tsc --noEmit`、`OdooSupplierDirectoryPage.tsx` 定向 ESLint、runner `node --check` 与目标 diff check 通过；未运行本地 build。
- [ ] 真实 Odoo 创建/重复 ABN 服务端行为和部署版本尚未验收；必须在隔离 attestation 通过的专用 UAT 租户验证。
- [x] 同批检查发现旧式供应商全字段表单 `/suppliers/new` 的悬浮 AI FAB 在 390px 遮挡 Contact 输入框。新建、编辑、分配供应商路由已改用顶栏 AI 入口；表单 390/1440px 本地 fixture **13/13 PASS**，AI launcher 仅在顶栏、Save 和输入项可见、空名称验证不发请求。截图已复核，API 写入 0：`docs/UAT_SUPPLIER_EDITOR_LOCAL_2026-10-23_CURRENT.json`、`docs/screenshots/2026-10-23-supplier-editor-local/`。
- [x] AI 入口路由单测现 **20/20 PASS**；`tsc --noEmit`、入口/供应商组件定向 ESLint、供应商 create/editor runner `node --check` 和目标 diff check 通过。未运行本地 build。
# AI 商品查找回归增量（2026-10-24）

- [x] 库存和商品搜索同时支持商品名、barcode、SKU/default_code
- [x] 查询保留 active、company 和库存范围约束
- [x] 无商品标识追问，不猜库存；具名无匹配与上游不可用分开表达
- [x] Java 回归覆盖 OR domain、barcode/SKU 输出和零业务写入契约
- [ ] 候选 SHA 通过 Dokploy Java 21 exact-SHA `mvn -B clean verify`
- [ ] 匹配 runtime 部署后重跑线上库存问法矩阵

## 2026-10-24 导航、Price Lists 与全站路由复验

- [x] 当前 HEAD `10083bc8`、dirty worktree：正式静态路由 **143 页 × 390/1440px = 286/286 PASS**；全部 HTTP 200，无 page error、横向溢出或固定 AI 按钮遮挡。发现旧扫描器漏识别 `Open Orithos AI assistant` 的固定悬浮入口，已修正后重跑完整矩阵；API 使用 fixture，拦截业务写请求 0。报告：`docs/UAT_LOCAL_STATIC_ROUTE_MATRIX_2026-10-24-HEAD-10083BC8.json`。
- [x] 导航点击专项 **9/9 PASS**：`/assistant` 桌面侧栏持续可见并高亮；Customer 菜单包含 Customers、Customer Groups、Price Lists、Balances、Gift Cards；桌面跳转和 390px 移动抽屉打开/导航后自动关闭均通过。报告：`docs/UAT_SIDEBAR_NAVIGATION_LOCAL_2026-10-24_HEAD-10083BC8.json`。
- [x] Price Lists 空态 screenshot 复核通过：按真实端点契约返回 `{items:[], limit, offset, hasNext:false}`，页面显示“No price lists found”，未出现错误横幅。截图：`docs/screenshots/2026-10-24-sidebar-navigation-head-10083bc8/`。
- [x] Price Lists 管理 **24/24 PASS**（390/1440px）：上游失败重试、名称筛选、必填校验、创建失败保留输入并成功重试、重命名、归档后保留记录、无横向溢出/浏览器异常。8 次模拟 POST/PATCH/DELETE 仅由本地 fixture 接收。截图复核发现归档行 Edit 被悬浮 AI 按钮遮挡；`/pricelists` 已改为顶栏 AI 入口。回归报告：`docs/UAT_PRICELISTS_LOCAL_2026-10-24_HEAD-10083BC8.json`。
- [x] 修复后的 `/pricelists` 路由遮挡专项 390/1440px **2/2 PASS**：`docs/UAT_PRICELISTS_ROUTE_LAYOUT_LOCAL_2026-10-24_HEAD-10083BC8.json`。
- [ ] 上述结果来自本地 dev server 与 fixture，不证明线上 runtime；本地未 build。现有 `pos-api` dirty 修改须先通过 exact-SHA Dokploy Java 21 `mvn -B clean verify`，不能把当前混合工作树直接部署。

## 2026-10-24 价格建议 GST 与批量改价跳转验证

- [x] 修正 Price Suggestions UAT fixture，使其符合 Odoo 10% 含税标价和“未含 GST 净销售额毛利”口径：成本 `$10`、当前含税标价 `$12`、目标毛利 `30%`，建议含税货架价 `$15.75`、建议净价 `$14.32`、GST `$1.43`、净毛利约 `30.17%`。
- [x] Node `v24.19.0` Playwright **33/33 PASS**：价格建议筛选/空态/CSV、完整批量改价 deep link（`productId=101&suggestedPrice=15.75&expectedPrice=12`）、SKU 搜索预填、Odoo 当前价匹配后新价格预填 `$15.75`，以及 320/390/768/1024/1440px 响应式和 AI 入口。
- [x] API 请求均由本地 fixture 接管，价格写入 **0**。截图抽查 390px 与 1440px，无横向溢出或内容遮挡。报告：`docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-24-GST-DEEP-LINK.json`；截图：`docs/screenshots/2026-10-24-price-suggestions-gst-deep-link/`。
- [ ] 此为本地 fixture，不证明真实 Odoo 商品税配置、实时销售/成本数据、线上部署或 POS 价目表生效；隔离租户业务门禁通过后再进行真实数据验收。未运行本地 build/Maven、未部署。
