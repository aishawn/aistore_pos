# Orithos POS 当前交接

## 2026-10-20 AI 助手问法扩展（待部署）

- 确定性路由新增显式日期销售问法、带名称商品搜索和商品库存问法，避免 provider 暂不可用时把明确请求送入分类模型；商品名称会保留为 query。
- 中文商品搜索捕获组已修正；自定义中英文比较问法在日期快捷路由前保持 `report_adhoc` 引导拒答。
- Java 21 全量门禁：`mvn -B clean verify`，`238 tests, 0 failures, 0 errors`；仅有既存 JSqlParser 弃用警告。
- 同步更新 `AI_ASSISTANT_TEST_PLAN.md` 与 `AI_ASSISTANT_UTTERANCE_CATALOG.md`。本批次尚未进入 Dokploy，线上 AI 回归需在分支绑定修复后执行。

## 2026-10-20 补货 RFQ 边界与请求竞态（工作区）

- RFQ 弹窗供应商加载使用请求 revision，旧请求不会覆盖快速重新打开后的供应商/错误状态。
- 创建 draft RFQ 在提交时再次校验数量 `0..100,000`，不依赖浏览器 input `max`；仍是人工确认的 Odoo draft，不自动发送或确认采购单。
- 本地验证：前端 typecheck、目标 ESLint、补货 race/audit UAT 脚本 `node --check`、目标 diff check 通过；未运行 Next/Docker build，未执行真实 RFQ 写入。
- 本批次待与前端其他改动集中部署；Dokploy 仍需先修正 Compose `main` 分支绑定。

## 2026-10-20 继续迭代：盘点键盘操作与现金边界

- 盘点搜索结果支持键盘 Enter/Space 添加可盘商品，并保留重复、不可盘商品和数量上限保护。
- Manage Cash 的金额输入与提交校验统一为 `0 < amount <= 1,000,000`，避免明显超限金额才在 Odoo 返回错误；仍要求打开 session，未改变真实写入流程。
- 本地验证：前端 typecheck、目标 ESLint、盘点 UAT 脚本语法和 `git diff --check` 通过；未运行 Next/Docker build。
- 最新代码已推送 `4121d26`；尚未触发 Dokploy，等待 Compose `main` 分支绑定修正后集中部署和线上复验。
- 2026-10-20 20:16（UTC+8）以 `after=4121d26` 触发 Compose webhook，完整响应为 `HTTP 301 {"message":"Branch Not Match"}`，没有创建构建任务；仍需在 Dokploy Source/Git 修正仓库/分支绑定。

## 2026-10-20 集中部署后只读回归（`d76e786`，运行身份未核验）

- Dokploy webhook 返回 `HTTP 200 Compose deployed successfully`；这只证明请求被接受，尚未从控制台回读 frontend/backend 构建日志、容器 SHA 或健康状态。
- Demo 只读回归通过：AI route matrix `9/9`、AI features `14/14`、AI reports `9/9`、Sommelier `10/10`、AI UI `2/2`、表格/表单 `14/14`、价格/库存 `8/8`，全站静态矩阵 `134 路由 × 390/1440 = 268/268`。
- 所有专项均无业务写入；table UAT 的非 GET 请求是被拦截的 Odoo 只读 RPC，`unexpectedWrites=0`；pricing UAT `blockedWrites=0`。
- 证据汇总：[UAT_DEPLOYMENT_BATCH_2026-10-20_D76E786.json](UAT_DEPLOYMENT_BATCH_2026-10-20_D76E786.json)。真实模型质量、发票字段探针和容器身份仍未达到放行条件，发布继续 **NO-GO**。

## 2026-10-20 Sommelier Odoo 租户上下文批次（工作区）

- 配置 Odoo service account 时，Sommelier 的 recommend/identify/label/similar/ask/wine 路径现在传递 `TenantContext` 的 vendor ID；Odoo `search_read` 使用绑定的 `allowed_company_ids`、`force_company` 和 `warehouse`。
- vendor 未绑定、Odoo provisioning 非 `ready` 或绑定不存在时，酒商目录 fail-closed 返回空结果，不再从全局 Odoo 目录猜测其他店库存；未配置 Odoo 时保留原本的只读 MySQL fallback。
- 新增 Odoo context 与 tenant-aware catalog 单测；本地 `npm run typecheck`、AI UAT 脚本语法检查和 `git diff --check` 通过。按约束未运行 Maven/Next/Docker build，Java 21 编译、线上多店隔离和真实库存上下文仍待 Dokploy 验证。

## 2026-10-20 AI 问法覆盖与报表空结果提示（`e9222da`）

- AI 报表日期解析新增 `前天/day before yesterday`、`past/previous/recent N days`、英文日期区间、中文数字日期区间；新增 [AI_ASSISTANT_UTTERANCE_CATALOG.md](AI_ASSISTANT_UTTERANCE_CATALOG.md) 覆盖销售、数量、客单价、库存、滞销、导航、实体操作、问答、拒绝和语音问法。
- 空销售结果改为可行动提示：明确所选营业日没有已完成销售，并建议使用 `sales last 7 days`；库存和滞销空结果使用领域对应提示。语音 API 注释与实际云端 ASR 失败行为一致。
- 只读线上报表续测 `UAT_AI_REPORTS_READONLY_CONTINUATION_2026-10-20.json` 为 `9/9 PASS`：`Australia/Adelaide` 日期边界、14 Oct `$4,014.36` 对账、7/30 天汇总和 Odoo 路径均通过；线上仍显示旧的 `No data found...` 文案，说明新提示尚未部署。
- 本地语音 fixture 已覆盖松开/取消和 ASR 失败；本轮未将本地登录重定向误报为产品通过。脚本语法与 diff check 通过，未运行 build/Maven。
- `e9222da` 已推送 `origin/main`；Dokploy webhook 返回 `HTTP 301 Branch Not Match`，没有启动构建。必须修正 Compose 分支绑定后再部署，并重新验证新空结果文案、日期区间和语音失败提示。

## 2026-10-20 AI 日志与错误码脱敏批次（工作区）

- 分类器日志不再写入原始问题或 slot 值；NL2SQL 日志只保留 outletId 与参数数量，不记录 SQL、参数、provider 或数据库异常文本。
- `SqlGuardException`、查询失败、配额失败统一使用 `SQL_GUARD_REJECTED`、`EXEC_QUERY_FAILED`、`QUOTA_EXCEEDED` 等固定错误码；`ReportRespondNode` 继续返回安全的员工提示。
- Redis、Odoo、报表快照、租户 schema provision、酒商 LLM fallback 和配置初始化日志只记录异常类型；不改变正常业务结果或 fallback 行为。
- 本地验证：AI 模块源码扫描不再发现 `e.getMessage()`、SQL/参数日志；`git diff --check` 通过。按约束未运行 Maven/Next/Docker build；Java 单测和 Dokploy 构建仍待后续集中验证。

## 2026-10-20 Dokploy #38 编译错误复核（当前状态）

- #38 的 Maven 失败点是 `AiConfigController.java` 与 `SommelierController.java` 调用 `AiProviderConfig.isValidBaseUrl(...)` 时解析不到该类型；`Parenthesis` deprecated 只是警告，不是失败原因。
- 当前 `main`/`origin/main` 为 `252a08e`，最近运行时代码批次为 `c559db2`（包含日志安全批次 `a5c8523`）。源码静态核对确认 `pos-api/src/main/java/com/orithos/modules/ai/AiProviderConfig.java` 已被 Git 跟踪，两个控制器均包含 `import com.orithos.modules.ai.AiProviderConfig;`，所以 #38 对应的是旧源码快照，不能作为当前提交仍无法编译的证据。
- 遵守本项目验证约束，本地未运行 Maven、Next 或 Docker build；当前没有新的编译通过证据。应在 Dokploy 控制台确认目标构建至少使用 `c559db2`（或其后提交），再读取完整 backend/frontend 日志、容器 SHA、健康状态和完成时间。
- Dokploy Compose 分支绑定此前反复返回 `HTTP 301 {"message":"Branch Not Match"}`；在 Source/Git 设置修正为 `aishawn/aistore_pos`、`main`、仓库根目录和 `docker-compose.yml` 前，不再重复 webhook。发布状态保持 **NO-GO**。

## 2026-10-20 Odoo 报表数据源改造（并行提交 `1ea5e18`）

- AI 报表路径已从 Classic/NL2SQL 查询改为绑定租户 Odoo company 的只读 JSON-RPC：销售、数量、AOV、库存和滞销查询均带 company、warehouse、时间窗口和 Demo seed 过滤；新增 `OdooReportQueryServiceTest`、`ReportPeriodResolverTest` 扩展及 `scripts/pilot-ai-report-readonly-uat.mjs`。
- 新增矩阵文档：[AI_ASSISTANT_TEST_MATRIX.md](AI_ASSISTANT_TEST_MATRIX.md)，明确报告日期、Odoo 对账、租户隔离、无写入和 AI/语音验收门槛。
- 当前仍未完成线上验收：本地按约束未运行 Maven/build；脚本语法通过。时间区仍使用 `Australia/Sydney`，而 Demo 公司记录为 `Australia/Adelaide`，需后续从 Odoo company timezone 读取后再宣称日期边界完全正确。
- 集中批次提交 `4748590` 已推送 `origin/main`；Compose webhook 返回 `HTTP 301 {"message":"Branch Not Match"}`，未启动构建。

## 2026-10-20 AI 麦克风策略回归补充

- 并行提交 `caccb74` 将前端 `Permissions-Policy` 从完全禁用麦克风改为仅允许当前 origin：`camera=(), microphone=(self), geolocation=()`。
- `scripts/pilot-ai-ui-uat.mjs` 现在在检测到新 Hold to speak 按钮时，同时断言响应头包含 `microphone=(self)`，避免 UI 能力与浏览器安全策略不一致。
- 脚本 `node --check`、`git diff --check` 通过；公网登录当前失败，尚未形成新的线上 AI 证据。

## 2026-10-20 Dokploy 分支阻断排查文档

- 远端当前只有 `main` 分支；Dokploy 控制台页面可访问但未认证，无法从本会话读取 Compose 服务的实际 Source/Git 配置。
- `DEPLOYMENT.md` 新增 `Branch Not Match` 处理步骤：核对仓库、`main` 分支、根目录、`docker-compose.yml`，使用普通 Deploy，并保存 frontend/backend SHA、完整构建日志、时间和健康状态。
- 在这些证据补齐前，任何 webhook `301` 或公网 `200` 都不能算新批次已部署；当前发布状态继续 **NO-GO**。

## 2026-10-20 AI 语音键盘交互批次（工作区）

- `SellAiPanel` 的 Hold to speak 按钮现在支持键盘 Space/Enter 按下与释放、失焦自动停止，并暴露 `aria-pressed`；删除并行提交遗留的未使用 `applyTranscript`，目标 ESLint 已无警告。
- `scripts/pilot-ai-ui-uat.mjs` 兼容旧 `Voice input` 与新 `Hold to speak` 文案，并验证新按钮的 idle ARIA 状态；公网只读脚本不会调用真实麦克风，完整按键录音需在媒体 fixture 中验证。
- 本地 typecheck、目标 ESLint、脚本 `node --check`、diff check 通过。公网脚本本次因登录接口失败而未形成有效 AI UI 证据，不能据此判断产品失败。
- 语音/测试批次提交 `72d56da` 已推送 `origin/main`；Compose webhook 返回 `HTTP 301 {"message":"Branch Not Match"}`，未启动构建。

## 2026-10-20 全站 Loading 状态语义批次（工作区）

- 平台 Stores、Promotions/Categories、Promotions、Register Closures、Price Sets、Registers/Outlets、Roles、Users、Stocktake 库位、Vendor Connections 和 Manage Cash 的 loading skeleton 全部补齐 `aria-live="polite"` 与 `aria-busy="true"`。
- 静态扫描确认 `pos-ui/app` 中没有缺少这两个状态语义的 `Loading` status；不改变读取、Retry、分页或业务写入行为。
- 本地 `npm run typecheck`、目标 ESLint、`git diff --check` 通过；按约束未运行 build。待集中部署后复跑全站矩阵、设置/盘点/平台专项。
- 集中提交 `3367c52` 已推送 `origin/main`；Compose webhook 仍返回 `HTTP 301 {"message":"Branch Not Match"}`，未启动构建。

## 2026-10-20 报表/设置 loading 状态语义批次（工作区）

- 报表 `/reports/daily-sales`、`last-month-sales`、`last-week-sales`、`this-month-sales`、`weekly-sales`，以及 `/settings/payment`、`/settings/tax` 的 skeleton loading 状态统一补齐 `aria-live="polite"` 与 `aria-busy="true"`。
- 只改变异步状态的可访问表达，不改变数据请求、报表计算、设置读取或任何写入行为；Future Costs/Prices 的同类修复已在前一批完成。
- 本地 `npm run typecheck`、目标 ESLint、`git diff --check` 通过；尚未运行 build 或线上验证，待集中部署后复跑报表/设置专项与全站矩阵。
- 集中批次提交 `8758235` 已推送 `origin/main`；Compose webhook 返回 `HTTP 301 {"message":"Branch Not Match"}`，未启动构建。

## 2026-10-20 Future Costs/Prices 状态可访问性批次（工作区）

- `pos-ui/app/utilities/future-costs/client-page.tsx` 与 `future-prices/client-page.tsx` 的 loading 状态补齐 `aria-live="polite"`、`aria-busy="true"`，让读屏器能识别异步读取过程。
- 两个页面的错误 Retry 状态补齐 `aria-live="assertive"`、图标 `aria-hidden` 和键盘 `focus-visible` 样式；不改变 API、分页、只读边界或数据展示。
- 本地 `npm run typecheck`、目标 ESLint、`git diff --check` 通过；按约束未运行 build。新代码待 Dokploy 分支修正并部署后，用全站矩阵和工具页专项复验。
- 批次提交 `e291e61` 已推送 `origin/main`；Compose webhook 返回 `HTTP 301 {"message":"Branch Not Match"}`，未启动构建。

## 2026-10-20 管理列表 UAT 断言修正（当前工作区）

- `scripts/pilot-admin-list-batch-uat.mjs` 已按页面真实 loading 状态等待 Mail Log、Trashed Items、Platform Stores 完成读取，并在清空筛选后再次等待。
- Platform Stores 的 `Create store` 只在未筛选空状态显示；脚本现在在输入无匹配搜索前检查创建入口，再检查筛选空状态的清空入口，避免把正确产品状态误报为失败。
- 公网只读复测：4 路由 × 390/1440，共 `8/8 PASS`；无业务写入。证据：`docs/UAT_ADMIN_LIST_BATCH_2026-10-17.json`（本次运行时间 `2026-10-20T03:05:24.020Z`）。
- 本次只修正测试等待与断言，没有改变产品代码。Dokploy #38 的 `AiProviderConfig` 错误仍应按旧快照/错误 Compose 分支处理：当前 `main` 已跟踪该类且两个控制器都有显式 import；需在控制台核对分支为 `main` 后部署并回读构建日志、运行 SHA 和健康状态。
- 本批次提交 `d8ed163` 已推送到 `origin/main`；触发 Compose webhook 返回 `HTTP 301 {"message":"Branch Not Match"}`，未启动构建，故不能宣称该批次已上线。
- 随后合并远端并推送 `14940f1`，再次触发 webhook 仍返回 `HTTP 301 {"message":"Branch Not Match"}`；仍需控制台修正 Compose 分支绑定。

## 2026-10-20 AI、报表与基础交互回归补充

- 现网只读/fixture 回归通过：AI 管理员保护 `15/15`、AI 功能 `14/14`、设置移动/桌面检查通过、订单页 `16/16`、POS 对话框 `2/2`、Odoo stocktake 只读 `10/10`、报表读取通过、Overview 竞态通过、Legacy Retry `5/5`；业务写入均为 `0` 或由 fixture 拦截。
- 管理列表批次第一次 `6/8`、重试 `5/8`，失败集中在平台 Stores 的 `Create store` 断言和 Mail Log 1440 空状态，截图显示平台按钮实际存在，属于旧脚本等待/状态断言不稳定，暂不修改产品代码；需后续改进脚本等待条件后再复测。

## 2026-10-20 登录页 SSR hydration 修复（待部署）

- `pos-ui/app/login/page.tsx` 的示例门店链接改为协议相对 URL（`//demo.<tenant-domain>/login`），避免服务端默认 HTTPS 与本地/代理 HTTP 首帧不一致造成 hydration mismatch。
- 本地 Next dev 浏览器检查：登录页 `hydrationErrors=0`，示例链接为 `//demo.localhost/login`；同一 dev 服务下价格建议和库存响应式 fixture 分别通过 `15/15`、`6/6`，业务写入均为 `0`。
- 本地 typecheck、目标 ESLint 和 diff check 通过；未运行 build。该修复尚未进入 Dokploy 镜像。

## 2026-10-20 表单 Modal 防误关闭（待部署）

- `pos-ui/src/components/admin/Modal.tsx` 新增 `closeOnOverlayClick`，默认关闭遮罩点击关闭；价格集、角色等编辑表单必须通过显式关闭按钮或 Escape 退出，避免误触遮罩丢失未保存输入。
- 本地 `npm run typecheck`、目标 ESLint 和 `git diff --check` 通过；现有平台恢复 fixture `5/5 PASS`，但该新 Modal 行为尚未进入公网镜像，需部署后补充表单遮罩回归。
- 最新集中提交为 `a145131`；完整 push payload 触发 Dokploy 仍返回 `HTTP 301 {"message":"Branch Not Match"}`，没有启动构建。

## 2026-10-20 测试基础设施校正与定价/库存回归（`816c13b`）

- `scripts/pilot-price-suggestions-local-uat.mjs` 已改为检查实际生产入口 `pos-ui/app`，不再把历史重复树 `pos-ui/src/app` 当作生产路由证据。
- 使用公网页面、浏览器 fixture 拦截 API 的只读回归通过：价格建议 `15/15 PASS`、Stock List/Capped Pricing/Bulk Price Edit `6/6 PASS`、Vendor Connections `2/2 PASS`；三项业务写入均为 `0`。证据分别写入 `docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19.json`、`docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-19.json`、`docs/UAT_VENDOR_CONNECTIONS_RESPONSIVE_LOCAL_2026-10-20.json`。
- 发票扫描 mock 仍通过，覆盖能力探测重试、扫描失败重试、预览编辑和 Odoo 下一步链接，未产生业务写入。
- 首次使用默认 `demo.localhost:3035` 的价格/库存/供应商 fixture 失败原因是本地 Next 服务未启动；切换到公网目标后重跑通过，不作为产品失败。
- 以上是当前线上基线/fixture 证据，不能替代 `d34fa45` 的部署后验证；对包含 `816c13b` 的完整 push payload 再次调用 Dokploy webhook 仍返回 `HTTP 301 {"message":"Branch Not Match"}`，没有启动构建。

## 2026-10-20 管理页共享移动安全区批次（`d34fa45`，待部署）

- `AdminPageLayout` 统一为手机管理页预留右侧 `6rem + safe-area-inset-right`，覆盖订单、报表、设置、工具和平台列表等标准页面，避免固定 Orithos AI 助手遮挡首屏或操作内容；桌面端恢复原有右间距。
- `ListTable` 的表头和数据行补齐稳定 `aria-rowindex`，不改变分页、读取和写入行为。
- 本地 `npm run typecheck`、目标 ESLint（`AdminPageLayout.tsx`、`ListTable.tsx`）和 `git diff --check` 通过；未运行 build。
- 推送后调用 Dokploy compose webhook 返回 `HTTP 301 {"message":"Branch Not Match"}`，没有启动构建，故本批次仍未完成公网验收。需在 Dokploy 控制台把 Compose 分支核对为 `main`，部署 `d34fa45`，再复跑根 `app` 全站矩阵和表格可访问性专项。

## 2026-10-20 `2b5afbd` Supplier Directory 移动安全区与部署后回归

- `pos-ui/src/components/OdooSupplierDirectoryPage.tsx` 的移动主内容区预留固定 AI 助手和系统安全区右侧空间；桌面端布局保持不变，供应商读取、Retry 和错误语义不变。
- 表格/表单可访问性专项 `docs/UAT_TABLE_A11Y_POST_2B5AFBD.json`：`14/14 PASS`，`unexpectedWrites=0`；其中被拦截的非 GET 请求均为受控只读检查路径。
- 根 `app` 全站只读矩阵 `docs/UAT_ALL_STATIC_PAGES_POST_2B5AFBD_RETRY.json`：`134` 路由 × `390/1440` = `268/268 PASS`，HTTP 全部 200，无页面错误和横向溢出。首次矩阵结果的 1440px 网络切换失败已通过串行重试排除，不作为代码失败。
- `2b5afbd` 已推送并由 Dokploy webhook 接受；但 frontend/backend 实际容器 SHA、完整构建日志、健康状态和完成时间仍未从控制台独立回读，整体发布继续 **NO-GO**。

