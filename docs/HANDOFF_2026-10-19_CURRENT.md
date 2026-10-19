# Orithos POS 当前交接

## 2026-10-19 Smart Pricing 到 Bulk Price Edit 闭环

- 价格建议每行新增 `Bulk edit this product`，携带 SKU 进入 `/stock/bulk-price-edit?search=...`；Bulk Price Edit 使用 `useSearchParams` 预填搜索并请求相同 SKU。
- Bulk Price Edit 路由增加 Suspense 边界，避免 `useSearchParams` 在静态渲染阶段缺少 boundary。
- 本地 fixture UAT `16/16 PASS`：搜索、状态筛选、CSV、SKU 深链、Bulk 页面预填、SKU query 和非 GET 写请求 `0` 均通过。证据：`docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19_DEEP-LINK.json`。
- 本地 `npm run typecheck`、Bulk/Price 目标 ESLint、`node --check scripts/pilot-price-suggestions-local-uat.mjs`、`git diff --check` 均通过；未运行 build。
- 该代码批次尚未重新触发 Dokploy；应与后续集中改动一起部署，再重跑价格建议和 Bulk Price Edit 公网 UAT。

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

> **当前有效摘要（2026-10-19）**
>
> 用户反馈线上已部署 `7544d03`，但目前没有从 Dokploy 控制台独立回读该 SHA 对应的 frontend/backend 容器、构建日志、健康状态和部署时间。因此 `7544d03` 只能作为待核对的部署声明，不能作为审计后的运行版本。仓库 `main` 和 `origin/main` 当前为 `761e078`；接手时先确认线上实际运行提交。

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

- Smart Pricing `/stock/price-suggestions`：本地页面、筛选、CSV、写保护和 Bulk Price Edit SKU 预填通过；线上当前部署身份及部署后 Bulk 页面只读回归仍需确认。
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

- 用户给出的 `7544d03` 与仓库当前 `761e078` 不一致；不能假定线上运行的是哪一个。
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
