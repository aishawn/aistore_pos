<!-- capability-summary:start -->
## 当前能力摘要（自动生成 · 2026-10-24）

来源：`docs/capability-status.json`。以下摘要优先于本文件后续历史记录；线上只读通过不等于部署身份已核验或真实业务验收。

| 能力 | 已实现 | 本地验证 | 线上只读验证 | 真实业务验收 | 边界 |
|---|---|---|---|---|---|
| 库存与定价界面 | 是 | 是 | 是 | 待验证 | Node 24.19.0 本地 Playwright 5 视口/Stock List、Capped Pricing、Bulk Price Edit 矩阵 15/15 PASS；Price Suggestions R2 名称、价税与保存恢复 fixture 14/14 PASS。2026-10-24 GST/deep-link 专项 37/37 PASS：净价/GST/毛利显示、15.75 含税建议、产品/原价参数传递、匹配原价时批量改价预填、原价变化时拒绝旧建议及 320–1440px 无溢出；所有 API 由 fixture 拦截、写入 0。证据 `docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-24-GST-DEEP-LINK.json`。四页均用原始 R2 导入名断言友好名称与原名 tooltip；Stock List 主动改名 PATCH 仅提交员工输入（五视口）。桌面四位小数价格可见；库存与封顶价失败重试 PASS。当前 Demo runtime 0e4a48ea（前后端匹配）线上只读 8 PASS / 2 BLOCKED / 0 FAIL；两个 BLOCKED 是未配置 Odoo price rules，线上截图仍见 R2 前缀，dirty 候选 e21a7943 尚未部署。真实价格写入和 POS 生效仍待隔离验收。 |
| 盘点与搜索保护 | 是 | 是 | 是 | 待验证 | Node 24 本地 stocktake fixture 五视口 5/5 PASS：地点加载失败重试、库存数量边界、取消无写、复核载荷一致和确认仅提交一次；4 个模拟 apply 请求全在 fixture，真实 Odoo 写入 0。另有 Demo runtime 0e4a48ea 只读运营浏览器 13/13 PASS，含盘点搜索防抖与补货 Retry。真实库存调整、收货和交易对账仍待隔离 UAT。 |
| GST 净毛利与 Odoo 改价 | 是 | 是 | 待验证 | 待验证 | Node 24 route handler + 内存 Odoo transport 31/31 PASS，覆盖含税/未税/零税率、复杂税拒绝、权限/公司隔离、分页、陈旧价格拒绝和价格写入回读；UI 人工确认/未知结果恢复 fixture 12/12 PASS；GST/deep-link 专项 Node 24.19.0 Playwright 37/37 PASS，确认 10% 含税下成本 10、目标净毛利 30% 对应建议货架价 15.75；净价/GST 展示、expectedPrice=12 匹配时预填 15.75、Odoo 原价变化至 13 时拒绝旧建议。截图检查 390/1440px，无横向溢出；所有 API 由 fixture 截获，真实 Odoo 写入 0。报告 `docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-24-GST-DEEP-LINK.json`。真实 Odoo 税组、实时建议数据与 POS 价目表生效仍待隔离验收。 |
| 收银退款与结果恢复 | 是 | 是 | 待验证 | 待验证 | Node 24 本地 Playwright POS checkout fixture 9/9 PASS：空购物车和现金不足拦截、找零/收据、外部终端确认、未知结果刷新后恢复且不重放、双击防重及 320/390/768/1024/1440px 收据布局。Close-register fixture 6/6 PASS：必填/负数/上限校验、面额点钞/差额、两种录入模式分别保留草稿且来回切换恢复各自金额、失败提示可见且保留金额、重试成功、处理中防重复与 Escape 锁定、五视口布局；无横向溢出，API 由 fixture 截获，真实 Odoo 写入 0。隔离租户已有销售/退款/关班回读 8 项通过，见 `docs/UAT_SINGLE_STORE_TRANSACTION_CLOSURE_2026-10-24_SHA-VERIFIED.json`；但商品税额为 0，退款后关班现金差异为 32，不能视为完整对账验收。线上匹配 runtime、实收终端、GST 商品、现金/退款差异与重试恢复仍待补齐。 |
| 采购收货 | 是 | 是 | 待验证 | 待验证 | 当前源码 SHA fbd2871e 的 Node 24 本地 Playwright：采购确认/收货延迟响应与恢复 66/66 PASS；Vendor Connections 五视口 5/5；供应商目录新增 69/69（10 次模拟写请求仅到 fixture）；供应商编辑 13/13；320–1440px 截图目视检查通过。所有网络由 fixture 接管，真实 Odoo 写入 0。此前隔离租户一项采购单确认/收货、库存增量 +1 和重复收货防重通过，见 `docs/UAT_PROCUREMENT_RECEIVE_ISOLATED_2026-10-22.json`；真实供应商写入、部分/超量收货、供应商发票匹配、财务对账和完整业务闭环仍未验收。证据：`docs/UAT_PURCHASE_BUSY_LOCAL_2026-10-24_GOAL-RERUN.json`、`docs/UAT_VENDOR_CONNECTIONS_RESPONSIVE_LOCAL_2026-10-24_GOAL-RERUN.json`、`docs/UAT_SUPPLIER_CREATE_LOCAL_2026-10-24_GOAL-RERUN.json`、`docs/UAT_SUPPLIER_EDITOR_LOCAL_2026-10-24_GOAL-RERUN.json`。 |
| AI 助手 | 是 | 是 | 待验证 | 待验证 | Node 24.19.0 local browser fixture 110/110 PASS across 22 AI card scenarios and 320/390/768/1024/1440px; CTA destinations, retry, empty states, truncation and external CTA rejection pass with no overflow/page errors or business writes. Evidence: docs/UAT_AI_CARD_UI_LOCAL_FULL_CURRENT_GOAL.json (source 8c7f488, dirty tree). Latest online API-only card contract on runtime 1bc4177 is 9/17 PASS; 4 guided cards are missing and 4 entity actions have incorrect CTA routes. All 17 responses report writeRequestCount=0. Diagnostic evidence: docs/UAT_AI_CARD_CONTRACT_ONLINE_2026-10-24_RUNTIME-1BC4177-DIAGNOSTIC.json. Current source is 8c7f488 and differs from runtime; dirty Java changes add the missing route/card mapping but have no exact-SHA Java 21 verification. Isolation gate: /api/odoo/uat-context HTTP 409, isolated=false; business writes 0. Frontend unit tests 23/23, typecheck PASS and source lint 0 errors / 15 warnings. Exact-SHA Java 21 gate, matched deployment, representative real invoice accuracy and isolated business acceptance remain pending. |
| Overview 报表首页 | 是 | 是 | 待验证 | 待验证 | Node 24 浏览器 fixture 15/15 PASS：320/390/768/1024/1440px 布局、趋势切换/键盘访问和顶栏 AI 入口；另有异步竞态专项 PASS，延迟的旧 24 小时响应未覆盖最新 7 天数据。API 全部 fixture 拦截，业务写入 0；源码尚未部署，真实 Odoo 数据未覆盖。 |
| 全站静态页面路由烟测 | 是 | 是 | 待验证 | 待验证 | 当前共享工作树 Node 24.19.0 Playwright 扫描正式 app 目录 143 个静态路由 × 390/1440px，共 286/286 PASS：HTTP 200、无 page error、无横向溢出或 AI 控件遮挡。证据 docs/UAT_LOCAL_STATIC_ROUTE_MATRIX_2026-10-24-CONTINUATION-1BC4177-NODE24.json（source 8c7f488，dirty tree）；所有 API 使用只读 fixture，业务写请求 0。仅本地路由烟测，不证明线上版本或 Odoo 数据闭环。 |
| 门店导航与移动侧栏 | 是 | 是 | 待验证 | 待验证 | Node 24.19.0 Playwright 9/9 PASS：AI Assistant 桌面侧栏持续可见且高亮；Customer 菜单包含 Customers、Groups、Price Lists、Balances、Gift Cards；桌面点击到 Price Lists；390px 抽屉以 modal/dialog 打开，导航后自动关闭。价格列表空态按真实 API schema fixture 返回；业务写入 0、浏览器错误 0。Price Lists 同一候选已单独覆盖 390/1440px CRUD/恢复 24/24 PASS，移动端浮动 AI 曾遮挡归档行 Edit，已改为顶栏入口并复验无重叠，见 `docs/UAT_PRICELISTS_LOCAL_2026-10-24_HEAD-10083BC8.json`。未验证线上版本。 |
| Odoo 价目表管理 | 是 | 是 | 待验证 | 待验证 | Node 24.19.0 本地 Playwright 24/24 PASS，覆盖 390/1440px 的 Odoo price list 读取、名称搜索、创建/编辑/归档、空名称拦截、服务失败恢复和响应式布局。8 次模拟 POST/PATCH/DELETE 由 fixture 处理，真实 Odoo 写入 0。手机截图发现 FAB 遮挡归档行 Edit，已调整为 header-only AI 并验证路由矩阵 2/2 PASS。未验证 Odoo 真实价目表、客户绑定、POS 结账实际应用或线上部署。 |
| 客户目录 | 是 | 是 | 待验证 | 待验证 | Node 24 Playwright fixture 26/26 PASS，覆盖 390/768/1024/1440px、短列表收缩、AI 入口位于 header、创建失败保留表单/重试及延迟搜索期间锁定旧客户编辑；8 个模拟写请求仅命中 fixture，真实业务写入 0。真实 Odoo 客户读写及当前源码线上验证未完成。 |
| 客户分组 | 是 | 是 | 待验证 | 待验证 | Node 24 Playwright fixture 22/22 PASS，覆盖 390/768/1024/1440px、短列表收缩、AI 入口位于 header、管理员 CRUD、员工只读及延迟搜索期间锁定旧结果；12 个模拟写请求仅命中 fixture，真实业务写入 0。真实 Odoo 分组写入及当前源码线上验证未完成。 |
| 两租户交付 | 是 | 是 | 是 | 待验证 | 公开注册页与 slug 可用性 GET 为 2/2 PASS；这未验证建店生命周期。Odoo 隔离库 aipos_uat 只读认证及模型探针通过，当前工作树 tenant-scope 静态审计 67 controllers / 0 findings；独立应用 runtime、收银员/店长/第二租户账号、跨租户在线越权测试和备份恢复仍未验收。Runtime SHA 未核验。 |