## 2026-10-20 Dokploy #38 编译错误交接结论

- 日志中两个 `cannot find symbol AiProviderConfig` 是 `AiConfigController.java` 与 `SommelierController.java` 的阻断错误；`SqlAst.java` 的 `Parenthesis` 弃用信息只是 warning。
- 当前 `main` 最新提交为 `2b5afbd`，两个控制器均已显式导入 `com.orithos.modules.ai.AiProviderConfig`，且 `AiProviderConfig.java` 已被 Git 跟踪；因此 #38 使用的是旧源码快照或错误 Compose 分支，当前源码无需重复改 Java 控制器。
- 未运行本地 Maven/Next/Docker build，遵循项目约束。Dokploy 控制台仍需确认 Compose 分支为 `main`，并回读成功构建对应的 backend/frontend SHA、完整日志和健康状态。

## 2026-10-20 Supplier Import 可访问性与移动安全区（`ba7a947`）

- Supplier Import 的真实 Supplier 标题现在绑定到 select；产品代码 textarea 增加稳定 `aria-label`；错误使用 `role=alert`，导入结果使用 `role=status`/`aria-live`。
- 移动内容区预留固定 AI 助手右侧安全区，不改变导入接口或提交条件。
- Post-deploy 根 `app` 全站矩阵 `docs/UAT_ALL_STATIC_PAGES_POST_BA7A947_RETRY.json`：`134 × 390/1440 = 268/268 PASS`，HTTP 全部 200，无页面错误或横向溢出。
- 表格/表单专项 `docs/UAT_TABLE_A11Y_POST_BA7A947_RETRY.json`：`14/14 PASS`，`unexpectedWrites=0`。
- 部署切换初期两个脚本曾收到登录 HTTP 404；等待服务就绪后串行重跑通过，已作为部署时序记录，不作为功能失败。

## 2026-10-20 Bulk/Capped Pricing 输入可访问性（`f07d251`）

- Bulk Price Edit 移除 `label` 包裹交互式 switch 的结构；价格输入增加产品名和数量级别的稳定 `aria-label`。
- Capped Pricing 当前价输入增加产品名 `aria-label`，不改变保存、校验或写入逻辑。
- Post-deploy pricing `docs/UAT_PRICING_PAGES_ONLINE_READONLY_POST_F07D251.json`：`8/8 PASS`，`blockedWrites=0`。
- 表格/表单专项 `docs/UAT_TABLE_A11Y_POST_F07D251.json`：`14/14 PASS`，`unnamedControls=0`，`unexpectedWrites=0`。
- 本地 typecheck、目标 ESLint 和 diff check 通过；未运行 build。

## 2026-10-20 Price Suggestions 移动安全区与语义（`1181f30`）

- Price Suggestions 页面移动端增加右侧 `safe-area-inset-right` 预留，避免固定 AI 助手覆盖首屏内容；桌面间距保持不变。
- `Explain suggestion` 按钮补齐 `aria-expanded` 和 `aria-controls`，展开解释区域使用稳定 id。
- Post-deploy pricing 证据 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_POST_1181F30_FINAL.json`：4 页面 × 390/1440，`8/8 PASS`，无页面错误、无横向溢出、`blockedWrites=0`；截图目录 `docs/screenshots/2026-10-20-pricing-post-1181f30/`。
- 首次回归因 `/stock/list` 390px 短暂 HTTP 502 得到 `7/8`，串行重试后通过；该瞬态结果已保留为诊断，不作为最终验收结论。

## 2026-10-20 OCR 扫描失败重试（`87338a8`）

- `ScanInvoicePage` 保存最近一次选择的文件；OCR 临时失败时显示 `Retry scan`，重试复用同一文件和预览，不要求用户再次选择文件。
- 线上 mock 证据 `docs/UAT_INVOICE_SCAN_MOCK_POST_87338A8.json`：`6/6 PASS`，第一次扫描故障、第二次扫描成功，`businessWrites=[]`。
- `87338a8` 已通过 Dokploy webhook 接受并完成公网行为验证；本地 typecheck、目标 ESLint、脚本语法和 diff check 均通过，未运行 build。

## 2026-10-20 发票 AI 能力探测重试（`08b8e83`）

- `ScanInvoicePage` 在 AI 能力探测临时失败时提供页面内 `Retry availability`，成功重试后恢复上传按钮；preview-only、Odoo 跳转和禁止业务写入边界不变。
- `scripts/pilot-invoice-scan-mock-uat.mjs` 增加首次 503 → Retry → 能力恢复的 mock 回归。
- 线上 mock 证据 `docs/UAT_INVOICE_SCAN_MOCK_POST_08B8E83_FINAL.json`：`5/5 PASS`，扫描接口仅被拦截 1 次，未提交供应商/采购/收货写入。
- 本地 `npm run typecheck`、目标 ESLint、脚本语法和 `git diff --check` 通过；未运行 build。

## 2026-10-20 Stock List 移动右侧安全区（待部署）

- `pos-ui/src/components/admin/StockListPage.tsx` 的移动滚动容器增加右侧 `safe-area-inset-right` 预留，避免固定 AI 助手覆盖产品卡片内容；桌面端在 `md` 断点恢复原有左右间距。
- 部署前线上只读回归 `docs/UAT_PRICING_PREDEPLOY_C73B324.json`：4 页面 × 390/1440，`8/8 PASS`，新增 `assistantCardOverlap=true`，`blockedWrites=0`。该证据仍对应旧线上镜像。
- 本地 `npm run typecheck`、目标 ESLint、UAT 脚本语法检查和 `git diff --check` 通过；未运行本地 build。
- 下一步集中部署后重跑 pricing、表格可访问性和全站根 `app` 矩阵；Demo 继续只读，禁止业务写入。

## 2026-10-20 `3da583e` 部署后回归

- 完整 GitHub push payload 触发 Dokploy 返回 `HTTP 200 Compose deployed successfully`；公网截图已显示 Stock List 移动产品卡片与浮动助手之间有右侧间距。
- Pricing/Stock 只读专项 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_POST_3DA583E.json`：`8/8 PASS`，`assistantCardOverlap=true`，页面错误 `0`，`blockedWrites=0`。
- 表格/表单专项 `docs/UAT_TABLE_A11Y_POST_3DA583E.json`：`14/14 PASS`，`unexpectedWrites=0`；其中 3 个非 GET 请求均为受控只读检查路径。
- 根 `app` 全站矩阵 `docs/UAT_ALL_STATIC_PAGES_POST_3DA583E.json`：`134 × 390/1440 = 268/268 PASS`，HTTP 全部 200，无页面错误或横向溢出。
- AI capability `docs/UAT_AI_AVAILABILITY_POST_3DA583E.json`：`3/3 PASS`；仅验证配置、composer 和本地快捷入口，未提交模型提示词。
- 这些证据的 Dokploy 容器 SHA/完整构建日志/健康状态仍未从控制台独立回读，整体发布状态继续 **NO-GO**。

- 同一线上镜像补充专项：`docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_POST_3DA583E.json` 盘点只读 `10/10` 检查通过，`nonGetStocktakeRequests=0`，`writeEnabled=false`；`docs/UAT_INVOICE_SCAN_MOCK_POST_3DA583E.json` 发票 preview-only `4/4 PASS`，无供应商/采购/收货写入。

## 2026-10-20 当前构建诊断与移动遮挡断言

- 当前 `main`/`origin/main` 为 `91ddfb9`；`AiProviderConfig.java` 已被 Git 跟踪，`AiConfigController` 与 `SommelierController` 均包含 `import com.orithos.modules.ai.AiProviderConfig;`。因此 Dokploy #38 的两个 `cannot find symbol` 不是当前源码缺陷，应视为旧快照或 Compose 分支/提交配置错误。
- `SqlAst.java` 的 `Parenthesis` 弃用信息只是 warning，不会导致 Maven 退出。未重复修改 Java 控制器，也未运行本地 Maven/Next build。
- Dokploy 必须从控制台确认 Compose 分支为 `main` 并部署 `91ddfb9` 或更晚提交；需要回读完整 Maven/Next 日志、frontend/backend 容器 SHA、健康状态和完成时间。仅 webhook 返回值不能证明构建完成，整体状态继续 **NO-GO**。
- 价格/库存只读 UAT 脚本新增 390px Stock List 浮动助手与可见产品卡片相交断言；下一次 UI 部署后需重新生成专项证据。现有 `da76894` 截图已发现首屏产品卡片仍可能被 FAB 覆盖，该问题尚未标记为已修复。

## 2026-10-20 Stock List 筛选与移动底部空间批次（当前工作区）

- `pos-ui/src/components/admin/StockListPage.tsx` 修正库存筛选开关的 HTML 结构：不再让 `<label>` 包裹交互式 `<button role="switch">`，改为普通分组容器和可见文本，避免重复触发与辅助技术语义冲突。
- Stock List 自定义滚动区域补齐 `6rem + safe-area-inset-bottom` 底部空间，保留分页和最后一行不被浮动 AI 助手或系统手势条遮挡；筛选、编辑、保存和导出逻辑不变。
- 本地验证：`npm run typecheck`、目标 ESLint、stock table/table-a11y 脚本 `node --check`、`git diff --check` 通过；未运行 build。
- 待与后续修改集中部署后，必须复跑 `/stock/list` 390/1440、stock table responsive 和全站矩阵，确认筛选开关状态、移动卡片字段、分页和无业务写入。

## 2026-10-20 `da76894` Stock List 部署后回归

