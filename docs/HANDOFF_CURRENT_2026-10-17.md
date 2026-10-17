# Orithos 当前交接文档

更新时间：2026-10-17（Asia/Shanghai，交接更新）
适用仓库：`aishawn/aistore_pos`  相关品牌仓库：`aishawn/aistore_orithos`

## 0. 最新权威摘要（交接必读）

### 当前结论

项目代码和只读线上回归仍在持续推进，但整体状态保持 **NO-GO / 未完成**。当前公网匿名 HEAD 检查已经返回动态 `no-store` 响应头，但 Dokploy 控制台仍未提供实际运行 SHA；因此不能仅凭 GitHub 已推送确认全部认证页面和业务代码已上线。

当前仓库基线：

- 分支：`main`
- 最新提交：`50095f4 docs: align cash P0 status with implementation`
- 本轮功能代码提交：`9224563 fix: tighten admin list and receiving UX`；回归脚本提交：`0baf7c6 test: add authenticated admin list regression batch`
- 共用弹窗交互提交：`1fb0fe0 fix: improve shared dialog keyboard behavior`
- GitHub：`https://github.com/aishawn/aistore_pos.git`
- 工作区保留用户未提交的 `pos-ui/tsconfig.json`，不得覆盖、回滚或混入业务提交

### 本轮已完成

- 品牌站注册、自动登录、Outlet/Register 配置、dummy/sample data 选择已有真实线上证据。
- 多租户 Odoo company、warehouse、stock location、POS config 隔离已有线上回读证据。
- Card 模拟收款、Cash 收款/找零、销售退款、库存恢复、Cash in/Cash out、基础关班已有线上证据。
- 供应商创建、采购确认、部分/全部收货、补货 draft RFQ 和审计消息已有隔离租户证据。
- richer dummy data、sample data 清理、产品 CSV 导出和删除租户后的认证拒绝已有 JSON 证据。
- 131 个认证页面在 390px 与 1440px 的矩阵曾达到 `262/262 PASS`；关键功能页面、角色 CRUD、移动端布局和无横向溢出已有回归记录。
- 最近的只读体验修复已提交到 GitHub：销售报表移动端摘要、分页越界恢复、不可用行操作隐藏、列表语义可访问性、未来价格移动端布局、回收项搜索、Mail Log 部分匹配、列表页 server layout 缓存隔离。
- 最近批次 `d835857` 修复 Future Costs/Prices 的 Next route config 回归；`1679f0b` 收窄平台 owner recovery 响应，不再返回页面不使用的 bootstrap token，并为 owner link 增加真实复制按钮；`0b98984` 将管理按钮和确认弹窗统一到至少 44px 触控高度。
- `3e992f0` 将 Register Closures 的假 View 入口改为真实详情链接，新增只读详情页（含 tender breakdown），移除静态日期范围占位，并补齐移动端卡片布局。
- `5912892` 将 Promotions、Register Closures 和五个销售报表的列表/详情路径加入 middleware 与 Next headers 的 no-store 守卫，避免动态页面的未认证重定向或详情子路径落回缓存策略之外。
- `83413b1` 为 Platform Stores 增加 `Deleted` 状态筛选和对应灰色状态徽章；`f940206` 补充该筛选的回归证据。
- 当前待部署批次补强了四处高频流程：采购收货数量在前端按剩余数量校验并补充输入语义标签；Platform Stores 无结果时区分筛选空态并提供 Clear filters；Mail Log 与 Trashed Items 在手机端改为摘要卡片并提供清除搜索/筛选；两个工具页同时加入 middleware 与 Next headers 的 no-store 路由守卫。
- 下一批待部署改动补强共用弹窗交互：ConfirmDialog、AlertDialog 和 Modal 支持 Escape 关闭；ConfirmDialog 的忙碌文案按危险/普通确认区分；AlertDialog 确认按钮统一至少 44px。
- 本地检查已多次通过：`npm run typecheck`、目标 ESLint、`git diff --check`。本机按约束未运行 build。

### 当前未完成

- Dokploy 实际运行 SHA 未取得确认，当前 `main` 的最新代码不能视为线上完整生效。
- 2026-10-17 19:38（Asia/Shanghai）匿名 HEAD 检查 `/utilities/future-costs` 与 `/platform/stores` 均返回：

  ```text
  Cache-Control: no-store, max-age=0
  cdn-cache-control: no-store
  cf-cache-status: DYNAMIC
  location: /login?next=...
  ```