试点决策：**NO-GO**。阻塞：Demo frontend/backend runtime are 1bc41771f6be6c28ccc0da84d2e8a7a73ae8b681; current source/origin main is 8c7f488ef89fe8571c8da185f879c7d45544396a and the working tree is dirty. Runtime and source do not match; there is no frozen candidate SHA.；pos-api 候选尚无当前 exact-SHA 的 Dokploy Java 21 `mvn -B clean verify` 完整日志，后端变更不得推送或部署。；Demo runtime 1bc4177 与当前源码 8c7f488 不匹配；当前线上 AI 卡片协议只读验收 9/17，4 类实体 CTA 路由错误、4 类目标卡片缺失。dirty Java 候选新增相应分类/路由处理，但未通过同 SHA Java 21 验证。真实供应商发票字段准确率仍需代表性脱敏票据验证；合成票据 OCR 9/9 不能替代真实票据验收。；隔离 UAT 已有一项采购收货及销售/退款/关班证据，但销售税额为 0、退款后现金差异为 32，尚未形成完整对账。Demo `/api/odoo/uat-context` 返回 409、isolated=false，当前不能安全进行业务写入。；价格建议真实上游数据、第二门店/platform operator 凭据、跨租户授权和备份恢复演练仍未完成。
<!-- capability-summary:end -->

# Orithos POS 试点放行清单

## 2026-10-24 AI 回归更新

- 总问法矩阵最新为 344 条，Demo 只读结果 **325 PASS / 0 BLOCKED / 19 FAIL**；除 16 条库存澄清旧行为外，3 条 bulk pricing 导航同义问法也待匹配 runtime 验证。候选已加入 `/stock/bulk-price-edit` 路由回归。