- Dokploy webhook 返回 `HTTP 200 Compose deployed successfully`，公网已呈现 Stock List switch 结构和底部安全空间修复。
- 价格/库存只读专项 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_POST_DA76894.json`：4 页面 × 390/1440，共 `8/8 PASS`，移动编辑卡片、分页底部/浮动助手避让和页面布局均通过，拦截业务写入 `0`。
- 表格/表单专项 `docs/UAT_TABLE_A11Y_POST_DA76894.json`：`14/14 PASS`，只读 Odoo RPC 被单独拦截，`unexpectedWrites=0`。
- 根 `app` 全站矩阵 `docs/UAT_ALL_STATIC_PAGES_POST_DA76894.json`：`134 × 2 = 268/268 PASS`，HTTP 全部 200，无页面错误或横向溢出。
- 当前线上专项已覆盖本轮修改；Dokploy 容器 SHA、完整构建日志和健康状态仍未从控制台独立回读，整体发布继续 **NO-GO**。

## 2026-10-20 发票扫描预览移动安全区批次（当前工作区）

- `pos-ui/src/components/admin/ScanInvoicePage.tsx` 的上传区域补齐 `aria-labelledby`/`aria-busy`，OCR 进行中状态补齐 `aria-live`，底部 Odoo 导航 footer 预留 `safe-area-inset-bottom`，避免手机手势条遮挡操作。
- 页面继续明确 preview-only：不新增保存采购单、供应商或收货的行为；真实 OCR 结果仍需在 Odoo Purchases/Replenishment 中人工继续。
- 本地验证：`npm run typecheck`、目标 ESLint 通过；mock 浏览器回归 `PASS`，证据 `docs/UAT_INVOICE_SCAN_MOCK_2026-10-20_SAFEAREA.json`。mock 拦截扫描接口，不调用模型，不产生业务写入。
- 已有真实 provider 只读证据 `docs/UAT_INVOICE_OCR_PREVIEW_ONLINE_39E0DC8.json` 仍显示供应商、发票号、日期、行项目和总额提取通过；真实收货写入仍未验收。
- 本批次需与后续修改集中部署后，在 390/1440 重新验证上传、错误、预览和底部操作；Demo 禁止业务写入。

## 2026-10-20 `dfc76d0` 部署后全站回归

- Dokploy webhook 对集中提交 `dfc76d0` 返回 `HTTP 200 Compose deployed successfully`；公网页面已呈现 stocktake ARIA 与发票 safe-area 代码。
- 根 `pos-ui/app` 全站只读矩阵：`134` 路由 × `390/1440` = `268/268 PASS`，HTTP 全部 200，无页面错误或横向溢出。证据：`docs/UAT_ALL_STATIC_PAGES_POST_DFC76D0.json`。
- Stocktake：`docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-20_POST-DFC76D0.json`，管理员/Odoo 会话、库位、combobox/listbox 语义和 390/1440 均 PASS，非 GET stocktake 请求 `0`。
- 发票预览 mock：`docs/UAT_INVOICE_SCAN_MOCK_2026-10-20_POST-DFC76D0.json`，预览无收货保存按钮、行项目可编辑、导航链接存在，未产生供应商/采购/收货写入。
- 表格/表单可访问性：`docs/UAT_TABLE_A11Y_POST_DFC76D0.json` 为 `14/14 PASS`；4 个被拦截的 `/api/odoo/records` 是只读 RPC，`unexpectedWrites=0`。
- AI capability：`docs/UAT_AI_AVAILABILITY_POST_DFC76D0.json` 为 `3/3 PASS`；AI composer 可用但本轮未提交提示词。
- Dokploy frontend/backend 容器 SHA、完整构建日志、健康状态和部署完成时间仍未从控制台独立回读；整体发布继续 **NO-GO**，真实 AI 质量、硬件和隔离写入验收仍未完成。

## 2026-10-20 Odoo Stocktake 搜索可访问性批次（当前工作区）

- `pos-ui/app/stock/stocktake/page.tsx` 的真实生产入口已补齐搜索 `combobox`、`aria-controls`、`aria-expanded`、`aria-busy`，产品结果使用 `listbox/option` 语义，空结果和搜索状态可被读屏器识别。
- 桌面表格和手机卡片的数量输入都补齐稳定的可访问名称；未改变搜索、扫码、数量校验、Review and apply 或 Odoo 写入逻辑。
- 本地验证通过：`npm run typecheck`、目标 ESLint、stocktake UAT 脚本 `node --check`、`git diff --check`；按约束未运行本地 build。
- 公网只读基线：`docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-20_BASELINE.json`，管理员/Odoo 会话/库位读取和 390/1440 页面均 PASS，横向溢出 `0`，非 GET stocktake 请求 `0`。该证据的 `deployment` 仍为 `unverified-after-deploy`，不证明新 ARIA 代码已上线。
- 已集中提交并推送 `ca5991a`，Dokploy webhook 返回 `HTTP 200 Compose deployed successfully`。增强版公网回归第一次因固定等待 700ms 过短而误报结果节点未出现，随后改为等待 `aria-busy` 结束并重跑通过。
- Post-deploy 证据：`docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-20_POST-CA5991A_RETRY.json`；管理员/Odoo 会话/库位读取、390/1440 页面、搜索 `combobox/listbox` 语义均 PASS，横向溢出 `0`，非 GET stocktake 请求 `0`。Dokploy 容器 SHA 和完整构建日志仍未从控制台独立回读，不能据此解除整体 NO-GO。
- 生产 Demo 继续禁止库存写入；隔离 Odoo stocktake 写入验收仍待获批环境完成。

## 2026-10-20 Dokploy #38 编译结果（最新）

- #38 后端构建失败的阻断错误是两个控制器找不到 `AiProviderConfig`；`SqlAst.java` 的 `Parenthesis` 仅为弃用 warning，不是失败原因。
- 当前本地 `main` 与 GitHub `origin/main` 均为 `50ac59ece899da00114c404b7eb599490ccbd9fb`（短 SHA：`50ac59e`）。`ea8f1b6` 已为 `AiConfigController` 和 `SommelierController` 补齐 `import com.orithos.modules.ai.AiProviderConfig;`，`AiProviderConfig.java` 也已被 Git 跟踪；源码检查确认当前提交可解析这两个引用。
- 因此 #38 使用的是修复前源码快照，或 Dokploy Compose 绑定了错误分支/提交；不需要再次修改 Java 控制器。未运行本地 Maven build，遵循当前项目约束。
- Dokploy 下一步必须在控制台将 Compose 分支确认设为 `main`，手动部署 `50ac59e`（或更晚提交），并回读 backend/frontend 完整构建日志、运行容器 SHA、健康状态和部署完成时间。仅 webhook 响应或公网 200 不能证明构建成功。
- 在上述证据补齐前，整体发布状态保持 **NO-GO**。

## 2026-10-20 根路由测试与移动安全区批次（当前工作区）

- 批次已提交并推送为 `ca0041b`。
- 发现全站矩阵脚本扫描 `pos-ui/src/app`，而 Next.js 实际使用根 `pos-ui/app`；两套路由有 96 个文件差异。已将 `scripts/pilot-all-static-pages-uat.mjs` 改为扫描根 `app`，避免把旧副本当成线上验证对象。
- 根 `app` 线上只读矩阵：`134` 路由 × `390/1440` = `268/268 PASS`，HTTP、页面错误、横向溢出均为 `0`。证据：`docs/UAT_ALL_STATIC_PAGES_ROOT_APP_ONLINE_2026-10-20.json`，运行时身份仍未从 Dokploy 控制台核验。
- 共享 `AdminPageLayout` 增加手机底部安全区，`AdminActionFooter` 增加表单底栏安全区；订单、采购、客户、库存等共享表单页面会继承该修复。Media Centre 搜索框补齐可访问名称，文件夹导航补齐 `nav` 标签。
- POS 收银台支付/Finalize 区域同步加入手机安全区；现有线上 POS 对话框回归 `2/2 PASS`（390/1440，帮助弹层、Escape、Sales Keys/Parked 键盘切换），证据 `docs/UAT_POS_DIALOG_2026-10-17.json`，变更后的镜像尚未部署。
- 已通过 `npm run typecheck`、`npx eslint src/components/admin/AdminPageLayout.tsx app/media/page.tsx`、`node --check scripts/pilot-all-static-pages-uat.mjs` 和目标 `git diff --check`；未运行本地 build。线上变更后的专门 UI 验证待 Dokploy 分支配置修复后重跑。
- 推送后手动 webhook 返回 `HTTP 301 {"message":"Branch Not Match"}`，没有新的 Dokploy 构建；控制台修正 Compose 分支后手动部署 `ca0041b`，再回读 frontend/backend SHA、构建日志、健康状态并重跑受影响页面。

## 2026-10-20 Dokploy #38 复核（历史记录）

- 当时记录的 `d3aa74b` 已被后续提交推进；两个控制器的 `AiProviderConfig` 显式 import 已在 `ea8f1b6` 加入，类文件已被 Git 跟踪；#38 的编译错误属于旧源码快照，不需要再次改 Java 代码。
- `AiProviderConfigTest` 覆盖 provider host 校验边界；本轮 `git diff --check` 通过。按项目约束没有运行本地 Maven/Next build。
- 提供的 Dokploy compose webhook 返回 `HTTP 301 {"message":"Branch Not Match"}`，包括发送 `main`、`refs/heads/main` 和完整 push payload 变体；本次没有启动构建。后续以文档顶部最新记录为准，从 Dokploy 控制台确认 Compose 分支/Watch 配置为 `main`，或手动 Deploy 当前提交。
- `Parenthesis` deprecation 是非阻断 warning。Dokploy 实际 frontend/backend SHA、完整构建日志、健康状态和完成时间仍未独立回读；整体状态继续 **NO-GO**。

## 2026-10-20 根路由树与只读回归校正（`0477edc`）

- Next.js 实际路由入口以 `pos-ui/app` 为准：根目录存在 `app`，`next.config` 使用标准 Next App Router，`tsconfig` 同时包含 `src` 只是类型检查范围。此前把 `src/app` 称为线上实际路由树的记录已校正；后续生产页面修改应优先落在 `pos-ui/app`。
- 当前根 `app` 的 Promotions、Favourite Reports、Media Centre、Registers & Outlets、Security、Barcodes、Customer Utilities、Product Utilities、Transfer List 已有真实读取或明确未接入状态；上一轮公网专项结果仍有效，但不应归因于仅修改 `src/app` 的死代码。
- `0477edc` 只读回归汇总：表格/表单 `14/14`、管理列表 `8/8`、AI availability `3/3`、AI surface `11/11`、AI UI `2/2`；业务写入 `0`。证据：`docs/UAT_READONLY_REGRESSION_2026-10-20_0477EDC.json`。
- 当前公网证据的 `deploymentShaVerified=false`，Dokploy 容器 SHA、完整构建日志和健康状态仍需控制台独立核验；整体继续 **NO-GO**。

## 2026-10-20 第三批占位数据清理（`e506619`）

- Barcodes、Customer Utilities、Product Utilities、Transfer List 的 `src/app` 入口移除硬编码示例、静态筛选器和无行为批量操作，改为明确未接入状态，并链接到真实 Odoo 目录、调拨流程或集成状态。
- 本地登录态全站矩阵：`134 路由 × 390/1440 = 268/268 PASS`，无 HTTP 失败、页面错误或横向溢出。证据：`docs/UAT_ALL_STATIC_PAGES_LOCAL_2026-10-20_THIRD-BATCH.json`，`sourceCommit=e506619`。
- typecheck、目标 ESLint、diff check 和专项脚本语法通过；本地未运行 build。待本批次部署后补充公网专项。
- `9028419` 批次公网回归完成：全站矩阵 `268/268 PASS`；九页内容/控件专项 `18/18 PASS`（前两批 5 页 + 本批 4 页，均覆盖 390/1440）。证据：`docs/UAT_ALL_STATIC_PAGES_ONLINE_2026-10-20_THIRD-BATCH.json`、`docs/UAT_ACTIVE_ROUTE_HONESTY_ONLINE_2026-10-20_9028419_FINAL.json`。
- 业务写请求为 `0`；Registers 的 Odoo records POST 属于只读 RPC，已从写入断言中单独分类。两种视口均无页面错误或横向溢出；公网证据仍为 `deploymentShaVerified=false`。

## 2026-10-20 第二批假数据清理（`0a06dec`）

- `src/app/settings/registers-outlets` 移除硬编码门店/收银台和无行为新增按钮，改为读取当前 Odoo session 的 companies/registers，只读展示、加载/错误/Retry 状态和移动卡片。
- `src/app/security` 移除固定日期、固定事件数量、静态饼图和伪筛选器，改为明确的安全事件未接入状态，并提供用户、角色和集成设置入口。
- 本地登录态全站矩阵：`134 路由 × 390/1440 = 268/268 PASS`，无 HTTP 失败、页面错误或横向溢出。证据：`docs/UAT_ALL_STATIC_PAGES_LOCAL_2026-10-20_SECOND-BATCH.json`，`sourceCommit=0a06dec`。
- typecheck、目标 ESLint、diff check 通过；本地未运行 build。待与前一批一起部署后补充公网专项，整体仍为 **NO-GO**。
- `922ff93` 批次触发后公网全站矩阵 `268/268 PASS`；五页内容/控件专项 `10/10 PASS`（Promotions、Favourite Reports、Media Centre、Registers & Outlets、Security × 390/1440）。Registers 的两个 Odoo records POST 被识别为只读 RPC，业务写请求为 `0`。证据：`docs/UAT_ALL_STATIC_PAGES_ONLINE_2026-10-20_SECOND-BATCH.json`、`docs/UAT_ACTIVE_ROUTE_HONESTY_ONLINE_2026-10-20_922FF93_RETRY.json`。
- 专项记录 `deploymentShaVerified=false`；公网行为通过不等于 Dokploy 容器 SHA、构建日志和健康状态已核验，发布继续 **NO-GO**。

## 2026-10-20 实际路由只读页面对齐（`dc77293`）

- 对齐 `src/app` 实际生效入口：Promotions 移除不会工作的创建/筛选占位控件，保留真实 API 读取、搜索、分页、刷新和移动列表；Favourite Reports 明确当前 pilot 未接入收藏/邮件调度，并提供真实 Reports Dashboard 入口；Media Centre 明确媒体存储未接入，上传、建文件夹、搜索和文件操作全部禁用，三栏布局在移动端改为纵向。
- 本地登录态浏览器矩阵覆盖 `134 路由 × 390/1440 = 268/268 PASS`，HTTP 全部 200，无页面错误或横向溢出。证据：`docs/UAT_ALL_STATIC_PAGES_LOCAL_2026-10-20_PROMOTIONS-MEDIA.json`，`sourceCommit=dc77293`。
- `npm run typecheck`、三页目标 ESLint 和 `git diff --check` 通过；本地未运行 build。
- 待把 `dc77293` 推送并触发 Dokploy 后，重新执行公网只读回归；不能用本地矩阵替代线上镜像身份或构建日志。
- `523e654`（包含本批次代码和证据文档）已推送，webhook 返回 HTTP 200；等待部署窗口后公网全站矩阵仍为 `268/268 PASS`，三页内容/控件专项为 `6/6 PASS`。证据：`docs/UAT_ALL_STATIC_PAGES_ONLINE_2026-10-20_DC77293.json`、`docs/UAT_ACTIVE_ROUTE_HONESTY_ONLINE_2026-10-20_523E654_RETRY.json`。
- 专项确认 Promotions 没有误导性 Add/More Filters，Favourite Reports 没有静态筛选占位，Media Centre 的两个写入控件处于 disabled；两种视口均无页面错误、横向溢出或非 GET 业务请求。证据的 `deploymentShaVerified=false`，仍不能替代 Dokploy 容器 SHA。

## 2026-10-20 Dokploy #38 后端构建诊断

- Dokploy #38 在 `AiConfigController.java:78` 和 `SommelierController.java:65` 报 `cannot find symbol: variable AiProviderConfig`；`SqlAst.java` 的 `Parenthesis` 仅为弃用警告，不是失败原因。
- 当前 `main`/`origin/main` 为 `2434f27`，其中已包含 `ea8f1b6` 的修复：两个控制器均显式导入 `com.orithos.modules.ai.AiProviderConfig`，类文件位于 `pos-api/src/main/java/com/orithos/modules/ai/AiProviderConfig.java`。源码检查确认当前提交不会产生这两个未解析符号。
- 因此 #38 对应的是修复前源码快照，或 Dokploy 服务绑定的分支/提交不是当前 `main`；不能把该失败归因于 `2434f27`。本地按既定约束未运行 Maven/Next build。
- 下一步必须在 Dokploy 控制台核对 Compose 服务绑定分支为 `main`，手动部署 `2434f27`，并回读 backend/frontend 构建日志、容器 SHA、健康状态和完成时间。仅 webhook 返回值或公网页面行为不能替代构建身份证据。
- 当前发布结论仍为 **NO-GO**；在控制台确认前不要把 `2434f27` 标记为已部署。
- 交接文档提交 `7f6ecc0` 已推送到 `main`；使用完整 push payload 触发 webhook 后返回 `HTTP 200 Compose deployed successfully`。该返回只证明 Dokploy 接受了触发，仍未证明构建通过或运行镜像已切换。

## 2026-10-20 `b058ef3` AI capability 与表单回归

- 线上 AI 回归：voice capability gate `PASS`（不可用时按钮 disabled 且显示明确原因）、AI Features `14/14`、AI Metrics `9/9`、AI UI `2/2`、表格/表单 DOM `14/14`，业务/配置写入 `0`。
- 供应链搜索清空断言通过；最新审计证据为 `docs/UAT_TABLE_A11Y_ONLINE_FDD9C3_FINAL.json`，并行批次汇总见 `docs/UAT_AI_REGRESSION_ONLINE_BEC6D0B.json`。
- Dokploy webhook 返回 `Compose deployed successfully`，但 `deploymentShaVerified=false`；控制台实际 frontend/backend SHA、构建日志和健康状态仍需独立回读，整体保持 **NO-GO**。

## 2026-10-20 Supply Chain 搜索状态复核（`fdd9c3a`）

- Supply Chain 搜索结果改为派生显示，清空查询时不会保留旧建议；Supply Chain effect lint 告警已清零。
- 线上 DOM/表单审计再次通过 `14/14 PASS`，包含 Rules & prices 面板控件名称和清空查询后的建议列表断言；页面错误 `0`，意外业务写入 `0`。
- 证据：`docs/UAT_TABLE_A11Y_ONLINE_FDD9C3_FINAL.json`。`fdd9c3a` 已通过 Dokploy webhook 接受并完成只读验证。

## 2026-10-20 表格与 Supply Chain 表单 DOM 复核（`6ec5dc3`）

- 线上 DOM 审计覆盖设置用户、角色管理、AI Metrics、Odoo 产品、Stocktake、供应链和发票扫描 7 个页面 × 390/1440，共 `14/14 PASS`；所有已渲染表格都有可访问名称，列头 `scope="col"` 正确，页面错误 `0`。
- 审计发现 `/settings/users` 实际命中旧 `pos-ui/app/settings/users` 入口，已补上 `aria-label="Store users"`；`src/app` 入口也保留同等语义。
- 审计拦截到的 4 个非 GET 请求全部为 Odoo 只读 `POST /api/odoo/records`，没有业务写入；发票扫描一次性 `404` 通过重试恢复为 `200`。证据：`docs/UAT_TABLE_A11Y_ONLINE_A533496_FINAL.json`。
- Supply Chain 的 Rules & prices 面板已检查可见输入控件，`unnamedControls=0`；Remove 操作也带有具体对象名称的可访问标签。最新证据：`docs/UAT_TABLE_A11Y_ONLINE_6EC5DC3.json`。
- `npm run typecheck`、旧 users 入口 ESLint、脚本 `node --check` 和 `git diff --check` 通过；未运行 build。

## 2026-10-19 最新 Dokploy 触发结果（`39bd36c`）

- 交接补充 `docs/HANDOFF_2026-10-19_AI_REGRESSION_0F9FAAB.md` 记录过一次 `301 Branch Not Match`；随后使用完整 GitHub push payload、`ref=refs/heads/main`、当前 HEAD `39bd36c` 重试，webhook 返回 `HTTP 200 Compose deployed successfully`。
- 该 `200` 仅表示 Dokploy 接受请求，不能替代控制台构建完成、运行容器 SHA、健康状态和部署完成时间证据；AI 回归仍按 `PASS_WITH_DEPLOYMENT_BLOCKED` 历史证据阅读，直到控制台独立核验。

## 2026-10-19 `0f9faab` 部署后 AI 回归

- `0f9faab`（包含 `2bc8046` 视觉能力位文案修复）已通过 Dokploy webhook 接受，返回 `HTTP 200 Compose deployed successfully`。
- 线上受影响 AI 只读回归全部通过：availability `3/3`、surface `11/11`、UI `2/2`、AI Features `14/14`；空音频/空图片边界、匿名 `401`、启用态 assistant 和 AI 配置读取均通过。
- Invoice OCR 探针为 `INFO`（provider 可达、探针图片没有发票字段，业务码 `50212`），不代表真实供应商发票字段提取或采购/收货/库存写入已放行。
- 证据：`docs/UAT_AI_AVAILABILITY_2026-10-19_AUTHFIX.json`、`docs/UAT_AI_SURFACE_2026-10-19_AUTHFIX.json`、`docs/UAT_AI_UI_2026-10-19_AUTHFIX.json`、`docs/UAT_AI_FEATURES_VERIFY_2026-10-19.json`。上述 AI 文件的 `sourceCommit` 为 `0f9faab`。
- Dokploy 控制台 frontend/backend 实际 SHA、完整构建日志、健康状态和完成时间仍需独立回读；整体仍为 **NO-GO**。

## 2026-10-19 表格可访问性批次（`b2e0b1a`）

- 为设置用户、Sell AI 动态结果、AI 报表结果、产品价格阶梯、发票 OCR 明细和供应链建议表补齐 `aria-label` 与列头 `scope="col"`；没有改变接口、数据写入或业务流程。
- 本地 `npm run typecheck` 通过；6 个受影响文件 ESLint 为 `0 error / 3 warning`（warning 为既有未转义撇号和 SupplyChain effect 规则提示）；3 个 UAT 脚本 `node --check` 通过；全站源代码表头扫描 `TABLE_HEADER_SCOPE_SCAN PASS`；未运行 build。
- `b2e0b1a` 已推送并通过 Dokploy webhook 接受：`HTTP 200 Compose deployed successfully`。
- 线上验证：全站静态矩阵 `134 路由 × 390/1440 = 268/268 PASS`，AI Metrics `9/9 PASS`，Odoo 自动恢复 `6/6 PASS`，Pricing `8/8 PASS`。证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-19_POST-B2E0B1A_FINAL.json`、`docs/UAT_AI_METRICS_ONLINE_B2E0B1A.json`、`docs/UAT_ODOO_AUTORECOVER_2026-10-19_POST-B2E0B1A.json`、`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19_POST-B2E0B1A.json`。
- 矩阵重跑期间两个设置页曾各出现一次 `502/504`，随后独立请求均连续 3 次返回 `200`，判定为部署窗口瞬态；没有新增产品缺陷证据。
- Dokploy 控制台 frontend/backend 实际 SHA、完整构建日志、健康状态和部署完成时间仍未独立回读；整体继续保持 **NO-GO**，且本轮未运行本地 build。
- 随后 `f5413e0`、`2cc4e38`、`2bc8046` 已推送到 `main`，补充 AI path 延迟指标和视觉能力位文案；上面四组 B2E0B1A 证据仍只证明 `b2e0b1a` 部署批次，需在 `2bc8046` 部署后重跑受影响 AI 验证。

## 2026-10-19 Dokploy #38 旧构建失败复核与重部署

- Dokploy #38 的阻塞错误是两个控制器找不到 `AiProviderConfig`；`Parenthesis` 弃用信息只是 warning。当前源码已在 `ea8f1b6` 为 `AiConfigController` 和 `SommelierController` 加入显式 import，`AiProviderConfig.java` 也存在，因此不需要重复改代码。
- 当前 `main` 与 `origin/main` 为 `2bc8046c83b68d96a59462349d03b8c024870028`，包含该修复。#38 应按旧源码快照处理，不能作为当前 `main` 的编译结论。
- 已用完整 GitHub push payload（`X-GitHub-Event: push`、`ref=refs/heads/main`）重新调用 Dokploy webhook，返回 `HTTP 200 Compose deployed successfully`。这只证明部署请求被接受，尚未证明构建成功、容器已切换或健康检查通过。
- 仍需从 Dokploy 控制台回读本次部署的 frontend/backend SHA、Maven 完整日志、容器健康状态和完成时间；在这些证据补齐前，整体保持 **NO-GO**。本地未运行 Maven/build。

## 2026-10-19 AI Metrics 可访问性迭代

- `74e9412` 为 AI Metrics 页面增加表格 caption、6 个列头 `scope="col"` 和刷新期间的 `aria-busy` 状态；这些语义不改变业务数据或 AI 请求行为。
- UAT 脚本增加 390/1440 可访问性断言。Dokploy 接受 `74e9412` 后，线上 AI Metrics `9/9 PASS`：管理员指标读取、assistant intent 统计、匿名 `401`、两种视口 UI、caption、列头 scope 和 busy 状态均通过；非 GET 业务/配置写入 `0`。
- 证据：`docs/UAT_AI_METRICS_ONLINE_74E9412.json`。该文件的 deployment 字段为目标提交短 SHA，Dokploy 控制台完整构建日志、容器 SHA 和健康状态仍待独立回读。

## 2026-10-19 最新专项回归汇总

- 主店只读专项全部通过：Sommelier `10/10`、Legacy Retry `5/5`、Closure Recovery、Overview Race、Reporting Race、Role Permission Retry、Purchase Mobile Mock、Invoice Scan Mock 均 PASS；没有产生业务写入。
- AI 线上专项通过：AI Features `14 PASS / 0 FAIL / 0 BLOCKED`、AI availability `3/3`、AI surface `11/11`、AI UI `2/2`、AI Metrics `7/7`。AI metrics 包含 assistant intent 覆盖、管理员鉴权、匿名 `401` 和 390/1440 UI。
- 真实发票 OCR preview `PASS`：识别 `Harbour Wine Co`、发票号 `HW-2026-1042`、日期 `2026-10-19`、2 行明细、总额 `382.8`；preview-only 边界的非 GET 业务写入为 `0`。证据：`docs/UAT_INVOICE_OCR_PREVIEW_ONLINE_1EAB632.json`。
- 这些结果补齐了此前“真实 OCR 尚未验收”的旧记录，但仍不等于供应商、采购单、收货和库存流程已完成验收；OCR 页面仍是预览模式。
- 当前线上待补证据集中在 Dokploy frontend/backend 容器 SHA、完整构建日志、健康状态，以及隔离 Odoo 的 stocktake/采购写入回归。整体仍保持 **NO-GO**。

## 2026-10-19 路由树修复与最新验证

- 发现 Next 同时存在 `pos-ui/app` 与 `pos-ui/src/app`，实际使用的是 `src/app`；Odoo 产品目录、采购、供应商、客户、补货、Odoo 收银台、Overview、AI 指标等 17 个入口此前只在旧目录，导致自动恢复脚本访问 `/products/odoo` 时出现空页面。已将入口补齐到 `src/app`，并保留现有组件和动态数据策略。
- 静态 UAT 脚本现在扫描实际生效的 `src/app`，并支持 `PILOT_UAT_FILENAME=docs/...`，不会再生成错误的 `docs/docs/...` 路径。
- 最新主店只读静态矩阵已完成：`139` 路由 × `390/1440`，全部 `278/278 PASS`，无 HTTP 失败、横向溢出或页面错误。证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-19_PRE-ROUTE-MIGRATION.json`。该证据是当前线上基线，尚不代表新路由补丁已部署。
- 线上 pricing 回归 `8/8 PASS`（Stock List、Capped Pricing、Bulk Price Edit、Price Suggestions × 390/1440），证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19_POST-B784457.json`。
- Odoo 自动恢复专项仍为 `4 PASS / 1 FAIL`：登录、service-account 配置、清 cookie、补货页自动恢复通过；产品目录初始加载失败，需要在新路由部署后重跑。当前失败不能标记为产品数据故障，需结合新页面和网络响应重新确认。
- 路由修复提交 `6aa867c` 已推送并由 Dokploy 接受部署；pricing 线上回归仍为 `8/8 PASS`。自动恢复脚本随后修正了两个判定问题：忽略空的全局 `role=alert`，并等待产品目录客户端 hydration 完成后再判断 SSR 的 `No records`。修正后线上自动恢复专项 `6/6 PASS`，证据：`docs/UAT_ODOO_AUTORECOVER_2026-10-19_POST-6AA867C_FINAL.json`。
- 自动恢复最终证据覆盖：管理员登录、service-account 配置、清除 Odoo cookie、补货页无手动 Connect 恢复、产品目录页面内读请求自动恢复、Odoo 用户及 `orithos_store1/00004` POS session 恢复。所有请求仍为只读或会话清理，不包含销售、库存、采购、退款或关班写入。
- 最新 `70cd722` 部署请求也已被 Dokploy 接受；部署等待后的自动恢复回归仍为 `6/6 PASS`，证据：`docs/UAT_ODOO_AUTORECOVER_2026-10-19_POST-70CD722.json`。Dokploy 控制台容器 SHA、完整构建日志和健康状态仍需独立回读。
- 前端 `npm run typecheck`、脚本 `node --check`、`git diff --check` 通过；按约束未运行本地 build。后端 `AiProviderConfig` import 已存在于当前 `main`（`ea8f1b6`），本次 Dokploy #38 错误对应旧源码快照。

## 2026-10-19 当前批次：价格编辑与移动端表格