- 这证明当前匿名请求路径没有旧静态缓存特征；仍需认证浏览器和 Dokploy 运行 SHA 证据确认页面代码批次。
- 推送 `5ca76d1` 后约 30 秒再次检查 `/reports/closures/1` 和 `/reports/daily-sales`：两者均返回 `Cache-Control: no-store, max-age=0`、`cdn-cache-control: no-store`、`cf-cache-status: DYNAMIC`，且无 `x-nextjs-prerender`；这是匿名重定向层证据，尚不能替代认证页面回归或 Dokploy SHA。
- 认证只读页面矩阵已在公网运行环境完成：`docs/UAT_ALL_STATIC_PAGES_2026-10-17_REPORT_BATCH.json`，131 路由 × 390/1440 共 `262/262 PASS`，无横向溢出和页面错误；脚本源提交记录为 `cabdbf4`，Dokploy 控制台运行 SHA 仍待补记。
- 重点页面截图已在本批次重新采集并保存于 `docs/screenshots/2026-10-17-report-batch/`，覆盖 `/reports/closures`、`/platform/stores`、`/utilities/future-costs`、`/utilities/future-prices` 的 390px/1440px 视口；索引见 `docs/UAT_FOCUS_SCREENSHOTS_2026-10-17.json`，其中 `sourceCommit=9224563`、`deployment=null`。平台截图使用 `app.orithos.com.au`，租户页面使用 `demo.orithos.com.au`，均为认证只读访问。
- `83413b1` 后的平台门店截图在 390px/1440px 均返回 HTTP 200；列表状态徽章和分页正常，新增 Deleted 状态筛选已随页面部署回归。
- 最新 `docs/UAT_PAGE_MATRIX_2026-10-13.json` 的 `deployment` 为空，`sourceCommit` 为旧提交；它证明历史回归通过，不能证明当前最新批次已部署。
- 回收项搜索和 Mail Log 搜索的后端修改尚未用部署后的只读数据完成线上验证。
- 本轮待部署改动尚未用实际运行 SHA 完成线上回归；需重点验证采购收货弹窗、Platform Stores 筛选空态、Mail Log/Trashed Items 的 390px 布局和 no-store 响应头。
- 认证只读管理列表回归脚本 `scripts/pilot-admin-list-batch-uat.mjs` 已在推送后再次运行：采购、Platform Stores、Mail Log、Trashed Items 在 390px/1440px 共 `8/8 PASS`，无横向溢出，并在三个搜索页验证无结果文案、Clear 操作和清除后的输入状态；证据见 `docs/UAT_ADMIN_LIST_BATCH_2026-10-17.json` 和 `docs/screenshots/2026-10-17-admin-list-batch/`。该证据的 `sourceCommit=9224563`，`deployment=null`，所以仍需 Dokploy SHA 绑定。
- 最新 server `layout.tsx` 缓存隔离、移动端报表、平台门店/工具页和 Register Closures 详情已完成认证只读矩阵和重点截图回归；仍未取得 Dokploy 实际运行 SHA，因此不能把证据绑定到具体线上容器版本。
- 收银小票时区、采购/补货显示时区虽有页面回归，仍需在获准的 disposable tenant 业务链路中做一次真实小票/订单回读确认。
- 实体刷卡终端、打印机、钱箱、分单收款、离线 POS、生产 AI、SMTP 实际发信、正式门店现金实点差异处理仍未覆盖或未实现。

### 当前问题与风险

1. **部署链路阻塞**：当前环境没有 Dokploy 控制台、部署 API 或 webhook token，无法从仓库侧触发普通 Deploy；重复检查仍观察到旧缓存头。
2. **证据与线上版本脱节**：页面返回 200 或 GitHub push 不能证明 Dokploy 已消费该提交，必须记录 Dokploy 前后端容器 SHA。
3. **历史文档存在时间差**：下方历史章节记录多个已通过批次，阅读时以本节和对应 JSON 的 `generatedAt`、`sourceCommit`、`deployment` 为准。
4. **工作区并行修改**：当前仅保留用户已有未提交的 `pos-ui/tsconfig.json`；不要覆盖、回滚或混入业务提交。任何交接操作不得使用 `git reset --hard`、`git checkout --` 或 `git add -A`。

### 最新 Dokploy Webhook 尝试（2026-10-17）

- 用户提供的 Compose webhook 已实际调用。
- 直接空 POST 返回 `{"message":"Branch Not Match"}`；按 GitHub push 格式发送 `ref=refs/heads/main`、仓库 `aishawn/aistore_pos` 和提交 `d835857` 后返回 `HTTP 200 {"message":"Compose deployed successfully"}`。
- 按用户要求等待约 7 分钟后，`/security`、`/reports/dashboard`、`/utilities/future-costs`、`/utilities/trashed-items` 仍返回 `Cache-Control: s-maxage=31536000`、`x-nextjs-cache: HIT`、`x-nextjs-prerender: 1`。
- 该结果证明 webhook 接收了请求，但不能证明 Compose 构建成功或 frontend 已切换；需要在 Dokploy Deployments 页面查看该任务的状态、构建日志、实际 commit SHA 和服务容器状态。
- 随后以最新提交 `94b2d4d` 发送完整 GitHub push payload，webhook 再次返回 `HTTP 200 {"message":"Compose deployed successfully"}`；等待约 5 分钟后五个关键页面仍返回相同旧缓存头。当前最需要核对的是该部署任务是否失败/取消、Compose 是否绑定了不同的分支或仓库、以及 frontend domain 是否仍指向旧服务。

### 接手后的最短执行路径

1. 在 Dokploy 对 `main` 执行普通 **Deploy**，禁止 Fresh Volumes，并记录 frontend/backend 实际运行 commit SHA；功能代码目标至少为 `9224563`，仓库当前 HEAD 为 `08fb1ab`。
2. 先用 HEAD 请求验证 `/security`、`/reports/dashboard`、`/utilities/future-prices`、`/utilities/trashed-items` 的缓存头。
3. 用新的 disposable tenant（例如 `codex-handoff-<timestamp>`）做注册、bootstrap、Odoo binding 和只读数据回读；不要复用历史租户或写入 Demo 公司。
4. 用认证浏览器执行完整页面矩阵，重点覆盖新改动页面和 390/1440 两个视口；将证据写入带当前运行 SHA 的新 JSON 文件。
5. 只在授权测试租户执行销售/退款/现金/采购等写入；保存订单、库存、session、receipt 和 HTTP 状态前后值。
6. 通过平台 Web UI 删除测试租户，并确认登录与受保护 API 返回 402/未授权。
7. 若发现问题，按“修改代码 → 推送 `main` → Dokploy 普通 Deploy → 只回归受影响场景 → 完整冒烟”的顺序执行。