- 总问法矩阵已扩展到 340 条；Demo 只读结果 **324 PASS / 0 BLOCKED / 16 FAIL**，失败均为无商品标识库存澄清问法。证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_CURRENT_FULL-340-RERUN.json`。
- AI 功能面 **14/14 PASS**；卡片合约旧 runtime **0/9 PASS**。运行时为 `0e4a48ea`，当前候选为 `e21a7943`，两者不匹配，不能据此判定候选实现。
- Pilot 继续 **NO-GO**：候选包含 `pos-api` 修改，尚未取得同 SHA Dokploy Java 21 `mvn -B clean verify` 成功日志；隔离业务闭环、真实发票 OCR 和匹配 runtime 验收仍未完成。

## 2026-10-23 当前候选最新状态（优先于下方历史快照）

- 候选 source `e21a794356594de3aed15805664dc0fcac482c5f` 为 dirty worktree；Demo runtime `0e4a48ead3e32c57623ed726e3583cee5945d0ca`，source/runtime 不匹配。
- Assistant API-only 332 条矩阵：**324 PASS / 0 BLOCKED / 8 FAIL**；13 条库存澄清专项：**1 PASS / 0 BLOCKED / 12 FAIL**。失败集中在旧 runtime 未执行候选澄清规则，所有请求均无业务写入。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_FULL-332-RERUN-CURRENT.json`、`docs/UAT_AI_STOCK_CLARIFICATION_VARIANTS_ONLINE_CURRENT.json`。
- 最新线上 AI 功能面探针 **14/14 PASS**（含 assistant、transcription、label vision、invoice vision 配置检查），证据：`docs/UAT_AI_FEATURES_VERIFY_ONLINE_CURRENT_RERUN.json`；此为只读运行时观察，不替代候选 SHA 匹配验收。
- AI card contract 旧 runtime 专项为 **0/9 PASS**：缺结构化 `cta` 和四类 guided-action 卡片；候选 UI 已通过本地 fixture 兼容旧字段并拒绝外链，待候选部署后复测。证据：`docs/UAT_AI_CARD_CONTRACT_ONLINE_CURRENT_RERUN.json`。
- 前端单测 **18/18 PASS**、typecheck、UAT 脚本语法和 diff 检查通过；CTA 会拒绝管理、内部和 API 路径。本地不运行 build。后端 Java 21 exact-SHA `mvn -B clean verify` 尚未完成，因此不推送、不部署，Pilot **NO-GO**。

## 2026-10-23 当前版本复验

- Demo `/api/public/version` 返回 frontend/backend SHA `01f96f98d79f61e66f1d1d7d8066b179f8bd8307`；`main` / `origin/main` 已前进至 `a44fd650d6cdd7a3f1e3669de2f176d783739e90`，新后端报告候选尚未部署。该 SHA 的 Java 21 exact-SHA `mvn -B clean verify` 证据尚未找到。
- 已部署 runtime 上 AI surface matrix **14/14 PASS**；Assistant API-only 目录 **322/322 PASS**；合成澳洲税务发票 OCR preview **9/9 字段/金额检查 PASS**。AI reports **20/22 PASS / 2 BLOCKED / 0 FAIL**，两项库存问数阻断。全部无 Odoo 业务写入。证据：`docs/UAT_AI_FEATURES_VERIFY_ONLINE_2026-10-23_RUNTIME-01F96F98.json`、`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_RUNTIME-01F96F98.json`、`docs/UAT_AI_VALID_INVOICE_OCR_ONLINE_2026-10-23_RUNTIME-01F96F98.json`、`docs/UAT_AI_REPORTS_READONLY_2026-10-23_USER-RECHECK.json`。
- 全站静态巡检 **282/282 PASS** 的代码与当前 runtime `01f96f98` 的 `pos-ui` / `pos-api` 无差异；当前 main 的 `a44fd650` 后端改动不在该 runtime。未提交的 Overview/客户页 UI 修改另有本地 fixture 通过，但尚未部署。
- 隔离环境已有一项采购收货/库存增量/重复保护通过，以及销售/退款/关班 8 项通过；被测销售税额为 0，退款后关班现金差异为 32，不能视为完整对账通过。Demo `/api/odoo/uat-context` 返回 409，本机没有 `.env.uat` 或 Docker CLI，无法安全追加写入。
- **仍 NO-GO**：需部署通过 context attestation 的专用 UAT stack，补齐 GST、现金退款差异、库存、定价、供应商发票匹配和部分/超量收货全链路；另需用真实脱敏供应商票据验 OCR 准确率。未运行本机 production/Docker build。

## 2026-10-24 Deployed AI verification

Demo frontend and backend report runtime SHA `bcbf3d4c178973558ab801fb343bce6aec3789d3`. The deployed AI feature suite returned **14 PASS / 0 BLOCKED / 1 FAIL**; invoice OCR preview is the sole failure (`50213 provider/model configuration failure`). A 322-case Assistant API-only matrix returned **321 PASS / 0 FAIL / 1 BLOCKED**; the only blocked gibberish-input case returned **1/1 PASS** on an isolated retry. Invoice upload safety routing passed, and the matrix recorded no business write requests. Evidence is in `docs/UAT_AI_FEATURES_VERIFY_ONLINE_2026-10-24_DEPLOYED-BCBF3D4.json`, `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_DEPLOYED-BCBF3D4.json`, and `docs/UAT_AI_UNKNOWN_GIBBERISH_ONLINE_2026-10-24_DEPLOYED-BCBF3D4.json`.

The current local `.env` uses `AI_DASHSCOPE_MODEL=qwen3.8-flash` but explicitly overrides the invoice vision model to `AI_VISION_MODEL=qwen-vl-plus`. The invoice service uses that override first. The Dokploy backend values could not be read in this session; check that the vision model is enabled for the configured key/region, and keep `AI_DASHSCOPE_BASE_URL` host-only. A direct provider request from this workstation ended in `ECONNRESET`, so it does not establish server-side provider health. Do not share the API key. The pilot remains **NO-GO** until OCR works with the deployed configuration and real business flows are reconciled in an isolated Odoo environment.

## 2026-10-24 Customer UI local verification

The current customer directory and customer groups source passed isolated browser fixture checks on Node `v24.19.0`: **10/10** directory checks and **9/9** group checks at 390/1440px where applicable. The fixtures intercepted all 10 simulated write requests; production business writes were **0**. `tsc --noEmit`, targeted ESLint, the existing 4 unit tests, fixture script syntax checks, and `git diff --check` passed. Evidence: `docs/UAT_CUSTOMER_DIRECTORY_LOCAL_2026-10-24_NODE24.json` and `docs/UAT_CUSTOMER_GROUPS_LOCAL_2026-10-24_NODE24.json`; screenshots are in the matching `docs/screenshots/2026-10-24-*-node24/` directories.

This was a local fixture run against an isolated source copy whose customer page hashes match the working tree. It did not test real Odoo data or writes, and no production/Docker build was run. Keep the pilot **NO-GO** until the separate backend Java 21 exact-SHA gate, matched deployment verification, AI/OCR blockers, and isolated real-business reconciliation are complete.

## 2026-10-23 AI release status

