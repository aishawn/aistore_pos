# Orithos 当前交接（2026-10-29）

## 2026-11-03 Continuous list audit follow-up

- Fixed consumed-row pagination, synchronous append locking, stale-query protection and same-batch retries across Customers, Suppliers, Purchase orders, Base Prices, Stock List and Price Suggestions. Refresh resets accumulated results; append failures preserve rows and pause automatic retries. Purchase Transfers and shared Products/Inventory Stocktake return paths reattach scroll observers.
- Local intercepted Edge browser regression: **140/140 PASS** at 390/1440px, browser errors 0, real business writes 0. TypeScript PASS; targeted ESLint exits 0 with 27 warnings; script syntax and scoped diff checks PASS. See `CONTINUOUS_LIST_AUDIT_2026-11-03.md` and `UAT_CONTINUOUS_LISTS_LOCAL_2026-11-03.json`. Products Stocktake observer change is source-inspected; preceding product append evidence remains separate.
- No local production build or Maven. Before follow-up push SKR frontend/backend SHA is `40906c80d78ace6d83f874605bff0486a1cd9911`; authenticated SKR scrolling and post-push runtime remain unverified. Manual pagination/editing screens were audited and retained. No production-readiness change.


## 2026-11-03 Products ordinary-pagination follow-up

- Fixed an append guard that incorrectly required an inventory snapshot on ordinary Products requests. These responses contain no snapshotId, so both scrolling and Load more returned without fetching offset 40. Retry now resumes the failed ordinary batch.
- Corrected the earlier fixture, which incorrectly attached inventory snapshot fields to ordinary product responses. New targeted browser evidence: `UAT_PRODUCTS_APPEND_LOCAL_2026-11-03.json`, 54/54 at 390/1024/1440px, errors 0, real writes 0; TypeScript and targeted ESLint PASS. See `PRODUCTS_APPEND_FIX_2026-11-03.md`.
- SKR runtime before fix: `7b610666`; supplied local demo credentials do not authenticate SKR, so authenticated live scroll verification is unavailable. No local production build or Maven; deployment verification remains separate.

## 2026-11-03 Store pulse 单行三列

- 按 owner 最新参考图，将昨日销售、毛利率、库存总数固定为一行三列，标题/数值/说明上下排列，用竖线分隔。窄屏仍保持三列，数值字号随卡片宽度调整。未核实值显示破折号及具体原因，保留原值 title 与明细链接。
- 本地组件浏览器预览在 320/390/768/1024/1440 验证同一行、无溢出、焦点和链接；正常值、无销售、不可用、STALE、加载禁用和深色模式通过。typecheck、定向 ESLint、CSS 解析及 diff 检查通过。未修改业务数据或计算口径，未运行本地应用构建；部署状态与源代码推送分开确认。

## 2026-11-03 Product footer and continuous list loading repair

- Products / Inventory report: totals occupy a separate opaque footer flush with the page bottom; the scroll region ends above it. Load more is always available while more rows remain; no artificial table spacer or text behind the footer.
- Purchase orders / customers / suppliers: append batches with fallback loading buttons, stale-response guards, row deduplication and correct scroll observer roots. Refresh and filter changes reset offsets. Sales History keeps the latest daily summary / sales lines behavior and adds guarded daily append, same-batch retries and query reset.
- Scope and test limits: `LIST_FOOTER_FIX_2026-11-03.md`; local intercepted browser evidence: `UAT_LIST_FOOTER_LOCAL_2026-11-03.json`. No Odoo business writes, no local production build or Maven. Source push and deployed runtime verification remain separate; no production-readiness change.



## 2026-11-03 Store pulse 视觉精简

- 按 owner 截图优化右侧 Store pulse，抽出 OverviewStorePulse：标题/更新时间与 44px 刷新按钮合并为紧凑页头，三行指标采用统一左右对齐与轻分隔线，橙色推广横幅改为简洁 View reports 链接。仍仅显示昨日销售、毛利率和库存总数。
- 异常库存和未核实毛利采用带图标的 Needs review 标记和简短原因；异常库存原值保留在链接 title，明细链接不变。正常值与零值仍正常显示。仅调整 UI，不修改业务数据、报表 API 或计算口径。
- 本地 Edge/Chromium 组件预览通过 320/390/768/1024/1440 宽度无溢出、键盘焦点、明细链接及触控尺寸检查，并覆盖正常值、无销售、不可用、STALE、刷新禁用、报表入口权限和深色模式。预览从实际组件 TSX/共享 CSS 渲染，使用模拟数据及 Link/金额格式依赖替身；typecheck、两个改动组件的定向 ESLint、PostCSS 解析及 diff whitespace 检查通过。未构建本地应用，不代表完整页面或线上验收，部署另行确认。

## 2026-11-03 Dashboard 指标精简

- 按 owner 要求，Store pulse 仅保留昨日销售、毛利率、库存总数，按此顺序显示；移除今日销售和交易数，以及区域内误导性的 Today 标签。沿用英文界面名称 Yesterday sales / Gross margin / Total inventory。
- 三行布局保留明细链接、数据核验状态、刷新与缓存时间提示；移动端数字左对齐，链接有明确键盘焦点。仅改展示，不改变 API、成本口径或业务数据。未执行本地应用构建，部署状态另行确认。
- 本地 typecheck、OverviewPageContent 定向 ESLint、PostCSS 语法解析与 diff whitespace 检查通过；未宣称浏览器或线上部署验收。

## 2026-11-03 Dashboard 数据可信核验

- 按 owner 确认的口径，昨日毛利成本改为销售前最近一次有效采购收货的未税采购单价，支持箱/件换算，不再查询运行时不存在的 `pos.order.line.purchase_price`，不使用当前商品成本兜底。订单与销售行未税金额必须对齐、全部相关行成本有依据，才发布昨日毛利率；不完整成本、退货未追溯原销售、币种或单位不匹配均保留未核实状态。缓存版本已升级。
- 公司 5 / `aipos_uat` / Adelaide 只读核验：昨日含税销售 3,579.98、税额 307.67、未税 3,272.31；销售行未税合计却为 3,579.98，差额 307.67。内部库位库存原值 -10,350,065，8,265 个商品存在负 quant。2,343 张原生采购单全为 draft，无采购关联完成收货，不能据此宣称采购成本可核实。
- 已确认历史导入有箱价直接作为单件成本、采购单价除以订购数量、含税行金额同时写入未税字段的问题；库存异常的完整根因尚待移动历史对账。此次仅修正报表核验与状态提示，未修改业务账本或导入器。历史修复须先生成逐条变更清单、验证备份恢复和回滚，再由 owner 授权具体写入范围。
- 本地 26 项定向测试及 typecheck 通过；定向 ESLint 零错误（useOverview 原有 2 项 hook 警告）。未执行本地构建；部署与浏览器验收尚未确认。复核脚本及详细证据/修复步骤见 [DASHBOARD_DATA_TRUST_2026-11-03.md](DASHBOARD_DATA_TRUST_2026-11-03.md)。不得将此次报表拦截视为历史业务数据已修复。