- 已推送 `05928f9` 并触发 Dokploy。Stock List/Capped Pricing 数量列加宽、对齐表头和数据行、手机内部横向滚动；Stock List 商品计数按 `Product/Products` 正确单复数显示。AI assistant 新增回复数、成功率和平均延迟的会话摘要。
- 本地响应式 fixture UAT `4/4 PASS`：Stock List/Capped Pricing × 390/1440；四项均检查真实 DEMO Shiraz 行可见、数据行与表头列边界误差不超过 1px、列不重叠、表头文字留在本列内、页面不横向溢出；Stock List 同时检查 `1 Product` 文案；移动端内部可横向滚动；页面错误 `0`、业务写入 `0`。检查曾发现最多 13px 的逐列漂移，已通过移除表头容器额外水平内边距修正。证据：`UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-19.json` 和 `docs/screenshots/2026-10-19-stock-tables-local/`。
- 线上 pricing 只读基线在加载完成后为 `4/8 PASS`：Stock List/Capped Pricing × 390/1440 四项均因表头文字溢出或列边界与数据行错位未通过；浏览器非 GET 请求拦截 `0`，JS 错误 `0`。Capped Pricing 390px 实际列表行和叠字表头截图已保存。运行部署 SHA 未核验。证据：`UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19_BASELINE_FINAL.json`、`docs/screenshots/2026-10-19-pricing-reliability-online/`。
- 推送后的公网 pricing 矩阵 `8/8 PASS`：Stock List/Capped Pricing × 390/1440；表头与首行列边界对齐、移动端表格内部滚动、无页面溢出；浏览器非 GET 请求拦截 `0`，JS 错误 `0`。证据：`UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19_POST-05928F9_FINAL.json`、`docs/screenshots/2026-10-19-pricing-post-05928f9-final/`。
- 同轮复验：价格行保存失败/重试 `8/8 PASS`（所有 PATCH fixture 拦截）；Price Suggestions 搜索、筛选、CSV、Bulk 深链 `16/16 PASS`（API 写入 `0`）；AI capability gate `2/2 PASS`（390/1440，语音转写请求 `0`）。证据：`UAT_STOCK_PRICING_SAVE_GUARD_LOCAL_2026-10-19.json`、`UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19.json`、`UAT_AI_CAPABILITY_GATES_LOCAL_2026-10-19.json`。
- AI assistant 新增本地会话摘要（累计回复数、成功率、平均延迟）；`4/4 PASS` 覆盖单次与两次成功响应、逐条诊断和零业务写入。证据：`UAT_AI_DIAGNOSTICS_LOCAL_2026-10-19.json`。
- 公网页面 AI 会话摘要 fixture `4/4 PASS`；助手响应由浏览器截获，未调用生产模型。证据：`UAT_AI_DIAGNOSTICS_ONLINE_FIXTURE_2026-10-19_POST-05928F9.json`。
- Bulk Price Edit 同步采用稳定最小宽度和表头/数据行共同列基准，并修正单商品计数文案；本地响应式矩阵扩展为三页 × 390/1440，`6/6 PASS`。证据：`UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-19.json` 与 `docs/screenshots/2026-10-19-stock-tables-local/`。
- Bulk Price Edit 搜索、分类和新增数量控件补充可访问名称；本地 `6/6` 响应式矩阵同时验证三项控件在 390/1440 可定位。目标 ESLint、TypeScript、脚本语法和 diff 检查通过。
- `e564c4d` 推送后公网 pricing 矩阵 `8/8 PASS`：Stock List、Capped Pricing、Bulk Price Edit、Price Suggestions × 390/1440；三张宽表均加载完成，表头与数据行检查通过，手机表格滚动通过，页面错误与被拦截写请求均为 `0`。证据：`UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19_POST-E564C4D_FINAL.json`、`docs/screenshots/2026-10-19-pricing-post-e564c4d-final/`。
- 前端 `npm run typecheck`、Stock List/Capped Pricing 目标 ESLint、UAT 脚本 `node --check`、`git diff --check` 均通过；未运行本地 build。
- 公网行为验证通过；Dokploy 控制台的实际 frontend/backend SHA、构建日志和健康状态仍未独立核验。`AiProviderConfig` 缺符号错误对应的 import 修复已在 `ea8f1b6`，包含于 `origin/main`，无需重复改代码。
- Stock List 与 Capped Pricing 现在防止同一行重复 blur 提交；提交中锁定该行输入。失败时显示单元格/行错误，保留用户输入供修正或重试。
- Bulk Price Edit 已有相同保存失败保护：失败显示错误并回滚到已保存价格；busy 状态清除后可继续编辑。
- 本地 fixture 结果：Stock List + Capped Pricing 保存失败恢复 `8/8 PASS`；Bulk Price Edit `7/7 PASS`；Price Suggestions 深链 `16/16 PASS`；AI capability gate `2/2 PASS`（390/1440）。业务 PATCH 由 fixture 拦截，Price Suggestions API 写入 `0`，语音转写请求 `0`。本次复验记录见顶部当前批次及对应 `UAT_*_LOCAL_2026-10-19.json`。
- 线上 390px 旧版截图曾发现 Stock List/Capped Pricing 列表难以浏览；`05928f9` 推送后公网 390/1440 只读矩阵 `8/8 PASS`，容器 SHA/构建日志/健康状态尚未从 Dokploy 控制台核验；旧版线上诊断见 `UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19_BASELINE_FINAL.json`。
- 最新本地 `typecheck`、目标 ESLint、响应式 UAT 脚本语法与 `git diff --check` 通过；按约束未运行本地 build。
- 当前 `main` 与 `origin/main` 已推进至 `05928f9`；本轮线上 UAT 通过。Dokploy 容器身份与构建/健康信息待控制台核验。
- 当前 `main` 与 `origin/main` 已推进至 `e564c4d`；本轮线上 UAT 通过。Dokploy 容器身份与构建/健康信息待控制台核验。
- 本轮可访问性改动尚未部署；将与文档和 UAT 证据一起形成下一次集中部署。

## 2026-10-19 Smart Pricing 到 Bulk Price Edit 闭环

- 价格建议每行新增 `Bulk edit this product`，携带 SKU 进入 `/stock/bulk-price-edit?search=...`；Bulk Price Edit 使用 `useSearchParams` 预填搜索并请求相同 SKU。
- Bulk Price Edit 路由增加 Suspense 边界，避免 `useSearchParams` 在静态渲染阶段缺少 boundary。
- 本地 fixture UAT `16/16 PASS`：搜索、状态筛选、CSV、SKU 深链、Bulk 页面预填、SKU query 和非 GET 写请求 `0` 均通过。证据：`docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19_DEEP-LINK.json`。
- 本地 `npm run typecheck`、Bulk/Price 目标 ESLint、`node --check scripts/pilot-price-suggestions-local-uat.mjs`、`git diff --check` 均通过；未运行 build。
- `228fa6f` 已触发 Dokploy；线上价格建议/Bulk 只读回归通过，后续 `7a87dd7` 又补上了 Bulk 保存失败保护并完成线上 fixture 复验。

## 2026-10-19 当前公网汇总

- 全站静态矩阵：`133` 路由 × `390/1440` 视口，`266/266 PASS`，无 HTTP 路由失败；独立证据 `docs/UAT_ALL_STATIC_PAGES_2026-10-19_POST-4487A12.json`。
- AI availability `3/3 PASS`、surface `11/11 PASS`、UI `2/2 PASS`，AI 全功能只读矩阵 `14 PASS / 0 FAIL / 1 INFO`。AI 当前线上为 `enabled=true`，真实 NLQ、Sommelier、ASR/视觉边界和匿名鉴权均已回归；Invoice OCR 探针没有发票字段，真实发票照片字段提取仍未验收。
- 价格建议搜索/状态筛选/CSV 和只读保护已在公网出现并通过，价格、销售、库存、采购和现金写入均为 `0`。
- `10facb6` 视觉路由修复已有线上矩阵通过记录；`41507d9`、`4487a12` 已补充证据。Dokploy 容器 SHA、构建日志和健康状态仍未从控制台独立回读。

## 2026-10-19 AI 迭代：价格建议到 Bulk Price Edit

- 价格建议每个商品现在提供 `Bulk edit this product` 深链，携带当前 SKU（无 SKU 时使用商品名）。
- Bulk Price Edit 页面读取 `search` 查询参数并预填搜索框；路由使用 `Suspense` 包裹 `useSearchParams`，避免 Next.js 静态渲染问题。
- 本地 fixture UAT 已通过：价格建议页面、SKU/状态筛选、CSV、深链、Bulk 搜索预填、Bulk API 查询参数和 AI 入口均通过，`0` 个非 GET 请求。
- 证据：`docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19.json`。本地未运行 build；线上部署后仍需重跑价格建议认证 gate 和 Bulk 页面只读回归。

## 2026-10-19 `228fa6f` 部署后 AI 回归

- 价格建议/Bulk 页面线上只读回归通过：搜索、状态筛选、CSV、SKU 深链、Bulk 搜索预填和 API 查询参数均通过，`0` 个写请求。证据：`docs/UAT_PRICE_SUGGESTIONS_ONLINE_2026-10-19_POST-228FA6F.json`。
- AI 全功能只读回归：`14 PASS / 0 FAIL / 1 INFO`。NLQ、Sommelier、ASR/酒标空输入、价格建议 API/页面、补货页和匿名 assistant 鉴权通过；Invoice OCR 仍为 `50212` INFO，仅证明 provider 可达，未完成真实发票字段提取。证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-19_POST-228FA6F.json`。
- AI availability `3/3 PASS`、surface `11/11 PASS`、Sommelier `10/10 PASS`。证据：`docs/UAT_AI_AVAILABILITY_2026-10-19_POST-228FA6F.json`、`docs/UAT_AI_SURFACE_2026-10-19_POST-228FA6F.json`、`docs/UAT_SOMMELIER_READONLY_2026-10-19_POST-228FA6F.json`。
- AI UI 390/1440 两个视口 `2/2 PASS`，推荐卡片和识别结果均返回，页面错误为 `0`。测试脚本已改为定位实际结果列表，避免依赖不存在的 `#main-content` id。证据：`docs/UAT_AI_UI_2026-10-19_POST-228FA6F_RETRY2.json`。
- 本轮所有线上检查均为只读或浏览器拦截请求；没有对 Demo 写入销售、采购、库存、现金、反馈或 AI 配置。

## 2026-10-19 AI capability guard 修复

- Invoice Scan 上传按钮现在遵循 `AI_ENABLED` 和 `invoiceVisionAvailable`：AI 关闭或视觉能力不可用时按钮直接禁用，页面仍保留 Odoo Purchases / Replenishment 下一步。
- 本地 typecheck、Invoice Scan 目标 ESLint、脚本语法和 `git diff --check` 通过；线上 fixture Invoice mock 通过，`0` 个供应商/采购/收货业务写入。证据：`docs/UAT_INVOICE_SCAN_MOCK_2026-10-19_POST-228FA6F.json`。
- 该修复尚未部署后单独验证；下一轮需确认启用态上传正常，并用能力位 fixture/线上配置确认关闭态按钮禁用。
- Bulk Price Edit 保存失败保护也已完成本地验证：失败 PATCH 回滚输入并显示错误，输入不会保持 busy，随后重试可继续，fixture 共 2 次 PATCH 且没有真实业务写入。证据：`docs/UAT_BULK_PRICE_EDIT_SAVE_GUARD_LOCAL_2026-10-19.json`。该改动待与 Invoice guard 一起部署。

## 2026-10-19 AI 响应诊断提示

- 销售助手的每条 AI 回复现在可显示本次 `intent`、响应耗时（毫秒）和成功/失败状态；不显示或持久化原始问题、JWT、API key、供应商错误或 token 内容。
- 本地 fixture 已通过：模拟 NLQ 返回后显示 `AI · report_sales · Nms`，且除被拦截的 AI 请求外没有业务写入。证据：`docs/UAT_AI_DIAGNOSTICS_LOCAL_2026-10-19.json`。
- 这是轻量诊断提示，不是持久化成本看板；token 使用量和跨请求成功率仍需后端指标/权限设计后再实现。

### `7a87dd7` 部署后复验

- Bulk Price Edit 在线上壳中完成失败保存/重试 fixture：首次 PATCH 503 后输入回滚并显示错误，第二次 PATCH 成功，`2` 次 PATCH 均由浏览器 fixture 截获，没有真实价格写入。证据：`docs/UAT_BULK_PRICE_EDIT_SAVE_GUARD_ONLINE_2026-10-19_POST-7A87DD7_RETRY.json`。
- 同一部署后的 AI 全功能只读回归 `14 PASS / 0 FAIL / 1 INFO`，Invoice OCR 仍为无字段探针的 `50212 INFO`。证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-19_POST-7A87DD7.json`。

### `911ad11` 部署后复验

- Invoice Scan mock `PASS`：预览、详情、行编辑、Odoo 下一步链接通过，未产生供应商/采购/收货写入。证据：`docs/UAT_INVOICE_SCAN_MOCK_2026-10-19_POST-911AD11.json`。
- AI 全功能只读回归 `14 PASS / 0 FAIL / 1 INFO`，AI UI `2/2 PASS`（390/1440、无页面错误）。证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-19_POST-911AD11.json`、`docs/UAT_AI_UI_2026-10-19_POST-911AD11.json`。
- 线上验证的是启用态；AI 关闭/视觉不可用的按钮禁用逻辑已由代码实现，但尚无生产切换后的线上截图证据。真实发票字段 OCR 仍未验收。

> **当前有效摘要（2026-10-19）**
>
> 当前 Git 基线为 `05928f9`，已推送且 Dokploy webhook 接受。公网 pricing 只读矩阵 `8/8 PASS`，AI 会话摘要在公网 shell 的 fixture 验证 `4/4 PASS`；页面业务写入为 `0`。Dokploy 控制台的实际容器 SHA、构建日志与健康状态仍待独立核验。未运行本地 build。

## 交接结论

当前整体状态：**NO-GO（可继续只读回归，禁止据此宣称生产全量通过）**。

### 已完成并有线上证据

- 注册、租户自动登录、Odoo 公司绑定、Outlet/Register 配置、dummy data 初始化，以及租户删除后的认证拒绝。
- 基础 POS：开班、商品搜索、数量修改、Cash 收款/找零、Card 模拟收款、GST/现金舍入、收据/订单回读和销售扣库存。
- Cash/Card 全额退款、退款订单、库存恢复、Cash in/out，以及正确现金盘点值关班。
- 隔离公司中的供应商、RFQ、采购确认、部分收货/backorder、最终收货、重复收货保护和库存回读；但必须在当前已核实部署版本重跑一次。
- 多租户读取隔离、登出保护、平台删除租户后的认证拒绝。
- AI 视觉路由修复后线上只读回归：`14 PASS / 0 FAIL / 1 INFO`，证据 `docs/UAT_AI_FEATURES_VERIFY_2026-10-19_POST-10FACB6.json`。NLQ、Sommelier、ASR/空图边界、价格建议只读接口、补货页和匿名鉴权通过。
- AI UI `2/2`、availability `3/3` 通过，证据 `docs/UAT_AI_UI_2026-10-19_POST-10FACB6.json`、`docs/UAT_AI_AVAILABILITY_2026-10-19_POST-10FACB6.json`。
- AI 价格建议保持 `writeEnabled=false`；价格建议筛选/CSV 导出已完成本地 fixture 验证，不产生价格写入。
- Invoice OCR 明确为 preview-only；mock 扫描通过且没有创建供应商、采购单或收货单。

### 已实现但证据不足，不能标记为完成

- Smart Pricing `/stock/price-suggestions`：本地与线上页面、筛选、CSV、写保护和 Bulk Price Edit SKU 预填通过；Dokploy 容器运行身份仍需控制台独立确认。
- Invoice OCR：当前探针仅证明 provider 可达，返回 `50212`；使用的不是包含真实发票字段的图片，尚未证明 supplier、invoice number、日期、行项目和合计字段提取成功。
- 采购/收货：已有历史隔离租户证据，但尚未绑定到用户所称 `7544d03` 或 Dokploy 当前容器后重跑。
- Stocktake：管理员只读页面、权限保护和 location fallback 有证据；真实隔离 Odoo 盘点写入、取消不改库存、重复确认只生效一次、quant reference 和跨租户拒绝尚未验收。生产 `ODOO_STOCKTAKE_WRITE_ENABLED=false`。
- AI 配置管理员保护：代码和控制器单测已加入，但普通员工线上调用写接口的拒绝结果尚未形成可审计证据。

### 尚未完成或产品未实现

- 真实 DashScope 生产能力尚未作为全量生产能力放行；真实语音转写、酒标图像识别和真实发票 OCR 字段提取仍需按真实输入验收。
- 实体刷卡终端、打印机、钱箱未接入验证；当前 Card 只是 Odoo 模拟支付方式。
- 分单/多支付方式收款、离线 POS 尚未实现或未验收，不计入基础 POS 通过门槛。
- SMTP 邀请/密码重置邮件、正式现金差异审批、财务对账和完整采购财务流程未完成。
- 当前版本的完整采购/收货、stocktake 写入和删除租户后的全链路冒烟仍待重跑。
- Dokploy 当前 frontend/backend SHA、构建日志、健康状态和部署时间尚未独立核验。
- 本地未运行 build；本机 Java 8 不满足后端 Java 21 要求，Maven 结果必须以 Java 21 CI/Dokploy 构建为准。

## 当前问题与风险

- 用户给出的 `7544d03` 与仓库当前 `d0c5d8f` 不一致；不能假定线上运行的是哪一个。
- Dokploy webhook 历史上出现过 `301 Branch Not Match`；即使 webhook 返回 `200 Compose deployed successfully`，也不等于容器已切换，必须回读控制台证据。
- 历史 UAT JSON 同时包含旧版本、`unverified-after-deploy` 和已接受部署目标，阅读时必须按时间和 deployment 字段区分。
- 工作区有大量历史 UAT、截图和用户未提交改动。禁止 `git add -A`、reset、clean 或覆盖无关文件；只提交明确纳入交接的文件。
- 不得对生产 Demo 公司做销售、采购、库存、现金或 stocktake 写入；业务写入必须使用一次性隔离租户，结束后删除并验证认证拒绝。

## 接手后的优先顺序

1. 从 Dokploy 控制台回读当前 frontend/backend SHA、构建日志、健康状态和部署时间，核对 `7544d03`。
2. 在一次性隔离租户重跑基础冒烟：`signup -> bootstrap login -> Odoo binding -> outlet/register -> dummy catalog -> open session -> cash/card sale -> refund -> close register -> platform delete`。
3. 在同一隔离租户完成 stocktake 写入和当前版本采购/部分收货/全部收货回归，保存库存前后值、session、订单、收货和权限 JSON 证据。
4. 找到真实可解码供应商发票图片，完成 preview-only OCR 字段提取验收，并确认不创建 supplier、PO、receipt 或库存写入。
5. 在受支持 Java 21/Node 版本执行后端测试和生产构建验证；部署后只重跑受影响用例及完整冒烟。
6. 在上述证据补齐前保持 `AI_ENABLED=false`、`ODOO_STOCKTAKE_WRITE_ENABLED=false`，整体保持 `NO-GO`。

## 2026-10-19 价格建议筛选增强

- `/stock/price-suggestions` 增加商品名/SKU搜索、状态筛选和筛选结果计数；`Export CSV` 导出当前筛选结果，保持纯浏览器生成。
- 本地验证：`npm run typecheck`、`npx eslint src/components/OdooPriceSuggestionsPage.tsx`、`node --check scripts/pilot-price-suggestions-local-uat.mjs`、`git diff --check` 均通过；Playwright fixture `PASS`，搜索命中/空结果、状态筛选、CSV 内容和非 GET 请求 `0` 均有证据。
- 证据：`docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19_SEARCH.json`。本地开发服务端口 `3035`，API 全部 fixture 拦截，没有 Odoo 或业务写入。
- 本次 UI 改动已在公网观察到；由于 Dokploy 容器 SHA 尚未从控制台核验，仍需将行为证据与运行镜像身份对应起来。
- 集中批次已提交并推送：`d9089bb`（价格建议筛选/导出范围）及其父提交包含 `ea8f1b6`（AI provider 导入修复）。对最新提交发送完整 GitHub push payload 后，Dokploy webhook 仍返回 `HTTP 301 {"message":"Branch Not Match"}`，没有产生构建任务；线上验证继续等待 Dokploy Compose 分支配置修正。
- 随后公网只读 gate 观察到价格建议页已出现搜索和状态筛选，且 assistant NLQ、AI capability、Sommelier 页面和价格写保护均通过；证据 `docs/UAT_AI_ENABLED_GATE_2026-10-19_POST-D9089BB_ONLINE-PRICE-FILTER.json`。由于 Dokploy 控制台未回读容器 SHA/构建日志，不能据此确认运行镜像对应 `d9089bb`。
- 启用态回归已串行重跑并通过：AI surface `11/11`、AI UI `2/2`；空音频/空图片业务边界、匿名路由鉴权、390/1440 UI 焦点与启用态聊天/语音状态均通过。证据 `docs/UAT_AI_SURFACE_2026-10-19_POST-9B01128_ENABLED-AWARE-RETRY2.json`、`docs/UAT_AI_UI_2026-10-19_POST-9B01128_ENABLED-AWARE-RETRY.json`。首次并行运行的登录 `404/502` 为瞬态失败，未计入通过或失败结论。

## 2026-10-19 Dokploy backend build failure and fix

- Dokploy build `#38` failed during Maven compile, not because of the `Parenthesis` deprecation warnings. The blocking errors were missing symbol `AiProviderConfig` in `AiConfigController.java:78` and `SommelierController.java:65`.
- Root cause: both controllers referenced `com.orithos.modules.ai.AiProviderConfig` from child packages without importing it.
- Fixed locally by adding the two explicit imports. No runtime behavior or API contract changed.
- Local Maven verification is unavailable in this workspace because only JDK 8 is installed while the project requires Java 21; the attempted compile also reports unrelated UTF-8 source decoding errors under the Windows JDK. Verify with the Docker/Maven Java 21 build.
- The deprecation warning for `net.sf.jsqlparser.expression.Parenthesis` remains non-blocking and is separate cleanup work.
- Next step: commit and push the import fix, trigger the provided Dokploy webhook once, then confirm build success and rerun AI UAT. Until that succeeds, production AI remains **NO-GO**.
- The fix was committed as `ea8f1b6ed16dc5399a319671c152cbd825a40200` and pushed to `origin/main`. Both a minimal payload and a complete GitHub-style push payload returned `HTTP 301 {"message":"Branch Not Match"}` from the provided webhook, so no Dokploy build was started. The Dokploy Compose service branch/watch configuration must be corrected to `main`, or a normal Deploy must be run from the dashboard, before online verification.

## 2026-10-19 本轮新增：价格建议 CSV 导出