The source-matched Demo run on `9e61de5d` covered 320 Assistant API-only utterances: **316 PASS / 0 BLOCKED / 4 FAIL**. A current-contract 4-case recheck recorded **2 PASS / 2 FAIL**: invoice uploads correctly open the guided `/invoices/scan` preview; a Chinese price-review query is incorrectly classified as a guided write, and “查看批量改价” routes to capped pricing instead of bulk edit. The separate feature suite returned **14 PASS / 1 FAIL** because invoice OCR preview returned HTTP 200 / code `50213` (provider/model configuration failure). These UAT requests produced no Odoo business writes.

`main` and `origin/main` are both `fbcea34e`; they include the committed price-query fix `00e4a5af`. The worktree has further uncommitted Java routing/tests and a 322-case utterance catalog for Chinese invoice-upload wording. Demo still runs `9e61de5d`. Java 21 exact-SHA `mvn -B clean verify` has not run; this machine has Java 8. `pos-api/Dockerfile` uses `mvn -B clean package -DskipTests`, which is not test evidence. Keep **NO-GO** until the exact candidate passes Java 21 verification, is deployed, and the 322-case catalogue passes on a matching runtime. Invoice OCR remains blocked by provider/model error `50213`.

## 2026-10-22 AI release status

The latest AI-only Demo recheck remains **NO-GO**: 304 utterances returned 265 PASS / 33 BLOCKED / 6 FAIL on runtime `b4719e7c`, which does not match the dirty worktree based on HEAD `8a4c56e5` (backend AI work is still uncommitted). The source has not passed Java 21 exact-SHA `mvn -B clean verify`; do not push or deploy it. Features were 14/15 because the invoice OCR probe returned HTTP 500 / `50000`; live AI stock reporting was unavailable. The read-only companion suites passed availability, routes, surface/auth, UI, transcription, metrics and capability gates; History/Platform and stock RPC retain credential/data blockers. No business writes occurred. See `docs/AI_ASSISTANT_TEST_PLAN.md` and timestamped UAT evidence.

**2026-10-21续验：仍 NO-GO。** 用户确认 Dokploy 部署成功；checkout/runtime SHA 尚未取得。目录/助手实际视口 44/44，session warmup 后盘点/补货线上只读 13/13；冷入口仍记录一次 Odoo session 401。采购 AI 入口修复本地 40/40，尚未推送。真实隔离 Odoo 业务闭环与后端 Java21 门禁仍未完成。

**2026-10-21 最新决定：NO-GO。**前端 `1897d8b2f65946ddedef63f1dbe7437548851ca5` 已推送，用户报告Dokploy成功，checkout/runtime SHA未核验。最新Demo库存定价只读矩阵4/8通过：桌面通过，手机仍旧布局；无业务写入。证据 `UAT_UI_BATCH_DEMO_RUNTIME_BASELINE_2026-10-21_1897D8B.json`。需先确认Demo实际运行提交，再验本批线上交互；真实Odoo闭环和后端同候选SHA远程Java21门禁仍未完成。下方保留历史检查记录。

更新时间：2026-10-15

## 域名分工（app 控制台 / demo 试点店）

- 控制台：`https://app.orithos.com.au` — 仅 `PlatformShell` + `/platform/*`（无商店侧栏）。访问 `/` 或 `?next=/` 应落到 `/platform/stores`。
- 试点店：`https://demo.orithos.com.au` — 完整 POS 壳（Sidebar / Sell）。
- 部署后验收：`app/` 不出现收银页；`app/platform/stores` 有 Stores 导航；demo 登录后仍为商店 POS。
- 历史 UAT JSON 中旧 `target: app.orithos.com.au` 门店矩阵证据已迁移目标为 demo；控制台专项单独验。

## Dashboard mock 清理

- `/dashboard` 已移除固定退款演示数据，统一读取 Odoo 实时报表；重复 dashboard 入口和无引用的演示销售注入器同步清理。
- 部署后需补做 `/dashboard` 生产回归，确认页面不出现旧演示商品、发票号或固定金额。

## 全静态页面回归

- 128 个静态路由在 390/1440 两个视口共 256 项检查，252 项通过；126 个页面无 404/5xx、页面错误或横向溢出。
- 租户注册/子域名登录整套代码已整理并随本次部署提交；前端 typecheck 通过、lint 0 errors / 50 warnings。后端测试必须由 Dockerfile 的 Java 21 builder 完成，本机 Java 8 无法运行 Maven 验证。
- `/auth/bootstrap`、`/signup` 的生产 404 需要在本次 Dokploy 部署完成后重新验证；在 200 响应、租户 API 安全和 Java 21 构建证据出现前，P0 仍保持 BLOCKED。

## 2026-10-15 追加复验

- 生产只读回归再次通过：Odoo 自动恢复 6/6、报表范围 2/2 HTTP 200 且指标自洽、页面矩阵 43/43（含 `/dashboard`）；未产生销售、退款、采购、收货、库存或关班写入。
- 前端 typecheck 通过，lint 0 errors / 49 warnings；warning 为既有 React effect/static-components 规则及少量未使用符号，客户余额页未使用导入已清理。
- 放行状态不变：仍需真实隔离环境交易/采购收货、班次现金实点关账、价税/库存位置确认、SMTP 和硬件验收后才可从 NO-GO 转为 GO。

## 最新 R2 真实售价、GST 与收据数据复核（2026-10-15）