## 2026-11-03 Shopfront 全量只读镜像扩展

- Shopfront crawler 增加扩展只读记录表、每日扩展实体任务和分页查询 API。覆盖客户组、价格表、品牌/分类/系列/标签、客户付款、客户欠款日快照、保存报表定义、促销、商品欠货、盘点记录、收银结账、门店及收银机。原始 JSON 保留来源字段；POS 接收端增加独立只读影子表和分页读取类型，不触碰 Odoo/POS 销售、库存或采购业务账本。
- GraphQL 查询按官方 Query/Objects 文档选择字段；Shopfront 单项查询失败按实体记为 partial，不能把未授权或查询错误记成零数据。扩展镜像在 crawler `/api/extended-records`，POS staging 通过 `type=extended_records` 查询；覆盖数量在 `/api/sync/coverage` 的 `extended_data` 返回。
- Python 语法检查、GraphQL 文档解析（15 条）、定向 crawler 测试 6/6 和 `git diff --check` 通过。完整 crawler suite 在既有 `test_history_releases_writer_between_chunks_for_queued_repairs` 挂起，停止后未宣称全套通过。候选 SHA `5ff436ce8c718ac560e569d56a9014225bad905d` 的 GitHub Actions Java 21 `mvn -B clean verify` 成功；该 SHA 已快进推送到 `main`。手动 Dokploy Compose webhook 返回 `HTTP 301 Branch Not Match`，未开始部署；按 runbook 停止重试，需修正 Dokploy Source/Git 分支绑定后再部署。线上 OpenAPI 仍未包含扩展同步接口，不能视为已部署。
- 线上 OAuth `/api/stores` 仍只有 6/28 个请求 scope，缺少 22 个，包括 `see_customer_groups`、`see_balances`、`see_pricelists`、`see_classifications` 和高级报表/促销/盘点/结账等。全量 scopes 已由 OAuth start 请求，但最近 grant 仍只有 `run_sales_reports`、`see_customers`、`see_history`、`see_products`、`see_stock_management`、`see_suppliers`。需由 Shopfront Owner/Admin 在当前 consent 页面完成授权，并确认 token 实际 granted scopes；若仍只有这 6 项，检查 Shopfront 应用本身获准的 scope 配置/授权上限，而不是重复兑换旧 callback code。之后再触发扩展同步并对账。线上存量覆盖为产品 11,024、库存 10,846、销售 155,536、销售明细 304,770、供应商 109、采购单 2,356、客户 20；POS staging 对这些实体数量一致。当前没有线上扩展实体同步或其数量对账证据。

## 2026-11-03 Inventory report totals, sorting and continuous loading

- `/reports/inventory` now identifies itself as Inventory report. The shared product catalogue uses 40-row continuous append, desktop column sorting, mobile sorting and a sticky summary of all matching products, stock quantity and current-cost value in AUD. Search/category/quick-view/sort changes reset results. Refresh retains last successful rows on failure; append retries resume the same batch. Snapshot expiry explicitly requires refresh.
- Opt-in records API report requests retain the existing permission, company domain and category validation. Odoo computed quantities and many-to-many categories are sorted over the full server result, with ID tie breaks, rather than unsafe SQL ordering. Short-lived (5 minute), bounded process-local snapshots bind session/access credential, host, company and query; restart/replica/cache eviction returns 409. Inventory does not change while scrolling the same snapshot. Initial scans read Odoo in 500-row keyset batches; browser batches remain 40 rows. Sorting by inclusive sale price quotes the complete matching result, deduplicating shared price/tax combinations; this may take longer for large catalogues.
- Stock value is quantity × Odoo current unit cost, calculated in decimal arithmetic and rounded once to cents; it is not an accounting valuation or last-purchase-cost report. Unknown/unreadable costs produce an explicit unavailable total (never an invented zero); valid zero costs remain zero. Mixed units are not added together. Individual costs are removed before returning/caching report rows. No Classic/R2 fallback and no Odoo business writes.
- Local Node 24.19.0: unit tests 7/7, actual API handler with in-memory transport 8/8, browser fixtures 37/37 at 390/1024/1440, TypeScript and targeted ESLint PASS. Browser errors 0, real writes 0. Evidence: `UAT_INVENTORY_REPORT_ROUTE_LOCAL_2026-11-03.json`, `UAT_INVENTORY_REPORT_UI_LOCAL_2026-11-03.json`; screenshots in `screenshots/inventory-report-2026-11-03/`.
- Implemented and locally verified; deployment/runtime SHA and real Odoo reconciliation remain unverified. No local application build or Maven run. Browser used webpack dev because this checkout's node_modules junction is incompatible with Turbopack's filesystem root; no configuration change included.


## 2026-11-03 Assistant History rollback, URL fix and database repair

- Restored History to the original main-area searchable list with Back; Suggested workflows remains collapsed. Fixed URL validation rejecting the actual backend `vendor:user:UUID` session key after `%3A` decoding. Reproduced the link failure before the fix and added real-format direct-link/new-reply/reload tests at 390/768/1024/1440. Empty saved conversations now explicitly report unavailable messages rather than silently showing the greeting.
- Authenticated Demo read of the reported conversation returned HTTP 200 but `id=null`, `messages=[]`. Read-only JDBC inspection of the deployed database found the existing tables had lost ID/timestamp defaults during PostgreSQL migration: 59,001 threads / 118,110 messages, with 22,217 null thread IDs, 44,434 null message IDs and 44,434 null message associations. The supplied conversation also had null timestamps; 62 orphan user messages matched its truncated title, so no reliable reconstruction exists from those fields. No orphan was assigned to a user/conversation by inference.
- Applied `scripts/repair-ai-chat-history-defaults.sql` through `scripts/RepairAiChatHistoryDefaults.java` after a successful transaction/rollback rehearsal. Backups are in database schema `ai_history_repair_20261103`. Restored automatic ID sequences, ID primary keys and timestamp defaults; assigned IDs to previously null-ID rows, preserved all message associations and all original rows. A rollback-only insertion probe passed for generated IDs, timestamps and parent/child linkage. The reported conversation now has a numeric ID but still has zero linked messages. Old unknown timestamps and orphan ownership remain unknown.
- These changes touch no `pos-api/` sources or resources. The standalone JDBC maintenance helper was compiled locally and executed in the deployed backend container; no local application build/Maven run. Node 24 typecheck, targeted lint (zero errors / existing unused-disable warnings), and intercepted browser regression pass. Local UI evidence: `UAT_AI_ASSISTANT_HISTORY_LOCAL_2026-11-03.json`. Real API/database evidence: `UAT_AI_ASSISTANT_REPORTED_HISTORY_READONLY_2026-11-03.json` and `UAT_AI_CHAT_HISTORY_DEFAULTS_REPAIR_ONLINE_2026-11-03.json`.
- Live persistence round-trip PASS for a deterministic read-only sales question: HTTP 200 / code 0; detail has matching session, numeric ID, timestamp and both user/assistant messages. A greeting and a navigation-only fallback probe returned code 50210 before persistence; general graph/provider health is not established by the sales pass. Runtime checked: `0d3d0bc3`; frontend UI fix deployment remains unconfirmed. No Odoo/business writes; maintenance only changed AI history data/schema plus AI audit/usage metadata from three probes.

