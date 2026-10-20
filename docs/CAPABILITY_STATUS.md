# Orithos POS — capability status

**Last updated:** 2026-10-20（根 `app` 路由矩阵与共享移动安全区批次）

### 2026-10-20 Sommelier Odoo 租户上下文批次（工作区）

- Sommelier 的 Odoo 目录读取现在按租户 vendor 绑定传递 company/warehouse context；未 ready 或未绑定时 fail-closed，避免跨店目录/库存混入。未配置 Odoo 时保持只读 legacy fallback。
- 新增 Odoo context 和 tenant-aware catalog 测试；前端 typecheck、AI UAT 脚本语法、diff check 通过。Java 21/Maven、线上多店隔离和实际 warehouse 数量仍未验收。

### 2026-10-20 AI 日志与错误码脱敏批次（工作区）

- AI 分类、NL2SQL、报表查询、配额、Odoo catalog、快照和 sommelier fallback 日志移除原始问题、SQL、参数、provider/DB 异常文本，只保留异常类型及必要的 outlet/intent/fallback 信息。
- guard、查询和 quota 状态改为固定错误码，响应层保持通用安全提示；未改变 AI 查询权限、租户绑定或只读策略。
- 源码静态扫描与 `git diff --check` 通过；未运行 Maven/Next/Docker build，当前能力仍需 Dokploy 构建和线上 AI 回归确认。

### 2026-10-20 Dokploy #38 编译错误复核

- #38 的后端失败来自旧源码快照：两个控制器调用 `AiProviderConfig.isValidBaseUrl(...)` 时缺少显式 import。当前 `main`/`origin/main` 为 `c559db2`（最近运行时代码 `c559db2`，包含 `a5c8523`），类文件已被 Git 跟踪且两个 import 均存在。
- `Parenthesis` deprecated 只是非阻断警告。遵守验证约束，本地未运行 Maven、Next 或 Docker build，因此当前提交仍没有新的构建通过证据。
- 发布保持 **NO-GO**，直到 Dokploy 控制台确认使用当前提交构建成功、frontend/backend 健康并回读运行 SHA。此前 webhook 的 `HTTP 301 Branch Not Match` 仍需先通过 Source/Git 分支绑定修复。

### 2026-10-20 Odoo 报表数据源改造（`1ea5e18`）

- AI 报表改为绑定租户 Odoo company 的只读查询，补充服务层/日期解析测试和 `AI_ASSISTANT_TEST_MATRIX.md`；不允许写入 Odoo。
- 脚本语法检查通过，但未运行 Maven；线上报告对账尚未验证。已知边界：当前日期解析与 Odoo context 使用 `Australia/Sydney`，Demo company 为 `Australia/Adelaide`，需完成 company timezone 对齐。
- `4748590` 已推送，但 webhook 仍返回 `HTTP 301 Branch Not Match`，Odoo 报表改造尚未获得线上镜像验证。

### 2026-10-20 AI 麦克风策略回归补充

- Hold to speak 的同源麦克风策略已在 `caccb74` 放开；AI UI UAT 增加 `Permissions-Policy` 响应头断言。
- 本地脚本语法和 diff check 通过；线上登录失败，待 Dokploy 正常部署后复测真实响应头和语音状态。

### 2026-10-20 Dokploy 分支阻断排查

- 仓库远端当前仅有 `main`；控制台未认证时只能返回登录壳，无法独立读取 Compose Source/Git 设置。
- `DEPLOYMENT.md` 已补充 `HTTP 301 Branch Not Match` 的排查、普通 Deploy 和运行 SHA/日志/健康证据要求；线上发布仍保持 **NO-GO**。

### 2026-10-20 AI 语音键盘交互批次（工作区）

- Hold to speak 支持键盘按下/释放和失焦停止，按钮状态补齐 `aria-pressed`；AI UI UAT 脚本兼容新旧按钮文案且不启用真实麦克风。
- 本地 typecheck、目标 ESLint、脚本语法检查通过；本次公网 AI UI 尝试因登录失败未产生有效线上证据，待 Dokploy 分支修正和认证恢复后复测。
- `72d56da` 已推送，但 webhook 仍返回 `HTTP 301 Branch Not Match`，语音键盘交互尚未获得线上镜像验证。

### 2026-10-20 全站 Loading 状态语义批次（工作区）

- 平台、促销、关班、设置、盘点、供应商连接和现金管理页面的 loading status 已统一补齐 live-region/busy 语义；静态扫描无遗漏。
- 本地 typecheck、目标 ESLint、diff check 通过；与前两批工具/报表修复合并，待下一次 Dokploy 部署后验证真实 DOM。
- `3367c52` 已推送，但 webhook 仍返回 `HTTP 301 Branch Not Match`，全站 loading 语义尚未获得线上镜像验证。

### 2026-10-20 报表/设置 loading 状态语义批次（工作区）

- 报表 5 页和 Payment/Tax 设置页的异步 skeleton 状态已统一补齐 live-region 与 busy 语义，不改变读取和业务行为。
- 本地 typecheck、目标 ESLint、diff check 通过；与 Future Costs/Prices 修复合并等待下一次 Dokploy 部署后验证。
- 合并批次 `8758235` 已推送，但 webhook 仍为 `HTTP 301 Branch Not Match`，因此报表/设置新语义尚未完成线上验证。

### 2026-10-20 Future Costs/Prices 状态可访问性批次（工作区）

- Future Costs/Prices 的异步 loading 与错误 Retry 状态已统一补齐 live-region、busy、图标隐藏和键盘焦点语义；不改变只读接口和页面行为。
- 本地 typecheck、目标 ESLint、diff check 通过；尚未进入 Dokploy 镜像，需部署后补跑工具页与全站矩阵。
- `e291e61` 已推送，但 Compose webhook 仍返回 `HTTP 301 Branch Not Match`，因此线上仍未验证该批次。

### 2026-10-20 管理列表回归状态

- 管理列表只读专项已修正测试等待和 Platform Stores 创建入口断言：`docs/UAT_ADMIN_LIST_BATCH_2026-10-17.json` 当前为 `8/8 PASS`（390/1440，4 路由），业务写入 `0`。
- 产品页面不需要为该失败项改动；创建入口在未筛选空状态显示，筛选后显示清空筛选入口。脚本已分别验证两种状态。
- Dokploy #38 的 `AiProviderConfig` 编译错误不对应当前 `main`：类文件已被 Git 跟踪，两个控制器已导入。部署前仍须在 Dokploy 控制台确认 Compose 分支和构建上下文。
- `d8ed163` 已推送 `origin/main`；Compose webhook 返回 `HTTP 301 Branch Not Match`，没有构建，因此本批次线上状态仍为待部署。
- 合并远端后的 `14940f1` 再次触发 webhook 仍为 `HTTP 301 Branch Not Match`，线上状态仍为待部署。

### 2026-10-20 AI、报表与基础交互回归补充

- AI 管理员保护 `15/15`、AI 功能 `14/14`、订单 `16/16`、POS 对话框 `2/2`、stocktake 只读 `10/10`、报表和 Overview 竞态均通过，未产生业务写入。
- 管理列表此前的失败是脚本等待/状态断言问题，已通过 8/8 复测；无产品代码回归。

### 2026-10-20 登录页 SSR hydration 修复（待部署）

- 示例门店链接使用协议相对 URL，消除 HTTP/HTTPS 首帧属性差异。
- 本地 dev 浏览器检查 `hydrationErrors=0`；价格建议 `15/15`、库存响应式 `6/6` 通过，写入 `0`。
- 尚未部署到 Dokploy，需在分支修正后补做公网登录页检查。

### 2026-10-20 表单 Modal 防误关闭（待部署）

- 通用 `Modal` 默认不再因点击遮罩关闭，避免创建/编辑表单误触导致输入丢失；显式关闭按钮和 Escape 仍可用。
- typecheck、目标 ESLint、diff check 通过；需要在 Dokploy 修正分支后部署并补充遮罩点击/显式关闭回归。
- 集中提交为 `a145131`；Dokploy webhook 仍返回 `301 Branch Not Match`，当前没有新构建。

### 2026-10-20 定价/库存回归与路由脚本校正（`816c13b`）

- 价格建议 fixture UAT 已改为检查实际 `pos-ui/app` 路由，并在公网目标上 `15/15 PASS`；Stock/Capped/Bulk `6/6 PASS`，Vendor Connections `2/2 PASS`，均无业务写入。
- 发票扫描 mock 通过能力探测重试、OCR 重试和 preview-only 边界。
- 默认本地目标失败是因 `demo.localhost:3035` 未启动；公网 fixture 重跑通过。结果仅代表当前线上基线；包含 `816c13b` 的 webhook 仍返回 `301 Branch Not Match`，待 Dokploy 分支修正后需重新验证 `d34fa45`。

### 2026-10-20 管理页共享移动安全区批次（`d34fa45`，待部署）

- 标准 `AdminPageLayout` 在手机端统一为固定 AI 助手预留右侧安全区；`ListTable` 补齐表头/数据行 `aria-rowindex`。
- 本地 typecheck、目标 ESLint 和 diff check 通过，未运行 build。
- Dokploy webhook 返回 `HTTP 301 Branch Not Match`，未产生构建任务；公网效果必须在控制台修正 Compose 分支并部署 `d34fa45` 后验证。

### 2026-10-20 `2b5afbd` Supplier Directory 移动安全区与最终矩阵

- Odoo Supplier Directory 移动主内容区为固定 AI 助手和系统安全区预留右侧空间；桌面端保持原布局，读取与 Retry 行为不变。
- `docs/UAT_TABLE_A11Y_POST_2B5AFBD.json`：表格/表单 `14/14 PASS`，`unexpectedWrites=0`。
- `docs/UAT_ALL_STATIC_PAGES_POST_2B5AFBD_RETRY.json`：根 `app` 的 `134` 路由 × `390/1440` 为 `268/268 PASS`，HTTP、页面错误和横向溢出均为 `0`。
- `2b5afbd` 已推送并触发 Dokploy webhook；容器 SHA、完整构建日志、健康状态和完成时间尚未从控制台独立核验，发布仍为 **NO-GO**。