- 最新 R2 SHA 与用户提供版本一致。Odoo `aipos` 商品目录已经是该版本真实售价/可映射 GST：4,716 款，其中 4,572 有来源售价；144 缺价、112 缺 GST、1 款来源 9.5% 未映射的商品均不可售。dry-run 无需改价税，库存未写。
- POS 商品卡现用 Odoo `account.tax.compute_all` 计算含税零售价，线上 `148 PINOT NOIR` 显示 $12.99 Incl. GST，与 R2 一致。
- R2 最近 16 笔收据（21 行、19 条支付）逐笔依据折扣、优惠、现金舍入、附加费计算应付额，净支付差异 0；总应付 $510.62、GST $46.41。生产浏览器 #00046355 明细验证折前 $86.96、优惠 $14、舍入 -$0.01、实付 $72.95。
- GitHub `main` 提交 `93339f1` 已在生产生效，收据 API 和 POS 商品卡均完成只读回读；证据见 [R2 零售数据 UAT](UAT_R2_LIVE_UAT_2026-10-15.json)。
- 缺价/缺 GST 商品的本地人工核验表已生成：224 个唯一商品，全部与 Odoo 匹配，当前全部不可售；其中 144 缺来源价、112 缺 GST（32 项重叠）、1 项税率为未映射 9.5%。表格含商品成本/库存，只保存在仓库外的本地工作区 `C:\shawn\1code\1project-new\aistore_pos\v1\R2_PRODUCT_PRICE_TAX_REVIEW_2026-10-15.csv`，没有随 GitHub 推送。需由店主/会计核实后再维护税价。
- 历史收据是 R2 只读归档，仍不写为 Odoo 交易；不会改变库存、班次或账务。自动同步保持关闭，正式运营不依赖 R2。
- 追加部署 `04dd61a` 后再次完成生产验证：时区以 Odoo 公司门店州为准，SA 为 `Australia/Adelaide`；销售 `260-1-000009` 显示 `13 Oct 2026, 08:11 pm`。默认 Odoo 自动恢复有效、班次 `orithos_store1/00004` 仍开；42/42 页面、84/84 布局通过。R2 同一 SHA 的 16 笔只读收据仍在线；扫描 4,748 条商品详情未发现图片字段/URL。证据见 [追加 UAT](UAT_R2_TIMEZONE_2026-10-15_04dd61a.json)。
- 报表范围切换、净销售/退款/税额校验通过；班次关闭保护及采购空状态只读检查 3/3 通过。无销售、退款、采购或库存写入。
- 当前 8/24 小时报表为零是因为 Odoo 中没有近期 POS 订单；R2 归档收据不计入 Odoo 经营报表和补货。若要用 R2 测智能预测/经营分析，需要独立标记的测试来源视图。

## R2 实际价格与只读销售历史（2026-10-14）

- 2026-10-15 复核用户重新提供的 R2 对象，SHA-256 与已同步版本相同；实时商品同步 dry-run 为 0 差异。最新 16 笔交易、真实售价/GST及订单详情已经在线上销售历史的 `R2 · TEST` 只读区提供，无需再次导入。
- 不将历史收据重放到 Odoo，以免重复形成库存或账务交易。`orithos_store1/00004` 中两笔 UAT 销售均已全额退款，并保留对应两笔退款供审计；本次未新增/删除交易或调整库存。
- 最新快照 SHA-256 `2fc62e86c5f0fd1045a5c8f830c544dcc168b232bc384afd8d6eddcbd6625116`。Odoo `aipos` 中 4,716 个 R2 商品已完成真实目录售价与可映射税率替换；验证 dry-run 为 0 待更新、写入回读 0 mismatch，库存未写。
- 144 个无来源售价商品、112 个来源税率缺失商品及 1 个来源 9.5% 商品都没有伪造可售数据；不满足可验证售价/税率的商品已从 POS 禁售，待会计/店主确认后配置。
- 追加安全复核修复了同步脚本的漏判：R2 缺 GST 不再被视为免税。80 款“有来源售价、无 GST 来源”的商品已从 POS 禁售；Odoo 回读确认 112 款缺 GST、144 款缺价都没有可售模板。复核 dry-run 待更新为 0、无 mismatch、库存字段未写入。
- 16 笔最新 Shopfront 收据已在生产销售历史页由管理员只读查看；同源未登录请求被拒绝，管理员接口返回 16 笔、21 行、19 条支付记录，收据 GST 合计 $46.41。最新收据详情在浏览器核对通过。没有转换成 Odoo 交易，不能用于退款或对账。详见 [R2 零售数据生产 UAT](UAT_R2_LIVE_UAT_2026-10-15.json)。
- 最新部署 `67bd1b6387b88642b23055317736799d277420cf` 已在 Dokploy 标记 Done。R2 的读取与页面验收通过；目录同步回读无差异、没有写库存。自动同步保持关闭，正式上线不依赖 R2。整体仍 **NO-GO**，直到真实税价核验、隔离环境 POS 销售/退款、采购收货测试及门店运行准备等事项完成。

## 全站生产回归（2026-10-15）

- 页面矩阵 42/42、双视口布局 84/84、交互 6/6 通过；角色权限临时创建、分配权限、删除和清理通过。证据：[页面矩阵](UAT_PAGE_MATRIX_2026-10-15.json)、[布局](UAT_LAYOUT_2026-10-15.json)。
- Odoo 自动恢复专项 6/6 通过：清除 Odoo 浏览器会话后，补货页自动恢复；商品页读请求安全重试；POS 班次 `orithos_store1/00004` 仍开启。证据：[自动恢复 UAT](UAT_ODOO_AUTORECOVER_2026-10-15.json)。
- 最新应用修复部署 `67bd1b6` Done；后续文档提交部署 `8eeabf4` Done。此次回归没有执行销售、退款、采购、收货、库存调整或关班。整体仍 **NO-GO**，因为新目录交易对账、隔离采购/收货、现金实点关账和门店硬件等未完成。

## 历史状态（2026-10-14；其价格/税 MOCK 回退已由上方 R2 校准覆盖）

- R2 目录已导入当前 `aipos` 测试/试点库：4,716 个唯一源商品，1,089 个商品有库存、总量 46,575.33；2 款 DEMO 停用。商品位于 `R2 TEST DATA` 分类，历史收据未导入。
- 144 个缺价使用成本回退并标记 `MOCK_COST_FALLBACK`；DashScope TLS 失败，未由模型生成。缺失/非标准的 113 个税率字段映射为 MOCK 10%。公司为标记 TEST 的模拟澳洲门店，未编造 ABN。
- R2 仍仅用于开发/验证，自动调度关闭，正式上线无需 R2。收据/客户数据不进入 Odoo。
- 页面矩阵、布局、自动恢复和部分 mock UI 验收已有通过证据；最新部署 SHA `42844b8` 的全站 42 路由、目录加载和响应式验收已通过。基于新目录的收银/退款、采购/收货及关账 UAT 未完成；目前仍只有 `aipos`，没有独立 staging 数据库。
- AI、SMTP、打印机/钱箱及多租户注册/专属 URL/Outlet 隔离未完成。正式上线 **NO-GO**。

> 下方历史 R2 缺少商品详情/收据的说法仅针对 CSV 导出；本轮从 SQLite 核实了数据库内对应数据。


## 2026-10-14 历史复核（已由 2026-10-15 状态更新）

最新生产部署 `42844b86422bf81ad38d74122dddd3b8a3b1d8fe` 的页面矩阵 42/42、布局 84/84、交互 12/12、订单页 16/16、只读班次保护 3/3、收货与贷项单 API 保护各 8/8、发票 MOCK 审阅 4/4、Odoo 连接失败提示 4/4、自动恢复 6/6 已通过。R2 目录数据导入当前 `aipos` 测试/试点库，导入汇总见 [UAT_R2_ODOO_IMPORT_2026-10-14.json](UAT_R2_ODOO_IMPORT_2026-10-14.json)。

