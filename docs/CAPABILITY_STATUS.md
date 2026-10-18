# Orithos POS — capability status

**Last updated:** 2026-10-18 (`4d7b4c4`：utility 错误态 Retry；线上故障注入回归通过)
**Source of truth for business data:** Odoo (via `pos-ui` `/api/odoo/*`).  
Classic Spring/MySQL POS remains in-repo as **reference only** (hidden from sidebar unless `NEXT_PUBLIC_SHOW_CLASSIC_POS=true`).

Statuses:

| Status | Meaning |
|---|---|
| **Accepted** | Implemented against Odoo and suitable for pilot acceptance testing |
| **In progress** | Code present; needs field validation or incomplete edge cases |
| **Planned** | Documented product intent; not a pilot commitment |

## 2026-10-18 迭代快照

本节记录最近一批已合并并经过 Demo 线上只读验证的功能。GitHub `main` 当前基线为 `48f4dd1`；UAT JSON 中的 `deployment` 字段由脚本写入本地 Git HEAD，不能作为 Dokploy 运行身份。`48f4dd1` 的详情 Retry、legacy Retry 和 utility 错误态公网回归已确认，Dokploy 完整 SHA、构建日志和容器状态仍待独立回读。仍不能把只读/UI 验证当作真实业务写入、硬件、生产 AI 或正式财务验收。

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
| POS 分类恢复 | 收银页分类 API 临时失败时提供独立 `Retry categories`，恢复收银分类筛选 | `88ae390` 本地 typecheck、目标 ESLint 通过；待 Dokploy 部署后做故障注入复验 |
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

### 仍未放行

- Dokploy frontend/backend 实际运行 SHA、构建日志和容器状态尚未从控制台独立确认；本次手动 webhook 返回 `Branch Not Match`，不能作为部署成功证据。
- 生产 AI、实体支付终端、打印机/钱箱、SMTP、分单支付和离线 POS 仍未完成验收或未实现。
- 正式门店现金差异审批、财务对账和正式运营流程仍需店主/财务验收。
- 以上回归均为只读或 UI 语义验证；业务写入必须继续使用隔离 Odoo 测试公司/数据库。

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