### 通过标准

- Dokploy 运行 SHA 与目标 GitHub commit 一致。
- 动态页面返回 no-store，不再返回旧静态预渲染头。
- 新租户核心业务写入和回读全部落在正确 Odoo company，跨租户读取被拒绝。
- 失败请求不产生部分业务写入，删除租户后认证和受保护 API 被拒绝。
- 每个场景有不含密码、token、cookie、API key 的 JSON 证据。
- 未验证硬件、分单、离线和生产 AI 能力继续单独标记，不计入核心 POS 通过。

## 1. 当前结论

当前 richer dummy data、sample data 清理和现金盘点关班均已通过全新的线上 disposable tenant 回读，但整体项目仍保持 **NO-GO**，因为实体硬件、分单收款、离线 POS、生产 AI 和正式门店硬件/现金运营验收仍未覆盖。此前的品牌注册、租户隔离、POS 销售、退款、现金管理、供应商创建、采购收货和页面回归也已有线上证据。

后续不要复用历史租户，也不要写入生产 Demo 公司。每次代码变更仍需推送并确认 Dokploy 的实际部署 SHA，再用新的 disposable tenant 回归并删除租户。

### 缓存批次提交 `1f1027f`

- 为商品、价格组、角色、用户、促销分类、供应商连接和平台门店详情页增加服务器端 `dynamic = "force-dynamic"` 与 `fetchCache = "force-no-store"`，并在 `next.config.ts` 为对应路径加入 `no-store` 响应头。
- GitHub `main` 已推送 `1f1027f`。公网匿名响应已回读为 `Cache-Control: no-store, max-age=0`、Cloudflare `DYNAMIC`；不再出现旧的 `s-maxage=31536000`。
- 认证只读页面矩阵第一次结果为 `261/262`；`/settings/surcharging` 的 1440px 首次请求出现瞬时 504，立即重试在 390px/1440px 均为 200 且无横向溢出。原始结果保留在 `UAT_ALL_STATIC_PAGES_LIVE_2026-10-17_CACHE_BATCH.json`，重试证据为 `UAT_CACHE_BATCH_RETRY_2026-10-17.json`。
- 这批次没有销售、退款、采购、库存、现金、关班或权限写入；仍需在 Dokploy 控制台补记实际运行部署 SHA。

### 收银台门店时区修复 `9217dca`

- 收银完成小票和本机暂存销售日期改用当前 Odoo POS 配置的 `timezone`，不再固定为 Sydney；同时兼容 Odoo 返回的 ISO 时间、带偏移时间和无时区时间，避免重复追加 `Z` 导致日期错误。
- `9217dca` 已推送 `main`。认证只读页面矩阵在该提交上线后为 `262/262 PASS`（131 路由 × 390/1440 两个视口），证据见 `UAT_REGISTER_TIMEZONE_LIVE_2026-10-17.json`。
- 本轮只读验证没有提交销售或其他业务写入；收银小票时区需在下一次获准的 disposable tenant 销售验收中用真实小票进一步确认。

### 关班页时区统一 `22060a6`

- 新增共享 `formatOdooDateTime`，正确处理 Odoo 无时区/ISO 时间，并使用当前 POS 配置的门店时区；Close Register 的开班时间不再固定显示 Sydney。
- `22060a6` 已推送并完成线上认证回归，131 路由 × 390/1440 两个视口为 `262/262 PASS`，证据见 `UAT_REGISTER_CLOSE_TIMEZONE_LIVE_2026-10-17.json`。
- 本轮未执行关班、销售或任何其他业务写入。

### 补货页时区统一 `0b7fe5c`

- 补货计划的 `Generated` 时间和本机审批审计时间现在读取当前 Odoo POS 配置时区；读取寄存器元数据失败时回退到 Adelaide，不阻断补货计划。
- `0b7fe5c` 已推送并完成线上认证回归，131 路由 × 390/1440 两个视口为 `262/262 PASS`，证据见 `UAT_REPLENISHMENT_TIMEZONE_LIVE_2026-10-17.json`。
- 本轮未创建 RFQ、销售、关班或其他业务写入。

### 采购列表时区统一 `7c44cb5`

- 采购列表桌面表格和移动卡片现在读取当前 Odoo POS 配置的门店时区；共享日期格式化函数继续兼容 Odoo 无时区/ISO 时间，读取寄存器元数据失败时回退 Adelaide。
- `7c44cb5` 已推送并完成线上认证回归，131 路由 × 390/1440 两个视口为 `262/262 PASS`，证据见 `UAT_PURCHASE_TIMEZONE_LIVE_2026-10-17.json`。
- 本轮未确认采购、收货、创建 RFQ 或执行其他业务写入。

### 核心 Odoo 页面缓存防护 `cb4cf6e`

- 为 Sell、Sales History、Close、Purchases、Replenishment、Reports、Customers、Suppliers 路由增加 `dynamic = "force-dynamic"`、`fetchCache = "force-no-store"`，并加入 Next `no-store` 响应头清单，降低 Dokploy 切换后旧页面壳残留风险。
- `cb4cf6e` 已部署验证：核心路由响应为 `Cache-Control: no-store, max-age=0`、Cloudflare `DYNAMIC`；认证页面矩阵为 `262/262 PASS`（131 路由 × 390/1440），证据见 `UAT_CORE_PAGE_CACHE_LIVE_2026-10-17.json`。
- 本轮未执行任何销售、采购、库存、现金、关班或权限写入。