### 2026-10-20 Dokploy #38 编译错误结论

- 两个 `AiProviderConfig` 找不到符号是旧构建快照或错误 Compose 分支问题；当前 `main` 的两个控制器已有显式 import，类文件已跟踪。
- `Parenthesis` deprecation 只是 warning，不是失败原因。应在 Dokploy 控制台部署 `main` 的 `2b5afbd`（或更晚提交），并核验 backend/frontend SHA、完整构建日志和健康状态。
- 本地未运行 Maven/Next/Docker build；生产 AI 真实质量、硬件、隔离写入和正式财务流程仍未完成。

### 2026-10-20 Supplier Import 可访问性与移动安全区（`ba7a947`）

- Supplier Import 补齐 Supplier select、产品代码 textarea、错误和结果状态语义，并预留移动端 AI 助手右侧空间。
- 部署后全站 `268/268 PASS`，表格/表单 `14/14 PASS`，`unexpectedWrites=0`；部署切换窗口的短暂登录 404 在等待后恢复。

### 2026-10-20 Bulk/Capped Pricing 输入可访问性（`f07d251`）

- Bulk Price Edit switch 结构和价格输入名称已修复；Capped Pricing 当前价输入补齐产品名称。
- 公网 pricing `8/8 PASS`，表格/表单 `14/14 PASS`，`unnamedControls=0`、`unexpectedWrites=0`；证据见对应 `POST_F07D251` 文件。

### 2026-10-20 Price Suggestions 移动安全区与语义（`1181f30`）

- Price Suggestions 移动内容为固定 AI 助手预留右侧空间，解释按钮补齐展开语义。
- 公网 pricing 矩阵 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_POST_1181F30_FINAL.json` 为 `8/8 PASS`，`blockedWrites=0`；390px 截图确认首屏内容与 FAB 不相交。

### 2026-10-20 OCR 扫描失败重试（`87338a8`）

- 发票 OCR 失败后可直接重试同一文件，保留预览和编辑上下文；仍是 preview-only，不写入采购或收货。
- 公网 mock 回归 `docs/UAT_INVOICE_SCAN_MOCK_POST_87338A8.json`：`6/6 PASS`，首次故障/二次成功，业务写入 `0`。

### 2026-10-20 发票 AI 能力探测重试（`08b8e83`）

- 发票扫描页新增页面内 `Retry availability`，能力探测临时失败后可恢复上传；仍不创建供应商、采购单或收货。
- 线上 mock 回归 `docs/UAT_INVOICE_SCAN_MOCK_POST_08B8E83_FINAL.json` 为 `5/5 PASS`，业务写入 `0`。

### 2026-10-20 Stock List 移动右侧安全区（待部署）

- 移动 Stock List 内容区增加右侧安全区，降低固定 AI 助手遮挡产品卡片的风险；桌面布局不变。
- 部署前只读 pricing 回归 `docs/UAT_PRICING_PREDEPLOY_C73B324.json` 为 `8/8 PASS`，新增卡片/FAB 相交断言通过，`blockedWrites=0`；仍需部署后复验。

### 2026-10-20 `3da583e` 部署后回归

- Stock List 移动右侧安全区已在公网截图中生效；pricing/stock 只读专项 `8/8 PASS`，`assistantCardOverlap=true`，业务写入 `0`。
- 表格/表单 `14/14 PASS`、根 `app` 全站 `268/268 PASS`、AI availability `3/3 PASS`；证据分别为 `docs/UAT_TABLE_A11Y_POST_3DA583E.json`、`docs/UAT_ALL_STATIC_PAGES_POST_3DA583E.json`、`docs/UAT_AI_AVAILABILITY_POST_3DA583E.json`。
- 仍未从 Dokploy 控制台独立核验实际构建日志、运行容器 SHA 和健康状态；生产发布继续 **NO-GO**。
- 同批次盘点只读专项 `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_POST_3DA583E.json` 通过 `10/10`，非 GET 请求 `0`；发票扫描 preview-only mock `docs/UAT_INVOICE_SCAN_MOCK_POST_3DA583E.json` 为 `4/4 PASS`，未产生采购/收货写入。

### 2026-10-20 当前构建诊断与 Stock List 遮挡检测

- 当前 `main`/`origin/main` 为 `91ddfb9`；两个控制器的 `AiProviderConfig` 显式 import 和 `AiProviderConfig.java` 均已存在。Dokploy #38 的 `cannot find symbol` 属于旧源码快照或错误 Compose 分支，不需要重复修改 Java。
- `Parenthesis` deprecation 是非阻断 warning。需在 Dokploy 控制台确认部署 `91ddfb9`（或更晚提交），并独立回读构建日志、容器 SHA、健康状态和完成时间；在证据补齐前整体 **NO-GO**。
- Stock List 价格专项脚本已增加移动端 FAB 与可见产品卡片相交断言；现有截图仍显示遮挡风险，尚未验收为通过。

### 2026-10-20 Stock List 筛选与移动底部空间批次（工作区）

- 修正 `StockListPage` 的库存筛选 switch 结构，移除 label/button 嵌套；保留 `role="switch"`、`aria-checked` 和现有筛选请求行为。
- 自定义列表滚动区域增加浮动助手和系统手势条的底部安全空间；桌面表格与移动产品编辑卡片字段不变。
- 本地 typecheck、目标 ESLint、相关脚本语法和 diff check 通过；部署后需以公网 stock table 和全站只读矩阵验证实际效果。

### 2026-10-20 `da76894` Stock List 部署后回归

- Dokploy webhook 接受 `da76894`；价格/库存只读专项 `8/8 PASS`（4 页面 × 390/1440），表格/表单专项 `14/14 PASS`，全站根 `app` 矩阵 `268/268 PASS`。
- Stock List 移动卡片字段、筛选开关、分页/浮动助手底部空间均通过；所有专项无意外业务写入。
- 证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_POST_DA76894.json`、`docs/UAT_TABLE_A11Y_POST_DA76894.json`、`docs/UAT_ALL_STATIC_PAGES_POST_DA76894.json`。
- Dokploy 容器 SHA/构建日志/健康状态仍待独立核验；生产 AI 质量、实体硬件、隔离 Odoo 写入和正式财务流程仍未完成，整体 **NO-GO**。

### 2026-10-20 `dfc76d0` 部署后全站回归

- Dokploy webhook 接受 `dfc76d0`，公网根 `app` 矩阵 `268/268 PASS`（134 路由、390/1440），HTTP、页面错误和横向溢出均为 `0`；证据 `docs/UAT_ALL_STATIC_PAGES_POST_DFC76D0.json`。
- Stocktake、发票预览、表格/表单和 AI availability 专项均通过：分别见 `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-20_POST-DFC76D0.json`、`docs/UAT_INVOICE_SCAN_MOCK_2026-10-20_POST-DFC76D0.json`、`docs/UAT_TABLE_A11Y_POST_DFC76D0.json`、`docs/UAT_AI_AVAILABILITY_POST_DFC76D0.json`。
- 表格专项拦截的 4 个 Odoo records POST 是只读 RPC，未发现业务写入；AI 本轮仅验证 capability/composer，没有提交模型请求。
- Dokploy 容器 SHA、构建日志和健康状态仍未独立核验；生产 AI 质量、硬件、隔离 Odoo 写入和正式财务流程仍未完成，整体状态 **NO-GO**。

### 2026-10-20 发票扫描预览移动安全区批次（工作区）

- `ScanInvoicePage` 的上传区域和 OCR loading 状态补齐可访问状态语义；底部 Odoo Purchases/Replenishment 操作预留手机安全区。
- 仍是 preview-only，不创建供应商、采购单、收货或库存调整；mock 浏览器证据 `docs/UAT_INVOICE_SCAN_MOCK_2026-10-20_SAFEAREA.json` 为 `PASS`，业务写入为 `0`（扫描请求由 fixture 拦截）。
- 真实 provider OCR 证据 `docs/UAT_INVOICE_OCR_PREVIEW_ONLINE_39E0DC8.json` 已验证供应商、发票号、日期、行项目和总额字段；真实收货闭环仍未验收。
- 本地 typecheck 和目标 ESLint 通过，未运行 build；部署后需补 390/1440 上传/错误/预览和 safe-area 公网回归。

### 2026-10-20 Odoo Stocktake 搜索可访问性批次（工作区）

- 真实入口 `pos-ui/app/stock/stocktake/page.tsx` 现在为产品搜索提供 combobox/listbox/option 语义、加载状态和结果关联；数量输入在桌面/移动布局均有稳定可访问名称。
- 业务逻辑不变：仍以 Odoo 为库存来源，`Review and apply` 受 `writeEnabled`、数量边界和 variance 保护；本次没有新增或执行库存写入。
- 本地 `npm run typecheck`、目标 ESLint、相关脚本 `node --check` 和 `git diff --check` 通过，未运行 build。
- 公网只读基线 `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-20_BASELINE.json`：`PASS`；管理员/Odoo 会话/库位读取、390/1440 布局均通过，非 GET 请求 `0`。`deploymentShaVerified` 尚未核验。
- `ca5991a` 已经由 Dokploy webhook 接受并出现在公网行为中；增强版 post-deploy 只读回归 `PASS`，证据 `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-20_POST-CA5991A_RETRY.json`。首次结果只是等待不足导致的测试误报，已修正为等待 `aria-busy` 结束。
- Post-deploy 回归覆盖管理员/Odoo 会话、库位读取、390/1440 布局、combobox/listbox 语义和非 GET 请求 `0`；Dokploy 容器 SHA/完整构建日志仍待控制台独立核验，整体发布继续 **NO-GO**。
- Demo 保持 `writeEnabled=false`；在获批隔离 Odoo 租户完成 stocktake 写入验收前，不把库存调整标记为已完成。

### 2026-10-20 Dokploy #38 编译结果（最新）