## 2026-11-02 Assistant history links and sidebar simplification

- Removed the dedicated assistant workspace's Store context control and redundant AI Assistant navigation item. History expands in the desktop sidebar without replacing the dialogue; Suggested workflows is collapsed by default. Mobile retains the accessible history control.
- Saved conversations now open at `/assistant?chat=<id-or-session-key>`; direct links, reload, browser back/forward and New chat restore the corresponding state. First persisted assistant replies assign their session-key URL. Continuations use the loaded session key. Numeric and legacy session-key history IDs are supported and URL-encoded. Failed detail loads show an explicit error and clear stale dialogue; stale detail responses are ignored.
- No backend changes or live business writes. Existing store/user-scoped history APIs remain in use. Node 24 typecheck, targeted ESLint (zero errors; existing unused-disable warnings) and Chromium fixtures at 390/768/1024/1440 pass. Evidence: `docs/UAT_AI_ASSISTANT_HISTORY_LOCAL_2026-11-02.json`; reproduction: `scripts/pilot-assistant-history-local.cjs`. These are intercepted fixtures, not live SKR history/storage acceptance. Deployment/runtime identity remains unconfirmed.

## 2026-11-02 AI Health navigation simplification

- Renamed Setup's AI Query Health entry and the metrics page heading to AI Health. The existing `/reports/ai/metrics` URL, admin-only permission checks and metrics data remain unchanged.
- Hid the unrelated business-report tab strip on this Setup health page only; retained time-window selection and Refresh. Other report pages keep their existing navigation. Updated the existing online UAT heading locator; no metrics API/backend changes or live business writes.

## 2026-11-02 Products / Purchases / Sell menu organization

- Follow-up: moved Help to the end of the Sales dropdown and removed its standalone toolbar icon. It invokes the existing register help dialog; help content and checkout behavior remain unchanged.
- Follow-up: fixed the Sales dropdown being clipped by toolbar horizontal overflow; the header now stacks above sale panels and the register selector shrinks on narrow screens. Removed Stock's duplicate Suppliers sidebar entry; Purchases retains its supplier tab. Reproduced the original failure on 390/1440 with actual hit testing; 44 UI fixture checks now pass, including unobscured menu items, the single Suppliers entry, dialogs and cart preservation. No live business writes or deployment claim from fixtures.
- Implemented the requested Products More entries (Catalogue, Inventory, Stocktake), purchasing tab order (Orders, Invoices, Suppliers, Replenishment; More → Stock Transfers), and Sell upper-right Sales dropdown with five dialog entries. Existing business write flows are reused.
- Added scoped, read-only Odoo catalogue/inventory/sales-line/payment queries with search and pagination. Catalogue is product-level; Inventory is internal-location record-level. These views do not read crawler/staging tables or establish migration-count parity.
- Local Node 24 typecheck/targeted lint, 14 route fixtures and 40 Chromium UI fixture checks pass; mobile/desktop dialogs retain nonempty cart state. Purchases More is aligned within narrow screens. No backend changes, local application build or live business writes. Live deployment/import completeness remain unverified. Design and evidence links: [WORKSPACE_MENUS_2026-11-02.md](WORKSPACE_MENUS_2026-11-02.md).

## 2026-11-02 Settings consistency audit

- Company and regional pages now read actual company currency and the shared location-derived business timezone. Regional failures are visible and retryable. Company save actions no longer cover form fields; failed-save retry asks before discarding a draft. PATCH rejects cross-origin requests and ambiguous multi-company edits, validates email, and preserves omitted optional fields.
- Staff permission previews use the selected role's actual permission endpoint instead of the complete permission catalogue. Switching roles clears stale results; loading/failure states, complete section grouping, permission-gated requests and dialog keyboard focus are explicit. This remains role-template assignment, not individual permission overrides or an invitation system.
- Account connection status checks live session and accessible registers; unknown account tabs fall back to Security. Developer API key creation is explicitly unavailable in this release. AI provider connectivity is not claimed by the connection panel.
- Retired Company/Outlet/Register explanation pages redirect to their current destinations. Other retained legacy capability explanations (sale keys, rules, loyalty, notifications and surcharging) also retain the five-tab Settings shell; statement/transfer entries lead to their business workspaces. Hardware/Receipts use the same Settings shell and subtab component, with Store terminal-help links; customer-display legacy links lead to hardware capabilities. Static SMTP/connected claims were removed.
- Browser inspection found cramped labels at a 768px viewport with the sidebar open. Settings navigation now uses a 560px content-container threshold, so narrow content uses the dropdown regardless of viewport width.
- Local typecheck, targeted ESLint and diff whitespace checks pass. No local application build, backend changes or live business writes. `scripts/settings-audit-readonly.cjs` covers real-service navigation, Company fields, connection state, role previews and legacy redirects at 390/768/1440, plus a separately labelled regional-error UI injection. Live read-only regression completed on both hosts at runtime `3070b44a` (contains behavior `745c3d3e`): 113 unique checks across three viewport widths; real role previews/connection/company data and legacy redirects pass. Regional-error injection is UI-only. Evidence: `docs/UAT_SETTINGS_CONSISTENCY_AUDIT_2026-11-02.json`. An intermittent SKR navigation timeout was followed by a successful targeted rerun; no business writes were performed.


## 2026-11-02 Inventory snapshot target correction

- Corrected a Dokploy target parsing false alarm: target values are single-quoted JSON. The configured Demo company was stale ID 127/UTC; live tenant binding confirms Demo is Odoo company 137 and SKR is company 5. Updated only `INVENTORY_SNAPSHOT_TARGETS` to company 5 and 137, both `Australia/Adelaide`; retained all other environment entries.
- Normal Dokploy deployment `7cwasuIouJGbG-K9kv-lp` completed at 2026-11-02 02:28:41 UTC on runtime SHA `cfe60ae0ba0d1d91874c56ee67b5a562c193498f`, without Fresh Volumes. Worker logs reported company 137 `SUCCESS`, with zero error lines.
- Post-deploy read-only replenishment checks passed on Demo and SKR (HTTP 200, full catalogue, seven-day request, no non-GET Odoo calls or business writes). Demo now has a real native snapshot for 2026-11-02 with 100% coverage across 12,987 products and two warehouses. This is day 1 only; the next natural Adelaide business day is still required for continuity. SKR retains two observed days and zero gaps.
- Both inventory histories remain `REVIEW` due to missing supplier lead times. Odoo read-only audit found no confirmed/done POs in either company and no purchase-linked completed receipts (SKR has 398 completed incoming receipts but no PO links; Demo has none). Do not derive realized supplier lead time or promote purchase recommendations from these records. Evidence: `docs/UAT_AI_INVENTORY_SNAPSHOT_TARGET_REPAIR_2026-11-02.json`.