## 2. 仓库与工作区

### POS 仓库

- 本地路径：`C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master`
- Remote：`https://github.com/aishawn/aistore_pos.git`
- 分支：`main`
- 当前远端基线：见 `git log --oneline -1`，不要假设本地 HEAD 已在线上部署

当前工作树状态：

- richer dummy data 批次已审查并提交为 `7c51683`，远端 `origin/main` 已包含该提交。
- 只剩 `pos-ui/tsconfig.json` 的并行/既有未提交修改，必须保留。
- 交接文档的后续更新必须只添加明确的文档文件，禁止 `git add -A`、`git reset --hard` 和 `git checkout --`。

### 品牌站仓库

- 本地路径：`C:\shawn\1code\1project-new\aistore_pos\v1\shipany-template-dev`
- Remote：`https://github.com/aishawn/aistore_orithos.git`
- 已推送的主要提交：`2ff783a`、`8f8d8c6`
- 已验证公开页面：`/`、`/pricing`、`/updates`、`/signup` 均返回 HTTP 200

## 3. 已有线上证据

以下项目已经有真实线上响应或业务数据回读，证据文件位于 POS 仓库的 `docs/`：

- 品牌站 6 步注册、自动登录、Outlet/Register 配置和 dummy data
- 每租户独立 Odoo `res.company`、warehouse、stock location、POS config
- Card 模拟收款、Cash 收款和找零
- 销售退款、重复退款拒绝、库存恢复
- Cash in / Cash out 和基础关班保护
- Cash sale 后正确 counted cash 关班：session closed、cash difference 0；证据见 `docs/UAT_CLOSE_REGISTER_INCOME_ACCOUNT_FIX_LIVE_2026-10-17.json`
- 采购单确认、部分收货、全部收货、重复收货拒绝
- 供应商 tenant-scoped 创建、ABN 重复拒绝、Odoo company 回读；证据见 `docs/UAT_SUPPLIER_ISOLATION_LIVE_2026-10-17.json`
- 多租户访问隔离、租户删除后的认证拒绝
- 认证页面矩阵、移动端布局、缓存策略和公开品牌页面回归

重点证据：

- `docs/UAT_BRAND_SIGNUP_8CHAR_E2E_2026-10-17.json`
- `docs/UAT_BRAND_SIGNUP_OUTLET_DUMMY_E2E_2026-10-17.json`
- `docs/UAT_BRAND_PUBLIC_PAGES_2026-10-17.json`
- `docs/UAT_REBUILT_TENANT_LIVE_2026-10-16.json`
- `docs/UAT_PURCHASE_RECEIVE_LIVE_2026-10-16.json`
- `docs/UAT_PAGE_MATRIX_LIVE_2026-10-17_RETRY.json`

历史租户（例如 `codex-uat-20261016203934`）仅供证据回溯，禁止复用。

## 4. 当前批次：richer dummy data（线上验收通过）

2026-10-17 使用新 slug `codex-rich-20261017104027` 完成真实注册、bootstrap、Odoo session 恢复、数据回读和平台删除：

- Odoo company `18`，provision `ready`，允许公司数 `1`
- `14` 个 DEMO 商品、`4` 个 DEMO 客户、`34` 笔销售（含 `2` 笔退款）
- `3` 个 Register，对应 Main Store 2 个、Back Bar 1 个
- 注册、bootstrap、Odoo session、products、customers、sales、registers 均返回 HTTP 200
- 删除租户返回 HTTP 200，删除后认证返回 HTTP 402

证据：[UAT_RICHER_DUMMY_SEED_LIVE_2026-10-17.json](UAT_RICHER_DUMMY_SEED_LIVE_2026-10-17.json)。公网响应没有暴露 Dokploy SHA，因此该项使用线上行为回读证明，部署 SHA 仍需在 Dokploy 控制台补记。

### Sample data 清理线上回归：已通过

新租户 `cpr-20261017105911` 通过 Settings Data API 完成：状态读取、`REMOVE SAMPLE` 确认、DEMO 商品/客户归档、销售保留、二次清理幂等和租户删除。首次清理返回 200/code 0，归档 14 个商品和 4 个客户；清理后 active product API 为 0，销售 API 仍返回 34 笔；第二次清理返回 `idempotent=true`；删除后认证返回 402。

证据：[UAT_SAMPLE_DATA_PURGE_LIVE_2026-10-17.json](UAT_SAMPLE_DATA_PURGE_LIVE_2026-10-17.json)。此前发现的 Odoo 20 domain 错误已由 `87a6d7c` 修复并在线上回归通过。

### 产品 CSV 导出线上回归：已通过

新租户 `cpx-20261017110149` 的认证导出返回 HTTP 200，响应为 `text/csv`，文件名正确，包含标准表头和 14 行 DEMO 商品；删除租户返回 200，删除后认证返回 402。

证据：[UAT_PRODUCT_EXPORT_LIVE_2026-10-17.json](UAT_PRODUCT_EXPORT_LIVE_2026-10-17.json)。

提交 `7c51683` 中的 `OdooTenantProvisioner.java` 在选择 sample data 时创建：

- 14 个 `DEMO-` 商品
- 5 个分类
- 4 个客户
- 最近 14 天约 32 笔已支付订单，最多 2 笔退款
- 一个保持打开的 POS register

这批代码已完成代码级检查，并在 `7c51683` 上完成一次隔离新租户回读；后续若修改 seed 逻辑，必须重新检查：