- #38 的阻断错误是 `AiConfigController.java` 和 `SommelierController.java` 找不到 `AiProviderConfig`；`Parenthesis` 弃用提示只是 warning。
- 当前 `main`/`origin/main` 为 `50ac59e`，包含 `ea8f1b6` 的显式 import 修复，且 `AiProviderConfig.java` 已被 Git 跟踪。当前源码不需要重复修改 Java 控制器。
- #38 应视为修复前源码快照或错误 Dokploy 分支的构建结果。需在控制台选择 `main` 的 `50ac59e`（或更晚提交）重新部署，并回读 Maven/Next 构建日志、frontend/backend 容器 SHA、健康状态和完成时间。
- 在 Dokploy 证据独立核验前，发布状态继续为 **NO-GO**；本地未运行 Maven/Next build。

### 2026-10-20 根 `app` 真实路由矩阵与共享移动安全区（工作区）

- 代码已提交并推送为 `ca0041b`；本次集中批次包含路由 UAT 修正、共享管理壳层/POS 移动安全区和 Media Centre 无障碍改进。
- 修正 `pilot-all-static-pages-uat.mjs` 的扫描根目录：Next.js 在根目录同时存在 `app` 与 `src/app` 时使用 `pos-ui/app`；两棵树有 96 个文件不同，旧脚本可能验证到非生产入口。
- 线上只读矩阵按根 `pos-ui/app` 收集到 `134` 路由 × `390/1440` = `268/268 PASS`；HTTP、页面错误和横向溢出均为 `0`。证据：`docs/UAT_ALL_STATIC_PAGES_ROOT_APP_ONLINE_2026-10-20.json`。该证据对应运行时旧镜像，不能替代 Dokploy SHA 核验。
- `AdminPageLayout` 的移动底部空间和 `AdminActionFooter` 的表单底栏加入 `safe-area-inset-bottom`，覆盖订单、采购、客户、库存等共享管理页面，减少手势条/浮动 AI 按钮遮挡。
- Media Centre 的文件搜索框补齐可访问名称，媒体目录补齐 `nav` 标签；媒体存储仍未接入，未新增虚假上传功能。
- POS 收银台底部支付/Finalize 区域也加入手机安全区；线上只读 POS 对话框回归 `2/2 PASS`（390/1440，帮助弹层、Escape、Sales Keys/Parked 键盘切换），证据：`docs/UAT_POS_DIALOG_2026-10-17.json`。该证据仍对应已部署旧镜像。
- 本地 `npm run typecheck`、目标 ESLint、UAT 脚本 `node --check` 和 `git diff --check` 通过；未运行 build。Dokploy 部署和变更后的线上 DOM 复验待分支修复后执行。
- 推送后手动调用 Dokploy webhook 仍返回 `HTTP 301 {"message":"Branch Not Match"}`，没有启动构建；需控制台修正 Compose 分支为 `main` 后再手动 Deploy `ca0041b`。

### 2026-10-20 Dokploy #38 复核（`d3aa74b`）

- 当前 `main` 与 `origin/main` 均为 `d3aa74b2f493ae15ddbe23e79c6a40fba83e1fcf`；该提交包含 `ea8f1b6` 的两个显式 `AiProviderConfig` import，且 `AiProviderConfig.java` 已被 Git 跟踪。#38 中两个 `cannot find symbol` 因此来自旧源码快照，当前源码不需要重复修改。
- `AiProviderConfigTest` 已覆盖合法 HTTPS host、禁止 `/api/v1`、禁止非本地 HTTP、查询参数和非法 URL；`git diff --check` 通过（仅有历史文档换行提示）。
- 对提供的 Dokploy compose webhook 发送 POST（含 `main`、`refs/heads/main` 和完整 push payload 变体）均返回 `HTTP 301 {"message":"Branch Not Match"}`，没有启动新构建。需在 Dokploy 控制台把 Compose Git 分支/Watch 配置核对为 `main`，或直接手动 Deploy 当前 `d3aa74b`。
- `SqlAst.java` 的 `Parenthesis` 弃用提示仍是 warning，不是阻断错误。Dokploy backend/frontend 容器 SHA、完整构建日志、健康状态和完成时间仍未核验，发布继续 **NO-GO**。

### 2026-10-20 根路由树校正与只读回归（`0477edc`）

- 已确认 Next.js 生产入口为 `pos-ui/app`；`pos-ui/src/app` 不应作为线上路由证据来源。后续页面优化和 UAT 路由收集以根 `app` 为准。
- 只读回归汇总：表格/表单 `14/14`、管理列表 `8/8`、AI availability `3/3`、AI surface `11/11`、AI UI `2/2`，意外业务写入 `0`。证据：`docs/UAT_READONLY_REGRESSION_2026-10-20_0477EDC.json`。
- 生产 AI 模型质量、真实硬件、写入型 Odoo 验收和 Dokploy 容器身份仍未完成，发布保持 **NO-GO**。

### 2026-10-20 第三批占位数据清理（`e506619`）

- Barcodes、Customer Utilities、Product Utilities、Transfer List 不再展示伪造产品/客户/位置或假操作按钮；页面明确未接入边界，并提供真实导航入口。
- 本地登录态全站矩阵 `268/268 PASS`，证据：`docs/UAT_ALL_STATIC_PAGES_LOCAL_2026-10-20_THIRD-BATCH.json`，源码提交 `e506619`。
- 公网回归和 Dokploy 构建身份待本批次部署后补充，发布继续 **NO-GO**。
- `9028419` 公网验证：全站 `268/268 PASS`，九页实际内容/控件专项 `18/18 PASS`，业务写请求 `0`。证据：`docs/UAT_ALL_STATIC_PAGES_ONLINE_2026-10-20_THIRD-BATCH.json`、`docs/UAT_ACTIVE_ROUTE_HONESTY_ONLINE_2026-10-20_9028419_FINAL.json`。
- 公网行为通过不等于 Dokploy 容器身份已核验；`deploymentShaVerified=false`，发布继续 **NO-GO**。

### 2026-10-20 第二批假数据清理（`0a06dec`）

- Registers & Outlets 现在显示 Odoo companies/registers，只读且带 session 错误恢复；Security Centre 不再展示伪造事件/图表，改为明确未接入状态和真实设置入口。
- 本地登录态全站矩阵 `268/268 PASS`，证据：`docs/UAT_ALL_STATIC_PAGES_LOCAL_2026-10-20_SECOND-BATCH.json`，源码提交 `0a06dec`。
- 线上专项待本批次部署后执行；Dokploy 容器 SHA、构建日志和健康状态仍待独立核验，发布继续 **NO-GO**。
- `922ff93` 公网回归：全站 `268/268 PASS`，五页语义/控件专项 `10/10 PASS`；Registers 只读 Odoo RPC 正常，未发生业务写入。证据：`docs/UAT_ALL_STATIC_PAGES_ONLINE_2026-10-20_SECOND-BATCH.json`、`docs/UAT_ACTIVE_ROUTE_HONESTY_ONLINE_2026-10-20_922FF93_RETRY.json`。
- 公网证据仍未独立绑定 Dokploy 容器 SHA，不能把它当作构建审计结论。

### 2026-10-20 实际路由只读页面对齐（`dc77293`）

- Promotions、Favourite Reports、Media Centre 的 `src/app` 入口已移除误导性的静态创建/筛选/上传控件，改为真实读取或明确未接入状态，并补齐移动布局和可访问语义。
- 登录态本地全站矩阵 `134 × 2 = 268/268 PASS`，无 HTTP 失败、页面错误或横向溢出。证据：`docs/UAT_ALL_STATIC_PAGES_LOCAL_2026-10-20_PROMOTIONS-MEDIA.json`，源码提交 `dc77293`。
- 目标 typecheck、ESLint 和 diff check 通过；未运行 build。线上 Dokploy 与公网回归待本批次部署后补充。
- `523e654` 批次触发后，公网全站矩阵 `268/268 PASS`，实际页面专项 `6/6 PASS`（Promotions、Favourite Reports、Media Centre × 390/1440）；非 GET 业务请求 `0`。证据：`docs/UAT_ALL_STATIC_PAGES_ONLINE_2026-10-20_DC77293.json`、`docs/UAT_ACTIVE_ROUTE_HONESTY_ONLINE_2026-10-20_523E654_RETRY.json`。
- 这些证据的 Dokploy 运行身份仍未独立核验，发布结论继续为 **NO-GO**。

### 2026-10-20 Dokploy #38 构建失败诊断（更新）

- 构建日志中的两个 `AiProviderConfig` 编译错误来自旧源码快照：当前 `main`/`origin/main` 为 `0ceb21f`，且已包含 `ea8f1b6` 的显式 import 修复及 `AiProviderConfig.java`。
- `SqlAst.java` 的 `Parenthesis` deprecation 是 warning，不是阻断错误；当前源码检查已确认两个控制器引用可解析。
- Dokploy 尚未提供 `0ceb21f` 的可审计构建完成记录。需在控制台确认 Compose 分支为 `main` 并部署该提交，再回读 backend/frontend 容器 SHA、构建日志和健康状态。发布状态继续为 **NO-GO**。
- 对现有 webhook 发送包含 `ref=refs/heads/main` 的完整 push payload 返回 `HTTP 301 Branch Not Match`，本次没有启动新的构建；此前的 `HTTP 200` 记录不能替代当前 SHA 的控制台证据。

### 2026-10-20 响应式库存与供应商连接批次（本地）

- `StockListPage` 在 390px 改为可完整编辑的产品卡片，保留产品名、分类、价格集、库存、价格数量、成本、售价和利润字段；桌面端继续使用原十列表格。保存、blur 校验和错误提示逻辑不变。
- Vendor Connections 在 390px 增加移动卡片，保留 sender code、customer ID、Connected 状态以及 Edit/Delete 操作；1440px 继续使用桌面表格。
- 本地验证：`npm run typecheck`、目标 ESLint、两个 UAT 脚本 `node --check`、`git diff --check` 均通过；Stock List/Capped Pricing/Bulk Price Edit `6/6 PASS`，Vendor Connections `2/2 PASS`，页面错误 `0`，拦截业务写入 `0`。证据：`docs/UAT_STOCK_LIST_MOBILE_LOCAL_2026-10-20.json`、`docs/UAT_VENDOR_CONNECTIONS_RESPONSIVE_LOCAL_2026-10-20.json`。
- 该批次尚未由 Dokploy 运行镜像验证；部署前继续保持 **NO-GO**，部署后需回归 `/stock/list`、`/stock/capped-pricing`、`/stock/bulk-price-edit` 和 `/utilities/vendor-connections` 的 390/1440 只读布局及操作可见性。

