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