## 2026-11-02 Segmented 365-day forecast walk-forward

- Added `scripts/ai_forecast_segmented_eval.py`. It uses the existing forecast engine, builds segments only from each origin's training prefix, selects a per-segment candidate on earlier validation folds, and scores later holdout folds for 7/14/28-day horizons. It reports WAPE, MASE, bias ratio, P80/P90 coverage, prediction coverage, low-confidence rate, and quantile safety violations.
- On the 500-product, 365-day SKR sales snapshot (2025-10-31 to 2026-10-30), intermittent demand selected `moving_average_7_v1` and improved relative WAPE by 5.2%, 5.9%, and 7.1% against `two_stage_occurrence_v1` for 7/14/28 days. Absolute WAPE remains 148%-151%, so this relative improvement does not make forecasts purchase-ready. Sparse long-tail TSB does not improve the baseline. Stable-high has only four products; first-sale recency is a proxy and has too little holdout coverage.
- Prediction coverage was 100% for scored holdout windows and numerical quantile safety violations were zero. P80/P90 coverage was materially below nominal levels. This is sales-only research: no stockout labels/native historical inventory, costs, lead times, fill rate, expiry exposure, or realized purchasing costs. Quality remains FAIL/RESEARCH ONLY; no model switch or purchase automation. `writeRequests=[]`.
- The reported low-confidence rate is the forecast service's existing confidence label (in this explicit-model experiment, mainly history length/censoring); it is not a calibrated probability of forecast accuracy. Quantile coverage is the stronger uncertainty evidence and is below target.
- Reproduction: `python scripts/ai_forecast_segmented_eval.py --snapshot data/ai-eval/odoo-sales-snapshot-365d.json --output data/ai-eval/segmented-walk-forward-365d-500.json`; aggregate evidence: `docs/UAT_AI_FORECAST_SEGMENTED_WALK_FORWARD_2026-11-02.json`.

## 2026-11-02 Suppliers sticky header alignment

- `OdooSupplierDirectoryPage.tsx`: moved scroll-container top padding to the title header's margin, so the desktop sticky table header meets the shell navigation without a strip of scrolling rows above it. Added explicit header stacking and a bottom separator; mobile cards retain their layout.
- Chromium layout reproduction: at scrollTop=500, the old header stopped at y=80 under a 56px navigation; removing the 24px scroll-container top padding aligned it to y=56. This is a layout fixture check, not live supplier acceptance; no business data was written.
- Validation: `npm run typecheck` passed; targeted ESLint passed with 0 errors / 3 existing effect warnings; `git diff --check` passed. No local application build was run.
- Demo runtime checked before this fix: frontend/backend `3f8843d97ff52024d993293b1b0b971118e9b42e`. Latest fix deployment and live authenticated scroll verification remain unconfirmed.

## 2026-11-02 店铺独立分类与 SKR 旧分类迁移

- 分类管理、产品分类下拉及分类校验统一只接受 tenant binding 对应公司的 `pos.category`；公共分类不再展示或可选，伪造公共/其他店铺分类筛选返回 403。保留原写入开关、公司权限和删除保护。
- 按用户授权，先通过已登录的平台店铺详情核对 SKR -> company 5 / `aipos_uat`，再执行分类迁移。新增 5 个店铺分类、迁移 14 个产品模板（含归档）；回读核对分类路径不变，公共分类引用为 0，44 个公共分类记录未变。只写分类及分类关联，没有库存、价格、税、删商品或跨店铺写入。共享 UAT 数据库 `isolated=false`，不代表正式生产验收。
- `scripts/migrate_store_categories.py` 默认 dry-run，apply 校验公司 ID/精确名称和隔离数据库变量，完整 journal 在忽略目录 `.local/`，支持中断后重新规划。门店迁移流程及其他测试店铺/样例开店路径的限制见 `docs/STORE_CATEGORY_POLICY.md`。
- 本地验证：真实 Next route + 内存 Odoo transport 15/15，通过只读角色、跨店铺隔离、公共分类拒绝、产品筛选、写入开关及归档引用删除保护；Python 迁移测试 4/4，通过路径保留、幂等恢复和无跨店铺写入。线上迁移证据 `docs/UAT_STORE_CATEGORIES_MIGRATION_2026-11-02.json`，接口测试证据 `docs/UAT_STORE_CATEGORIES_ROUTE_LOCAL_2026-11-02.json`。页面部署 SHA 尚未确认。

## 2026-11-01 Manage Categories unified presentation

- Removed the Local / Shared source rows. Categories with the same normalized full ancestry appear once; identical names under different parent paths remain separate. Search displays the matching category total.
- The opt-in `categories?view=unified` read endpoint counts active sellable product variants with a union of category IDs, preserving company scope and counting products assigned to both aliases once. Product catalogue dropdowns and category links query the same union.
- No Odoo data migration or business writes. Existing category write gate, company ownership checks and server-side deletion protections remain. Groups containing multiple underlying records stay read-only to avoid partial rename/delete; singleton owned categories retain editing when enabled.
- Local Node 24 verification: typecheck, targeted ESLint (no errors; existing effect warnings), three grouping regression tests and a mocked API check for union counts, logical child counts, company scope and duplicate edit restrictions passed. Browser fixture verification was not completed: Turbopack rejected the dependency junction and the webpack dev preview timed out while compiling the page. No local production build was run. Deployment identity and live SKR acceptance have not been established for this change.

## 2026-11-01 历史库存回放与线上复验（最新）

- GitHub `main` 已更新到 `185d1887`；Demo 和 SKR 当前 frontend/backend runtime 均为该 SHA。
- 新增 `InventoryBacktestRequest.originDate`，可把某个历史日期作为信息边界：截点后的库存只作 holdout 标签，不进入预测输入。响应明确返回 `evaluationMode=HISTORICAL_WALK_FORWARD` 和 `futureObservationsUsedAsInput=false`。
- SKR 固定快照覆盖 2026-05-05 至 2026-10-31，共 180 个日期。新增 `scripts/ai_inventory_historical_replay.py`，在 2026-08-31 截点、200 个库存质量合格商品上，7/14/28 天回放均 200/200 PASS，平均库存 MAE 分别 1.1064、2.0164、3.8364；`writeRequests=[]`。
- Demo/SKR 最新只读回归：AI 功能矩阵各 15/15 PASS；报表各 23/23 PASS；命令 parse/preview/cancel/执行关闭守卫各 7/7 PASS。`AI_COMMANDS_EXECUTION_ENABLED=false` 保持关闭，未产生业务写入。
- 最新预测接口：Demo 1,837 个商品、SKR 2,479 个商品均 HTTP 200，`modelVersion=6`。风险接口没有把负库存或低置信度数据输出为正常缺货告警，问题数据进入 `dataQualityAlerts`。
- 387 条全量 Assistant 线上目录回归本轮未完成：原脚本串行节流和上游响应耗时过长，已停止，不能记为 PASS。此前较小目录和本轮 15 条功能矩阵通过不代表 387 条全量目录通过。
- 预测质量门槛仍未通过：SKR walk-forward WAPE 高于当前探索门槛，且库存历史为 Odoo `qty_available(to_date)` 重建标签，不是独立原生盘点。继续禁止自动采购、自动调价和其他业务写入。