### 2026-10-20 部署后验证与共享安全区修复

- `AdminPageLayout` 在手机端增加底部安全空间，确保滚动到列表末尾时固定 AI 助手按钮不会遮挡最后一行、分页或表单操作；初始视口中靠近右下角的中间内容仍可能与浮动按钮同屏，这是后续浮动助手定位优化项。
- `d350428` 部署后公网价格/库存回归 `8/8 PASS`，Stock List 390px 已按卡片字段验证，Capped Pricing 仍按横向表格验证；非 GET 业务请求 `0`。证据：`docs/UAT_PRICING_POST_D350428_RETRY.json`。
- 公网诚实化页面矩阵 `18/18 PASS`，覆盖 9 页面 × 390/1440，无横向溢出、页面错误或非 GET 请求。证据：`docs/UAT_ACTIVE_ROUTE_HONESTY_ONLINE_D350428.json`。
- 公网 Vendor Connections `2/2 PASS`；当前生产无连接数据，因此验证空状态、标题、无溢出、无页面错误和业务写入 `0`，不把空状态误报为移动卡片已被真实数据渲染。证据：`docs/UAT_VENDOR_CONNECTIONS_ONLINE_D350428.json`。
- 上述公网结果的 `deployment=unverified-after-deploy`；webhook 只证明 Dokploy 接收了部署请求，容器 SHA、完整构建日志和健康状态仍需控制台回读。整体保持 **NO-GO**。
- 全站静态矩阵在 `09b7997` 部署后复测：`134` 路由 × `390/1440`，`268/268 PASS`；HTTP 全部 200，无横向溢出或页面错误。证据：`docs/UAT_ALL_STATIC_PAGES_POST_09B7997.json`。该证据仍未替代 Dokploy 容器 SHA 回读。

### 2026-10-20 `854bf6a` 后线上只读复核

- 表格/表单 DOM 审计 `14/14 PASS`，覆盖用户、角色、AI Metrics、Odoo 产品、Stocktake、供应链和发票扫描的 390/1440 视口；页面错误和意外业务写入均为 `0`。证据：`docs/UAT_TABLE_A11Y_ONLINE_2026-10-20_POST-854BF6A.json`。
- AI availability `3/3 PASS`；当前 Demo client config 报告 `enabled=true`，AI composer 可用，未提交提示词。证据：`docs/UAT_AI_AVAILABILITY_2026-10-20_POST-854BF6A.json`。
- 两份证据均为 `deployment=unverified-after-deploy`；Dokploy webhook 对 `854bf6a` 返回 `301 Branch Not Match`，因此不能把公网行为归因于该提交，容器 SHA、构建日志和健康状态仍待控制台核验。整体保持 **NO-GO**。

### 2026-10-20 移动列表语义批次（`e187e7f` 工作区后）