1. `pos.order.sync_from_ui` 的订单 payload 是否兼容 Odoo 20。
2. payment method、税、退款和 session API 是否使用正确字段及状态。
3. 库存扣减、退款恢复和公司上下文是否严格绑定新租户。
4. 种子失败时是否会留下部分写入，是否可安全重试。
5. 每次创建租户是否只执行一次，避免重复订单和重复商品。

`docs/UAT_RICHER_DUMMY_SEED_2026-10-17.json` 是实现说明；真实线上结果以 `UAT_RICHER_DUMMY_SEED_LIVE_2026-10-17.json` 为准。

### Sample Data 清理批次的最新结果

历史部署竞态记录：`db2140e` 上一次性租户 `codex-sample-20261017105923` 的异步 Odoo provisioning 返回 `Access to unauthorized or invalid companies.`，未执行清理或业务写入，租户已删除且删除后认证返回 402；证据见 `docs/UAT_SAMPLE_DATA_PURGE_LIVE_2026-10-17_RETRY.json`。

修复后结果：`87a6d7c` 将 Odoo 20 不接受的 unary `!` domain 改为 `not like`。新租户 `cpr-20261017105911` 已完成清理回归：归档 14 个 DEMO 商品、4 个客户，清理后 active product 为 0，销售记录保留，二次清理 `idempotent=true`，删除后认证返回 402。当前 sample-data 清理批次按修复后证据视为通过，详见 `docs/UAT_SAMPLE_DATA_PURGE_FIX_LIVE_2026-10-17.json`。

整体项目仍为 **NO-GO**，因为实体硬件、分单收款、离线 POS、生产 AI 和正式门店硬件/现金运营验收尚未覆盖；自动化隔离租户的现金盘点关班已通过。

### 最新状态守卫回归（`01f1c5a`）

新租户 `codex-probe-20261017112219` 首次 provisioning 返回 `ready`，sample status 返回 14 个 DEMO 商品、4 个客户、32 笔 demo orders，CSV 导出返回 15 行；删除后认证返回 402。证据见 `docs/UAT_SAMPLE_STATUS_GUARD_LIVE_2026-10-17.json`。现有 demo 租户只读状态仍为 `never_seeded/canPurge=false`，页面保持 `no-store`。

### Provisioning company context 修复：已通过

`78f8385` 将新 Odoo company 加入 service user 的步骤移到所有 company-scoped setup RPC 之前。新租户 `cprv-20261017110927` 首次 binding 轮询即返回 `ready`，无 provision error，Odoo session 返回 200，14 个 DEMO 商品可读；删除租户后认证返回 402。

证据：[UAT_PROVISION_COMPANY_CONTEXT_FIX_LIVE_2026-10-17.json](UAT_PROVISION_COMPANY_CONTEXT_FIX_LIVE_2026-10-17.json)。

## 5. 最新补货审计线上验收

2026-10-17 使用全新租户完成补货计划、供应商创建、draft RFQ 和内部审批审计回读：

- tenant slug：`codex-replenishment-2212548828`（已删除）
- Odoo company：`46`
- draft RFQ：`P00012` / purchase order `10`
- supplier：tenant-scoped supplier `410`
- RFQ 状态：`draft`，未确认采购
- approval audit：1 条 Odoo chatter message，包含 forecast method、coverage、suggested/ordered quantity 和 reason
- 未知供应商 ID `1` 返回 HTTP `404`，没有产生采购写入
- 删除租户后认证返回 HTTP `402`

证据：[`UAT_REPLENISHMENT_AUDIT_LIVE_2026-10-17.json`](UAT_REPLENISHMENT_AUDIT_LIVE_2026-10-17.json)。

这次线上回归证明了当前租户范围内的 RFQ 和审计写入。Demo 租户没有可读供应商，因此未执行跨公司真实供应商 ID 的对照请求。

## 6. 接手后的执行顺序

### Date & Time 页面修复（`a9a5162`）

本批次将 `/settings/company/date-time` 的固定 `Australia/Sydney` 文案改为读取当前 Odoo POS 配置的门店时区；Odoo 连接失败时显示 `Odoo POS configuration`，避免把示例值当成实际设置。页面保留动态/不缓存声明，并加入 no-store headers 配置。

- 提交：`a9a5162`，已推送 `origin/main`
- 检查：`npm run typecheck` 通过；目标页面 ESLint 通过；`git diff --check` 通过
- 线上矩阵：[`UAT_DATE_TIME_SETTINGS_LIVE_2026-10-17.json`](UAT_DATE_TIME_SETTINGS_LIVE_2026-10-17.json)，131 路由 × 390/1440 = `262/262 PASS`
- `/settings/company/date-time` 在两个视口均返回 HTTP 200，页面不再包含 `Australia/Sydney`
- 当前未认证响应仍观察到 `Cache-Control: s-maxage=31536000`、`x-nextjs-cache: HIT`、`x-nextjs-prerender: 1`；因此缓存头切换和 Dokploy 实际运行 SHA 仍需单独确认，不能仅凭矩阵结果宣称部署已完成
- 本批次未执行 Demo 租户销售、退款、采购、库存、现金、关班或权限写入

工作区保留原有未提交的 `pos-ui/tsconfig.json` 修改，未纳入本提交。

### Odoo 时间解析统一（`4ef8242`）

报表 Dashboard、Overview 和 Sales History 原先各自拼接 `Z` 解析 Odoo 时间；当 Odoo 返回带偏移的 ISO 时间时会产生重复时区后缀，造成无效日期或错误回退。现在统一使用共享 `odoo-date.ts`，同时兼容无时区、`Z`、带偏移 ISO 时间和 read_group 的门店本地时间桶。