## 2026-11-01 全量 Assistant 回归与运行时变更

- `03214731` 的 387 条 Assistant 目录已完成真实线上回归：Demo 首轮 378 PASS、9 个 15 秒超时；将这 9 条以 60 秒预算重试后 9/9 PASS，因此 Demo 总计 387/387 PASS、0 FAIL。SKR 总计 387/387 PASS、0 FAIL。两次均为 Assistant API 只读调用，`writeRequests=["none: assistant API only"]`。
- 回归期间 Dokploy 有并行部署，SKR 首次结果的 `/api/public/version` 后端字段暂时为空；随后运行时已稳定切到 `ad959eb5`。因此 387 条结果可证明行为通过，但 SKR 结果的运行时身份需要以稳定版本探针和最新 23/23 报表回归共同解释。
- `ad959eb5` 是并行进入 `main` 的 Odoo 只读会话恢复修复，Demo/SKR 最新只读报表均 23/23 PASS，运行时精确匹配 `ad959eb5`。
- 最新 Demo AI 功能矩阵为 14 PASS、2 BLOCKED、0 FAIL；两个阻断均为本地 AI 配额 `42901 local AI quota exhausted before provider call`，集中在发票 OCR 探针及其后置无效图片探针。不能把配额阻断记为 OCR 通过或功能失败；待配额窗口恢复后重跑。
- 评测脚本 `pilot-ai-workflow-utterances-online-uat.mjs` 新增 `PILOT_CONCURRENCY`（1–8，默认 1），用于控制完整目录验证速度；默认串行语义保持不变。

## 2026-11-01 SKR 历史库存回测与线上回归（本地候选，未发布）

- 开发预研不需要等待未来 28 天真实库存快照。180 天真实 SKR 销售按日期做 expanding-window 回测；Odoo 历史 `qty_available` 只用于识别缺货删失日期。每折预测输入被限制在训练截止日前；holdout 库存标签只用于评分掩码，不进入预测特征或模型选择。历史 `to_date` 是 Odoo 系统历史数量，不是独立实盘盘点真值，可能受补录、回溯移动和仓库范围影响。
- 固定只读快照覆盖 2026-05-05 至 2026-10-31，共 180 天、2,000 个商品序列。1,721 个商品有可用库存标签；279 个因非正库存与重复销售冲突排除。销售快照为 26,973 单、52,101 行，`writeRequests=[]`。未来原生库存快照适合前向校准和上线验收，但不是历史回测前提。
- 当前候选模型完整 walk-forward 的累计 horizon WAPE：7/14/28 天为 84.0%/72.7%/70.3%，均未达到探索门槛 30%；固定 `two_stage_occurrence_v1` 为 75.8%/60.9%/50.9%，三个窗口都优于当前逐商品选模结果。当前算法未通过，不应开放自动采购；先诊断模型选型、需求分层与缺货标签偏差，再用同一固定快照比较候选。
- 线上只读 AI 功能矩阵：Demo 14/14 PASS，SKR 14/14 PASS；两站 runtime 均为 `8b9c73a23c232cda308d0d7d3c2e10639a657f24`。Demo 命令预览专项 6 PASS/1 FAIL：商品资料预览、只读预览、执行开关拒绝确认、取消都通过；补货预览返回 `DRAFT`、0 条建议。业务写入数为 0。修复仍仅在本地，未部署。
- 本地安全开关：`AI_COMMANDS_ENABLED=true`、`AI_COMMANDS_EXECUTION_ENABLED=false`。Demo/SKR 线上真实命令执行尚未开放；SKR 仅做只读检查。
- 后端 Java 21 `mvn -B clean verify`：495 tests，0 failures/errors。Python `scripts/tests` 57 项、`forecast-service/tests` 11 项通过；前端 Node 24 单测 46/46、TypeScript 通过。全量 ESLint 0 errors/140 warnings，本次两文件 0 errors/2 warnings。生产依赖 audit 为 0 漏洞；包含开发依赖的完整审计报告 37 项（其中 1 critical），需单独处理。Next.js 生产构建在本机 Turbopack/webpack 均卡住并已停止，不能算构建通过。
- DashScope 本机最小文本探测遇到网络 `ECONNRESET`，没有拿到 provider 响应，不能据此判断 API key 无效。ASR 正向测试仍需在网络和服务端配额可用时完成。
- 评测快照和报告留在忽略目录 `.local/ai-eval/`；当前所有源码仍未提交、推送或部署。自动部署前需解决预测选型质量和 Demo 补货空预览，并验证候选 SHA。

## 2026-11-01 AI replenishment full catalogue deployed; summary correction candidate

- Removed the first-1,000 alphabetical catalogue cutoff. Keyset pages and before/after counts cover all active company-owned POS products (safe ceiling 25,000; fail closed above it or on incomplete reads). Supplier rows are also paginated; failed supplier reads clear partial lead-time data.
- Sales now read signed order lines by ID and aggregate local business dates, avoiding full-store grouped-offset timeouts. Forecast targets run in bounded batches of 500, at most two requests concurrently, with full mature donor context and per-batch ID coverage checks. Service v5 is required; mixed old services fail closed.
- Similar-product statistics are reused within a request, preserving the full-store donor result. UI shows 100 rows per page; search/totals cover all rows and select-all applies to the displayed page.
- Local source + real read-only Odoo: 12,984 SKR products; 13,629 product/day rows; 20 highest-selling series x 56 days independently reconciled against 824 native lines, 1 refund and 11 UTC/local date crossings, zero mismatches. 11,956 products need data review; all unsafe/no-demand suggestions remain zero. No SKR business writes. See `UAT_AI_FULL_CATALOGUE_LOCAL_2026-11-01.json`. This is not deployment evidence.
- Whole-company audit confirms Demo company 127 has zero completed POS orders since 2026-09-06; prior fixture recommendation UI + native draft creation does not establish native demand pilot acceptance. Do not seed invented fiscal sales, prices or taxes.
- Deployed and read-only verified at `11a779a119f3a04153c6c222a7aee246869f28e4`, deployment `7bfr3HJkYyvz29DoMosrq`, backend 489/0/0. SKR full catalogue: 12,984 products, 2,325 positive-demand products; desktop 100-row pagination, cross-page search and mobile pagination passed. Complete request about 31.6s; compressed body 0.83MB (30.6MB decoded). Demo: 12,334 current POS products, no demand or suggestions. All 15 historical selling products outside the active POS scope were confirmed archived/non-POS. See `UAT_AI_FULL_CATALOGUE_ONLINE_2026-11-01.json`.
- Follow-up UI correction in this commit counts stock <= 0 with positive sales across every product (1,189 in native SKR data), including products held for data review. Previous summary counted suggested orders only and misleadingly showed zero. Summary now explicitly labels excluded review items. Static checks passed; runtime verified on `12b25d761ffc1537e661dfe821f8c98e7ffdaa72`; 1,189 displayed correctly.
- Replenishment read performance: `5698591a` adds a five-minute tenant-scoped process cache. Native SKR repeat read was 46.9s MISS, 2.0s HIT; `validateSales=true` bypassed cache and was 40.2s MISS. No business writes. Evidence `UAT_AI_REPLENISHMENT_CACHE_2026-11-01.json`.
- Review reason summary `e2ce1bdd` is live and read-only verified: 8,360 negative-stock flags and 11,601 cost/price flags across 11,956 products (counts overlap); all affected suggestions remain zero. Evidence `UAT_AI_REPLENISHMENT_REVIEW_REASONS_2026-11-01.json`.
- Inventory status `394fa92e` now exposes `latestBusinessDate`, `firstBusinessDate`, and `invalidSnapshots` in the authenticated response and UI. Live SKR readback reports latest business date `2026-11-01`, observed days `1`, gap days `0`, invalid snapshots `0`; the next real business date is still pending.
- Still pending: follow-up summary runtime verification, a second real scheduled server capture, physical SKR timezone confirmation, and genuine Demo positive-demand history. Shared `aipos_uat`, `isolated=false`, formal production NO-GO unchanged.