- `/stock/price-suggestions` 现在支持 `Export CSV`，导出当前视图（默认建议项；切换后为全部 POS 商品）的产品、SKU、状态、成本、当前价、建议价、毛利、28 天销量、库存和解释原因。
- CSV 在浏览器内生成并下载，未增加服务端写接口；价格建议仍明确 `writeEnabled=false`，人工变价仍从 Products / Bulk Price Edit 完成。
- 本地检查：`npm run typecheck`、目标 ESLint、`node --check scripts/pilot-price-suggestions-local-uat.mjs`、`git diff --check` 通过；本地 Playwright UAT `PASS`，下载内容包含 DEMO 商品和表头，非 GET API 请求 `0`。证据：`docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19.json`。
- 以上是早期 `404` 记录；后续 `266/266` 全站矩阵和价格建议线上 gate 已确认页面可达，不能将该旧失败当作当前状态。

## 2026-10-19 `26f1d47` 部署后只读回归

- AI availability `3/3`、AI surface `11/11`、AI UI `2/2`、Sommelier `10/10` 通过；AI 仍关闭，未产生模型或业务写入。
- 全站矩阵 `133 x 2 = 264/266`：仅 `/stock/price-suggestions` 在 390/1440 返回 `404`，其余 132 路由通过，无页面错误或横向溢出。
- 证据：`docs/UAT_AI_AVAILABILITY_2026-10-19_AUTHFIX.json`、`docs/UAT_AI_SURFACE_2026-10-19_AUTHFIX.json`、`docs/UAT_AI_UI_2026-10-19_AUTHFIX.json`、`docs/UAT_SOMMELIER_READONLY_2026-10-19_POST-26F1D47.json`、`docs/UAT_ALL_STATIC_PAGES_2026-10-19_POST-26F1D47.json`。
- 放行结论仍为 `NO-GO`：frontend 实际 SHA、构建日志和健康状态未从 Dokploy 控制台独立核验，价格建议线上路由仍不可见。

## 下一批部署候选：补齐 `src/app` 价格建议 wrapper

- 生产代码同时存在根 `app/` 页面和 `src/app/` wrapper；价格建议此前只有根页面，缺少 `src/app/stock/price-suggestions/page.tsx`，Stock Tools 的 `src/app/stock/more` 也没有入口。
- 已补齐 wrapper 和导航入口；本地 UAT 新增结构检查，连同页面、缓存头、CSV 内容和非 GET 请求 `0` 共 `8/8 PASS`。
- 这只是线上 404 的修复候选，尚未取得线上证据；下一次集中部署后需优先重跑价格建议 gate 和全站矩阵。

## 下一批后端修复：AI 关闭门禁前移

- 本次部署后的 AI surface UAT 发现：client `enabled=false`，但空语音请求返回 `40010`，而不是关闭状态业务码 `50301`；该结果不能证明模型被调用，但 API 契约不一致。
- `AiAssistantController` 的 transcribe 和 `SommelierController` 的 identify-image 现在先检查 `app.ai.enabled`，关闭时统一拒绝，再读取 multipart 文件或调用模型。
- 本地前端 typecheck、脚本语法和 diff check 通过；后端 Maven 测试未运行，必须在 Java 21 CI/下一次部署后验证 `50301` 和无模型调用。

## `aac28da` 部署后状态

- 价格建议线上路由已恢复：认证 gate 到达页面并通过只读文案检查；上一轮全站矩阵 `266/266 PASS`。
- Dokploy 当前实际 AI flag 为 `enabled=true`，assistant 调用返回 DashScope `HTTP 400 InvalidParameter: url error`；AI surface/gate 失败，说明生产 DashScope URL 或模型配置无效。
- 当前不能把真实 AI 视为通过，也不能把关闭门禁视为线上通过，因为线上并非关闭状态。修正 Dokploy AI 环境后需重跑 assistant、语音、酒标和价格建议 gate；在此之前建议恢复 `AI_ENABLED=false`。

## 下一批候选：AI provider 错误隔离

- `AiAssistantController` 将未预期的 graph/DashScope 异常转换为业务码 `50210`，不再返回 HTTP 500 或供应商原始 URL、request id 和错误细节。
- `SellAiPanel` 对 `50210` 显示“AI 暂时不可用”的可操作提示，保留商品查询和销售快捷入口。
- AI gate 新增供应商错误泄漏断言；本地 typecheck、ESLint、脚本语法和 diff check 通过。需下一次部署后在当前错误配置环境验证。

## `9ff8c12` 部署后 provider 隔离验证

- 价格建议线上页面和只读 gate 通过。
- DashScope 配置仍无效，assistant 请求失败，但响应已变为业务码 `50210` 的安全提示；不再泄漏原始 `InvalidParameter`、URL 或 request id。gate 的 provider 错误脱敏检查通过。
- 真实 AI 仍是 `NO-GO`，需先修正 Dokploy `AI_DASHSCOPE_BASE_URL` / 模型配置，之后再跑 assistant、voice、label 和 invoice UAT。

## 下一批候选：视觉 AI provider 错误隔离

- 酒标识别和发票 OCR 的视觉服务现在会隐藏 DashScope URL、request id、`InvalidParameter` 等供应商原始详情，改为可操作的 AI 配置提示。
- 新增两份 Java 单测覆盖错误脱敏；本机未运行 Maven，因为只有 Java 8，项目要求 Java 21。
- 该批次尚未部署，需与下一次集中部署一起重跑视觉接口和 AI gate。

## `bc9c7df` 部署后回归

- 价格建议和只读页面 gate 通过。
- DashScope URL 配置仍失败；assistant 返回 `50210` 安全提示，原始 provider 错误不再泄漏。
- 视觉服务的非空图片 provider 回归和 Java 21 单测仍待完成；当前真实 AI 继续 `NO-GO`。

## 2026-10-19 DashScope `url error` 根因与修复

- 本地 `.env` key 实测：`AI_DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com` **有效**。
- `qwen3.8-flash` 走 Spring AI 默认 `text-generation` → `InvalidParameter: url error`；同一 key 走 `multimodal-generation` 或 OpenAI compatible → `200 OK`。
- `qwen-plus` 相反：text-generation 通过，multimodal 报 url error。
- 因此不是 Dokploy host URL 配错，而是 **模型与 generation 路径不匹配**。
- 代码：`DashScopeEnvironmentPostProcessor` 按 `AI_DASHSCOPE_MODEL` 自动设置 `spring.ai.dashscope.chat.options.multi-model` 与 `completions-path`。证据：`docs/UAT_AI_DASHSCOPE_PROBE_2026-10-19.json`。
- Dokploy 保持：`AI_DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com`（不要加 `/api/v1`）、`AI_DASHSCOPE_MODEL=qwen3.8-flash` 即可；部署本修复后重跑 assistant。

## 下一批候选：provider URL readiness guard

- 新增统一 URL readiness 检查，拒绝带 API path/query 的 DashScope base URL；配置无效时 assistant、voice、label、invoice capability 均标为不可用，接口返回 `50301`，避免外部请求。
- 新增 Java 单测和线上 gate readiness 断言；本地不运行 Maven/build，需 Java 21 CI/部署后验证。

## `392c85f` 部署后回归

- 价格建议和只读边界通过；assistant 原始 provider 错误仍被转换为 `50210` 安全提示。
- base URL 形式 readiness 通过，但 DashScope 实际仍返回 `url error`，所以真实 AI 仍未放行。下一步需要 Dokploy 控制台核对 `AI_DASHSCOPE_BASE_URL`、region/model 和 Spring AI endpoint 配置。

## 2026-10-19 AI 持续回归（8791e1a）

- 线上只读 AI 全功能脚本结果：`13 PASS / 1 FAIL / 1 INFO`，证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-19_CONTINUE-3.json`。
- 已通过：管理员登录、AI capability flags、ASR 空音频边界、Sommelier 文本识别/推荐/话术/问答/相似、酒标空图边界、Price Suggestions API（1000 商品且 `writeEnabled=false`）、Price Suggestions 页面、Replenishment 页面和匿名 assistant `401`。
- 失败：NLQ assistant 返回安全业务码 `50210`；Invoice OCR 对可解码 PNG 返回 `50213` provider/model 配置错误。供应商原始 URL、request id 和错误内容没有泄漏。
- 本地只读比较表明当前 key 对 `https://dashscope.aliyuncs.com` 的 OpenAI-compatible chat endpoint 返回 HTTP 200；国际域名返回 HTTP 401。Dokploy 应核对 `AI_DASHSCOPE_BASE_URL` 与 key 的 region，并使用 region 根地址。
- UAT 脚本已改为使用可解码 PNG 探针：`50213` 计为硬失败，`50212` 仅表示 provider 可达但图片没有发票字段；这仍不替代真实发票照片的字段提取验收。
- 本轮本地只执行 `node --check scripts/pilot-ai-features-verify-uat.mjs` 与 `git diff --check`，没有运行 build。部署和配置修复后需等待 Dokploy 完成，再重新执行同一脚本。

## 2026-10-19 AI 视觉路由修复后回归（10facb6）