**仍然 NO-GO：** 没有独立 staging；本轮没有基于 R2 商品创建销售、退款、采购或收货，也未关闭 POS 班次 00004。不能把只读页面、拦截式 MOCK 表单测试当作真实交易验收。下一步先建立/确认隔离 Odoo 测试库，在其中完成销售退款对账、采购收货对账；现金实点后再决定是否关班。AI 缺价生成未成功，SMTP、支付终端、打印机/钱箱、GST/价目表核验与多租户建店仍未完成。
## 历史复核（2026-10-14 20:05，R2 状态已由本轮补充取代）

### R2 worker 修复已推送（`4dd7268`）；Dokploy 精确 SHA 未核实

| 项目 | 状态 | 证据 |
|---|---|---|
| R2 线上配置与首轮同步 | **PASS** | 最近 UAT 为 `configured=true / success`、reason=initial；6 个对象、SQLite `quick_check=ok`、DB 250,114,048 字节；下次运行 2026-10-15 03:30 Adelaide。 |
| 每日 R2 任务 | **PARTIAL** | 首轮成功；第二个计划周期、容器重启后的快照持久性、上游时区未验证。 |
| R2 对象进入 POS 业务界面 | **未完成** | 只有私有归档状态卡；尚未解析 manifest/schema/CSV 并提供业务页面。 |
| Worker 时区保障 | **已推送，部署待核** | Alpine 镜像补 `tzdata`；无效时区 fail-fast，不再静默用 UTC。 |
| 同步失败反馈 | **已推送，部署待核** | 管理员 API/UI 返回并展示 `nextAttemptAt`，不包含密钥。 |
| 生产可用性 | **需观察** | 一次 R2 匿名探测 502 后立即恢复为 401；不能据此证明长期不稳定或完全稳定。 |
| 本地密钥配置 | **未发现** | 本仓库根 `.env` 无 R2 变量（只检查键名/是否非空）；线上已 configured。确认本地文件位置并撤销曾公开的旧 key。 |

完整文件摘要和状态见 [R2 UAT](UAT_R2_ARCHIVE_2026-10-14.json)；试点其他运营门槛保持 NO-GO。

## 当前状态复核（2026-10-14 19:01，上海时间）

### 最新生产部署：`05dffdb9fd3ae74026803d1587deedcabdd6117d`（Dokploy Done）

| 项目 | 状态 | 证据 |
|---|---|---|
| GitHub / Dokploy | **PASS** | 精确 SHA `05dffdb` 已在 Dokploy 标记 Done；`main` push 会触发部署。 |
| 全站页面与角色权限 | **PASS** | 35/35 路由通过；管理员角色临时创建、权限保存和清理通过；没有失败页。见 `UAT_PAGE_MATRIX_2026-10-13.json`。 |
| 订单/采购相关页面 | **PASS（只读专项）** | `05dffdb` 8 路由 × 2 视口，16/16；页面错误 0、横向溢出 0、业务写请求 0。见 `UAT_ORDER_PAGES_2026-10-14.json`。 |
| Odoo 自动连接 | **PASS** | 删除 Odoo session 后首个业务页自动连接，目录只读请求自动恢复重试，6/6；班次 `orithos_store1/00004` 仍打开。见 `UAT_ODOO_AUTORECOVER_2026-10-13.json`。 |
| 客户余额路由 | **PASS（状态说明）** | 修复原 `/customers/balances` 自我导入导致的 404；现在清楚标明本试点尚未从 Odoo 接入客户欠款/还款，不显示旧模拟余额。 |
| R2 worker / 集成页 | **代码已部署，未配置上游** | `05dffdb` 上 R2 UAT 6/6，匿名状态 API 为 401，管理员响应无密钥字段，手机/桌面无溢出。真实状态为 `configured=false`，未下载任何对象。见 `UAT_R2_ARCHIVE_2026-10-14.json`。 |
| POS 业务写入 | **未改动** | 本轮没有销售、退款、采购、收货、库存调整或关账写入；AI 保持关闭。 |
| 试点放行 | **NO-GO** | R2 凭据/首次下载未完成；现金实点与关班、真实采购收货、价目表/GST/库存位置和硬件/SMTP 等运营项也未完成。 |