## 2026-10-31 SKR 发票历史 500 修复候选（未发布）

- 只读复现：登录/Odoo session 正常；发票列表无筛选、仅状态、仅搜索均 HTTP 500，两个筛选都有值时 HTTP 200。日志确认为 PostgreSQL 无法推断空参数 `$2` 的类型。
- 基于 `origin/main=a03b6919` 的隔离候选已修复 list/count/查重的 nullable JDBC 参数类型，并增加稳定排序、前端请求竞态保护和可重试错误提示。
- Node 24 TypeScript、定向 ESLint、diff 检查通过；Java 回归测试已编写但未运行。Dokploy 服务器终端 SSH 认证失败，远程精确 SHA Java 21 推送前门禁未完成；未提交、推送或部署，线上故障仍存在。业务写入 0。
- 详见 `INVOICE_HISTORY_500_FIX_2026-10-31.md` 与 `UAT_INVOICE_HISTORY_500_SKR_2026-10-31.json`。恢复远程验证能力后再完成验证、发布及 SKR 只读回归。

## 当前部署

- Demo POS：`https://demo.orithos.com.au/`
- 管理后台：`https://app.orithos.com.au/`
- Dokploy 自动部署来源：GitHub `main`
- 最近一次线上 `/api/public/version` 观测到 Demo 与 SKR 前后端 runtime SHA：`c7c87b1aff8dfe4a4ec399a802fe6642fee6c898`。
- 补货路由修复候选 `6bc07cfb` 已在 Demo 与 SKR 部署；后续测试/文档提交不改变行为 runtime。
- Java 8 仍作为本机默认 Java；Java 21 安装于 `C:\Users\ai_sh\.jdks\jdk-21.0.12.1+1`，`JAVA21_HOME` 已写入用户环境变量。
- 同 SHA GitHub Actions Java 21 门禁通过：`mvn -B clean verify`，447 tests，0 failures，0 errors。

## 数据库约定

当前按用户要求统一为共享 UAT：

```text
ODOO_DATABASE=aipos_uat
ODOO_DATABASE_UAT=aipos_uat
ISOLATION_ODOO_DATABASE=aipos_uat
```

这三个值相同意味着 `isolated=false`。所有调试和获授权的试用写入都属于共享 `aipos_uat`，不能宣称为客户生产隔离，也不能把当前门禁当作正式生产放行。

## 已完成验证

- 前后端 exact-SHA Java 21 构建与部署一致性通过。
- 认证后的 `GET /api/sell/parked` 已从旧 runtime 的 500 修复为 200；GET 不执行过期挂单清理写入，清理由定时任务负责。
- 普通 AI assistant provider quota 已接入；线上 121 个只读请求在应用层被限流，未执行 provider，也未产生 Odoo 写入。
- 共享 UAT 销售/退款曾完成一组人工对账，GST、退款链路和库存回读均有记录；这不替代完整客户验收。
- SKR 商店认证只读巡检 `docs/UAT_OPERATIONS_RUNTIME_ONLINE_SKR_2026-10-29.json`：13/13 PASS，覆盖库存搜索竞态、补货故障提示与 Retry 恢复、真实 Odoo 补货读取，0 个业务写入。
- SKR 客户组真实 CRUD `docs/UAT_CUSTOMER_GROUPS_LIVE_CRUD_SKR_2026-10-29.json`：8/8 PASS，创建、读回、重命名、删除和清理后不存在验证通过，3 个业务写入。
- SKR 硬件/离线边界模拟 `docs/UAT_HARDWARE_OFFLINE_STATUS_ONLINE_SKR_2026-10-29.json`：4/4 PASS；仅证明 UI 明确标示设备未验收和离线结算不支持，不替代现场设备测试。
- SKR AI assistant 只读 probe `docs/UAT_AI_ASSISTANT_READONLY_SKR_2026-10-29.json`：3/3 HTTP 200、无写请求；均走 `llmFallback=true`，响应约 1.9–4.7 秒。
- SKR 公开 Wikimedia 酒标 probe `docs/UAT_AI_PUBLIC_WINE_LABEL_ONLINE_SKR_2026-10-29.json`：HTTP 200、约 17 秒，识别标签但店内匹配 0；不能替代真实脱敏样本准确率/成本验收。
- SKR 价格表真实 CRUD `docs/UAT_PRICELISTS_ONLINE_SKR_2026-10-29.json`：9/9 PASS，创建、读回、改名、归档和最终清理验证通过，3 个 UAT 写入。
- SKR Odoo POS API 销售→全额退款 `docs/UAT_SELL_REFUND_API_SKR_2026-10-29.json`：10/10 PASS；现金销售与退款均确认，库存 100→销售→退款后回到 100，销售/退款历史均可回读。该证据的商品 GST 为 0，不能替代 GST 正确税率商品验收。
- SKR POS 浏览器 quote→Finalise 只读探针 `docs/UAT_SELL_QUOTE_ONLINE_SKR_2026-10-29.json`：5/5 PASS；quote HTTP 200、购物车显示报价并启用 `Finalise Sale`，未提交 checkout 业务写入。
- SKR POS 浏览器真实销售→收据→销售历史→全额退款 UI `docs/UAT_SELL_REFUND_BROWSER_SKR_2026-10-28.json`：12/12 PASS；收据回读、退款确认、负数退款历史和库存回读通过。测试商品 GST 为 0。
- SKR 采购确认/收货生命周期 `docs/UAT_PURCHASE_RECEIVE_SKR_2026-10-28.json`：14/14 PASS；供应商、RFQ、确认、超量拦截、部分收货、重复提交幂等、backorder 和最终收货均通过。
- SKR 盘点真实写入回滚 `docs/UAT_STOCKTAKE_WRITE_SKR_2026-10-29.json`：5/5 PASS；数量 190→191→190，Odoo 回读一致，临时差异已恢复。
- SKR 现金关班 `docs/UAT_CASH_CLOSE_SKR_2026-10-29.json`：缺少盘点时 422 门禁通过，但正确现金 758.80 的关班请求约 30 秒后返回 Cloudflare 502，session 仍为 opened；关班闭环仍阻断。
- 关班订单量预检线上复验 `docs/UAT_CASH_CLOSE_PREFLIGHT_SKR_2026-10-29.json`：SKR `configId=4/sessionId=2` 的 153,453 张订单在 478ms 内返回 HTTP 409，未写入现金且 session 未变化；已避免旧 runtime 的 Cloudflare 502 等待，但该历史超大 session 仍需在 Orithos 中关闭或新开 register。
- SKR 合成税票 OCR `docs/UAT_AI_VALID_INVOICE_OCR_ONLINE_SKR_2026-10-29.json`：9/9 字段匹配 PASS，约束为合成图片、预览接口、0 Odoo 写入，不能替代真实供应商票据现场准确率。
- SKR AI 指标 `docs/UAT_AI_METRICS_ONLINE_SKR_2026-10-29.json`：24 小时窗口和权限/UI 检查 PASS；总体 p50 716ms、p95 2699ms，`assistant:search_product` p50 837ms、p95 1585ms、estimatedTokens 4808；成本仍为估算 token，非供应商账单。
- SKR GST 上下文只读扫描 `docs/UAT_GST_TAX_CONTEXT_SKR_2026-10-29.json` 和根因检查 `docs/UAT_GST_ROOT_CAUSE_SKR_2026-10-29.json`：POS config 4/company 5 没有默认或可选 fiscal position，公司 5 的 active sale tax 数量为 0；10% GST tax 3 属于 company 1、tax 44 属于 company 2。未执行配置或业务写入。
- GST 销售/退款闭环脚本 `docs/UAT_GST_SELL_REFUND_API_SKR_2026-10-29.json` 因当前 POS 商品上下文均没有有效 GST 商品而记为 `BLOCKED`；未创建销售、退款或其他业务写入。
- SKR AI 启用门禁 `docs/UAT_AI_ENABLED_GATE_ONLINE_SKR_2026-10-29.json`：价格建议只读页面、AI assistant、酒类查找页和无价格写入监听均 PASS；脚本已兼容当前 `/assistant` 路由和进程环境认证。
- SKR 离线/硬件边界 `docs/UAT_HARDWARE_OFFLINE_STATUS_ONLINE_SKR_2026-10-29.json`、`docs/UAT_OFFLINE_CAPABILITY_ONLINE_SKR_2026-10-29.json`：浏览器网络模拟和 UI 状态 PASS；没有升级为现场设备或离线销售支持。