- Dokploy webhook 返回 `HTTP 200 Compose deployed successfully`，等待约四分钟后线上 AI 全功能只读回归为 **14 PASS / 0 FAIL / 1 INFO**。证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-19_POST-10FACB6.json`。
- NLQ assistant、Sommelier 全部动作、ASR/酒标空输入、价格建议 API/页面、补货页和匿名鉴权均通过。
- Invoice OCR 探针返回 `50212`：provider 已可达，但使用的是无发票字段的可解码页面截图，因此只记为 INFO；尚未用真实供应商发票照片完成字段提取验收。
- `InvoiceVisionService` 和 `WineLabelVisionService` 已按模型在 compatible chat 与 native multimodal endpoint 之间路由，并兼容 native `output.choices` 响应结构。真实业务仍只预览，不创建采购或收货。
- 之前的 `97eda76` 路由逻辑已通过 `META-INF/spring.factories` 注册到 Spring Boot 3.3，线上 NLQ 从 `50210` 恢复通过。
- 同一部署后的 UI/availability 回归也通过：AI UI `2/2`，availability `3/3`；证据为 `docs/UAT_AI_UI_2026-10-19_POST-10FACB6.json` 和 `docs/UAT_AI_AVAILABILITY_2026-10-19_POST-10FACB6.json`。

> **当前有效结论（2026-10-19，交接优先阅读）**
>
> 用户反馈已部署提交 `7544d03`。目前只有该反馈，没有从 Dokploy 控制台独立回读 frontend/backend 容器 SHA、构建日志、健康状态和部署时间，因此不能把 `7544d03` 作为已审计的运行版本。最新本地/远端交接提交为 `404600c`；价格建议部署验证目标为 `b34c9d0`，代码部署身份仍需在 Dokploy 控制台确认。

## 一、已完成

### 已有线上业务证据

- 品牌站注册、租户自动登录、Odoo 公司绑定、Outlet/Register 配置、dummy data 初始化。
- 基础 POS：开班、商品搜索、数量修改、Cash 收款/找零、Card 模拟收款、GST/现金舍入、收据和订单回读、销售扣库存。
- Cash/Card 全额退款、退款订单、库存恢复、Cash in/out，以及正确现金盘点值关班。
- 隔离公司供应商、RFQ、采购确认、部分收货/backorder、最终收货、重复收货保护和库存回读（但需要在当前已核实部署版本重跑）。
- 多租户读取隔离、登出保护、平台删除租户后的认证拒绝。

### 最近已完成的 AI 与权限修复

- AI 关闭状态：对话输入和 Voice input 禁用；`Open sell`、商品查询、库存查询仍可用。
- 登录后的门店页面显示 Orithos AI 入口；Sommelier 统一为 Wine Assistant；识标页在 AI 关闭时禁用拍照并保留名称/条码搜索。
- 发票扫描明确为 preview-only，不创建供应商、采购单或收货单。
- 发票扫描 mock 回归已通过：预览、详情、行编辑和 Odoo 采购链接正常，fixture 截获扫描请求且没有供应商/采购/收货业务写入；证据 `docs/UAT_INVOICE_SCAN_MOCK_2026-10-19_POST-B74D976.json`。这不代表真实 OCR 已验收。
- AI 只读线上回归：availability `3/3`、surface `11/11`、UI `2/2`、Sommelier `10/10`、公网 AI route matrix `9/9` 均通过；本次复测证据 `docs/UAT_AI_ROUTE_MATRIX_2026-10-19_POST-A48CFD8.json`。
- 普通非管理员对 13 个 AI 配置 reload/create/update/delete 接口全部被拒绝，业务码 `40300`，配置数量未变化；临时用户和角色已清理。
- Stocktake 普通用户 GET/POST 均被拒绝（HTTP `403` / 业务码 `40300`）；生产 `ODOO_STOCKTAKE_WRITE_ENABLED=false`，没有写入 Demo Odoo。
- 新增 Smart Pricing 只读建议页 `/stock/price-suggestions`：本地 fixture、typecheck、目标 ESLint 均通过，`writeEnabled=false` 且没有价格写请求；但部署后公网 URL 当前返回 HTTP `404`，尚不能算线上通过。价格建议 gate 证据：`docs/UAT_AI_ENABLED_GATE_2026-10-19_POST-23F9B76.json`。

### 已完成的本地质量检查

- `npm run typecheck`、目标 ESLint、UAT 脚本 `node --check`、`git diff --check` 已通过。
- 未运行 build；当前 Node 为 `22.22.2`，而 `pos-ui/package.json` 声明 Node `>=24`，构建结论需以受支持 Node 或 Dokploy 构建日志为准。

## 二、未完成或证据不足

- **部署身份**：尚未独立确认 Dokploy 实际运行的是 `7544d03` 或哪个 SHA。
- **Stocktake 写入**：隔离 Odoo 租户中的真实盘点写入、取消不改库存、确认只应用一次、quant reference、库存前后值、跨租户拒绝仍未验收。生产写开关保持关闭。
- **Stocktake 数量边界**：`1,000,000` 上限和 40 行限制有本地 fixture 证据，缺少有效线上真实登录交互证据。
- **采购当前版本回归**：采购确认、部分/全部收货有历史线上证据，但尚未在部署身份核实后的当前版本重跑。
- **AI 生产能力**：真实 DashScope 对话、云端语音转写、酒标图像识别、真实发票 OCR 未验收；生产 `AI_ENABLED=false`。
- **Smart Pricing 线上部署**：`/stock/price-suggestions` 在本地实现和 fixture 验证通过，但 Dokploy 部署等待后公网仍返回 `404`；需要从 Dokploy 控制台确认实际构建分支、frontend 镜像 SHA 和构建日志。
- **现场与运营能力**：实体刷卡终端、打印机、钱箱、SMTP 邀请/密码重置邮件、正式现金差异审批和财务对账未验收。
- **产品缺口**：分单/多支付方式收款和离线 POS 尚未实现或验收，不计入基础 POS 通过门槛。
- **平台改动**：租户生命周期/店铺状态转换工作区改动未完整提交、未运行后端测试、未部署、未线上验收。

## 三、当前问题与风险

- Dokploy webhook 曾出现 HTTP `301` / `Branch Not Match`；完整 payload 在部分提交上返回 `200`，触发成功不等于容器已切换。
- UAT JSON 中的 deployment SHA 只能表示测试目标或触发批次，不能替代 Dokploy 容器、构建和健康检查证据。
- 当前 AI 和 stocktake 的通过项主要证明 UI、关闭策略、鉴权和只读行为，不证明生产模型或库存写入已可用。
- 工作区有大量历史 UAT、截图和未提交改动。接手时禁止 `git add -A`、清理、reset 或覆盖用户文件，只提交明确相关文件。

## 四、建议接手顺序

1. 在 Dokploy 控制台回读 frontend/backend 当前 SHA、构建日志、健康状态和部署时间，核对用户所称 `7544d03`。
2. 在一次性隔离租户完成 stocktake 写入全链路，记录库存前后值、quant reference、取消/重复提交/跨租户/非管理员结果；结束后删除租户并验证认证拒绝。
3. 在已核实部署版本重跑采购收货和基础冒烟：`signup -> login -> outlet/register -> dummy catalog -> open session -> cash/card sale -> refund -> close register -> delete tenant`。
4. 继续保持生产 `AI_ENABLED=false` 和 `ODOO_STOCKTAKE_WRITE_ENABLED=false`，直到真实模型和隔离库存写入完成验收。
5. 将硬件、邮件、正式财务、多支付、离线 POS 单独列入后续产品验收，不用 mock 或只读结果标记为通过。

## 五、放行结论

当前整体为 **NO-GO**。基础 POS、退款、现金管理、历史采购链路、AI 关闭策略/鉴权和 stocktake 只读行为已有证据；部署运行身份、stocktake 真实写入、当前版本采购回归及生产运营能力仍缺关键证据。

## 六、最新部署后公网回归（2026-10-19）

- Dokploy compose webhook 对 `8cf2cc0` 返回 HTTP `200` / `Compose deployed successfully`，并等待约 3 分钟后执行回归。
- AI availability `3/3 PASS`、AI surface `11/11 PASS`、AI route matrix `9/9 PASS`、Sommelier `10/10 PASS`。
- 本轮没有销售、采购、库存或现金业务写入；AI 仍按生产 `AI_ENABLED=false` 的关闭策略运行。
- 证据：`docs/UAT_AI_AVAILABILITY_2026-10-19_POST-8CF2CC0.json`、`docs/UAT_AI_SURFACE_2026-10-19_POST-8CF2CC0.json`、`docs/UAT_AI_ROUTE_MATRIX_2026-10-19_POST-8CF2CC0.json`、`docs/UAT_SOMMELIER_READONLY_2026-10-19_POST-8CF2CC0.json`。
- 上述脚本的 `deployment` 字段仍为 `unverified-after-deploy`；只能证明 webhook 触发后公网行为通过，不能替代 Dokploy 容器 SHA、构建日志和健康状态回读。

## 七、Smart Pricing 迭代状态（2026-10-19）

- `158394a` 新增基于 Odoo 成本、售价和目标毛利的 GST-inclusive 货架价建议，只读返回，明确不写入 `list_price`；应用动作通过 Products / Bulk Price Edit 由人工完成。
- 本地 fixture：`PASS`，无 API 写请求；`npm run typecheck`、目标 ESLint、UAT 脚本语法检查通过。
- 已使用简化和标准 GitHub push payload 多次触发 Dokploy webhook（均返回 HTTP `200`）并等待约 3 分钟；公网登录成功，但 `/stock/price-suggestions` 仍不可达，包含 no-store 缓存修复后最新 AI enablement gate 仍为 `FAIL`。这确认问题不是 payload 过简或缓存，当前不能把该功能宣称为线上可用。
- 最新线上复测（等待部署窗口后）仍为 `FAIL`，证据 `docs/UAT_AI_ENABLED_GATE_2026-10-19_LATEST.json`；生产 `AI_ENABLED=false`，没有模型或价格写入。
- 生产 AI 仍为 `AI_ENABLED=false`；gate 的模型 smoke 保持阻塞，需在非生产隔离环境完成真实 DashScope、ASR、视觉和租户隔离验收后再考虑开启。

更新时间：2026-10-19（Asia/Shanghai）
仓库：`aishawn/aistore_pos`
本地仓库：`C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master`
分支：`main`
当前 GitHub `main` / 本地 `HEAD`：`404600c`（Smart Pricing 路由缺失失败证据）；价格建议部署验证目标为 `b34c9d0`，最新已核实应用修复提交为 `b74d976`，stocktake 权限顺序部署为 `a6d5a57`，盘点数量边界保护为 `0a337c7`，页面内 Retry 为 `14a052a`，来源提示部署为 `3cd5be0`，location fallback 为 `5afab93`，AI 修复为 `56cd7c1`。

## 最新状态覆盖（2026-10-19）

以下结果优先于本文后面保留的历史回归段落：

- 四条品牌 AI 能力店内落点：智能进货=`/stock/replenishment`（规则）+ `/invoices/scan`（OCR 预览）；智能推荐=`/sommelier*`；智能定价=`/stock/price-suggestions`（只建议、不写价）；智能搜索=全页悬浮 Orithos AI。生产开 AI 前 checklist：`docs/AI_PRODUCTION_ENABLEMENT.md`。本地价格建议 fixture UAT `PASS`（`docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19.json`，写请求 0）；启用闸门 `docs/UAT_AI_ENABLED_GATE_2026-10-19.json`。生产 `AI_ENABLED` 仍待 Dokploy 勾选 checklist 后打开，本轮未改生产密钥。
- 门店壳里每个已登录页面都显示可拖动的 Orithos AI 悬浮图标，包括收银、设置、采购、补货、侍酒和发票扫描。侧边栏 Orithos AI 去掉了与 Stock 重复的 Replenishment Plan，并增加 Price Suggestions；其余项各有一行说明。AI 关闭时输入框和语音禁用，今日销售、打开收银、查商品、查库存仍可跳转。酒款页标题统一为 Wine Assistant；识标页在 AI 关闭时禁用拍照并说明名称和条码搜索仍可用。本地 fixture 截图在 `docs/screenshots/2026-10-19-ai-nav/`。没有销售或采购写入。
- AI 配置管理员保护已完成线上验证：临时非管理员店员对 13 个 reload/create/update/delete 写接口全部被拒绝，返回业务码 `40300`，配置计数未变化；证据 `docs/UAT_AI_ADMIN_GUARD_2026-10-19_POST-3AFEF08.json`。
- Stocktake 权限顺序已修复并部署：`a6d5a57` 将 POST 身份验证前移到 payload、数量和写开关检查之前；普通店员 GET/POST 均返回 HTTP `403` / `40300`，未产生库存调整；证据 `docs/UAT_ODOO_STOCKTAKE_ADMIN_GUARD_2026-10-19_POST-A6D5A57.json`、`docs/HANDOFF_2026-10-19_STOCKTAKE_AUTH_ORDER_DEPLOY.md`。
- 本轮完整 webhook 均返回 `200 Compose deployed successfully`，但 Dokploy 控制台容器 SHA、构建日志和健康状态仍未独立回读；这些 UAT 证明部署触发后公网页为预期行为，不替代容器级取证。
- Stocktake 真实隔离 Odoo 写入仍未验收，生产 `ODOO_STOCKTAKE_WRITE_ENABLED=false` 保持不变。
- `b74d976` frontend 部署后，线上 AI disabled-state 已与源码一致：对话输入框和 Voice input 禁用，`Open sell` 快捷入口仍可用；AI availability `3/3`、surface `11/11`、UI `2/2`、Sommelier `10/10` 全部通过。证据：`docs/UAT_AI_AVAILABILITY_2026-10-19_POST-B74D976.json`、`docs/UAT_AI_SURFACE_2026-10-19_POST-B74D976.json`、`docs/UAT_AI_UI_2026-10-19_POST-B74D976.json`、`docs/UAT_SOMMELIER_READONLY_2026-10-19_POST-B74D976.json`。
- 之前线上仍显示旧 `Ask Orithos AI...` 输入框，根因是 disabled-state 源码改动未提交；`b74d976` 已提交并部署，不能再用旧页面结论判断当前版本。

## 本次交接摘要

### 已完成并有证据

- 品牌站注册、租户自动登录、Odoo 公司绑定、Outlet/Register 配置、dummy data 初始化，以及删除租户后的认证拒绝。
- 基础 POS：开班、商品搜索、数量修改、Cash 收款/找零、Card 模拟收款、GST/现金舍入、收据和订单回读、销售扣库存。
- 退款与现金：Cash/Card 全额退款、退款订单、库存恢复、Cash in/out、正确现金盘点值关班。
- 采购：隔离公司供应商、RFQ、采购确认、部分收货/backorder、最终收货、重复收货保护和库存回读；该项需要在当前已核实部署版本重新回归。
- 多租户读取隔离、登出保护、平台删除租户后的认证拒绝。
- 全站静态页面历史矩阵 `131 路由 x 390/1440 = 262/262 PASS`，以及多个 Retry、Auth replay、列表、订单、报表和移动端回归。
- AI 关闭策略和鉴权：availability `3/3 PASS`、surface `11/11 PASS`，27 个受保护 AI/config/voice/label/Sommelier 路由匿名访问均为 `401`；AI UI `2/2 PASS`；Sommelier `10/10 PASS`；发票扫描 mock 通过且没有供应商/采购写入。
- 普通店员 AI 配置写保护：临时空权限角色和店员线上测试 `13/13 PASS`，所有 reload/create/update/delete 均返回业务码 `40300`，AI 配置数量 `[13,12,119,3]` 前后一致；测试用户和角色已清理。
- Odoo stocktake 页面/API 的租户、company、库位隔离，叶子库位和库存类型校验，数量/行数边界，提交前重读，应用后库存回读，admin-only 和默认关闭写开关；线上只读回归通过，当前无盘点写入。

### 未完成或只完成部分验证

- Odoo stocktake 的真实隔离公司写入尚未验收：取消不改库存、确认只应用一次、quant reference、库存前后值、跨租户拒绝和普通用户拒绝仍需在一次性隔离租户中完成。生产保持 `ODOO_STOCKTAKE_WRITE_ENABLED=false`。
- stocktake 数量边界（`1000001`）目前有本地 fixture 证据，但没有有效的线上真实登录交互证据；之前一次尝试被登录壳重定向，不能计为通过。
- AI 配置写接口的权限行为已完成线上验证；当前 API 使用统一业务信封，HTTP 状态为 `200`、业务码为 `40300`，监控若只看 HTTP 状态需同时检查响应码字段。本地 Maven 测试仍未执行。
- 真实 DashScope 对话、云端语音转写、酒标图像识别、真实发票 OCR 尚未验收；生产 `AI_ENABLED=false`，当前 AI 结果不代表模型已启用。
- 实体刷卡终端、打印机、钱箱、SMTP 邀请/重置邮件、正式现金差异审批、财务对账未验收。
- 分单/多支付方式收款和离线 POS 尚未实现或验收，不计入当前基础 POS 通过门槛。
- 平台店铺状态转换、租户生命周期相关工作区改动尚未提交、未运行后端测试、未部署、未线上验收。

### 当前问题和风险

- Dokploy 当前运行镜像的 frontend/backend SHA、构建日志、健康状态和部署时间没有从控制台独立回读。用户提供的 `7544d03` 只能作为“用户称已部署”的信息，不能替代可审计部署证据。
- 对 `14a052a`、`0a337c7` 的简化/标准 webhook 请求均返回 HTTP `301` / `Branch Not Match`；更早完整 GitHub payload 对 `5afab93` 等提交曾返回 `200`。需要先修正 Dokploy 分支/触发配置，再确认运行 SHA。
- 线上只读 UAT 中记录的 deployment SHA 不能自动证明容器实际运行该 SHA；必须以 Dokploy 构建日志或容器标签回读为准。
- 本地只做了 typecheck、目标 ESLint、脚本语法和 fixture UAT，没有运行 build；当前 Node `22.22.2`，而 `pos-ui/package.json` 声明 Node `>=24`，构建结论应以受支持 Node 或 Dokploy 日志为准。
- 工作区存在大量未提交的历史 UAT、截图、平台租户代码和配置改动。接手时不得 `git add -A`、清理或重置；只提交明确属于当前修复的文件。

### 建议的接手顺序

1. 在 Dokploy 控制台读取 frontend/backend 当前 SHA、构建日志、健康状态和部署时间，核对 `65a1e57`、`5afab93`、用户所称 `7544d03` 的关系；修复 `Branch Not Match` 后再做新部署。
2. 使用一次性隔离租户完成 stocktake 写入验收，记录库存前后值、quant reference、取消/重复提交/跨租户/非管理员结果，结束后删除租户并验证认证拒绝。
3. 在当前已核实部署版本重新执行采购收货和核心冒烟：`signup -> login -> outlet/register -> dummy catalog -> open session -> cash/card sale -> refund -> close register -> delete tenant`。
4. 将生产 AI、硬件、邮件、正式财务、分单支付、离线 POS 单独列入产品验收计划，不从 mock 或只读测试推断已完成。

### 放行结论

当前整体仍为 **NO-GO**。基础 POS、退款、现金管理和已有采购链路有历史线上证据，AI 关闭策略/鉴权和 stocktake 只读行为有近期线上证据；但部署身份未核实，stocktake 真实写入、普通用户权限、当前版本采购回归及生产运营能力仍缺证据。

## 2026-10-19 当前部署后回归

- 完整 GitHub push payload（含 `X-GitHub-Event: push`）触发 Dokploy 返回 HTTP `200` / `Compose deployed successfully`，目标提交为 `5392598c37c4560105f3c405c3f4d7e47f8b439c`。
- 等待超过 2 分钟后，主店公网回归通过：AI availability `3/3`、AI surface `11/11`、AI UI `2/2`、Sommelier `10/10`、Odoo stocktake 只读 `PASS`。证据：`docs/UAT_AI_AVAILABILITY_2026-10-19_POST-5392598.json`、`docs/UAT_AI_SURFACE_2026-10-19_POST-5392598.json`、`docs/UAT_AI_UI_2026-10-19_POST-5392598.json`、`docs/UAT_SOMMELIER_READONLY_2026-10-19_POST-5392598.json`、`docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19_POST-5392598.json`。
- 本轮仍验证生产 `AI_ENABLED=false`、匿名受保护 AI 路由为 `401`、Sommelier 价格/库存与 Odoo 目录一致；stocktake `locationSource=single-warehouse-fallback`、`writeEnabled=false`、非 GET 请求为 0。
- 这些是部署触发后的公网行为证据；Dokploy 控制台 frontend/backend 容器实际 SHA、构建日志和健康状态仍未独立回读，因此不能把脚本中的 deployment 字段当作容器取证。整体放行仍为 **NO-GO**。

## 2026-10-19 AI 管理员保护回归

- `3afef08` 的部署 webhook 返回 HTTP `200`；等待部署窗口后，使用临时非管理员店员测试 AI 配置全部 13 个写接口。
- 结果 `15/15 PASS`：13 个 reload/create/update/delete 请求均返回 HTTP `200` + 业务码 `40300`，配置计数 `[13,12,119,3]` 未变化；临时角色和账号已删除。证据：`docs/UAT_AI_ADMIN_GUARD_2026-10-19_POST-3AFEF08.json`。
- 这证明权限拒绝和无写入成立，但不代表 HTTP 状态码为 403；当前项目统一使用业务码表达该类错误，后续监控和客户端必须检查 `code` 字段。

## 本轮继续：Odoo 盘点 P0

- 新增 `/stock/stocktake` 页面和 `/api/odoo/stocktake` BFF：商品搜索/条码选择、数量填写、差异预览、人工确认；API 限定租户 company 与绑定库位下的内部叶子库位，拒绝追踪商品、包装/寄售库存、待盘记录，并在提交前重读商品和库存、应用后回读核对，成功响应显示 Odoo quant 调整引用。
- 本轮补上 Orithos 服务端角色门槛：对 `/api/auth/me` 做实时管理员核验；普通用户返回 403，身份服务不可用时 fail-closed。由于后端还没有 `stock.adjust` 授权模型，目前是 admin-only。
- `ODOO_STOCKTAKE_WRITE_ENABLED=false` 默认关闭；没有向 Demo 的 `aipos` 写入。线上只读查询已确认租户 company 恰有一个 warehouse，并从 `lot_stock_id` 返回唯一库位；真实隔离 Odoo 写入仍未验收。
- 本地 fixture 浏览器 UAT 390/1440/768 共 3 个视口通过：取消不触发写请求、确认恰好调用一次且 payload 正确、关闭开关时按钮禁用；无横向溢出或页面错误。证据 `docs/UAT_ODOO_STOCKTAKE_LOCAL_ITERATION_2026-10-19.json`，截图 `docs/screenshots/2026-10-19-stocktake/`。所有 API 均被 fixture 拦截，不连接或写入 Odoo。
- 页面/API 已在 `b2b1a05` 推送；单 warehouse location 兜底在 `5afab93` 部署。线上管理员只读回归通过；隔离 Odoo 写入和线上普通用户权限回归仍未做。
- 后续 `5afab93` 增加单 warehouse `lot_stock_id` 只读兜底，`3cd5be0` 增加 `locationSource` 和 UI 来源提示；管理员线上只读 UAT 通过，Demo binding 缺少 location 但成功解析出 1 个库位，未产生任何非 GET 盘点请求。证据 `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json`。
- `14a052a` 将库位读取失败从整页 reload 改为局部 Retry；390px fixture 首次 503 后恢复，线上管理员只读回归也通过。证据 `docs/HANDOFF_2026-10-19_STOCKTAKE_RETRY.md`。线上证据的行为通过不替代 Dokploy 容器 SHA 取证。
- 本地 fixture 首次 503 后点击 Retry 恢复，390/768/1440 三视口及原有确认/取消写保护均通过。
- `0a337c7` 将数量上限（1,000,000）和最多 40 行限制前移到 Review 按钮；超限数量时 Review 保持禁用。本地 390/768/1440 fixture 通过，证据 `docs/UAT_ODOO_STOCKTAKE_LOCAL_2026-10-19_LATEST.json`。
- 最新线上只读回归 `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19_LATEST.json` 通过：管理员登录、Odoo session 恢复、binding/location 读取、390/1440 页面均 PASS；`locationSource=single-warehouse-fallback`、`writeEnabled=false`、非 GET 盘点请求为 0。该证据不覆盖数量写入、库存回读或 Dokploy 容器 SHA。
- 最新 AI 线上只读回归：surface `11/11 PASS`、UI `2/2 PASS`。证据 `docs/UAT_AI_SURFACE_2026-10-19_LATEST.json`、`docs/UAT_AI_UI_2026-10-19_LATEST.json`；生产 AI、语音和酒标识别仍关闭，匿名受保护路由均返回 `401`。

## 当前结论

基础 POS/采购、多个前端回归，以及最近 AI 修复后的公网行为均有通过记录。Odoo 盘点 location fallback 与来源提示已在 `3cd5be0` 部署并通过线上只读 UAT；`14a052a` 的页面内 Retry 已完成本地验证但尚未部署。Dokploy 控制台中的容器实际 SHA、完整构建日志与健康状态仍未独立回读。Odoo 盘点仍缺隔离库存写入和普通用户权限验收，租户/平台后续改动也未完整验收。整体仍为 **NO-GO**。

## 2026-10-19 持续迭代补充

- 主商店只读回归：AI availability `3/3`、AI surface `11/11`（含 27 个匿名 API 路由）、Sommelier `10/10`、发票扫描 mock `PASS`。证据：`UAT_AI_AVAILABILITY_2026-10-19_CONTINUATION.json`、`UAT_AI_SURFACE_2026-10-19_ROUTE-MATRIX.json`、`UAT_SOMMELIER_READONLY_2026-10-19_CONTINUATION.json`、`UAT_INVOICE_SCAN_MOCK_2026-10-19_CONTINUATION.json`。Sommelier 推荐/详情价格和库存与 Odoo 目录一致；本轮没有模型、销售、采购、反馈或配置写入。生产 `AI_ENABLED=false`，这些结果不代表模型已启用。
- 公网 AI UI 的较早复测曾发现 dialog 未包含输入框（`UAT_AI_UI_2026-10-19_CONTINUATION.json`）；该问题随后在 `56cd7c1` 修复，并由后续公网 UI `2/2 PASS` 回归覆盖。
- 语音入口在 AI 关闭时原先仍可启动麦克风录音。`56cd7c1` 已加入 AI 未知/关闭时禁用语音按钮和录音启动保护；本地 fixture 验证 390px/1440px 通过，转写请求为 `0`。
- `/api/ai/config` 的 reload 和 intents/slots/slot-values/prompts 写接口原先仅要求登录。`56cd7c1` 已加入 `AdminAccess.requireAdmin()` 和非管理员 `40300` 控制器单测；单测未在本地 Maven 执行，仍需线上普通员工权限验证。
- 本地检查：前端 `npm run typecheck`、`SellAiPanel.tsx` 目标 ESLint、AI UAT 脚本 `node --check` 和 `git diff --check` 均通过。本仓库未运行 build。
- 公网脚本证据的 `deployment` 仍是 `unverified-after-deploy`；修复后行为已有公网回归记录，但运行镜像 SHA 尚未独立确认。

### `56cd7c1` 推送后线上回归（记录于 `db9219c`）

- GitHub `main` 已推送到 `56cd7c136eb84a89b5e5b028ed89c02f48bc52b5`。
- 用户提供的 Dokploy compose webhook 在本轮仍返回 HTTP `301` / `{"message":"Branch Not Match"}`，因此没有可审计的 Dokploy 部署任务、构建日志或容器运行 SHA。
- 推送后等待部署窗口并复测公网：AI UI `2/2 PASS`（390/1440）、AI availability `3/3 PASS`、AI surface `11/11 PASS`、Sommelier `10/10 PASS`、发票扫描 mock `PASS`。证据：`UAT_AI_UI_2026-10-19_POST-PUSH-CHECK.json`、`UAT_AI_AVAILABILITY_2026-10-19_POST-DEPLOY.json`、`UAT_AI_SURFACE_2026-10-19_POST-DEPLOY.json`、`UAT_SOMMELIER_READONLY_2026-10-19_POST-DEPLOY.json`、`UAT_INVOICE_SCAN_MOCK_2026-10-19_POST-DEPLOY.json`。
- AI dialog/语音禁用源码修复和 AI 配置写接口管理员保护已在 `56cd7c1` 推送。公网 UI `2/2` 验证修复后的界面行为；这不等于验证了生产 AI 模型。
- 这些公网结果证明修复后的行为在当前站点可观察到，但由于 deployment 字段仍为 `unverified-after-deploy`，不能据此确认 Dokploy 使用的镜像就是 `56cd7c1`。后端 AI 配置管理员保护仍缺非管理员线上证据；新增控制器单测由后端构建验证，但本地没有运行 Maven 测试。

### 2026-10-19 后续只读回归

- 本地曾用简化和标准 GitHub push payload 请求部署 `14a052a` 与 `0a337c7`，均返回 HTTP `301` / `Branch Not Match`；因此无法从 webhook 单独确认 Dokploy 已切换到这些 SHA。公开页面本轮数量边界专项被重定向到登录壳，未形成有效线上数量证据。此前 `b2b1a05`、`5afab93`、`3cd5be0` 的完整 payload 曾返回 HTTP `200 Compose deployed successfully`。
- 主商店 AI 线上回归再次通过：availability `3/3`、surface `11/11`（包括 27 个匿名路由 `401`）、AI UI `2/2`、Sommelier `10/10`。推荐产品价格/库存与 Odoo 商品目录一致；生产 `AI_ENABLED=false`，没有调用真实模型、语音转写或图像识别服务。发票扫描 mock `PASS`，扫描端点由浏览器 fixture 截获，没有创建供应商或采购。
- `5afab93` 部署等待超过 5 分钟后的 AI 回归：availability `3/3`、surface `11/11`、UI `2/2`、Sommelier `10/10`、invoice mock `PASS`。证据：`docs/UAT_AI_AVAILABILITY_2026-10-19_POST-5AFAB93.json`、`docs/UAT_AI_SURFACE_2026-10-19_POST-5AFAB93.json`、`docs/UAT_AI_UI_2026-10-19_POST-5AFAB93.json`、`docs/UAT_SOMMELIER_READONLY_2026-10-19_POST-5AFAB93.json`、`docs/UAT_INVOICE_SCAN_MOCK_2026-10-19_POST-5AFAB93.json`。这些脚本记录的 deployment SHA 为 `5afab93`；容器 SHA 仍未在 Dokploy 控制台核实。
- `3cd5be0` stocktake source UX 线上只读证据更新为 PASS：`locationSource=single-warehouse-fallback`，管理员可看到写入前需显式绑定的提示；证据 `docs/HANDOFF_2026-10-19_STOCKTAKE_SOURCE_UX.md` 与 `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json`。
- 本地 `npm run typecheck` 和 stocktake 页面/API/navigation 目标 ESLint 均退出码 0；未运行 build。当前 Node 为 `22.22.2`，而 `pos-ui/package.json` 声明 Node `>=24`，应在受支持 Node 版本或用 Dokploy 构建日志补足工具链验证。

## 已完成且有证据

### 核心业务能力（既有隔离租户验收）

- 品牌站注册、租户自动登录、Odoo 公司绑定、Outlet/Register 配置、dummy data 初始化和租户删除后的认证拒绝。
- POS 开班、商品搜索、Cash 收款/找零、Card 模拟收款、GST/现金舍入、收据与订单回读、销售扣库存。
- Cash/Card 全额退款、退款订单及库存恢复；Cash in/out；正确现金盘点值关班。
- 隔离公司供应商创建、RFQ、采购确认、部分收货/backorder、最终收货、重复收货保护和库存回读。
- 多租户读取隔离、登出保护，以及平台删除租户后的认证拒绝。

以上结论来自此前保存的隔离租户线上证据；执行新的写入验收时仍须建立一次性租户，禁止对生产 Demo 公司做业务写入。

### 页面、交互和稳定性

- 全站静态页面基线：131 路由 × 390/1440 视口，262/262 PASS（历史回归证据）。
- 已有综合交互、管理列表、订单、设置、平台恢复、报表/Overview/补货竞态、关班读取保护等专项通过记录；详见 `HANDOFF_2026-10-18.md` 与 `CAPABILITY_STATUS.md`。
- 2026-10-19 Product Detail Retry 在线只读故障注入 1/1 PASS；Gift Cards Retry 和搜索竞态 2/2 PASS。失败 GET 后 Retry 期间按钮锁定、错误提示保留，恢复后成功；390px 无横向溢出、无页面错误、没有业务写请求。证据：`UAT_PRODUCT_VIEW_RETRY_AFTER_B3C9EBA.json`、`UAT_GIFTCARDS_OUTLET_RETRY_AFTER_B3C9EBA.json`。
- Auth replay 在线回归 2/2 PASS：GET 401 仅刷新并重试一次，DELETE 没有自动重放且测试请求被浏览器拦截。证据：`UAT_AUTH_REPLAY_AFTER_B3C9EBA.json`。
- AI availability 3/3 PASS、AI surface 11/11 PASS：验证生产 AI 关闭状态、配置读取和登出后的匿名 API 401；另有 27 个配置/语音/酒标/Sommelier 路由匿名矩阵。证据：`UAT_AI_AVAILABILITY_2026-10-19_CONTINUATION.json`、`UAT_AI_SURFACE_2026-10-19_ROUTE-MATRIX.json`。
- AI 对话框和语音禁用修复在本地 fixture 环境完成 390px/1440px 检查：modal 语义、dialog 范围、Tab 焦点循环、Escape 焦点返回、AI 关闭时语音按钮禁用均通过；转写请求为 `0`，AI 请求由 fixture 拦截。证据：`UAT_AI_FOCUS_LOCAL_2026-10-19_RELEASE-CANDIDATE.json`。
- 最新全站静态矩阵：131 路由 × 390/1440 视口，262/262 PASS，无路由失败、横向溢出或页面错误。证据：`UAT_ALL_STATIC_PAGES_AFTER_94CCC32.json`。矩阵 `sourceCommit=94ccc32` 表示测试源码基线，不证明 Dokploy 正在运行该 SHA。

## 未完成或未覆盖

- **Dokploy 容器构建身份待独立核验**：`3cd5be0` 后线上 stocktake 与 AI UAT 通过，但 `14a052a`/`0a337c7` 的部署请求返回 `Branch Not Match`；frontend/backend 容器实际 SHA、完整构建日志、健康状态和部署时间仍需从控制台回读。
- **AI 配置管理员权限仍缺线上验证**：修复已提交于 `56cd7c1`，但未用普通员工账号验证写接口返回拒绝；控制器单测存在，尚无本地 Maven 执行结果或可审计 CI 构建记录。
- **AI 生产功能未验收**：当前生产 `AI_ENABLED=false`。真实 DashScope 对话、云端语音转写、酒标图像识别、真实发票 OCR 尚未验证；现有通过项只证明关闭策略、UI 状态和匿名鉴权。
- **实体设备未验证**：实体刷卡终端、打印机、钱箱没有接入现场设备验收。Card 是 Odoo 模拟支付方式。
- **产品能力缺口**：分单/多支付方式收款和离线 POS 尚未实现或未验收；不计入当前基础 POS 通过范围。
- **运营验收未完成**：真实邮件（邀请/密码重置）、正式现金差异审批、正式财务对账和采购财务流程未完成验收。
- **采购回归需重绑定当前版本**：隔离租户完整收货已有旧版本证据；尚未在已核实的当前生产版本上回归。
- **构建证据不足**：本地没有运行 build；生产构建结果需以 Dokploy 完整构建日志为准。
- **平台店铺状态转换改动待验证**：工作区对状态按钮和 API 增加允许转换矩阵，并新增 `suspended → expired` 拒绝单测；前端 typecheck/目标 ESLint 已通过，但后端测试未运行，当前环境仅有 JDK 8，项目要求 Java 21。该改动未提交，不能算已部署或已验收。
- **Odoo 盘点隔离验收未完成**：`5afab93` 已完成线上管理员只读验证和单 warehouse location 兜底，但本地/线上读取不验证 Odoo 字段权限、库存应用或审计记录。仍需在获批隔离 DB/company 验证取消不改库存、确认只应用一次、数量回读一致、跨租户/非管理员拒绝，再考虑启用环境开关；Demo `aipos` 禁止写入。
- **租户生命周期/平台店铺状态改动未完成验收**：后端租户删除状态转换和前端平台店铺详情等改动未提交；对应后端测试未运行，也没有线上回归证据。

## 当前问题与工作区状态

### 2026-10-19 Dokploy #38 构建故障处理

- Dokploy 构建日志曾报 `AiConfigController` 与 `SommelierController` 找不到 `AiProviderConfig`。当前 `main`/`origin/main` 为 `228fa6f`，该提交已包含 `pos-api/src/main/java/com/orithos/modules/ai/AiProviderConfig.java` 以及两个控制器的显式 import；因此该日志对应旧源码快照，而不是当前提交缺少类文件。
- 直接空 POST 到 compose webhook 会返回 `301 {"message":"Branch Not Match"}`。Dokploy 需要 GitHub push payload 中的 `ref=refs/heads/main`；按 push 格式重试后返回 `200 {"message":"Compose deployed successfully"}`。
- 本次只确认部署已被接受，尚未从 Dokploy 控制台回读 backend/frontend 实际容器 SHA、完整 Maven/Next 构建日志、健康状态和完成时间。完成这些回读前，不把本次部署标记为构建通过。
- 本地 Maven 编译在当前 Windows 工作区被既有源码编码错误阻断（`ApiResult.java`、`AiReportSchemaMigrator.java` 等非本次改动文件），未将该结果归因于 `AiProviderConfig`；生产构建仍以 Dokploy Java 21 日志为准。

### 2026-10-20 Dokploy #38 后续触发记录

- 已核对 `main` 与 `origin/main` 均为 `0ceb21ff2cd89caf4b6897bc8a93091f90ce0938`；该提交历史包含 `ea8f1b6` 的两个显式 import 修复，且 `AiProviderConfig.java` 已被 Git 跟踪。#38 的 `cannot find symbol` 因此属于旧源码快照，不需要再次修改控制器。
- 使用现有 compose webhook 发送 `ref=refs/heads/main`、`after=0ceb21ff2cd89caf4b6897bc8a93091f90ce0938` 的 push payload，返回 `HTTP 301 {"message":"Branch Not Match"}`。本次没有启动新的 Dokploy 构建，不能把该响应记为部署成功。
- 下一步应在 Dokploy 控制台确认 Compose 的 Git 分支设置；手动 Deploy 必须选择包含 `ea8f1b6` 的 `0ceb21f`（或更晚提交），并回读 backend 的 Maven 日志。`Parenthesis` 仅为弃用警告，不是失败原因。

### 2026-10-20 响应式库存与供应商连接批次

- `pos-ui/src/components/admin/StockListPage.tsx`：移动端由十列固定表格改为产品编辑卡片，避免价格和操作字段被裁切；桌面表格和原有 blur 保存逻辑保留。
- `pos-ui/app/utilities/vendor-connections/page.tsx`：新增移动供应商卡片，保留连接信息和 Edit/Delete 操作；桌面端保持 `ListTable`。
- 新增/更新 UAT：`scripts/pilot-stock-tables-responsive-local-uat.mjs`、`scripts/pilot-vendor-connections-responsive-local-uat.mjs`；本地证据为 Stock 三页 `6/6 PASS`、Vendor `2/2 PASS`，页面错误和业务写入均为 `0`。结果文件：`docs/UAT_STOCK_LIST_MOBILE_LOCAL_2026-10-20.json`、`docs/UAT_VENDOR_CONNECTIONS_RESPONSIVE_LOCAL_2026-10-20.json`。
- 当前只完成本地静态检查和 fixture 浏览器验证，未运行本地 build；需集中提交后推送，再从 Dokploy 控制台核对构建日志、容器 SHA 和健康状态，最后执行公网只读回归。

### 2026-10-20 部署后回归与固定助手安全区

- 公网 `d350428` 后价格/库存回归 `8/8 PASS`，诚实化页面矩阵 `18/18 PASS`；供应商连接空状态 `2/2 PASS`。所有回归均拦截业务非 GET 请求，写入计数为 `0`。
- 公网 Stock List 390px 截图确认产品卡片字段完整；共享安全区保证滚动到末尾时固定 AI 助手按钮不覆盖分页或底部内容。本地证据：`docs/UAT_STOCK_LIST_MOBILE_LOCAL_2026-10-20_SAFEAREA.json`。初始视口中间内容与浮动按钮同屏的定位优化仍待后续批次处理。
- 新增共享修复：`pos-ui/src/components/admin/AdminPageLayout.tsx` 手机端预留底部空间；新增公网回归脚本 `scripts/pilot-vendor-connections-online-uat.mjs`，并修正价格回归脚本以识别 Stock List 卡片布局。
- 公网结果仍不能证明 Dokploy 容器实际运行 `d350428`；必须从控制台回读运行 SHA、backend/frontend 构建日志和健康状态。上述脚本与证据文件将在下一次集中提交时纳入版本。

### 2026-10-20 全站矩阵（`09b7997` 部署后）

- `134` 路由 × `390/1440` 共 `268/268 PASS`，HTTP 全部 200，无横向溢出、页面错误或脚本失败。证据：`docs/UAT_ALL_STATIC_PAGES_POST_09B7997.json`。
- 这是页面加载/布局矩阵，不代表所有页面的业务写入、真实 Odoo 数据流程或生产 AI 已验收；对应专项仍以各自 UAT 和隔离租户写入证据为准。

- `main` 与 `origin/main` 当前为 `5bcfb72`；stocktake location fallback 代码部署提交为 `5afab93`，来源提示部署提交为 `3cd5be0`，Retry 修复为 `14a052a`，数量边界保护为 `0a337c7`。
- 完整 push payload 返回 HTTP 200，随后线上只读 UAT 记录 deployment `5afab93`。Dokploy 控制台的 frontend/backend 容器 SHA、构建日志和健康状态仍未回读；不得把旧的 `7544d03` 当作当前版本。
- 工作区仍有大量未提交变更，当前可见包括能力状态/旧交接文档、平台租户生命周期后端代码与测试、平台店铺详情前端、多个 UAT JSON/截图以及 `tsconfig.json`。Odoo stocktake 页面/API 已提交；其本地 UAT 证据和截图目前仍未提交。AI 修复源码和 Odoo stocktake 实现均已提交，不应再按未提交代码处理。接手时检查实际 diff 和归属。
- 不要运行 `git add -A`，不要清理、重置或覆盖这些改动。新增交接文件应单独处理。
- `UAT_AI_UI_2026-10-19_AUTHFIX.json` 是较早的线上焦点失败（1/2）；较新的 `UAT_AI_UI_2026-10-19_POST-PUSH-CHECK.json` 为 `56cd7c1` 后公网行为 `2/2 PASS`，两者应按时间区分。
- 旧线上回归 JSON 的 `deployment=unverified-after-deploy`；本轮 `POST-5AFAB93` UAT 显式记录已接受部署的 SHA `5afab93`。两类证据均不替代 Dokploy 容器 SHA/构建日志。

## 接手顺序

1. 从 Dokploy 控制台回读 frontend/backend 当前容器 SHA、完整构建日志、健康状态和部署时间，将其与已部署提交 `5afab93` 对照。
2. 使用普通员工账号验证 AI 配置写接口的管理员拒绝逻辑；确认生产 AI 仍保持关闭，除非另有预算与生产验收批准。
3. 审阅剩余工作区 diff，特别是租户生命周期和平台店铺状态转换。只提交明确纳入的文件，不要提交整批 UAT/截图或无关工作区改动。
4. Odoo stocktake 需先只读核实绑定库位树，再于获批隔离 Odoo 完成写入验收；后端单测在 Java 21 CI/受控环境运行并记录结果。保持生产 `ODOO_STOCKTAKE_WRITE_ENABLED=false`，直到验收完成。
5. 再运行受影响路由的只读冒烟。若要进行业务写入，使用一次性隔离租户，并在结束后删除租户及验证认证拒绝。
6. 生产 AI、硬件、多支付、离线 POS 和正式财务/邮件流程仍单独跟踪，不得由 UI 或 mock 测试标记为通过。

## 放行矩阵

| 类别 | 状态 |
|---|---|
| 隔离租户基础 POS、退款、现金管理/关班 | 已有线上验收记录 |
| 隔离租户采购确认与收货 | 已有线上验收记录；需当前部署版本回归 |
| Retry、Auth replay、AI surface 最近专项 | 通过只读线上回归；部署 SHA 未核验 |
| AI dialog/语音禁用修复 | 已包含在 `5afab93` 部署批次；post-deploy UI 2/2 PASS；容器 SHA 待控制台回读 |
| AI 配置管理员保护 | `56cd7c1` 已推送；控制器单测已新增；普通员工线上拒绝及可审计测试结果待补 |
| Odoo stocktake | `3cd5be0` 已部署且线上管理员只读通过；`14a052a` Retry 和 `0a337c7` 数量边界本地三视口通过，最新部署 SHA 待核实；服务端 admin-only；隔离 Odoo 写入未验收 |
| Dokploy 当前运行版本及完整构建 | 未核验 |
| 生产 AI、实体硬件、SMTP、正式财务流程 | 未验收 |
| 分单/多支付、离线 POS | 未实现或未验收 |
| 整体放行 | **NO-GO** |

## 2026-10-19 AI 持续回归（bc9c7df）

- 线上只读 AI 全功能脚本结果：`13 PASS / 1 FAIL / 1 INFO`，证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-19_CONTINUE-3.json`。
- 已通过：管理员登录、AI capability flags、ASR 空音频边界、Sommelier 文本识别/推荐/话术/问答/相似、酒标空图边界、Price Suggestions API（1000 商品且 `writeEnabled=false`）、Price Suggestions 页面、Replenishment 页面和匿名 assistant `401`。
- 失败：NLQ assistant 返回安全业务码 `50210`；Invoice OCR 对可解码 PNG 返回 `50213` provider/model 配置错误。供应商原始 URL、request id 和错误内容没有泄漏。
- 生产 AI 当前仍未达到可用验收。只读比较表明本地 key 对 `https://dashscope.aliyuncs.com` 可返回 HTTP 200，对国际域名返回 HTTP 401；因此应在 Dokploy 核对 `AI_DASHSCOPE_BASE_URL` 与 key 的 region，并使用 region 根地址，不要填 `/compatible-mode/v1` 路径。
- `scripts/pilot-ai-features-verify-uat.mjs` 已改为使用可解码 PNG 探针：`50213` 现在计为硬失败，`50212` 仅表示 provider 可达但图片没有发票字段；这仍不替代真实发票照片的字段提取验收。
- 本轮本地只执行 `node --check scripts/pilot-ai-features-verify-uat.mjs` 与 `git diff --check`，没有运行 build；部署和配置修复后需等待 Dokploy 完成，再重新执行同一脚本。