- Future Costs、Future Prices、This Month Sales、Weekly Sales 的移动列表补齐 `list/listitem` 语义；未改变 Odoo 读取或任何业务写入。
- 全站静态矩阵 `268/268 PASS`（134 路由 × 390/1440），证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-20_PRE-DEPLOY.json`。
- 这批源码尚未被 Dokploy 运行镜像确认；webhook 仍返回 `301 Branch Not Match`，整体保持 **NO-GO**。

### 2026-10-20 工具列表第二批（工作区）

- Mail Log、Trashed Items 移动列表补齐 `list/listitem` 语义，加载 skeleton 增加 `aria-busy`；不改变邮件日志、回收项读取或筛选行为。
- typecheck、目标 ESLint、UAT 脚本语法和 diff check 通过；源码待下一次可审计 Dokploy 部署后复跑线上 DOM 回归。

### 2026-10-20 实际路由树对齐（工作区）

- Future Costs/Prices 的 `src/app` 页面改为复用已验证的只读客户端，并保留动态不缓存策略，避免历史 `revalidate` 冲突和无效的 New/Filter 控件。
- Trashed Items 搜索现在真正绑定并发送 `q`，Mail Log 搜索框有明确可访问名称；相关源码检查通过，线上验证待部署。

### 2026-10-20 `b058ef3` AI capability 与表单回归

- voice capability gate、AI Features `14/14`、AI Metrics `9/9`、AI UI `2/2` 和表格/表单 DOM `14/14` 均通过，业务/配置写入为 `0`。
- 供应链搜索清空断言通过；AI 汇总证据：`docs/UAT_AI_REGRESSION_ONLINE_BEC6D0B.json`，DOM 证据：`docs/UAT_TABLE_A11Y_ONLINE_FDD9C3_FINAL.json`。
- `deploymentShaVerified=false`，Dokploy 实际运行 SHA、构建日志和健康状态仍待控制台核验，整体保持 **NO-GO**。

### 2026-10-20 Supply Chain 搜索状态（`fdd9c3a`）

- 搜索结果改为派生显示，清空查询不会残留旧建议；Supply Chain ESLint 告警已清零。
- 线上 DOM/表单审计 `14/14 PASS`，页面错误 `0`，意外业务写入 `0`。证据：`docs/UAT_TABLE_A11Y_ONLINE_FDD9C3_FINAL.json`。

### 2026-10-20 表格 DOM 复核（`88a164d`）

- 线上 DOM 审计 `14/14 PASS`：设置用户、角色管理、AI Metrics、Odoo 产品、Stocktake、供应链和发票扫描页面在 390/1440 视口的表格名称和列头语义均通过。
- 发现并修复实际生效的旧 `app/settings/users` 表格缺少 `aria-label`；4 个被拦截的 Odoo records POST 均为只读请求，业务写入为 `0`。
- 证据：`docs/UAT_TABLE_A11Y_ONLINE_A533496_FINAL.json`。
- Supply Chain Rules & prices 面板的所有可见输入控件均有可访问名称，`unnamedControls=0`；最新证据：`docs/UAT_TABLE_A11Y_ONLINE_6EC5DC3.json`。

### `0f9faab` 部署后 AI 回归

- availability `3/3`、surface `11/11`、UI `2/2`、AI Features `14/14` 通过；空输入边界、匿名鉴权和启用态 assistant 均通过。
- Invoice OCR 当前为 provider 可达 `INFO`，仍需真实供应商发票照片字段提取验收；不允许据此执行供应商、采购、收货或库存写入。
- 证据：`docs/UAT_AI_AVAILABILITY_2026-10-19_AUTHFIX.json`、`docs/UAT_AI_SURFACE_2026-10-19_AUTHFIX.json`、`docs/UAT_AI_UI_2026-10-19_AUTHFIX.json`、`docs/UAT_AI_FEATURES_VERIFY_2026-10-19.json`。

### 表格可访问性批次（`b2e0b1a`）

- 设置用户、Sell AI 动态结果、AI 报表、产品价格阶梯、发票 OCR 明细和供应链建议表均补齐可识别表名与 `scope="col"` 列头。
- 本地 typecheck、目标 ESLint、UAT 脚本语法和全站表头语义扫描通过；未运行 build。
- Dokploy webhook 返回 `HTTP 200 Compose deployed successfully`。
- 线上只读证据：静态矩阵 `268/268 PASS`、AI Metrics `9/9 PASS`、Odoo 自动恢复 `6/6 PASS`、Pricing `8/8 PASS`。详细证据见交接文档中的四个 `B2E0B1A` 文件。
- 运行容器 SHA、完整构建日志和健康状态仍需 Dokploy 控制台独立核验，因此总体仍为 **NO-GO**。
- `f5413e0`、`2cc4e38`、`2bc8046` 随后补充 AI path 延迟指标和视觉能力位文案；B2E0B1A 线上证据对应上一批运行版本，需部署 `2bc8046` 后重跑受影响 AI 验证。

### AI Metrics UI 语义增强（`74e9412`）

- AI Metrics 表格增加可访问 caption 和列头 `scope`，页面根节点在刷新期间暴露 `aria-busy`。
- Dokploy 部署后线上 UAT `9/9 PASS`，覆盖管理员/匿名鉴权、assistant intent 指标、390/1440 UI 和新增语义断言；证据 `docs/UAT_AI_METRICS_ONLINE_74E9412.json`。

### 最新专项回归（2026-10-19）

- Sommelier `10/10`、Legacy Retry `5/5`、Closure、Overview、Reporting、权限、采购移动端和发票 mock 均通过，均未写入 Demo 业务数据。
- AI Features `14/14`、availability `3/3`、surface `11/11`、UI `2/2`、AI Metrics `7/7` 通过。
- 真实发票 OCR preview 已通过：供应商、发票号、日期、2 行明细和总额均可解析；preview-only 非 GET 业务写入为 `0`。证据 `docs/UAT_INVOICE_OCR_PREVIEW_ONLINE_1EAB632.json`。
- OCR 仍只代表预览解析能力，不代表自动创建供应商、采购单、收货或库存写入已经放行。

### 2026-10-19 当前路由树修复

- Next 实际使用 `pos-ui/src/app`；已补齐此前只存在于旧 `pos-ui/app` 的 17 个业务/认证入口，覆盖 Odoo 产品目录、采购、客户、供应商、补货、Odoo 收银台、Overview、AI 指标、数据设置、盘点和认证页面。
- 静态 UAT 脚本已改为扫描 `src/app`。当前线上基线 `139 × 2 = 278/278 PASS`，证据 `docs/UAT_ALL_STATIC_PAGES_2026-10-19_PRE-ROUTE-MIGRATION.json`；新路由提交需部署后再次确认。
- 自动恢复专项仍有产品目录初始加载失败（`4/5`），补货页恢复通过；部署路由修复后必须重跑，整体放行仍为 **NO-GO**。
- 路由修复后的自动恢复专项已重跑并通过 `6/6`：产品目录 hydration、首次加载、页面内过期会话恢复和 POS session 保留均通过。证据 `docs/UAT_ODOO_AUTORECOVER_2026-10-19_POST-6AA867C_FINAL.json`。整体放行仍为 **NO-GO**，因为 Dokploy 容器 SHA/构建日志和生产 AI、硬件、正式财务流程仍未完整核验。
- `70cd722` 最新部署请求已接受；等待后自动恢复专项继续为 `6/6 PASS`，证据 `docs/UAT_ODOO_AUTORECOVER_2026-10-19_POST-70CD722.json`。运行镜像身份仍未从 Dokploy 控制台独立核验。
**Source of truth for business data:** Odoo (via `pos-ui` `/api/odoo/*`).  
Classic Spring/MySQL POS remains in-repo as **reference only** (hidden from sidebar unless `NEXT_PUBLIC_SHOW_CLASSIC_POS=true`).

### 2026-10-19 当前公网回归汇总
- 线上 AI 已启用：availability `3/3 PASS`、surface `11/11 PASS`、UI `2/2 PASS`；AI 全功能只读矩阵 `14 PASS / 0 FAIL / 1 INFO`。Invoice OCR 的 `INFO` 仅表示探针图片没有发票字段，不代表真实发票字段提取已验收。
- 价格建议页的商品/SKU搜索、状态筛选、CSV导出和 `writeEnabled=false` 保护已在公网观察到；未产生价格写入。
- 全站静态矩阵更新为 `133 路由 × 390/1440 = 266/266 PASS`，独立证据 `docs/UAT_ALL_STATIC_PAGES_2026-10-19_POST-4487A12.json`。
- 视觉 AI 已按模型路由 native multimodal / compatible chat；真实酒标和发票照片的业务字段提取仍需专门验收。
- 以上公网行为不替代 Dokploy 控制台的 frontend/backend 容器 SHA、构建日志和健康状态取证。
- 价格建议现在可将单个 SKU 深链到 Bulk Price Edit，Bulk Price Edit 会预填 SKU 并发送同一搜索条件；本地 `16` 项 fixture UAT 全部通过，仍保持无自动价格写入。证据：`docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19_DEEP-LINK.json`。

### 2026-10-19 Stock 与 Capped Pricing 响应式修正（公网行为通过）
- Stock List 与 Capped Pricing 为表格设置最小宽度，在手机视口内使用表格区域横向滚动；两页 Quantity 列加宽，完整显示列名；Stock List 商品计数按单复数显示。
- 本地 fixture UAT `4/4 PASS`：两页面在 390/1440 视口均渲染样例行；表头和首行列边界误差不超过 1px、表头文字不越列、页面不横向溢出；Stock List 的 `1 Product` 计数文案通过；390px 表格区域可滚动。`0` 个页面错误、`0` 个业务写入。证据：`docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-19.json`；截图见 `docs/screenshots/2026-10-19-stock-tables-local/`。
- 同批本地复验保存失败重试 `8/8 PASS`、价格建议交互/深链 `16/16 PASS`、AI capability gate `2/2 PASS`。这些是 fixture/UI 验证，不代表线上实际 Odoo 写入或生产 AI 验收。
- `05928f9` 推送后公网 pricing 矩阵 `8/8 PASS`，覆盖两页 × 390/1440；表头完整、数据行列对齐、移动端内部滚动和页面无溢出。页面错误和被拦截写请求均为 `0`。证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19_POST-05928F9_FINAL.json`。Dokploy 容器 SHA、构建日志和健康状态仍待控制台核验。
- Bulk Price Edit 新增相同的宽表列基准、最小宽度和单商品计数修正；本地响应式矩阵现为三页 × 390/1440，`6/6 PASS`，包含首行对齐和零业务写入。线上验证待下一次集中部署。
- `e564c4d` 推送后线上 pricing 矩阵 `8/8 PASS`，覆盖 Stock List、Capped Pricing、Bulk Price Edit、Price Suggestions × 390/1440；宽表列对齐、表头、手机滚动、页面无溢出均通过，页面错误/被拦截写请求为 `0`。证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19_POST-E564C4D_FINAL.json` 和 `docs/screenshots/2026-10-19-pricing-post-e564c4d-final/`。
- Bulk Price Edit 的搜索、分类下拉和新增数量输入已补充可访问名称；本地响应式 `6/6 PASS` 覆盖这些控件。公网验证待下一次集中部署。

### 2026-10-19 公网定价表格基线与 AI 会话摘要
- 加载完成后的线上只读 pricing 基线 `4/8 PASS`：Stock List/Capped Pricing 在 390/1440 四项均有列文字溢出或首行列错位；没有页面 JS 错误或被拦截写请求。容器 SHA 未核验。证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19_BASELINE_FINAL.json` 及 `docs/screenshots/2026-10-19-pricing-reliability-online/`。
- 本地修正的 fixture 检查 `4/4 PASS`，包含首行真实对齐断言；AI assistant 会话摘要本地 `4/4 PASS`，验证单/多次响应统计及零业务写入。
- `05928f9` 推送后，线上只读 pricing 矩阵 `8/8 PASS`；公网 AI 会话摘要 fixture `4/4 PASS`，AI 请求被浏览器截获，没有调用生产模型。证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19_POST-05928F9_FINAL.json`、`docs/UAT_AI_DIAGNOSTICS_ONLINE_FIXTURE_2026-10-19_POST-05928F9.json` 和 `docs/screenshots/2026-10-19-pricing-post-05928f9-final/`。
- Dokploy webhook 已接受部署，但 frontend/backend 容器 SHA、构建日志与健康状态仍需控制台独立核实；公网行为通过不替代镜像身份取证。

### 2026-10-19 行内价格保存可靠性

- Stock List、Capped Pricing、Bulk Price Edit 的行内编辑在提交失败时提供错误提示；Stock List/Capped Pricing 保留用户编辑值供修正或重试，Bulk Price Edit 失败回滚到服务端值。提交期间输入禁用并标记 `aria-busy`，Stock List/Capped Pricing 使用同步锁抑制重复 blur PATCH。
- Stock List 与 Capped Pricing 本地 Playwright 故障注入 `8/8 PASS`：两处首次 PATCH 503 后错误可见、编辑值保留、重试成功；Stock List 重叠 blur 只产生一次并发 PATCH。所有 PATCH 均由 fixture 截获。证据：`docs/UAT_STOCK_PRICING_SAVE_GUARD_LOCAL_2026-10-19_POST-1C4A7B1.json`。
- Bulk Price Edit 本地故障注入 `7/7 PASS`：失败提示、回滚、busy 清除和后续重试通过；证据：`docs/UAT_BULK_PRICE_EDIT_SAVE_GUARD_LOCAL_2026-10-19_POST-1C4A7B1.json`。
- 本地 TypeScript、三个目标组件 ESLint 和相关 UAT 脚本语法检查通过。未运行本地 build；这批变更待 Dokploy 部署后做线上只读与容器构建回归。

### 2026-10-19 Stock List / Capped Pricing 移动端表格

- 公网只读截图在 390px 发现 Stock List 和 Capped Pricing 表头相互重叠；诊断记录 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19_POST-F1993D6_DIAGNOSTIC.json` 在 390px 两页均判定列重叠、内部横向滚动缺失。该页面行为证据不证明 Dokploy 容器 SHA。
- 已给两张宽表设置稳定最小宽度（Stock List `1100px`、Capped Pricing `1050px`），放在原有 overflow scroller 内；移动端只在表格区域横向滚动，页面本身不溢出。
- 最新本地布局 UAT `4/4 PASS`：两个页面在 390/1440 视口验证了样例行、表头与数据列对齐（最大误差 1px）、表头文字不越界、390px 内部横向滚动及页面无整体横向溢出；页面错误 `0`。证据：`docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-19.json`；截图位于 `docs/screenshots/2026-10-19-stock-tables-local/`。
- Online pricing UAT 已修正 viewport 设置和标题等待；应在下一批部署后重跑 8 条已登录只读页面检查，并确认 blocked non-GET requests 为 `0`。

### 2026-10-19 价格建议运营补强

- `/stock/price-suggestions` 增加只读 `Export CSV`：导出当前页面筛选结果（建议项或全部商品）的 SKU、成本、当前/建议售价、毛利、销量、库存和解释原因，使用 UTF-8 BOM 兼容门店表格工具。
- 导出只在浏览器生成文件，不调用任何价格写入接口；`writeEnabled=false` 边界保持不变。
- 本地浏览器 UAT `docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19.json`：页面缓存头、建议展示、人工应用入口、CSV 内容、AI 悬浮入口和非 GET 请求 `0` 全部通过。
- 价格建议整体仍为 **In progress**：公网 `/stock/price-suggestions` 仍需在 Dokploy 确认运行镜像后复测，CSV 本地证据不替代线上部署证据。
- `26f1d47` 已推送并通过 Dokploy webhook 触发（HTTP 200）；等待部署窗口后价格建议 gate 仍记录页面不可达，证据 `docs/UAT_AI_ENABLED_GATE_2026-10-19_POST-26F1D47.json`。这进一步说明 webhook 接受不等于 frontend 镜像已切换，需控制台构建日志/SHA 取证。

### 2026-10-19 价格建议筛选与运营导出增强

- 价格建议页新增商品名/SKU搜索和状态筛选（Raise price、Review、Missing cost、No shelf price、On target）。筛选结果数量、空状态和 CSV 导出均跟随当前筛选。
- 搜索只作用于已加载的 Odoo 只读结果；没有新增写接口，`writeEnabled=false` 约束保持不变。
- 本地 Playwright fixture `docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19_SEARCH.json`：搜索命中、无匹配、状态筛选、CSV 导出和非 GET 请求 `0` 均 PASS。
- 本批变更尚未部署；需和 `ea8f1b6` AI 编译修复一起通过 Dokploy Java 21 构建后，再做线上价格建议 gate 与全站矩阵。
- 公网只读 gate 后续观察到 `/stock/price-suggestions` 已显示商品/SKU搜索和状态筛选，AI assistant、Sommelier 页面及价格无写入断言也通过；证据 `docs/UAT_AI_ENABLED_GATE_2026-10-19_POST-D9089BB_ONLINE-PRICE-FILTER.json`。该行为证据不替代 Dokploy 容器 SHA、构建日志和健康状态取证。
- 启用态公网回归补充通过：AI surface `11/11`、AI UI `2/2`；空音频/空图片均返回业务码 `40010`，匿名 AI 路由矩阵 `27` 条全部 `401`，UI 正确显示启用态聊天/语音控件。证据：`docs/UAT_AI_SURFACE_2026-10-19_POST-9B01128_ENABLED-AWARE-RETRY2.json`、`docs/UAT_AI_UI_2026-10-19_POST-9B01128_ENABLED-AWARE-RETRY.json`。UAT 已按 `AI_ENABLED` 动态区分启用/关闭态，避免旧断言误报。

### 2026-10-19 `26f1d47` 部署后回归

- AI availability `3/3 PASS`、AI surface `11/11 PASS`、AI UI `2/2 PASS`、Sommelier 只读 `10/10 PASS`；生产 `AI_ENABLED=false`，未触发模型或业务写入。
- 全站静态矩阵 `133 路由 x 390/1440 = 264/266 PASS`；唯一失败是 `/stock/price-suggestions` 在两个视口均返回 `404`，其余路由和页面错误/溢出检查通过。
- 独立证据：`docs/UAT_AI_AVAILABILITY_2026-10-19_AUTHFIX.json`、`docs/UAT_AI_SURFACE_2026-10-19_AUTHFIX.json`、`docs/UAT_AI_UI_2026-10-19_AUTHFIX.json`、`docs/UAT_SOMMELIER_READONLY_2026-10-19_POST-26F1D47.json`、`docs/UAT_ALL_STATIC_PAGES_2026-10-19_POST-26F1D47.json`。

### 价格建议线上 404 修复候选

- 复核发现生产路由同时维护 `app/` 实现和 `src/app/` wrapper；价格建议此前缺少 `src/app/stock/price-suggestions/page.tsx`，而 `src/app/stock/more/page.tsx` 也没有入口。
- 已补齐 wrapper、Stock Tools 入口，并将本地 UAT 扩展为检查 wrapper/导航、CSV 下载和零写请求；当前本地 `8/8 PASS`。
- 该修复尚未部署，必须与下一批改动一起触发 Dokploy 后重新验证线上 404 是否消失。

### AI 关闭状态一致性修复候选

- `c478371` 后线上 AI client flag 为 `enabled=false`，但空语音请求仍返回 `40010`；这暴露了后端 multipart 校验先于 AI 关闭门禁的问题，AI surface 回归为 `6 PASS / 1 FAIL`。
- 已在 `AiAssistantController` 与 `SommelierController` 增加 `app.ai.enabled` 服务端门禁：语音和酒标图像接口在关闭时统一返回 `50301`，不会进入文件校验或模型服务。
- 本地已通过前端 typecheck、UAT 脚本语法和 diff check；后端 Maven 未运行，需 Java 21 CI/部署后验证。

### `aac28da` 部署后 AI 环境回归

- 价格建议页已从线上 `404` 恢复：认证 gate、商品/SKU筛选、状态筛选、CSV 和只读文案均通过；静态矩阵最新为 `266/266 PASS`。
- 以下旧段落记录的是 DashScope 路由修复前的 `AI_ENABLED=true` / `url error` 反例；当前 `10facb6` 后的线上 AI 全功能矩阵为 `14 PASS / 0 FAIL / 1 INFO`，不得把旧失败当作当前运行状态。
- `AI_ENABLED=true` 时本轮不能验证关闭门禁 `50301`；生产应在模型配置完成前保持关闭，或由运维修正环境后重新跑模型 smoke。

### AI provider failure containment candidate

- `AiAssistantController` now converts unexpected graph/provider exceptions to business code `50210` with a safe message; DashScope request IDs, URLs and raw provider details are not returned to staff.
- `SellAiPanel` renders a specific temporary-unavailable message for `50210` and keeps local product/search shortcuts available.
- The AI enablement gate now checks that failed model responses do not expose `InvalidParameter`, provider URLs, request IDs or `DashScope` details. This candidate is locally typechecked and script-syntax checked; it still needs Java 21 and online verification.

### `9ff8c12` provider error isolation online result

- 线上价格建议 gate：页面可达、只读文案通过、无价格写入。
- AI provider 请求仍失败（`AI_ENABLED=true` 且 DashScope URL 配置无效），但已返回业务码 `50210` 和安全提示；原始 `InvalidParameter` / URL / request id 泄漏断言 `PASS`。
- 证据：`docs/UAT_AI_ENABLED_GATE_2026-10-19_POST-9FF8C12.json`。真实 AI 仍未放行，需先修正 Dokploy AI 环境。

### 视觉 AI provider 错误隔离候选

- Wine label vision 和 invoice vision 现在对 `InvalidParameter`、URL、request id、DashScope 原始错误统一返回安全提示；普通异常也不再把 `Exception.getMessage()` 返回给店员。
- 新增 `WineLabelVisionServiceTest` / `InvoiceVisionServiceTest` 脱敏断言；当前未在本机 Java 8 执行 Maven，需 Java 21 CI/部署验证。

### `bc9c7df` 部署后验证

- 价格建议页面和只读 gate 继续通过。
- assistant provider 错误仍可复现，但响应为 `50210` 安全提示，gate 的原始供应商错误泄漏检查通过。
- 视觉 OCR 的 Java 脱敏单测尚未在 Java 21 执行；真实非空图片 provider 回归待 DashScope 配置修正后进行。
- 证据：`docs/UAT_AI_ENABLED_GATE_2026-10-19_POST-BC9C7DF.json`。

### Provider URL readiness guard candidate

- 新增 `AiProviderConfig.isValidBaseUrl`：仅接受 HTTPS provider host（本地测试允许 localhost），拒绝 `/api/v1` 等路径、query、fragment 和不安全 HTTP。
- AI client capability flags、assistant、语音和视觉接口共用该 readiness guard；配置无效时不发起模型请求，返回 `50301` 并将 capability 标为不可用。
- 新增 `AiProviderConfigTest` 和 gate 的 readiness 断言；本机未运行 Maven/build，需 Java 21/线上验证。

### `392c85f` readiness guard 部署后结果

- 价格建议页面和只读 gate 继续通过。
- 线上 `assistantAvailable=true`，说明 base URL 形式校验通过；实际 DashScope 仍返回 provider `url error`，assistant 已安全返回 `50210`，无原始错误泄漏。
- 这将阻断范围收窄到 DashScope 区域/模型或 Spring AI endpoint 配置；需要 Dokploy 构建日志和环境变量核对，不能靠前端或 mock UAT 放行。
- 证据：`docs/UAT_AI_ENABLED_GATE_2026-10-19_POST-392C85F.json`。

Statuses:

| Status | Meaning |
|---|---|
| **Accepted** | Implemented against Odoo and suitable for pilot acceptance testing |
| **In progress** | Code present; needs field validation or incomplete edge cases |
| **Planned** | Documented product intent; not a pilot commitment |

## 2026-10-19 最新验证

### 共享 Retry 状态保留：已做本地与公网行为验证

- 根因：`useApi` 在任何 GET 开始时立即清空错误；`AsyncDependencyNotice` 仅在 `error` 非空时渲染，因此 Retry 请求还在 pending 时错误条和按钮先被卸载。线上 Product Detail 与 Gift Cards UAT 已确定复现该行为。
- 修复：相同 path/query 的手动 Retry 保留上一次错误，直到 GET 成功后清除；path/query 改变时仍立即清理旧错误。共享依赖提示因此在 pending 窗口继续渲染，并使用既有 `disabled` 与 `aria-busy` 状态。
- 两个 Retry UAT 脚本新增 `PILOT_UAT_OUTPUT_PATH`，允许把新运行证据写到独立文件，避免覆盖既有用户/历史 JSON。默认路径保持兼容。
- 两个脚本新增 local mock 模式：测试请求只由 Playwright fixture 响应，非 GET 请求统一拦截为 `405`，不需要登录、后端或真实业务数据；本地结果使用 `not-applicable-local-dev`，不冒充部署验证。
- 本地 Playwright UAT：Product Detail `1/1 PASS`；Gift Cards Retry 与搜索竞态 `2/2 PASS`。两项都验证 pending 时 Retry 按钮 disabled、alert `aria-busy=true`、390px 无溢出、page errors `0`、写请求 `0`。证据：`docs/UAT_PRODUCT_VIEW_RETRY_LOCAL_9f15b70.json`、`docs/UAT_GIFTCARDS_OUTLET_RETRY_LOCAL_9f15b70.json`。
- 验证：`npm run typecheck`、目标 ESLint、两个 UAT 的 `node --check`、`git diff --check` 通过；本轮 Product Detail、Gift Cards 与 Auth 公网专项通过。未运行 build。
- 这次修复覆盖所有使用 `useApi` 的手动重试。旧错误会在新 path/query 发起请求时清除，且迟到请求仍受现有 sequence 保护。

### Store Ops 源码与验收边界复核

- **Purchase receive：Accepted（隔离租户/部署 `822f36b`）。** `POST /api/odoo/purchase-orders/{id}/receive` 和 Purchases 详情收货弹窗已实现；API 有同源校验、Odoo session、租户强制 company、订单/收货单/stock move 归属检查、明确确认及数量上限。专门的 live UAT（`docs/UAT_PURCHASE_RECEIVE_LIVE_2026-10-16.json`）验证 PO 确认、部分收货创建 backorder、最终收货、重复收货拒绝及库存增加 `+4`。`docs/UAT_RECEIVE_MANAGE_CASH_2026-10-16.json` 是更早的部署前/收货写入尚待验证快照，不覆盖后续隔离 UAT。当前 `c982572` 的部署身份仍未核验；这不撤销 `822f36b` 对应版本的验收，但后续代码变更仍需回归。
- **Odoo stocktake / inventory adjustment：In progress。** 新增 `/stock/stocktake` 与 `/api/odoo/stocktake`，仅搜索 POS 商品并按当前租户绑定的 company/location 限定；只能选内部叶子库位，批次/序列、包装、寄售及已有待盘记录会被阻止。提交前要求人工确认，写入前重新检查商品、当前库存和租户范围，应用后回读核对并返回 Odoo quant 调整引用。Orithos 后端 `/api/auth/me` 管理员核验已加到 GET/POST；角色 `stock.adjust` 尚未纳入后端授权模型，因此目前按规格 admin-only。`ODOO_STOCKTAKE_WRITE_ENABLED` 默认关闭。
- 本地 fixture 浏览器 UAT 3 个视口通过：390/1440 下取消不发请求、确认仅发送一次且 payload 正确；768 下写入开关关闭时不能提交；无页面错误/横向溢出。证据：`docs/UAT_ODOO_STOCKTAKE_LOCAL_ITERATION_2026-10-19.json` 与 `docs/screenshots/2026-10-19-stocktake/`。fixture 测试不代表 Odoo API 或库存写入验收。
- Odoo 19 源码/实例能力只读探测已确认 `stock.quant` 盘点字段及 `inventory_quantity_auto_apply` 行为。仍需核对 Demo 当前绑定库位树，并在获批隔离 Odoo 上做取消、写入、回读和审计验收；**没有对 Demo 的 `aipos` 执行任何写入**。旧 `/stocktake`、`/stocktake/express` Classic 页面仍是 Spring/MySQL 路径，不等于 Odoo SoT 盘点已验收。
- 部署 `3cd5be0` 后管理员线上只读 UAT 通过：登录、Odoo session 自动恢复、租户 binding 读取、盘点 location GET、390/1440 页面均 PASS；Demo binding 的 `odooStockLocationId` 为空，API 通过单 warehouse 的 `lot_stock_id` 只读兜底返回 1 个 location，并在 UI 显示来源提示。全程非 GET 盘点请求为 0，`writeEnabled=false`。证据：`docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json`、`docs/screenshots/2026-10-19-stocktake-online/`。
- 部署 `14a052a` 后库位加载 Retry 线上回归通过；本地 390px 故障注入验证首次 503 后局部 Retry 恢复，线上管理员只读页面 390/1440 继续 PASS。盘点 API 未产生非 GET 请求。证据：`docs/UAT_ODOO_STOCKTAKE_LOCAL_2026-10-19.json`、`docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json`。
- Store Ops P0 尚未全部完成：采购收货已有隔离环境写入验收；Odoo 盘点处于代码/fixture 验证阶段，隔离写入验收未完成。

- 当前 `main` 与 `origin/main` 均为 `94ccc32`；应用代码修复在 `9f15b70`，`b3c9eba` 增加隔离本地 browser fixtures，可指定 UAT 输出文件；`94ccc32` 更新认证 UAT 独立输出与回归文档。此前 `c982572` 提供读取序号保护及 Retry 忙碌语义。
- 全站矩阵 `docs/UAT_ALL_STATIC_PAGES_2026-10-19_1cde2cb.json` 为 131 路由 × 390/1440，`262/262 PASS`；它验证的是先前 `1cde2cb` 公网版本，不覆盖 `2a2d9ab`。
- 用户此前确认部署 `7544d03`。`c982572` 推送后使用完整 GitHub push payload 调用 Dokploy webhook 返回 HTTP `200 Compose deployed successfully`，并等待超过 5 分钟；但实际运行 SHA、构建日志和容器状态未从控制台回读，不能确认公网已运行 `c982572`。全站矩阵 `262/262 PASS` 与旧认证重放证据来自较早公网版本。
- `9f15b70` 修复 Retry 错误提示在 pending 期间被清除的问题，`b3c9eba` 加入无后端/无业务写入的 local mock browser UAT。两个提交均已推送；`b3c9eba` 的手工 webhook 请求返回 `301 Branch Not Match`，但公网行为 UAT 已在 push 后重跑，deployment SHA 仍标为 `unverified-after-deploy`。
- 全站静态矩阵在本轮公网重跑：131 路由 × 390/1440，`262/262 PASS`，无 HTTP 失败、横向溢出或页面错误；证据 `docs/UAT_ALL_STATIC_PAGES_AFTER_94CCC32.json`。`sourceCommit` 标记 UAT runner 基线，不替代 Dokploy 运行 SHA。
- 最新公网 Product Detail Retry UAT：`1/1 PASS`；第二次 Tax rates GET 保持 pending 时 Retry disabled、alert `aria-busy=true`，最终 `503 → Retry → 200`；390px 无溢出、page errors `0`、业务写入 `0`。Gift Cards UAT：Retry `1/1 PASS`、搜索竞态 `1/1 PASS`；Outlet pending 锁定正确，390px 无溢出、page errors `0`、业务写入 `0`。证据：`docs/UAT_PRODUCT_VIEW_RETRY_AFTER_B3C9EBA.json`、`docs/UAT_GIFTCARDS_OUTLET_RETRY_AFTER_B3C9EBA.json`。
- 最新公网认证回放：`2/2 PASS`；GET 401 后刷新一次，DELETE 尝试一次并被 Playwright 拦截，无服务端写入。证据：`docs/UAT_AUTH_REPLAY_AFTER_B3C9EBA.json`。
- 本地 fixture UAT 同样通过：商品详情 `1/1`、Gift Cards Retry/搜索竞态 `2/2`；证据 `docs/UAT_PRODUCT_VIEW_RETRY_LOCAL_9f15b70.json`、`docs/UAT_GIFTCARDS_OUTLET_RETRY_LOCAL_9f15b70.json`。
- 当前发布判定仍为 **NO-GO**：Retry、Auth 和全站公网行为均已通过，但 Dokploy 实际运行 SHA / 构建日志 / 容器状态未核验，无法将结果绑定到具体镜像提交。

## 已推送批次：`c982572`（部署请求已接受，运行版本待核验）

- `useApi` 增加请求序号保护；查询切换、组件卸载或新一轮 Retry 后，旧请求不能覆盖新数据/错误/loading 状态。
- 共享依赖错误提示增加 `aria-busy`，为 Retry 进行状态提供可访问的忙碌语义。
- 商品详情与 Gift Cards Retry UAT 用 Promise gate 控制待处理 GET，在放行响应前检查按钮禁用和提示忙碌状态，避免依赖固定延迟造成竞态误判。
- 本地 `npm run typecheck`、目标 ESLint、两份 UAT `node --check`、`git diff --check` 通过；未运行 build。
- `c982572` 已推送到 `origin/main`。完整 GitHub push payload 调用 Dokploy webhook 返回 HTTP `200 Compose deployed successfully`，并等待超过 5 分钟；仍需从控制台确认实际运行 SHA、构建日志和容器状态。线上 Retry 专项未通过，不能视为本批验收完成。UAT 只有在显式提供 `PILOT_DEPLOYMENT_VERIFIED=true` 与完整 40 位 `PILOT_DEPLOYMENT_SHA` 时才记录运行 SHA；否则保持 `unverified-after-deploy`。

## 下一本地批次：平台商店状态转换

- 对照 `docs/PLATFORM_ADMIN_P0_SPEC.md`，详情页/API 已具备生命周期操作，但当前 UI 原先无视当前状态显示全部状态按钮，API 也未约束非法转换。
- 本地改动按 P0 允许的状态转换矩阵隐藏不适用按钮，并让 API 对非法转换返回 `40910`；新增控制器单测覆盖 `suspended → expired` 拒绝。
- 前端 `npm run typecheck` 与详情页 ESLint 通过。后端单测未能运行：当前 Maven 使用 JDK `1.8.0_292`，项目要求 Java 21；编译在仓库其他 `record` 语法处失败。该改动尚未提交、部署或线上验证。

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
- 生产已打开 `AI_ENABLED`（Dokploy），但 NLQ Graph 服务曾因 `@ConditionalOnBean(CompiledGraph)` 未注册导致 `/api/ai/assistant` 持续 `50301`（pitch/ask 仍可用）。修复见本轮提交；部署后用 `scripts/pilot-ai-features-verify-uat.mjs` 复验。发票/酒标 VL 在当前 DashScope 账号上仍报 `model_not_found`/`access_denied`，需开通视觉模型后再验。Price suggestions 只读已通（`writeEnabled=false`）。证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-19.json`。
- 实体刷卡终端、打印机、钱箱、离线 POS、分单/多支付方式未实现或未验收；Card 仅为 Odoo payment method 模拟。
- SMTP 邀请/密码重置邮件、正式现金差异审批、财务对账和采购财务流程未完成正式运营验收。
- 多数创建、编辑、合并、销售、退款、收货、现金和关班写入回归使用隔离租户或 mock；Demo 租户禁止写入，不能把只读/mock 结果当成生产业务验收。

### Dokploy 部署后验证（2026-10-18，用户确认已部署）

- 管理列表 `8/8 PASS`；设置页 `27/27 PASS`（390/1440）；订单页 `16/16 PASS`，`pageErrors: []`、`mutatingApiRequests: []`。
- 综合交互 `14/14 PASS`；AI surface `10/10 PASS`；AI availability `3/3 PASS`；平台恢复 `5/5 PASS`，所有平台恢复写请求均被拦截为 `0`。
- 全站静态矩阵 `131` 路由 × `390/1440`，`262/262 PASS`；无 HTTP 失败、横向溢出或页面错误。证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-18_58f1926.json`。
- 商品详情 Tax rates 首次 `503` 后 Retry 恢复，390px 无溢出、无页面错误、写请求 `0`。证据：`docs/UAT_PRODUCT_VIEW_RETRY_2026-10-18.json`。
- 用户提供 Dokploy 已部署，但控制台运行 SHA、构建日志和容器状态仍未独立回读；UAT 中的 `deployment/sourceCommit` 只代表脚本运行时基线，不能替代 Dokploy 证据。

### 待部署代码批次：`d5050ca`

- 销售快捷键编辑页：Sale key sets 列表读取失败显示 Retry，失败时禁用切换选择器；保存前校验名称不能为空。
- 客户合并页：Customer groups lookup 失败显示依赖错误和 Retry，避免下拉静默为空。
- 本地 `npm run typecheck`、目标 ESLint、`git diff --check` 已通过；未运行 build。
- 尝试调用用户提供的 Dokploy Compose webhook 两次，均返回 HTTP `301` / `{"message":"Branch Not Match"}`，未确认触发部署。需在 Dokploy 控制台修正 webhook 分支或手动 Deploy 后再做线上验证。

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

## 2026-10-18 当前迭代：`632d3a0`

| 功能域 | 本批次改动 | 验证结果 |
|---|---|---|
| Odoo 商品导出 | 商品目录和数据设置页导出改用 `fetchOdooRoute`，复用 Odoo 会话恢复 | 本地 typecheck、目标 ESLint、diff check 通过；待 Dokploy 运行 `632d3a0` 后做过期会话故障注入 |
| Odoo 供应商创建 | 供应商 POST 统一经过 Odoo 请求封装；写请求仍不会被自动重放 | 本地 typecheck、目标 ESLint 通过；现有供应商真实写入证据不受影响 |
| 数据设置页恢复 | Retry 请求期间禁用并显示 `Retrying…` | 本地检查通过；公网旧版本只读回归无回归 |
| 客户详情最近销售 | 客户/Tab 上下文变化时清空旧销售明细，避免跨客户残留 | `npm run typecheck`、目标 ESLint 通过；待部署后补充切换客户只读证据 |
| 受保护文件下载 | 客户、商品模板、库存、外部盘点和礼品卡下载在 401 后刷新 token 并重试一次；写入请求不重放 | `npm run typecheck`、目标 ESLint、`git diff --check` 通过；待部署后做下载故障注入 |
| 业务 API 写请求恢复 | 401 自动重试仅限 GET/HEAD/OPTIONS，销售、采购、导入和删除不会在刷新 token 后自动重放 | `npm run typecheck`、目标 ESLint、`git diff --check` 通过；待部署后补充写请求拦截证据 |
| Odoo 连接失败恢复 | 商品目录和供应商目录的 session 探测失败显示原地 `Retry connection`；供应商异常进入明确 disconnected 状态 | `npm run typecheck`、目标 ESLint、`git diff --check` 通过；待部署后做 503 → Retry 只读注入 |
| Odoo 连接 Retry 状态 | 连接探测期间按钮禁用并显示 `Retrying…`，成功或失败后恢复明确状态 | `npm run typecheck`、目标 ESLint、`git diff --check` 通过；待部署后补充按钮状态证据 |
| Odoo 客户目录连接恢复 | 客户目录 session 探测失败显示 `Retry connection`，并在探测期间锁定按钮 | `npm run typecheck`、目标 ESLint、`git diff --check` 通过；待部署后补充只读注入证据 |
| 设置页 Retry 状态 | Payment、Tax、Registers/Outlets、Roles 的错误恢复按钮在请求期间禁用并显示 `Retrying…` | `npm run typecheck`、目标 ESLint、`git diff --check` 通过；待部署后补充设置页回归 |

脚本静态验证：仓库内 `51/51` 个 UAT `.mjs` 文件通过 `node --check`；该结果不替代 Dokploy 目标提交的线上运行证据。

### 认证重放专项（待目标部署）

新增脚本 `scripts/pilot-auth-replay-uat.mjs`。在当前公网版本的故障注入结果为：GET 401 后 `refreshRequests=2`、DELETE 401 后 `priceSetDeletes=2`；DELETE 请求全部被 Playwright 路由拦截，Demo 没有真实业务写入。证据：`docs/UAT_AUTH_REPLAY_2026-10-18.json`。这是旧公网版本的反证，不能绑定到当前代码；目标 `b4cc0d9` 部署后必须达到 GET refresh `1` 次、DELETE `1` 次。

本批次提交已推送 `origin/main`，当前代码为 `b4cc0d9`。Dokploy webhook `https://dokploy.modkie.com/api/deploy/compose/bIiwuE7McQD2kxJl3oG8j` 当前仍返回 `HTTP 301` 和 `Branch Not Match`，所以 `b4cc0d9` 尚未取得线上运行身份证据。当前发布结论继续保持 `NO-GO`；禁止把旧版本公网 UAT 的 `sourceCommit` 当作 Dokploy 审计 SHA。

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
| Explainable replenishment suggestions | Accepted | Rules-based velocity; row-level reasons; page copy states suggestions are not the chat model |
| Price suggestions (margin rules, read-only) | In progress | Demo read-only API/page PASS (`products=1000`, `writeEnabled=false`) in `docs/UAT_AI_FEATURES_VERIFY_2026-10-19.json`. Still apply changes only via Products / Bulk Price Edit; never auto-write list prices. |
| Approve → draft RFQ (human gated) | Accepted | Never auto-confirms PO |
| Replenishment approval audit | Accepted | Live isolated-company UAT created a draft RFQ and read back one internal Odoo chatter audit containing the forecast method, target coverage, suggested/ordered quantities and reason; zeroed suggestions remain audit-only and are excluded from PO lines. Evidence: `docs/UAT_REPLENISHMENT_AUDIT_LIVE_2026-10-17.json`. RFQ remains draft and is never auto-confirmed. |
| Supplier invoice OCR → receive draft | In progress | OCR remains preview-only and never creates supplier/PO/receipt. Provider routing is reachable and the probe returns `50212` for an image without invoice fields; real supplier invoice field extraction is still required. |
| Banner / buyer-group price files | Planned | |

## Reporting & AI

Production AI defaults to `AI_ENABLED=false` until the checklist in `docs/AI_PRODUCTION_ENABLEMENT.md` is complete (budget, DashScope key, report RO password, isolation UAT). The tenant report database account has no source-controlled default password; configuring `AI_REPORT_RO_PASSWORD` is required before outlet report access can be provisioned.

| Capability | Status | Notes |
|---|---|---|
| Odoo reporting dashboard | Accepted | `/reports/dashboard` browser UAT pass; 2026-10-16 refinements add a layout-preserving skeleton, retryable first-load and refresh failure states, explicit data-through vs loaded timestamps, and hide comparisons on low prior-period baselines. Commit `83815f2` is deployed and authenticated read-only smoke passed. |
| Cashier assistant / NL reports | In progress | Spring Graph NLQ is live in the latest public read-only matrix: assistant product lookup and chat composer passed; provider routing for `qwen3.8-flash` is covered by `10facb6`. Report RO password and formal report SQL acceptance remain outstanding. |
| Wine / sommelier assistant | In progress | Odoo remains authoritative; public read-only matrix passed identify, recommend, pitch, ask and similar flows. Register-specific warehouse context, tax/pricelist customer totals and real label photo extraction remain unverified. |
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

### 2026-10-20 Dokploy #38 后续触发（`faecf07`）

- 当前源码已包含 `AiProviderConfig.java` 和两个控制器的显式 import；#38 的 `cannot find symbol` 属于旧源码快照，`Parenthesis` 仅为弃用警告。
- `faecf07` 已推送到 GitHub `main`；完整 push payload 触发 Dokploy 返回 `HTTP 200 Compose deployed successfully`。
- 等待部署后 `/overview` 返回 `200`；未认证 API 返回 `401`。这些结果不证明构建完成或镜像身份。
- Dokploy frontend/backend 容器 SHA、完整构建日志和健康状态仍待控制台回读，整体发布保持 **NO-GO**。

### 2026-10-20 浮动 AI 助手交互与可访问性批次（`e9d9d69`）

- AI composer 已有可访问发送按钮、表单提交、空值/忙状态禁用；对话框标题与动态消息补齐 ARIA 语义，关闭后焦点恢复逻辑已修复。
- 手机端浮动助手默认位置预留底部安全区。公网 AI UI `2/2 PASS`，价格/库存 `8/8 PASS`，表格/表单 `14/14 PASS`；页面错误 0，意外业务写入 0。
- 证据：`docs/UAT_AI_UI_POST_E9D9D69_RETRY.json`、`docs/UAT_PRICING_POST_E9D9D69.json`、`docs/UAT_TABLE_A11Y_POST_E9D9D69.json`。
- 全站只读矩阵复测 `134 × 390/1440 = 268/268 PASS`，HTTP 全部 200，无页面错误或横向溢出；证据：`docs/UAT_ALL_STATIC_PAGES_POST_351C02F.json`。
- 本地未运行 build；Dokploy 容器 SHA、构建日志和健康状态仍未独立核验，发布保持 **NO-GO**。

### 2026-10-20 报表时区与日期解析批次（`73ba45c`）

- AI 报表读取绑定 Odoo company 的国家/州地址并推断业务时区，缓存 30 分钟；该时区同时用于相对日期、`context.tz`、UTC 查询边界和订单业务日分组，读取失败回退 Sydney。
- 英文月份解析改为大小写不敏感，覆盖全部 12 个缩写及无效日期回退；新增 Adelaide/Sydney 午夜边界和只读公司时区 RPC fixture。
- `pilot-ai-report-readonly-uat.mjs` 增加逐日 Overview 对账；本地 typecheck、目标 ESLint、脚本语法和 diff check 通过，未运行本地 build。
- 该批次尚未取得 Dokploy 构建/运行 SHA 证据，线上 RPT-04 仍为 **In progress**，整体发布继续 **NO-GO**。

### 2026-10-20 AI provider 安全与输入边界批次（`2e45369`）

- ASR 增加空文件、5 MB 上限和音频 MIME 白名单；provider 错误只返回固定重试提示。
- Invoice Vision、Wine Label Vision、ASR 和 AI report audit 均移除 provider body、request id、SQL 和数据库异常 message 的日志/用户响应泄露路径。
- Sell AI 前后端均对 intent、route、action 和 entity operation 做 allowlist/fail-closed 处理；未知响应不会触发导航或业务动作。
- 新增 Java 21 目标单测；本地只完成源码审查、前端 typecheck/ESLint 和脚本语法检查，未运行 Maven/Next/Docker build。线上 provider failure、真实麦克风交互和运行 SHA 仍待部署验证。