- 提交：`4ef8242`，已推送 `origin/main`
- 检查：`npm run typecheck` 通过；目标文件 ESLint 通过；`git diff --check` 通过
- 线上矩阵：[`UAT_TIMESTAMP_FORMAT_LIVE_2026-10-17.json`](UAT_TIMESTAMP_FORMAT_LIVE_2026-10-17.json)，131 路由 × 390/1440 = `262/262 PASS`
- 本轮未执行销售、退款、采购、库存、现金、关班或权限写入
- 公网响应仍观察到 `s-maxage=31536000`/`x-nextjs-prerender`；Dokploy 实际运行 SHA 和缓存头切换仍需控制台或下一次部署日志确认

### Middleware 缓存策略补齐（`d9a7208`）

`next.config.ts` 的实时页面清单与 `middleware.ts` 原先不一致，导致部分核心 Odoo 页面仍可能继承旧的预渲染缓存。现在中间件覆盖核心销售、历史、采购、补货、报表、设置、平台门店详情等路径，并对 `/platform/stores/:id` 使用前缀匹配。

- 提交：`d9a7208`，已推送 `origin/main`
- 检查：`npm run typecheck`、middleware ESLint、`git diff --check` 通过
- 认证矩阵：[`UAT_CACHE_MIDDLEWARE_LIVE_2026-10-17.json`](UAT_CACHE_MIDDLEWARE_LIVE_2026-10-17.json)，`262/262 PASS`
- 线上状态页仍返回 `s-maxage=31536000`、`x-nextjs-cache: HIT`；这证明当前公网实例尚未消费该提交，必须在 Dokploy 执行一次普通 Deploy 并确认运行 SHA 后再验收 no-store 头

### Date & Time server/client route 拆分（`e1cd939`）

Date & Time 页面现在由 server route 承载 `dynamic`/`fetchCache` 段配置，客户端只负责读取 Odoo POS 时区和渲染视图，避免在 Client Component 中导出 Next.js route segment 配置，降低 prerender/revalidate 构建错误风险。

- 提交：`e1cd939`，已推送 `origin/main`
- 检查：`npm run typecheck`、目标文件 ESLint、`git diff --check` 通过
- 认证矩阵：[`UAT_DATE_SETTINGS_ROUTE_LIVE_2026-10-17.json`](UAT_DATE_SETTINGS_ROUTE_LIVE_2026-10-17.json)，`262/262 PASS`
- 公网路由返回 200，但仍显示旧 `s-maxage=31536000`；Dokploy 尚未确认运行 `e1cd939`

### 门店时区刷新时间（`740e042`）

报表 Dashboard、Overview 和 Sales History 的 `Loaded`/`Last refreshed` 现在使用当前 Odoo 门店时区，而不是浏览器本地时区；共享日期工具新增 epoch 时间格式化入口。

- 提交：`740e042`，已推送 `origin/main`
- 检查：`npm run typecheck`、目标文件 ESLint、`git diff --check` 通过
- 首次矩阵：[`UAT_STORE_REFRESH_TIME_LIVE_2026-10-17.json`](UAT_STORE_REFRESH_TIME_LIVE_2026-10-17.json)，261/262；唯一异常为 390px `/customers/balances/statements` 瞬时 504，无页面错误
- 立即认证重试：[`UAT_STORE_REFRESH_TIME_RETRY_2026-10-17.json`](UAT_STORE_REFRESH_TIME_RETRY_2026-10-17.json)，该路由返回 200、无横向溢出、无页面错误
- 本轮仍未执行 Demo 租户业务写入；公网实例运行 SHA/缓存头仍待 Dokploy 普通 Deploy 确认

### Close/Purchases 刷新时间（`c936284`）

Close Register 和 Purchases 页面现在也使用当前 Odoo POS 门店时区显示 `Last refreshed`，不再混用浏览器本地时区。

- 提交：`c936284`，已推送 `origin/main`
- 检查：`npm run typecheck`、目标文件 ESLint、`git diff --check` 通过
- 定向线上回归：[`UAT_REFRESH_TIME_TARGETED_LIVE_2026-10-17.json`](UAT_REFRESH_TIME_TARGETED_LIVE_2026-10-17.json)，5 个核心路由 × 390/1440 = `10/10 PASS`
- 无横向溢出、无 page error，未执行任何业务写入
- 公网缓存头仍待 Dokploy 普通 Deploy 后确认

### Customers/Suppliers 刷新时间（`66bcb37`）

Customers 和 Suppliers 目录页现在读取当前 Odoo POS 配置的门店时区，并用该时区显示 `Last refreshed`；bootstrap 失败时保留 Adelaide 回退，不阻断目录读取。

- 提交：`66bcb37`，已推送 `origin/main`
- 检查：`npm run typecheck`、目标文件 ESLint、`git diff --check` 通过
- 定向线上回归：[`UAT_DIRECTORY_TIMEZONE_TARGETED_LIVE_2026-10-17.json`](UAT_DIRECTORY_TIMEZONE_TARGETED_LIVE_2026-10-17.json)，7 个路由 × 390/1440 = `14/14 PASS`
- 无横向溢出、无 page error，未执行任何业务写入
- 公网实例仍需 Dokploy 普通 Deploy 后确认最新运行 SHA 和 no-store 响应头

### Products/Replenishment 刷新时间（`9d45a52`）