## Dokploy #38 后端编译故障（2026-10-20）

- Dokploy #38 的 Maven 错误为 `AiConfigController.java:78` 和 `SommelierController.java:65` 找不到 `AiProviderConfig`。对应源码快照在两个控制器使用 `AiProviderConfig.isValidBaseUrl(...)` 时缺少显式 import；`AiProviderConfig.java` 类本身已经存在。
- `ea8f1b6` 已在两个控制器补齐 `import com.orithos.modules.ai.AiProviderConfig;`。该修复已包含在当前 `main`/`origin/main=feef55e`，因此 #38 不能作为当前提交仍然无法编译的证据，应视为旧源码快照的构建失败。
- `Parenthesis` deprecated warning 不是本次失败原因；真正导致退出的是上述两个 Java 编译错误。
- 当前工作区未运行本地 Maven build，仍以 Dokploy Java 21 构建日志和控制台容器 SHA 作为最终构建证据。触发后续部署时必须确认目标 SHA 为 `feef55e`（或其后包含该 import 修复的提交），并回读 frontend/backend 构建完成、健康状态和运行 SHA。

## 2026-10-20 UI 可访问性批次（本地）

- `ExpressStocktakePage` 的产品搜索框补齐可访问名称、combobox 状态、结果 `listbox`、选项 `aria-selected` 与加载状态；不改变搜索、扫描或库存写入逻辑。
- 平台店铺移动列表改为明确的 `list`/`listitem` 语义；Manage Cash 首屏 skeleton 标记为忙状态。
- 本地验证：`pos-ui` `npm run typecheck` 退出码 0；目标 ESLint（Manage Cash、Platform Stores、Express Stocktake）`0 warning / 0 error`；`pilot-table-a11y-online-uat.mjs`、`pilot-ai-features-verify-uat.mjs` `node --check` 通过；`git diff --check` 通过。
- 这批只完成源码级和静态检查，尚未证明 Dokploy 已运行该提交；部署后应复跑管理员只读表格/表单 UAT，并增加 Express Stocktake 390/1440 视口验证。生产 Demo 仍禁止业务写入。

## 2026-10-20 工具与报表移动列表语义