## 当前结论：NO-GO（正式生产）

仍需完成：正常规模 session 的正确/错误现金盘点关班和重试、盘点并发与恢复、两租户越权、备份恢复后的登录与 POS 交易、真实硬件（打印机/钱箱/扫码器/EFTPOS）和真实脱敏票据 OCR。GST 公司税率映射需先由 Odoo 配置确认，再用正确税率商品做销售/退款对账；AI provider 图片/OCR 仍受上游配额限制，不能作为客户承诺能力。

共享 `aipos_uat` 只适合受控试用和调试。客户试用应限制商品、交易量和管理员权限，并每日核对销售、GST、库存与现金关班。

## 本轮续验

- 线上 `/api/public/version`：Demo 与 SKR 的 frontend/backend 均为 `c7c87b1aff8dfe4a4ec399a802fe6642fee6c898`；两站点 `/api/public/uat-context` 均为 HTTP 200、`isolated=false`。
- 未认证公开巡检：根路径和受保护业务路由均按预期 307 到 `/login?next=...`；登录页 HTTP 200；关键路由未发现 5xx。
- 候选 `pos-ui` `npm run typecheck` 通过；硬件/离线线上验收脚本 `node --check` 通过。
- 关班超大 session 预检已部署：`pos.order.search_count` 超过 `ODOO_CLOSE_MAX_ORDERS`（默认 10,000）时快速返回 HTTP 409，避免等待 Odoo/Cloudflare 超时；线上复验见 `docs/UAT_CASH_CLOSE_PREFLIGHT_SKR_2026-10-29.json`。
- 本机未发现 `INITIAL_ADMIN_PASSWORD`、Dokploy/Odoo 凭据，也没有打印机、钱箱、扫码器或 EFTPOS；因此 Demo 认证写入验收和现场设备验收保持 `BLOCKED`，没有伪造 PASS。SKR 只读认证使用用户提供的测试账号完成。
- 源码边界仍明确显示设备未连接、EFTPOS 未验证和离线 POS 不支持；这只能证明 UI 合约，不能替代现场验收。

## AI 生产化候选（未部署）

- 候选分支 `codex/ai-prod-main` 当前 HEAD：`9066c80f`（后端代码候选 `9066c80f`）；已重放到当前 `origin/main=8b6ad27e`，尚未推送。
- Java 21 `pos-api/mvn -B clean verify`：**464 tests, 0 failures, 0 errors, BUILD SUCCESS**（此前候选 `803bba1`）。代码 `91df8028` 尚未取得新的 exact-SHA 远程构建证据；此前构建结果不能覆盖本次改动。
- 已加入 tenant/outlet 绑定的 Odoo 只读快照同步：`POST /api/ai/snapshots/sync`；同步商品、库存、价格和销售汇总到 `odoo_read_snapshot`。后台刷新由 `APP_AI_SNAPSHOT_SYNC_ENABLED` 控制，默认关闭。
- 定价/补货预览先生成快照，再使用版本化快照运行 `PricingDecisionEngine` / `ReplenishmentDecisionEngine`，决策快照保存 sourceVersion、dataAsOf、dataQuality 和算法结果；未开放任何 Odoo 写入。
- 新增共享 Odoo 销售域构建器，已将快照、定价和补货读查询按已绑定的 `odoo_pos_config_id` 限定到当前 POS 门店；本地候选新增对应单元测试。
- 补货快照回放不再把缺失的供应商、在途、欠单或箱规字段填成零/可用；缺少这些字段时返回 `INCOMPLETE_DATA`，等待供应链快照字段接入。
- 命令解析已通过 `AiCommandParser` 接入 `AiGateway`，严格校验结构化输出；确认执行器当前仍调用 Classic POS 商品/客户/价格表，不是 Odoo SoT，命令开关必须保持关闭，直到 Odoo 写适配器和回读审计完成。
- 当前 CI workflow 未为 `codex/ai-prod-main` 配置 push 触发；环境未提供可用的 GitHub CLI/token 来创建 PR 或 dispatch 远程候选构建。远程 exact-SHA 门禁仍阻止推送 `pos-api`。
- SKR 只读快照已成功生成（12,955 商品，价格/库存字段完整）；快照不含销售、供应商或客户数据，且存在 1,650 组重复商品名，已通过 `scripts/ai-eval/profile-snapshot.mjs` 标记价格/补货回测为 `BLOCKED`。
- Odoo `aipos_uat` 只读探针确认 company 2 有 14 个 POS 商品、1 条供应商记录和 1 条采购行；company 16 有 14 个 POS 商品但没有供应商/采购行；company 3、13、14 当前没有 POS 商品。现有共享 UAT 数据不足以证明 1–3 家隔离门店的补货回测。
- 快照同步响应现在包含 `suppliers` 和 `purchaseLines` 计数，便于评测记录供应链数据覆盖率。
- 仍未完成：Dokploy 对该精确 SHA 的远程 Java 21 门禁、匹配 runtime 部署、SKR/Demo 线上只读回归、真实 Odoo 快照写入验证、1–3 家隔离门店回测。不要把该候选描述为已部署或生产 GO。