Products 和 Replenishment 页面现在用 Odoo POS 门店时区显示 `Last refreshed`；Products 在连接后读取当前 POS 配置，Replenishment 继续复用已有 bootstrap 时区。

- 提交：`9d45a52`，已推送 `origin/main`
- 检查：`npm run typecheck`、目标文件 ESLint、`git diff --check` 通过
- 定向认证回归：[`UAT_STOCK_TIMEZONE_TARGETED_LIVE_2026-10-17.json`](UAT_STOCK_TIMEZONE_TARGETED_LIVE_2026-10-17.json)，4 个路由 × 390/1440 = `8/8 PASS`
- 首次登录探测出现瞬时 502，立即重试登录返回 200；重试后的所有页面无横向溢出、无 page error
- 本轮未执行销售、采购、库存、现金或其他业务写入；公网缓存头仍待 Dokploy 普通 Deploy 确认

### Next route config 构建风险清理（`11973ea`）

Products、Promotion Categories、Price Sets、Roles、Users、Vendor Connections 和 Platform Store Detail 的 `dynamic`/`fetchCache` 已从 Client Component 页面移到各自的 server `layout.tsx`。页面行为不变，降低 Next prerender/revalidate 构建错误风险。

- 提交：`11973ea`，已推送 `origin/main`
- 检查：typecheck、目标 ESLint、`git diff --check` 通过
- 定向认证回归：[`UAT_ROUTE_CONFIG_LAYOUT_LIVE_2026-10-17.json`](UAT_ROUTE_CONFIG_LAYOUT_LIVE_2026-10-17.json)，7 个路由 × 390/1440 = `14/14 PASS`
- 首次 `/products` 390px 请求为瞬时 504，立即认证重试为 200、无溢出、无 page error
- 本地未运行 build；公网实例仍需 Dokploy 普通 Deploy 后确认最新运行 SHA 和 no-store 头

### 全局键盘与移动端触控改进（待部署）

`AppShell` 现在为桌面和移动模式提供 Skip to main content，并把页面内容包在可聚焦的 `<main id="main-content">` landmark 中。Admin 共用按钮和列表行 View/Edit/Delete 操作补齐 `focus-visible` 焦点环；行操作最小触控高度提升到 44px，降低窄屏误触风险。

- 当前代码尚未部署，待与下一批功能改动合并后统一 Dokploy 普通 Deploy
- 检查：`npm run typecheck` 通过；目标 ESLint 无 error（保留仓库既有 warnings）；`git diff --check` 通过
- 本地未运行 build；未执行任何销售、退款、采购、库存、现金或权限写入
- `3f0068e` 推送后只读检查 `/`、`/overview`、`/products` 仍返回 `Cache-Control: s-maxage=31536000`、`x-nextjs-cache: HIT`、`x-nextjs-prerender: 1`，且无运行 SHA；需 Dokploy 普通 Deploy 后重新验证

### Future Costs / Prices 移动端列表（待部署）

`/utilities/future-costs` 和 `/utilities/future-prices` 在 `md` 以下不再渲染 720px 最小宽度的 `ListTable`，改为产品、金额和生效时间摘要卡片；桌面仍保留原密集表格和分页。该改动直接处理旧 UI 报告中的窄屏横向滚动问题。

- 检查：typecheck 通过；目标 ESLint 无 error，仅保留 `AppShell` 原有 1 个 warning；`git diff --check` 通过
- 未改变 API、数据权限或任何业务写入

### 共用列表可访问性（待部署）

`ListTable` 现在输出 `role="table"`、表头、行和单元格语义，并支持自定义 `aria-label`；共用 `Pagination` 使用 `nav[aria-label="Pagination"]`。这批改动覆盖商品、客户、供应商、设置、报表和工具列表，不改变现有桌面或移动布局。

- 检查：`npm run typecheck` 通过；`ListTable` 与 `Pagination` 目标 ESLint 通过；`git diff --check` 通过
- 未执行任何业务写入；仍需 Dokploy 普通 Deploy 后做认证页面和键盘回归

### 行操作入口一致性（待部署）

`AdminRowActions` 现在只渲染实际提供回调的 View/Edit/Delete 操作，不再显示点击后无动作的假入口；已有产品列表的真实操作保持不变。

- 检查：typecheck 通过；目标 ESLint 通过；`git diff --check` 通过

### 分页越界恢复（待部署）

共用 `Pagination` 现在会把过期页码限制在有效范围，正确显示当前结果区间，并提供 `Go to page N` 恢复入口。筛选条件减少结果后不会再显示错误的 Showing 区间或失效的 Prev/Next 状态。

- 检查：typecheck 通过；`Pagination` 与 Admin 共用组件目标 ESLint 通过；`git diff --check` 通过

### 销售报表移动端摘要（待部署）

Daily Sales、Weekly Sales、This Month Sales、Last Week Sales 和 Last Month Sales 现在在窄屏使用指标卡片/日摘要，桌面继续使用完整表格。金额、成本、交易数、毛利和毛利率均保留，避免 6 列报表在手机端横向滚动。

- 检查：typecheck 通过；5 个报表目标 ESLint 通过；`git diff --check` 通过
- 只读报表改动，未改变 API 或任何业务写入

### 平台门店与工具页只读一致性（待部署）

`/platform/stores` 在窄屏使用门店摘要卡片，桌面保留完整 7 列表格。`/utilities/mail-log` 和 `/utilities/trashed-items` 不再显示没有实现回调的 View/Restore/Delete 假操作入口，改为准确的只读列表。

- 检查：typecheck 通过；三个页面目标 ESLint 通过；`git diff --check` 通过
- 未改变租户、邮件或回收站 API；未执行任何业务写入