- Future Costs、Future Prices、This Month Sales、Weekly Sales 的移动端列表补齐 `role="list"` / `role="listitem"`，修正原先把 `aria-label` 放在无列表语义 div 上的问题；只影响辅助技术语义，不改变数据读取、分页或业务写入。
- 全站静态只读矩阵 `134 路由 × 390/1440 = 268/268 PASS`，HTTP 均为 200，无横向溢出或页面错误。证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-20_PRE-DEPLOY.json`。该证据观察的是当前公网页面，`deployment` 身份仍未核验。

## 2026-10-20 工具列表第二批

- Mail Log、Trashed Items 的移动端结果容器补齐 `list/listitem` 语义；首屏 skeleton 标记 `aria-busy="true"`，让读屏器能区分加载中和已加载列表。
- 本地验证：`pos-ui` `npm run typecheck` 退出码 0；两个目标页面 ESLint `0 warning / 0 error`；静态 UAT 与表格 UAT 脚本 `node --check`、`git diff --check` 均通过。

## 2026-10-20 实际路由树对齐

- `src/app/utilities/future-costs` 与 `future-prices` 现在使用已修正的只读客户端实现，同时保留 `dynamic="force-dynamic"` 和 `fetchCache="force-no-store"`；避免旧的“New/Filter”假控件覆盖真实只读能力，并规避历史 `revalidate` client/server 冲突。
- `src/app/utilities/trashed-items` 的搜索输入现在受控并发送 `q` 参数；此前输入框不会影响请求。`src/app/utilities/mail-log` 搜索框补齐可访问名称。
- typecheck、相关页面 ESLint、UAT 脚本语法和 `git diff --check` 均通过；本地未运行 build，部署后需重新验证 `/utilities/future-costs`、`/utilities/future-prices`、`/utilities/mail-log`、`/utilities/trashed-items` 的 390/1440 行为。

## 2026-10-20 线上只读复测（提交 854bf6a，部署身份未核验）

- `docs/UAT_TABLE_A11Y_ONLINE_2026-10-20_POST-854BF6A.json`：7 页面 × 390/1440 共 `14/14 PASS`，页面错误 0，未命名控件 0，清空供应商搜索建议残留 0，意外业务写入 0。脚本主动拦截了安全非 GET 请求，不能替代写入验收。
- `docs/UAT_AI_AVAILABILITY_2026-10-20_POST-854BF6A.json`：`3/3 PASS`；当前 Demo 的 `/api/ai/config/client` 报告 `enabled=true`，AI composer 可用，未提交提示词。该结果的 `deployment=unverified-after-deploy`，只能说明当前公网行为，不证明运行镜像来自 `854bf6a`。
- 由于线上 AI 开关已报告为开启，后续必须从 Dokploy 回读环境变量、模型/region 配置、构建日志和运行 SHA，再进行预算可控的真实模型回归；在此之前不把 NLQ、语音、酒标或发票 OCR 标记为已验收。

## 2026-10-20 Dokploy #38 后续触发（`faecf07`）

- 复核当前源码：`AiProviderConfig.java` 已被 Git 跟踪，`AiConfigController` 和 `SommelierController` 均显式导入 `com.orithos.modules.ai.AiProviderConfig`；因此 #38 的两个 `cannot find symbol` 对应修复前源码快照，不需要重复修改 Java 控制器。
- 已将本地 `main` 的 `0751ee0`、`faecf07` 推送到 GitHub，远端 `main` 与本地均为 `faecf073fb91228f52f036b0ae78de380bd78b12`。
- 使用完整 GitHub push payload（`ref=refs/heads/main`、`after=faecf07`）调用 Dokploy compose webhook，返回 `HTTP 200 {"message":"Compose deployed successfully"}`。这只证明 Dokploy 接受触发，不能替代构建完成证据。
- 等待部署窗口后，公开入口 `/overview` 返回 `200`；未认证 `/api/health` 与 `/api/ai/config/client` 返回 `401`，符合鉴权边界。尚未从 Dokploy 控制台取得 frontend/backend 容器 SHA、完整 Maven/Next 构建日志、健康状态和完成时间。
- 发布结论保持 **NO-GO**，直到控制台确认构建通过且运行容器 SHA 与 `faecf07`（或其后提交）一致。

## 2026-10-20 浮动 AI 助手交互与可访问性批次（`e9d9d69`）

- `SellAiPanel` 增加可见发送按钮和表单提交语义；空输入、AI 关闭、请求进行中均禁用，输入框增加稳定的 `aria-label`。
- 对话框改用 `aria-labelledby` + 隐藏完整标题，消息区域增加 `aria-live="polite"`；同步修复关闭后焦点恢复判断，兼容新 ARIA 命名。
- 手机端新会话默认将浮动助手上移到底部安全区，避免覆盖分页和底部操作；用户已保存的拖动位置仍保持。
- 本地验证：`npm run typecheck`、`SellAiPanel` ESLint、AI UAT `node --check`、`git diff --check` 通过；未运行 build。两个本地 AI fixture 因 `demo.localhost:3035` 页面加载超时，未形成通过证据。
- 公网验证：AI UI `2/2 PASS`（390/1440，焦点循环/恢复、发送按钮、ARIA、FAB 安全距离）；价格/库存 `8/8 PASS`；表格/表单 `14/14 PASS`；页面错误 0，意外业务写入 0。证据：`docs/UAT_AI_UI_POST_E9D9D69_RETRY.json`、`docs/UAT_PRICING_POST_E9D9D69.json`、`docs/UAT_TABLE_A11Y_POST_E9D9D69.json`。
- 全站只读矩阵复测 `134 路由 × 390/1440 = 268/268 PASS`，HTTP 全部 200，无页面错误或横向溢出；证据：`docs/UAT_ALL_STATIC_PAGES_POST_351C02F.json`。
- `e9d9d69` 已推送并由 webhook 接受；Dokploy 容器 SHA、完整构建日志和健康状态仍需控制台回读，整体发布保持 **NO-GO**。

## 2026-10-20 Dokploy #38 编译错误复核

- #38 后端失败点是 `AiConfigController.java:78` 与 `SommelierController.java:65` 使用 `AiProviderConfig.isValidBaseUrl(...)` 时缺少显式 import；`AiProviderConfig.java` 类本身已存在。`Parenthesis` deprecated 只是 warning，不是退出原因。
- 修复已在 `ea8f1b6` 完成：两个控制器均包含 `import com.orithos.modules.ai.AiProviderConfig;`；当前 `main`/`origin/main` 为 `a57d0c8`，并包含该修复。
- 当前源码静态核对结果：`AiProviderConfig.java` 被 Git 跟踪，两个控制器的 import 与调用均存在。该日志不能证明当前 `a57d0c8` 仍有同一编译错误，应按 Dokploy 使用旧源码快照或分支错位处理。
- 本地遵守约束未运行 Maven、Next 或 Docker build；未把 #38 标为成功或已部署。下一次部署必须在 Dokploy 控制台确认目标 commit 至少为 `a57d0c8`（或其后提交）、Maven/Next 构建完成、frontend/backend 健康且运行 SHA 与目标一致。
- 文档提交 `839e394` 推送后再次调用 compose webhook，平台仍返回 `HTTP 301 Branch Not Match`，因此本次没有启动构建；需先在 Dokploy 修正 Compose 的仓库/分支绑定，再重试。

## 2026-10-20 报表时区与日期解析批次（`73ba45c`）

- AI 报表相对日期现在按绑定 Odoo company 的地址推断业务时区，缓存 30 分钟，并将同一时区用于 Odoo `context.tz`、UTC 查询边界和订单业务日分组；无法读取时安全回退 `Australia/Sydney`。
- 日期解析补齐大小写不敏感的英文月份、全部 12 个月份缩写和无效日期回退；增加 Adelaide/Sydney 午夜边界、公司地址解析、DST/UTC 边界测试。
- 报表只读 UAT 增加逐日 AI/Overview 对账，而不是只比较单日；所有报告请求仍禁止 Odoo 写方法。`OdooReportingDashboard` 与 Settings/Data loading 状态补齐 `aria-live`/`aria-busy`。
- 本地验证：`pos-ui` `npm run typecheck`、目标 ESLint、AI 报表/OCR UAT `node --check`、目标 `git diff --check` 通过；遵守约束未运行 Maven、Next build 或 Docker build。
- 提交已推送前的下一步：集中推送 `73ba45c` 后，在 Dokploy 修正 Compose 分支绑定再部署；部署后必须执行 `pilot-ai-report-readonly-uat.mjs`、全站矩阵、表格/表单和 AI availability。当前线上仍不能标记为该提交，发布保持 **NO-GO**。

## 2026-10-20 当前线上基线与部署阻断

- 当前公网旧运行版本只读基线：AI 报表 `9/9 PASS`（逐日 Overview 对账 7 天、Odoo source path、`14,oct` 年份）；表格/表单 `14/14 PASS`、价格/库存 `8/8 PASS`、全站根 `app` `268/268 PASS`，均无意外业务写入。AI 报表证据：`docs/UAT_AI_REPORTS_READONLY_ONLINE.json`。
- 这些结果的运行提交为 `d48a374` 或脚本未核验版本，不能证明 `73ba45c`/`5bc65cc` 已上线；部署后必须重跑同一套脚本并记录运行身份。
- 针对 `5bc65cc` 的 compose webhook 于 2026-10-20 返回 `HTTP 301 {"message":"Branch Not Match"}`，构建未启动。Dokploy 分支绑定仍是当前外部阻断；在控制台修正前不重复触发 webhook。

## 2026-10-20 报表确定性路由与 #38 编译复核

- `AssistantFastPathRouter` 新增昨日销售、销售额区间和销量区间的中英文只读快捷路由；`ClassifyQueryNode` 对明确工作流请求先走确定性导航，provider 暂时不可用时不阻塞安全的报表/补货/定价/酒侍/发票预览入口。
- 报表只读 UAT 现在检查 API envelope 的非零 `code`，并在请求失败时明确记录 `AI assistant availability`，避免把 provider 不可用误报成业务数据失败。
- Java 21 门禁：`C:\Users\ai_sh\.jdks\jdk-21.0.12.1+1` 执行 `mvn -B clean verify`，`230 tests, 0 failures`，仅有 JSqlParser `Parenthesis` deprecated warnings；`node --check` 与 `git diff --check` 通过。
- #38 日志中的 `AiProviderConfig` cannot find symbol 不是当前工作树结果：类存在且两个控制器均有显式 import；当前源码已用 Java 21 编译通过。该错误应继续按 Dokploy 旧源码快照/分支绑定错位排查。
- 本批次尚未取得 Dokploy 构建完成、frontend/backend 健康状态或运行容器 SHA；部署结论保持 **NO-GO**，只提交源码和本交接更新，不把历史 UAT 生成物带入提交。

### 部署触发结果（`00c05eb`）

- 最新批次 `00c05eb` 已推送到 GitHub `main`。
- 2026-10-20 18:42（UTC+8）使用 `refs/heads/main` 和 `after=00c05eb` 调用 Compose webhook，返回 `HTTP 301 {"message":"Branch Not Match"}`；没有创建构建任务。
- 因此当前阻塞仍是 Dokploy Compose 仓库/分支绑定，不是本地 Java 编译错误。修正绑定后应以 `00c05eb` 或其后提交重新部署，并回读两端构建日志、健康状态和运行 SHA。

## 2026-10-20 AI 报表线上复测与排名路由批次

- 公网只读回归：诚实边界页 `18/18 PASS`、定价/库存 `8/8 PASS`、表格/表单 `14/14 PASS`、设置页 `PASS`、订单页 `16/16 PASS`、礼品卡 Retry/race `PASS`，均未产生意外业务写入。
- AI 功能静态/接口能力 `14/14 PASS`、AI UI `2/2 PASS`；自然语言工作流 `15/17 PASS`，失败为中文“本周哪类商品卖得最好”和“How much red wine sold this week?”，运行证据仍标记 `deployment=unverified-after-deploy`。
- AI 报表只读 `4/5 PASS`：Overview/7 天/30 天对账通过，AI availability 请求返回 `50210` provider unavailable。该结果说明当前公网运行配置/镜像仍不可确认，不能用来宣称真实模型验收。
- 当前源码补齐 `卖得最好`、`best-performing` 等排名词的安全 `report_adhoc` 路由，并新增分类节点绕过 provider 的单测；Java 21 `mvn -B clean verify` 通过，`233 tests, 0 failures`，仅有既存 JSqlParser 弃用警告。
- 本批次仍未运行本地 Next/Docker build；最新代码需与 Dokploy 分支绑定修复一起部署后，再重跑同一组 AI 工作流和报表脚本，确认运行 SHA 后才能判断线上失败是否消失。

## 2026-10-20 全站只读矩阵复测

- 公网全站矩阵完成 `134 路由 × 390/1440 = 268/268 PASS`；HTTP 全部 200，未报告页面级失败。证据文件：`docs/UAT_ALL_STATIC_PAGES_2026-10-15.json`（脚本沿用历史文件名）。
- 该矩阵验证的是当前公网可访问性和响应稳定性，不包含最新提交运行 SHA 证明，也不替代业务写入、真实 AI provider、Odoo 隔离写入和硬件验收。

## 2026-10-20 AI 报表结果页列选择批次（待部署）

- `AiReportResultPage` 的 Columns 控件已从禁用占位改为可访问列选择菜单；支持逐列隐藏/恢复，至少保留一列，表格合计、空结果列数和 CSV 导出均跟随当前可见列。菜单支持点击外部或 Escape 收起，结果搜索框补齐稳定的可访问名称。
- 本地 `pos-ui` `npm run typecheck`、目标 ESLint 和 `git diff --check` 通过；未运行 Next build。
- 该 UI 改动尚未进入可核验 Dokploy 镜像；部署后需在 AI 报表详情页验证菜单键盘操作、移动端不溢出、列切换、合计和导出结果，并重跑 AI UI/报表只读专项。
- 报表详情路由现在以 `reportId` 作为 React key，切换不同报告时会重置搜索和列隐藏状态，避免上一个报告的 UI 偏好污染新报告；本地 typecheck、目标 ESLint 和 diff check 通过。
- 列选择菜单增加 `Show all` 一键恢复；结果表合计行补充行标题语义，排序图标标记为装饰内容；本地 typecheck、目标 ESLint 和 diff check 通过。
- 2026-10-20 18:53（UTC+8）以 `after=641eaee` 触发 Compose webhook，仍返回 `HTTP 301 {"message":"Branch Not Match"}`，没有创建构建任务；该 UI 批次线上验证保持待部署。
- 2026-10-20 18:59（UTC+8）以最新 `after=2d3641f` 再次触发，仍返回 `HTTP 301 {"message":"Branch Not Match"}`；没有创建构建任务，线上验证继续等待 Dokploy 修正分支绑定。
- 2026-10-20 19:07（UTC+8）以最新 `after=5457dfb` 触发，仍返回 `HTTP 301 {"message":"Branch Not Match"}`；本批次没有创建构建任务。
- 2026-10-20 19:16（UTC+8）以最新 `after=c2360aa` 触发，仍返回 `HTTP 301 {"message":"Branch Not Match"}`；没有创建构建任务。

## 2026-10-20 AI 意图安全批次（`3cbf6d0`）

- 未知意图现在返回空的 UI/导航/动作/slot 指令；非法 route/action、未配置的实体操作和伪造动作不会降级成默认列表导航。
- 保留已配置的 `navigate`、商品搜索和实体列表行为；缺少实体操作时仍可安全打开对应列表。意图 key 规范化改为 `Locale.ROOT`，避免运行环境 locale 影响。
- 新增 `IntentSanitizeServiceTest` 的未知意图、合法导航、非法动作、合法实体操作、缺失操作和长度限制覆盖；本地未运行 Maven，Java 21 测试需 CI/部署环境执行。
- 当前线上行为仍来自未核验运行镜像；下一次 Dokploy 部署目标为当前 `ea43033` 或其后提交，部署后补跑 AI UI、AI features 和匿名鉴权回归。

## 2026-10-20 AI provider 安全与输入边界批次（`2e45369`）

- ASR 现在在 provider 调用前拒绝空音频、超过 5 MB 和非音频 MIME；支持的 MediaRecorder MIME 会规范化，provider 失败只返回固定重试提示。
- 发票 OCR、酒标识别和 ASR 不再把 provider body、request id 或异常 message 返回给员工或写入日志；模型不存在和配置错误仍保留可操作的配置提示。
- AI 报表/assistant 审计日志只记录 path、允许状态、行数和延迟；数据库写入异常只记录异常类型，不记录 SQL、问题文本或数据库诊断内容。
- Sell AI 前端额外 allowlist 可派发 intent，未知响应不会触发路由、Sell 操作或实体动作；后端同步拒绝伪造/非法实体操作。
- 新增 ASR 输入/错误脱敏、视觉 provider 安全消息、审计日志脱敏和 intent 行为测试；本地未运行 Maven/Next/Docker build。下一次部署目标为 `2e45369` 或其后提交，部署后补跑 AI features、AI UI 和匿名鉴权。

## 2026-10-20 最新 Dokploy 阻断

- 安全批次已推送，当前 `main`/`origin/main` 最新为 `97572da`。
- 针对 `97572da` 的 compose webhook 于 2026-10-20 14:03（UTC+8）再次返回 `HTTP 301 {"message":"Branch Not Match"}`，没有创建构建任务。
- 该结果与此前相同，不能作为 Java/Next 编译失败证据；在 Dokploy 控制台修正 Compose 仓库分支绑定前停止重复触发。修正后目标部署 `97572da`，并回读 frontend/backend 构建日志、健康状态和运行 SHA。

## 2026-10-20 Dokploy #38 编译日志最终复核（当前 HEAD `ffdfdfa`）

- #38 的唯一阻断是两个控制器调用 `AiProviderConfig.isValidBaseUrl(...)` 时缺少显式 import；`Parenthesis` deprecated 只是 warning，不会导致退出。
- `ea8f1b6` 已补齐 `AiConfigController` 与 `SommelierController` 的 `import com.orithos.modules.ai.AiProviderConfig;`。当前 `main`/`origin/main` 为 `ffdfdfa`，且 `ea8f1b6` 是其祖先；`AiProviderConfig.java`、两个 import 和调用均存在于当前 Git 树。
- 因此 #38 日志对应旧源码快照或 Dokploy 分支绑定错位，不能作为当前 HEAD 的编译结果。工作区本机 Maven 使用 Java 8，无法替代项目要求的 Java 21 构建验证；未将本地失败误报为 Java 21 编译失败。
- 下一次部署前必须在 Dokploy 确认 Compose 仓库/分支指向 `main`，目标 commit 至少为 `ffdfdfa`，并回读 Maven/Next 完整日志、backend/frontend 健康状态和运行容器 SHA。确认这些证据前，发布状态继续 **NO-GO**。
- 该说明提交为 `8785e78` 并已推送；随后调用 compose webhook 仍返回 `HTTP 301 {"message":"Branch Not Match"}`，没有启动构建。先修正 Dokploy 分支绑定，再以 `8785e78` 或其后提交部署。

## 2026-10-20 产品目录与 Sell AI 批次（待部署）

- 修复 Odoo 产品目录分类失败后的 `Retry categories` 不重新请求的问题，并为分类下拉补齐 `aria-busy`。
- 产品创建拒绝空白名称，产品编辑/创建统一拒绝负数或超过 `1,000,000` 的售价。
- Sell AI 的语音指针取消现在会立即停止录音；非法实体操作不再默认为 `list`，而是返回安全提示。
- 本地完成 typecheck、目标 ESLint、相关 UAT 脚本语法和 diff check；未运行本地 build。改动尚未线上验证。
- 下一次集中部署后运行 AI UI、AI entity guard、产品/价格只读页面、表格/表单和全站矩阵；必须回读 Dokploy 构建日志、健康状态和运行 SHA。
- 条码工具页增加 Odoo 产品目录和集成设置的真实导航入口，保留未接入打印能力的明确说明。
- 本批次已提交并推送为 `52c8f58`；compose webhook 于 2026-10-20 16:17（UTC+8）仍返回 `HTTP 301 {"message":"Branch Not Match"}`，没有启动构建。分支绑定修复后应以 `52c8f58` 或其后提交重新部署。
- 后续产品边界校验与条码导航批次已推送至 `dd5253d`；2026-10-20 16:49（UTC+8）再次触发 webhook 仍返回 `HTTP 301 {"message":"Branch Not Match"}`，未创建构建任务。当前线上回归证据仍是旧镜像基线。

## 2026-10-20 Java 21 后端门禁与价格建议 UI

- 当前后端 AI 多轮记忆、工具调用、报告路由和提示配置改动已用 `C:\Users\ai_sh\.jdks\jdk-21.0.12.1+1` 执行 `mvn -B clean verify`：`226 tests, 0 failures`，仅保留 JSqlParser `Parenthesis` deprecated warnings。
- 价格建议页的错误 Retry、刷新 busy 状态和搜索清除触控区域已优化；本地 typecheck、目标 ESLint、UAT 脚本语法和 diff check 通过。
- 这些改动仍未进入 Dokploy 镜像；下一次推送前必须保持 Java 21 全量门禁通过，部署后重跑 AI、价格/库存、全站矩阵并回读运行 SHA。
- 公网旧镜像工作流自然语言回归 `17/17 PASS`，证据为 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-20.json`；不能作为 `1b7cee5` 的 post-deploy 证据。
- 针对 `1b7cee5` 的 webhook 于 2026-10-20 17:20（UTC+8）仍返回 `HTTP 301 {"message":"Branch Not Match"}`，没有启动构建。

## 2026-10-20 发票 OCR 预览可靠性批次（工作区）

- `ScanInvoicePage` 现在在浏览器端拒绝非图片和超过 10 MB 的文件，错误提示可操作；OCR 仍是 preview-only，不会写入采购、收货或供应商。
- 预览表单现在同时展示并允许复核发票日期和到期日；mock UAT 增加到期日回填断言。
- 连续选择图片时用请求 revision 忽略旧响应，避免旧图片结果覆盖新图片，也避免旧请求清除新请求的 loading/error 状态。
- 本地验证：`npm run typecheck`、目标 ESLint、发票 OCR/价格建议/盘点 UAT `node --check`、`git diff --check` 均通过；按用户要求未运行 Next/Docker build。
- 改动尚未部署；下一次集中部署后重跑 `pilot-invoice-scan-mock-uat.mjs`、`pilot-invoice-ocr-preview-online.mjs`、价格建议和盘点只读专项，并核对 Dokploy runtime SHA。

## 2026-10-20 Dokploy #38 当前提交复核 (`d9e5c8c`)

- #38 的两个 `cannot find symbol: variable AiProviderConfig` 来自缺少 import 的旧源码快照。修复提交 `ea8f1b6` 已为两个 Controller 增加显式 import，`AiProviderConfig.java` 也已被 Git 跟踪。
- 当前 `main` 与 `origin/main` 均为 `d9e5c8c`，包含该修复。使用 JDK `21.0.12.1` 执行 `mvn -B clean verify`，结果为 `233 tests, 0 failures, 0 errors`。
- JSqlParser `Parenthesis` deprecated 仅是 warning，不是失败原因。
- Dokploy #38 不能作为当前提交的构建证据。此前 Compose webhook 持续返回 `HTTP 301 {"message":"Branch Not Match"}`，需在 Source/Git 修正 repo=`aishawn/aistore_pos`、branch=`main`、root=`/`、Compose=`docker-compose.yml` 后再执行普通 Deploy。
- 在回读 frontend/backend 完整日志、健康状态、容器运行 SHA 和目标 commit 前，发布状态保持 **NO-GO**。

## 2026-10-20 当前 HEAD Java 21 门禁复核

- `main` 当前为 `24f9e44`，包含 cashier chat history、platform AI usage 和 invoice assistant coverage。
- 使用 JDK `21.0.12.1` 执行 `mvn -B clean verify`：`228 tests, 0 failures`，仅有 JSqlParser `Parenthesis` deprecated warnings。
- 前端 `npm run typecheck`、目标 ESLint、AI UAT 脚本语法检查通过；未运行 Next build。
- 当前 HEAD 尚未获得 Dokploy 构建/运行证据，下一步以 `24f9e44` 触发部署并回读构建日志、健康状态和运行 SHA。
- 公网旧镜像 AI metrics 只读回归 `9/9 PASS`（390/1440、匿名 `401`、无业务写入），证据 `docs/UAT_AI_METRICS_ONLINE_E8E6C69.json`。
- `db8f02e` 的 compose webhook 于 2026-10-20 17:41（UTC+8）仍返回 `HTTP 301 {"message":"Branch Not Match"}`，尚未启动构建。
- Sommelier 只读 UAT 已将目录探针改为稳定的 `Shiraz` 查询并收紧非酒品词边界，提交 `dbfb55b`；该提交 webhook 于 2026-10-20 17:46（UTC+8）仍返回 `HTTP 301 {"message":"Branch Not Match"}`。