## 2026-11-02 Store operational UI parity

- Owner requires both SKR and Demo trial stores to use Odoo operational pages. Removed ShopfrontPurchasingGate from Suppliers and Purchase Orders; shared Purchasing/orders/purchase-report views now use Odoo for both stores. No business data or company binding was changed. Historical Shopfront orders remain archive data, not receivable Odoo purchase orders.
- Source searches found no other equivalent SKR-specific operational page replacement. Products, customers, Sell, stocktake and purchasing navigation use shared components; platform demo-reset remains intentionally Demo-specific. Audit details: docs/STORE_UI_PARITY_AUDIT_2026-11-02.md.
- Initial Node 24.19.0 typecheck passed; targeted component ESLint passed with 0 errors and 4 pre-existing effect warnings. Static tenant audit: 78 controllers, 0 findings; this is not proof of live isolation.
- Latest main integration exposed a missing closing bracket in the replenishment sales-history RPC arguments; corrected the syntax without changing query scope or business rules. Final integrated Node 24.19.0 typecheck and targeted replenishment route lint passed; git diff --check passed. No local builds were run.
- Both runtime version endpoints returned frontend/backend 46ae01309c918d7048975c62251e6ac412c87b5a during this audit. Both /api/public/uat-context endpoints returned isolated=false. Authenticated supplier completeness, purchase records, cross-tenant isolation and trial business acceptance remain unverified; no usable login/deployment credential was available and no business writes were made. Do not claim this UI fix is deployed or that either store is cleared for formal customer production.

## 2026-11-02 Sticky table header audit

- Owner reported Products table rows showing above the sticky header. Audited all 15 sticky-position source matches under pos-ui/app and pos-ui/src, including table headers, stock/pricing div headers and unrelated sticky side panels.
- Fixed the same padded-scrollport offset in Products, Customers, Customer Groups and Capped Pricing. Directory page top padding is now title margin; Capped Pricing top padding is now table-content margin. Existing horizontal/bottom spacing is preserved. Directory sticky headers now have z-10 and an opaque background with a bottom divider shadow, matching the previous Suppliers fix.
- Suppliers already has the corrected geometry. Purchase Orders, Sales History, Replenishment and product import preview stick inside unpadded inner scroll containers; Stock List and Bulk Price Edit have no top scroll padding. No offset change was needed there. Sticky side panels/horizontal columns are not table header cases.
- Browser layout fixture 18/18 PASS: reproduces original 16/24px directory offset at 390/1440px, confirms zero offset after the change and unchanged initial title top; also reproduces/fixes Capped Pricing's 12px gap. Evidence: docs/UAT_STICKY_HEADER_LAYOUT_2026-11-02.json. This fixture tests CSS layout, not authenticated live app/business acceptance; no business writes.
- Node 24.19.0 typecheck passed; targeted ESLint passed with 0 errors and 14 pre-existing effect warnings; git diff --check passed. No local build was run.
- Both hosts still returned frontend/backend 46ae01309c918d7048975c62251e6ac412c87b5a before publishing. Push main through the configured Dokploy auto-deploy route and confirm runtime SHA before calling the changes deployed. No DOKPLOY_WEBHOOK_URL or Dokploy login credentials are available in this checkout/process.

## 2026-11-02 Deployment parser failure follow-up

- Owner supplied a Dokploy frontend build failure at replenishment/route.ts:146 (Expected comma). The original batch search_read call lacked a closing array bracket; d55d1153 already corrected it. Latest origin/main 9d3cc10d includes that correction, so the supplied log alone cannot identify the failing checkout SHA.
- Split the nested expression into a named batchDomain and a multiline RPC call. Query scope, order IDs, pagination and fields are unchanged. Node 24.19.0 typecheck, targeted route ESLint, existing replenishment-safety tests (5/5) and git diff --check passed. No local build or backend changes.
- Owner confirmed the current POS Dokploy Compose ID is y4IqIQ8dvwEYL06Hppkjc; corrected ENVIRONMENT_MAP.md. Previous WvcUddxTnymK_K5RZPPtL link redirects to the dashboard home and must not be used. Deploy main through the current service and verify exact runtime identities.
- Credentials are configured in ignored primary checkout C:/shawn/1code/1project-new/aistore_pos/v1/orithopos-master/.env (DOKPLOY_USER / DOKPLOY_PASS); the isolated worktree does not have them. Do not infer credentials are unavailable from worktree/process checks alone. Webhook remains a secret and must not be recorded here.
- Owner authorizes SKR read-only tests and Demo read/write tests; both periodically sync real store data and all deployment/debugging/trial uses aipos_uat. This parser/deployment investigation requires no business writes.

### Deployment and live verification result

- Code ff59ce4859bc78ae4a615d7821852ccb3651a0e7 deployed successfully through the owner's configured main auto-deploy queue. Dokploy deployment bf4XQpCUSKpgUFUFnPYe0 status Done; frontend Compiled successfully; backend Java 21 mvn clean verify BUILD SUCCESS, 500 tests / 0 failures / 0 errors / 0 skipped. Full build log retained only in ignored primary .local/ff59ce48-pos-build.log; sanitized evidence is docs/UAT_DEPLOYMENT_PARSER_FIX_2026-11-02.json.
- Both SKR and Demo public version endpoints confirmed frontend/backend ff59ce48. Authenticated live read-only smoke passed Products, Suppliers, /customer-groups and Purchasing on each host. Products and Suppliers each loaded 40 rows on both stores; after scrollTop=800 their sticky-header gap was 0px and scroll padding was 0px. No Shopfront replacement was shown. Business writes: 0.
- The initial product wait incorrectly treated animated image placeholders as catalogue-loading skeletons and timed out. Corrected verification to wait for real multi-cell product rows and section aria-busy=false; both stores then passed live geometry checks. The original blocked observations and follow-up are retained in the evidence rather than reported as product failures.
- Dokploy queued jobs can begin with an old webhook Hash/title, then update to the actual fetched main Commit when complete. Use completed deployment identity plus runtime endpoints, not initial queue title, to identify deployed code. The owner's failure log matches deployment l0thlNSbRY35GYyAWTdDu for old 47f6098e; subsequent dca50a8d, 9d3cc10d and ff59ce48 builds succeeded.