### Trashed Items 搜索修复（待部署）

修复 `/utilities/trashed-items` 搜索框只改变本地状态但不请求后端的问题：后端 `/api/trashed-items` 新增 `q` 参数，按名称不区分大小写模糊匹配，列表和总数使用同一过滤条件；前端输入或切换类型时重置到第 1 页。

- 前端 typecheck 与目标 ESLint 通过；`git diff --check` 通过
- 本地未运行 Java build；部署后需用只读租户验证搜索结果和分页总数

### Mail Log 搜索匹配修复（待部署）

`/api/mail-log` 的 recipient 查询现在按不区分大小写的包含匹配处理，并对空白输入统一视为无筛选；列表与总数保持同一过滤条件，符合前端 Search 文案。

- 本地未运行 Java build；部署后需用只读日志数据验证片段邮箱搜索和分页

### Mail Log / Trashed Items 缓存隔离（待部署）

为两个 Client Component API 页面新增 server `layout.tsx`，统一导出 `dynamic = "force-dynamic"` 与 `fetchCache = "force-no-store"`。这使搜索结果和回收站列表不会被 Next 静态页面壳缓存；页面行为和 API 权限不变。

- 检查：typecheck 通过；`git diff --check` 通过
- 本地未运行 build；部署后需检查响应头为 `no-store` 并做认证只读回归

### 报表、促销与平台列表缓存隔离（待部署）

为 Platform Stores、Promotions、Register Closures、Daily/Weekly/This Month/Last Week/Last Month Sales 新增 server `layout.tsx`，统一设置 `force-dynamic` 与 `force-no-store`。这些页面的 API 读取和移动端布局改动将在同一部署批次验证。

- 检查：typecheck 通过；`git diff --check` 通过
- 本地未运行 build；部署后需检查上述路由响应头和认证只读页面矩阵

### 当前线上证据边界

`docs/UAT_PAGE_MATRIX_2026-10-13.json` 最近记录的矩阵为全 PASS，但其 `sourceCommit` 仍是 `3b75e05`，`deployment` 为空，早于当前 `e2c8641`。该文件只能证明旧提交的页面回归，不能证明本批次的 server layout、搜索修复或移动端报表已经上线；部署后必须生成新的带实际运行 SHA 的矩阵。

1. 阅读 `AGENTS.md`、本文件和 `docs/CAPABILITY_STATUS.md`。
2. 检查 `git status`，保留 `pos-ui/tsconfig.json` 等并行修改。
3. 复核 `7c51683` 的 richer dummy data Java 改动及对应测试；不要重复提交相同代码。
4. 在 `pos-ui` 目录运行允许的检查：

   ```text
   npm run typecheck
   npm run lint
   git diff --check
   ```

   当前环境不运行 `build`；本机 Java 8 不能代替后端要求的 Java 21 构建。
5. 确认 Dokploy 已消费 `7c51683`；若 webhook 未触发，再在 Dokploy 执行一次普通 Deploy。
6. 在 Dokploy 执行普通 Deploy，禁止 Fresh Volumes；记录前后端容器实际运行的 commit SHA。
7. 用新的 slug，例如 `codex-full-uat-<timestamp>`，密码使用至少 12 位，创建：
   - `Main Store`：2 个 Register
   - `Back Bar`：1 个 Register
   - 选择 sample/dummy data
8. 回读租户、Odoo company、商品、库存、客户、订单、退款和打开的 register。
9. 在该租户完成受授权的销售、退款、现金和采购收货回归，保存 JSON 证据。
10. 通过平台 Web UI 删除一次性租户，确认登录与受保护 API 返回 402/未授权。

## 7. 验收边界

### 不得宣称已验证

- 实体刷卡终端
- 打印机和钱箱
- 分单收款
- 离线 POS
- 生产 AI
- SMTP 实际发信
- 正式门店现金实点差异处理（除非现场完成并保存盘点证据）

这些项目在能力矩阵中标记为“未验证/未实现”，不计入核心 POS 通过门槛。

### 证据最低要求

每个场景至少记录时间、租户 slug、vendor、Odoo company、session、receipt/order、库存前后值和 HTTP 状态。不得写入密码、JWT、bootstrap token、Odoo 凭据或 `.env` 内容。

## 8. 常见陷阱

- 品牌域 `/signup` 是 6 步实现；`app.orithos.com.au` 上可能存在旧的 4 步实现，不能混为同一源码。
- “At least 12 characters” 曾与真实 API 的 8 位规则不一致；以当前线上 API 和前端实际响应为准，修改后必须重新做负向请求和真实注册验证。
- 页面返回 200 不等于租户、Odoo、库存或订单写入成功；必须回读业务数据。
- Dokploy 部署完成必须以实际构建日志和线上响应确认，不能只看 GitHub 已 push。
- 不要在真实 Demo 公司执行销售、退款、采购、库存、现金、关班或账户权限写入。

## 9. 交付完成定义

只有满足以下条件，才能把本批次标记为完成：

- richer dummy data 已通过 Java 21 构建或等价 CI 证据。
- Dokploy 已部署目标 commit，线上容器运行正常。
- 新租户的商品、库存、客户、订单、退款和 register 均有真实回读。
- 关键 POS 链路和跨租户拒绝有 JSON 证据。
- 测试租户已删除，删除后的认证拒绝已确认。
- GitHub commit、部署 SHA、缺陷和未覆盖能力已记录。

在此之前，整体状态保持 **NO-GO**。