R2 worker 默认每日 03:30 `Australia/Adelaide` 运行（比上游所述 02:30 晚一小时），但是当前没有 R2 凭据，计划任务不会执行。生产 API 在 `05dffdb` 上仍返回 `configured=false / not_configured`。需轮换聊天中分享过的旧密钥，再由店主在 Dokploy app compose 的 Environment 填入 `R2_ENDPOINT`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` 后部署；核实状态、手动同步并验 manifest 与 SQLite `quick_check`。核对上游时区/结束时间后再确认日程。不能把此状态表述为“每日同步已生效”。

## 历史状态复核（2026-10-14 18:17；以下内容由上方最新状态取代）

### 历史线上检查：应用 `d69ccd9`（2026-10-14 18:17，上海时间；已由上文 `4afaff5` 复验取代）

| 项目 | 当前状态 | 证据/说明 |
|---|---|---|
| GitHub / Dokploy | **PARTIAL** | 最近 Done 应用源 SHA `d69ccd9b7e24fec2d6e45cef7733cf847e7a0432`；后续订单编辑表单提交 `f0cbc79` 正在 Dokploy Running。 |
| 最近完整页面矩阵与角色安全 | **PASS** | `fddb70c` 上 35/35 路由；角色临时创建、权限保存、删除与 API 清理通过；12 次 Odoo session/recovery 200；未授权响应 0，UI 检查无失败。 |
| 最新改动页面专项 | **PASS** | `060dc89` 上价格组、促销分类、礼品卡列表和导入 4 路由 × 2 视口，8/8；只读导航，无写入。 |
| 新增促销浏览页 | **PASS** | `396ef3e` 的 `/promotions` 在 390/1440 两种视口通过，空活动列表、只读状态显示正常；未写入促销。 |
| 订单及销售历史相关页面 | **PASS（专项）** | `d69ccd9` 上 8 路由 × 2 视口 16/16；无溢出或页面错误；未提交订单/退款/收货。 |
| 双视口布局 | **PASS（分 SHA 记录）** | `24d8894` 全站 35 页 × 390/1440 为 70/70；价目表改版在 `b0c62f9` 专项 2/2，无横向溢出。 |
| 设置页手机/桌面专项 | **PASS** | 13 项 × 2 视口，26 项通过，目标 `24d8894`；`UAT_SETTINGS_MOBILE_2026-10-14.json`。 |
| 生产接口可达性 | **PASS / 延迟待观察** | `/login` 200（8.3 秒），未登录 `/api/auth/me` 401（6.5 秒，预期），`/api/odoo/session` 200（14.3 秒）。单次探测不能证明持续稳定。 |
| 当前可放行性 | **NO-GO** | 技术回归通过；现金实点/班次关账、真实采购收货、价目表/GST/库存位置、硬件和 AI 前置条件仍未完成。 |

UAT JSON 保留各自实际 deployment SHA：完整矩阵 `fddb70c`，订单/补货/销售历史专项和自动恢复复测 `d69ccd9`，价目表专项 `b0c62f9`，全站布局/设置专项 `24d8894`，后台路由专项 `060dc89`，促销浏览 `396ef3e`。页面矩阵会创建并清理临时权限记录；订单专项没有订单/退款/收货等写入。

| 项目 | 当前状态 | 证据/说明 |
|---|---|---|
历史快照：早先 `4191458` 曾因登录请求超时未能回归；该状态已被新 SHA 验证取代。当前有 UAT JSON 和交接文档待提交；促销页与订单页有并行修改，需保留；请勿修改 UAT 实际记录的 deployment SHA。

这份清单把代码可验证事项和必须依赖生产环境、店主或硬件的事项分开。没有证据的项目保持 `BLOCKED`，不能用 fixture、旧部署或页面可达性代替。

## P0：放行前必须完成

| 项目 | 当前状态 | 完成证据 |
|---|---|---|
| Git、origin、Dokploy SHA 一致 | **PASS（`4afaff5`）** | `4afaff5` Done；工作区若有并行改动，需按其精确 SHA 另行验收 |
| 生产入口可用性 | **PASS / 延迟待观察** | 只读端点在本轮返回预期状态码但延迟约 6–14 秒 |
| 生产页面与安全回归 | **PASS（只读页面）** | `4afaff5` 全站矩阵 35/35、订单专项 16/16；真实采购/收货写流程仍未测 |
| Odoo 会话自动恢复与登出拒绝 | **PASS / PARTIAL** | `4afaff5` 清 Cookie 自动恢复 6/6；完整 Orithos 登出拒绝链路本轮未测 |
| R2 每日归档拉取 | **BLOCKED** | worker 已部署且 API/UI 安全检查通过；`configured=false`，尚无首次成功下载，需轮换凭据并配置 Dokploy 后验证 |
| 班次 `orithos_store1/00004` 整班对账 | **BLOCKED** | 需要只读导出销售/退款/支付流水并与 Odoo 对账 |
| 现金实点与班次关账 | **BLOCKED** | 店主实点现金、确认差异后，记录关账结果和新班次状态 |
| 真实采购、审批、收货、库存增加 | **BLOCKED** | 需要隔离测试供应商或测试库；fixture 不计入此项 |

## P1：门店运营前置条件

- 核对 POS 价目表、GST、库存位置、顾客含税价格和酒款助手的价格/库存口径。
- 配置 SMTP，并验证邀请和密码重置邮件；未配置时继续显示复制链接降级路径。
- 接入并验收真实打印机、钱箱和支付终端；未接入时不得宣称硬件可用。
- 在 Node 24 / Java 21 环境运行 typecheck、build 和 lint；记录并处理历史 lint warnings。
- 提交当前 UAT 文档和脚本修改，再生成新的部署与回归证据。

## P2：前置条件满足后

- 在预算、数据范围、权限和日志保留策略明确后，启用只读 AI 销售/库存问答。
- 验证无权限、超预算、模型失败、Odoo 无数据和超时回退；AI 不得触发销售、采购、退款或关账写入。
- 收集店主/店员反馈，再决定离线、拆分支付、多门店、语音、识别和自动化建议的版本优先级。

## 放行规则

只有当 P0 全部为 `PASS`，并且未接入的 SMTP、硬件和 AI 能力在界面中明确标注时，才允许称为“核心试点闭环完成”。当前 `4afaff5` 页面回归通过，但关班、真实采购/收货及价格/GST/库存语义仍未通过，因此保持 NO-GO。

## 2026-10-15 租户注册部署复核

- 本地 `main` 与 `origin/main` 已同步到 `311f396`（Add tenant signup and subdomain isolation）。代码中的 Next middleware 将 `/signup`、`/auth/bootstrap`、`/api/auth/bootstrap` 与 `/api/public/*` 明确列为公开路径。
- 生产 `https://app.orithos.com.au` 当前仍返回旧构建行为：未登录访问 `/signup` 与 `/auth/bootstrap` 返回 `307` 到登录页；`GET /api/public/subdomain-available?slug=testshop` 返回 `401`。因此 311f396 尚未在生产生效，不能把本地代码或重定向后的 200 计为注册功能通过。
- 生产只读 `GET /api/odoo/session` 返回 `200` 且 `autoRecoverConfigured=true`，说明 Odoo 自动恢复配置仍在；本轮没有写入销售、退款、采购、收货、库存或关班数据。
- 最新全站脚本 `scripts/pilot-all-static-pages-uat.mjs` 于 2026-10-15 02:24 UTC 对 128 个静态路由、390/1440 两个视口执行：252/256 通过，4 个失败均为上述两个新路由的生产 `404`；其余页面无横向溢出、无页面错误。证据：[UAT_ALL_STATIC_PAGES_2026-10-15.json](UAT_ALL_STATIC_PAGES_2026-10-15.json)。

### 继续执行

1. 在 Dokploy 确认 `311f396`（或其后的文档提交）构建状态为 Done，并确认构建日志使用 Java 21；若没有新部署记录，重新检查 GitHub webhook/应用部署事件。
2. 部署后用匿名请求复核：`/signup` 和 `/auth/bootstrap` 应为 `200` 页面，`/api/public/subdomain-available?slug=testshop` 应返回公开 API 响应而不是 `401`。
3. 重新运行 `GIT_COMMIT=311f396 node scripts/pilot-all-static-pages-uat.mjs`，目标为 256/256；在此之前不得把注册/多租户能力标为 PASS。

## 2026-10-15 Overview 生产验收

- `3e67a35` 已部署并通过认证浏览器检查：Overview 默认查询 30 天（`?hours=720`），Odoo 显示 6 笔销售及 6 笔退款；独立的 `R2 · TEST · read-only` 区域显示 16 张小票、AUD 510.62。所有页面断言通过。
- 数据不混源：R2 测试档案没有回放到 Odoo，不计入 Odoo 营业额、会计或库存。此前 24 小时窗口没有 Odoo 订单，所以原 Overview 的 Odoo KPI 显示为零；这不是连接故障。
- 本项 Overview 数据展示验收通过；整体试点放行状态仍以 P0/NO-GO 条件为准，不能因本项通过而变更。

## 2026-10-15 全站真实数据回归

- 认证页面矩阵：43/43 通过，覆盖商品、库存、历史销售、Overview、报表、采购、客户、供应商和设置；角色权限 CRUD 及 Odoo 会话恢复通过。证据：`UAT_PAGE_MATRIX_2026-10-15_CONTINUATION.json`。
- 全静态路由：128 路由 × 390/1440，共 256/256 通过，无页面错误或横向溢出。证据：`UAT_ALL_STATIC_PAGES_2026-10-15_CONTINUATION.json`。
- R2 首次真实快照当前已配置并成功校验：`configured=true`、`state=success`、SQLite integrity `ok`、6 个快照文件 SHA-256 有效；仍是手动同步，不能表述为每日自动拉取已启用。证据：`UAT_R2_ARCHIVE_2026-10-14.json`。
- R2 商品源没有图片字段或 URL，因此图片上传无法从该数据源完成；这仍是上游数据限制，不应使用占位图冒充真实商品图片。
- 本轮仍保持 NO-GO：现金实点/关班、真实采购收货闭环、价目表/GST/库存位置最终运营确认、SMTP/硬件和 AI 前置条件仍未完成。

> 2026-10-15 继续复核：`origin/main` 已确认包含 `2a46c2d`，推送后约 90 秒生产仍为 `/signup` 307、`/auth/bootstrap` 307、公开子域名 API 401，说明 Dokploy webhook/部署仍未切换；该状态待下一次部署事件后复核。

### Dokploy Java 21 构建修复

- 失败日志根因已确认：`TenantSlugParser.HostTenant` 与 `TenantHolder.ResolvedTenant` 的静态 `controlPlane()` 工厂与 record accessor 冲突；同时 `TenantResolverFilter.isUnavailable` 为包私有，无法被认证控制器调用。
- 已改为 `controlPlaneTenant()` 工厂并公开 `isUnavailable`。推送后应重新执行 Java 21 `mvn -B clean verify`；只有 Dokploy 构建成功并部署新 SHA 后，才能复核注册路由和 256/256 页面矩阵。

### Tenant slug 单字符回归修复

- 最新 Dokploy 测试发现 `TenantSlugParserTest.slugValidation` 允许单字符 slug `a`，与租户规则不符。
- 已修复为 2-63 个字符，首尾为字母或数字，中间允许小写字母、数字和连字符；待下一次 Dokploy Java 21 构建确认 123 个后端测试全部通过。
- 在构建和部署成功前，注册、多租户公开 API 与全站 256/256 矩阵保持未放行状态。
- `f1010f6` 部署后页面已返回 200，但公开子域名 API 返回 500，生产日志显示 `vendor.subdomain` 缺失。已修正迁移脚本执行顺序（先新增列，再插入默认 vendor）；下一部署需确认迁移成功后再继续 UAT。
- `e397542` 部署后复核通过：注册页面、公开子域名可用性 API 和 Odoo session 均返回 200，API 返回 `available=true`。全站登录矩阵仍待提供本地 `.env` 的 `INITIAL_ADMIN_PASSWORD` 后执行；当前不能将 256/256 标记为通过。
- `d8d9096` 修复控制面登录缺失 `subdomain` 的前端/UAT 请求契约，并已部署；匿名入口复核仍为 200。需注入已授权 R2 admin 密码后运行全站脚本，才可验收登录后的页面和真实数据。
- 匿名路由巡检已完成 256 次访问，未发现 5xx；3 次重定向导航中止经单独复核均正常到达登录页。slug 最短长度和 Odoo 自动恢复也已在线验证。登录后的真实 R2 数据页面仍待 admin 凭据验收。
- `pilot-page-matrix.mjs` 已对齐控制面登录契约，支持通过环境变量传入 admin 密码和租户 slug；凭据缺失仍保持 NO-GO。
- POS mock 数据回退已清除：客户列表、快捷键商品和箱装数量均不再使用演示值；真实 Odoo/POS 查询失败时只显示明确的不可用状态。typecheck、lint 已通过。

### Overview 数据来源

- 生产只读验证：Odoo 最近 24 小时为 0 单；最近 30 天为 6 单/6 件。R2 只读档案有最近 16 张小票、21 件、AUD 510.62；它们没有写入 Odoo，原 Overview 只查 Odoo 因而显示零。
- Overview 增加 24 小时/7 天/30 天 Odoo 范围选择，并显示单独标明 R2 TEST 的只读档案汇总，避免将测试档案混算成实时 Odoo 营业额。等待部署后验收。
- 已在生产认证验收 R2 摘要和 30 天 Odoo 结果：16 张 R2 小票/AUD 510.62；30 天 Odoo 6 笔销售和 6 笔退款、净额为 0。默认范围改为 30 天以首屏呈现实际近期活动，最终提交待部署验收。
## 2026-10-24 AI 问法回归更新

- Assistant API-only 全量目录 366 条：**310 PASS / 6 BLOCKED / 50 FAIL**；库存/导航定向 26 条：**18 PASS / 0 BLOCKED / 8 FAIL**。全部为只读问答，`writeRequests=[]`。
- Demo runtime `0e4a48ea` 与测试 source `2b6468c1` / `fbd2871e` 不匹配。失败集中在候选新增库存短问法、库存标识、中文批量改价和澄清文案，不能判定当前候选失败；需匹配部署后复验。
- 候选已补齐商品名、条码、SKU、无商品库存列表、无结果澄清和批量改价导航测试。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_CURRENT-ITERATION.json`、`docs/UAT_AI_STOCK_AND_NAVIGATION_ONLINE_2026-10-24_CURRENT-ITERATION.json`。
- 发布状态不变：含 `pos-api` 修改的冻结 SHA 尚未取得 Dokploy Java 21 `mvn -B clean verify` 通过证据；隔离业务门禁仍未通过，Pilot **NO-GO**。
