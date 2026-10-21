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
- 后端 Java 21 门禁、真实 Odoo 交易闭环和 Dokploy Source/Git 修正仍未完成。## 2026-10-21 `83a6044` 前端版本端点状态

`83a6044f8770f8ba67b8dec7deff67dee17fe2aa` 已推送 `origin/main`。公网 `/api/public/version` 返回 200，`frontend.service=orithos-frontend` 且有构建时间；`frontend.commit=null`，`backend=null`，因此完整发布身份仍为 BLOCKED。Dokploy webhook 返回 `301 Branch Not Match`，需要修正 Source/Git 绑定和构建参数注入。此提交不含 `pos-api` WIP，未绕过 Java 21 门禁。# Orithos POS 当前发布状态

## 2026-10-21 Dokploy 成功后复验

用户确认 Dokploy 部署成功。线上只读结果：定价四页 390/1440px **8/8 PASS**（`UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19.json`）；全站 **272/272 PASS**（`UAT_ALL_STATIC_PAGES_AFTER_DEPLOY_2026-10-21_HONEST.json`）。Demo 租户域名上的 `/platform/operations` 两个 404 是控制平面隔离的预期结果，已从失败计数中排除并保留在 `expectedUnavailable`。

AI 功能矩阵为 **13 PASS / 1 BLOCKED / 0 FAIL**（`UAT_AI_FEATURES_VERIFY_AFTER_DEPLOY_2026-10-21.json`）；价格建议上游暂返 502，页面可用且提供 Retry。所有本轮请求均未执行 Odoo 价格、收货、RFQ、库存或其他业务写入。

`/api/public/version` 仍无法返回前后端服务身份，候选 `ae13e2279f858f0ac69d09bd0a2133d5be34236c` 的 Dokploy checkout、镜像和容器 SHA 仍未核验；线上结果继续标记 `unverified-after-deploy`。后端 WIP 仍须同候选 SHA 的 Java 21 `mvn -B clean verify`，隔离 Odoo 真实业务闭环也未完成，整体 NO-GO。

## 2026-10-21 AI 助手 182 条问法复测与安全修复

- 最新 Demo 只读矩阵为 **76 PASS / 90 BLOCKED / 16 FAIL**，证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_182CASE_RECHECK.json`。90 条均为 `50210`；5 个安全问法仍被旧 runtime 误导航，其余 11 个 FAIL 是已知报表/历史边界；助手 API 未产生业务写入。
- 源码已修复模型分类前的写入意图 fail-closed：明确的提交、保存、收货、删除、导入、发送和开始请求返回 guided `unknown`，不产生只读路由；节点回归覆盖 8 条安全问法。
- 该后端候选仍未部署。必须完成同一候选 SHA 的 Java 21 远程 `mvn -B clean verify`、Compose 构建和 runtime SHA 核验后，才能重跑并更新线上状态。

## 2026-10-21 AI 助手全量只读复测续轮

- 最新 174 条 Demo 只读矩阵为 `76 PASS / 87 BLOCKED / 11 FAIL`，证据：`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-174CASE-CURRENT.json`。87 条均为 `50210` 服务阻断；11 条仍是旧 runtime 的定价/发票/批量改价/补货历史误路由。
- 该运行的 `deployment=unverified-after-deploy`，不能证明当前工作区路由修复已经部署；业务写入为 0。

- 最近一次 Demo 只读自然语言复测覆盖 166 条：`72 PASS / 83 BLOCKED / 11 FAIL`。所有 BLOCKED 均为 `50210`；11 条误路由为定价历史 5 条、发票存在/数量 3 条、批量改价入口 1 条，以及补货支出历史 2 条。证据：`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_166CASE_GOAL-CONTINUATION.json`。Demo runtime SHA 未验证。
- 当前工作区目录为 182 条唯一问法；本轮新增补货口语、价格复核、酒类搭配和写入意图保护问法，均有确定性路由单测。新增 8 条问法的 Demo 只读复测为 4 PASS / 4 BLOCKED / 0 FAIL；8 条写入意图问法首次复测为 0 PASS / 3 BLOCKED / 5 FAIL，runtime SHA 未核验。报表路由补充采购/补货历史支出、发票成本等确定性边界，并加入当前工作流正向对照。UAT 脚本语法、case ID 唯一性和 `git diff --check` 通过；Java 单测未运行。后端仍需候选 SHA 对应的 Java 21 远程门禁，工作区改动未部署。
- 当前工作区还增加了补货提交、价格保存、发票收货/删除等写入意图的路由保护与负向回归断言；这些改动未通过 Java 21 门禁，不能标为已部署。
- 同轮 Demo 专项：surface/auth 11/11、Sommelier 10/10、metrics 9/9；reports 15/16（AI 实时库存源安全不可用）。Features verifier 有 10 个 PASS、1 个 OCR INFO 后，在 Overview 导航遇到 `ERR_CONNECTION_CLOSED`；route matrix 登录遇到 `socket hang up`，OCR 预览本轮 TLS 初始化断开。此前合成 OCR 6/6 仍是最近有效预览证据。未完成项均未标成 PASS，在线请求未写业务数据。
- 网络恢复后的重试：Features `14/14 PASS`、Route matrix `9/9 PASS`、合成发票 OCR `6/6 PASS`；OCR preview-only 写入边界通过。AI UI 仍因 Demo 缺少当前源码的 `What should I restock?` 快捷问句而失败，证据 `UAT_AI_UI_ONLINE_2026-10-21_GOAL-CONTINUATION-RETRY-2.json`。运行 SHA 仍未核验。
- 其他只读套件：availability 3/3、features 14/14、route 9/9、surface/auth 11/11、metrics 9/9、Sommelier 10/10、enabled gate PASS、OCR preview 6/6；reports 15/16（实时库存源 BLOCKED）；history/platform 9 PASS / 2 BLOCKED（缺少跨店/operator 账号）。AI UI 在线 0/1（Demo 缺工作区快捷问句），但本地 Next dev fixture 在四种视口/能力状态 `4/4 PASS`。
- 在线 runtime SHA 未核验；这些结果仅代表应答的 Demo 实例。工作区 Java 门禁未运行，不推送/部署后端改动；必须先在 Java 21 容器中对同一候选 SHA 通过 `mvn -B clean verify`。合成英语/中文 ASR 已通过 `4/4`；管理员写权限守卫会创建用户/角色，本轮未对 Demo 执行。
- Node `v24.19.0` 下 UI typecheck、AI 组件定向 ESLint、84 个 UAT 脚本语法检查通过；这些检查不替代 Java 21 预推门禁。
- 本地 voice release/cancel 与模拟 provider failure fixture 均通过；全部 API fixture 拦截，没有助手自动提交或非预期写入。

更新时间：2026-10-24

## 当前提交

- 远端 `main`：`60a0394`
- 本批次内容：普通 API 与 Odoo API 的 502/503/504 通用错误提示。
- 工作区另有未提交的 AI 确定性路由、对应 Java 测试和 UAT 脚本改动；这些改动不属于 `60a0394`，也没有绕过 Java 21 门禁推送。
- 当前未提交 AI 路由批次的问法目录为 117 条；新增商品/客户搜索口语和中英文采购历史/定价历史报表边界尚未进入远端构建或 Demo runtime。
- 113 条 Demo 只读复测已执行，结果为 `62 PASS / 46 BLOCKED / 5 FAIL`；证据为 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_113CASE_CURRENT.json`。新增商品搜索问法未失败但被旧 runtime 阻塞，5 条报表边界失败属于旧 runtime；部署 SHA 仍未核验。
- 新增客户查询后的 117 条复测为 `62 PASS / 50 BLOCKED / 5 FAIL`，证据为 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_117CASE_CURRENT.json`；4 条客户查询均被旧 runtime `50210` 阻塞，没有新增 FAIL。
- 当前未提交 AI 路由批次已扩展到 129 条本地问法，新增供应商、采购订单、库存盘点只读导航、写入动词负向测试和混合注入安全测试；仍需 Java 21 远程门禁和部署后复测，未计入远端发布。
- 129 条目录 Demo 只读复测结果为 `65 PASS / 59 BLOCKED / 5 FAIL`，证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_129CASE_CURRENT.json`；新增导航问法均为旧 runtime `50210` BLOCKED，混合注入问法安全通过，8 条旧报表边界 FAIL 未归因到当前源码。无业务写入，deployment SHA 未核验。
- 当前工作区目录已扩展为 **147 条唯一问法**；新增实体动作边界覆盖分类、客户组、价目表、礼品卡、采购周期、余额和批量改价的只读导航，以及不支持的 balance create/import/export、供应商只读 view、中文“开始盘点”、提交类动词和敏感伪造路径排除。该批次尚未通过 Dokploy Java 21 门禁或部署，不能用旧 runtime 结果替代。
- 144 条目录已对 Demo 完成只读执行：`65 PASS / 72 BLOCKED / 6 FAIL`，证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_144CASE_CURRENT.json`。8 条为旧 runtime 的定价历史/发票存在性误路由，新增 1 条中文批量改价问法仍被旧 runtime 导向 capped pricing；`deployment=unverified-after-deploy`，业务写入为 0。

## 2026-10-21 本轮全站与定价页复验

- Demo 页面矩阵 `270/270 PASS`（135 路由 × 390/1440）；交互 `14/14 PASS`；设置 `26/26 PASS`（13 页面 × 2 视口）；表格/可访问性 `14/14 PASS`，`unexpectedWrites=0`。公网运行 SHA 未核验。证据分别为 `UAT_ALL_STATIC_PAGES_2026-10-21_GOAL_RESUME.json`、`UAT_INTERACTION_2026-10-21_GOAL_RESUME.json`、`UAT_SETTINGS_MOBILE_2026-10-21_GOAL_RESUME.json`、`UAT_TABLE_A11Y_ONLINE_2026-10-21_GOAL_RESUME.json`。
- 库存/定价本地 fixture `6/6 PASS`、`blockedWrites=0`；但加强断言后的 Demo 定价页专项为 `5/8 PASS`，三个失败都在手机 Stock List、Capped Pricing、Bulk Price Edit。旧线上布局分别表现为 Stock List 卡片宽 `282px` 且 AI 入口重复、Capped Pricing 手机表格仍横向滚动、Bulk Price Edit 卡片缺失且搜索框宽 `110px`。无页面错误、无业务写入。新 UAT `pilot-pricing-pages-online-readonly-uat.mjs` 修正原有误报，证据为 `UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_LAYOUT-AUDIT.json`。
- 手机卡片、全宽内容区和 Header AI 单入口已在本地工作区实现并由 fixture 验证，尚未在 Demo 生效。运行容器 SHA 未核验，不可把公网失败归因于当前未提交代码。
- UI 验证使用 Node `24.19.0`；`tsc --noEmit`、七个目标组件 ESLint、UAT 脚本 `node --check` 和 `git diff --check` 通过。未运行本地 production build、Next/Docker build 或 Maven；当前 `pos-api` dirty batch 仍需远程 Java 21 `mvn -B clean verify` 门禁。
- 下次部署优先级：先核实/修正 Dokploy Source/Git 的 `Branch Not Match`，将移动端定价布局与强化 UAT 一起部署；核对构建 SHA、容器健康和 runtime SHA 后重跑四页双视口。价格编辑真实保存仍须隔离 Odoo UAT。

## 已实现

| 能力 | 当前状态 |
| --- | --- |
| 商品、库存、价格、补货、采购、销售、报表、设置页面 | 已实现，公网页面矩阵可达 |
| POS/Odoo 会话、商品搜索、报价、现金和关班门禁 | 已实现，写入验证按隔离环境执行 |
| AI 助手、自然语言报表、确定性工作流路由 | 已实现部分路由；新增问法待部署 |
| Sommelier、酒标识别、发票 OCR、语音转写 | 已实现入口和安全错误处理；真实 provider 质量待验证 |
| 502/503/504 网关错误提示 | 已在 `60a0394` 实现，待线上验证 |

## 已检查证据

- 当前回归总览：页面 `270/270`、交互 `14/14`、运营安全 `3/3`、设置 `28/28`、表格/可访问性 `14/14`、AI UI `2/2`、UAT 脚本语法 `83/83`。
- 页面矩阵：`135 routes x 390/1440 = 270/270 PASS`，见 `UAT_ALL_STATIC_PAGES_2026-10-24_CURRENT_RECHECK.json`。
- AI 工作流旧公网基线：`51 PASS / 16 BLOCKED / 0 FAIL`，见 `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_CURRENT_RECHECK.json`。
- 推送后扩展矩阵复测：`54 PASS / 25 BLOCKED / 0 FAIL`，见 `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_AFTER_PUSH.json`；该证据的 `deployment` 仍为 `unverified-after-deploy`，不能证明运行容器已加载 `60a0394`。
- 推送后 AI UI 只读复测：390/1440 两个视口 `2/2 PASS`，各有 3 张推荐卡、48 条识别结果、助手发送按钮和安全区通过，页面错误为 `0`；见 `UAT_AI_UI_2026-10-24_AFTER_PUSH.json`。运行身份仍未核验。
- 推送后真实只读交互复测：`14/14 PASS`，覆盖移动导航/焦点、商品搜索编辑、表单必填、CSV 预览取消、客户卡片、退款历史、补货和报表筛选；证据 `UAT_INTERACTION_2026-10-24_AFTER_PUSH.json`，无业务写入。
- 推送后运营安全只读复测：`3/3 PASS`；关班现金必填与取消、无现金直接关班 `422`、采购状态筛选均通过，session `00004` 保持 opened；证据 `UAT_OPS_READONLY_2026-10-24_AFTER_PUSH.json`。
- 推送后设置页复测：390/1440 共 `28/28 PASS`，无横向溢出；表格与可访问性复测 `14/14 PASS`，`unexpectedWrites=0`，见 `UAT_SETTINGS_MOBILE_2026-10-24_AFTER_PUSH.json` 和 `UAT_TABLE_A11Y_ONLINE_2026-10-24_AFTER_PUSH.json`。
- UAT 脚本静态门禁：`83/83` 个 `scripts/*.mjs` 通过 `node --check`。
- 推送后全站页面矩阵：`135 routes x 390/1440 = 270/270 PASS`，无页面错误或横向溢出；证据 `UAT_ALL_STATIC_PAGES_2026-10-24_AFTER_PUSH.json`。公网运行 `sourceCommit` 未公开，因此仍不属于 post-deploy 证明。
- 恢复后 AI 报表只读复测：`13 PASS / 1 BLOCKED / 0 FAIL`，销售报表和 Odoo Overview 对账通过；库存报表安全地提示当前无法读取实时库存。证据 `UAT_AI_REPORTS_READONLY_ONLINE_2026-10-24_RESUMED.json`；`deploymentShaVerified=false`，根因尚不能归属于源码或 runtime 配置。
- 恢复后 AI features：`14/14 PASS`；AI 配置、NLQ、语音/图像空输入保护、Sommelier、价格建议 API/页面和补货入口通过。OCR 探针为 `INFO`：provider 可达，但探针图没有发票字段。证据 `UAT_AI_FEATURES_VERIFY_2026-10-21_RESUMED.json`。
- 恢复后 Sommelier：`10/10 PASS`；推荐/详情/替代品价格和 free stock 与 Odoo 目录一致，匿名推荐返回 `401`。证据 `UAT_SOMMELIER_READONLY_2026-10-21_RESUMED.json`；deployment 仍未验证。

## 2026-10-21 Price Suggestions 移动端复验续轮

- 本地 UI 已移除 Price Suggestions 手机端多余右侧留白；fixture UAT `18/18 PASS`，390px 内容宽 `358px`、无页面错误、无业务/API 写入。搜索、筛选、空状态、只读 CSV、深链和 Header AI 交互均通过。
- 证据：`docs/UAT_PRICE_SUGGESTIONS_MOBILE_LOCAL_2026-10-21_RECHECK.json`；截图：`docs/screenshots/2026-10-21-price-suggestions-mobile-recheck/`。Node `24.19.0` typecheck、目标 ESLint、`git diff --check` 通过，未运行本地 production build。
- Demo 四页定价双视口最新只读证据为 `4/8 PASS`：1440px 四页通过，390px 四页失败；以 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_LAYOUT-AUDIT-2.json` 为准，旧 `5/8` 结果已被此审计取代。页面无错误、业务写入 `0`，公网运行 SHA 未验证。
- 当前改动未部署。需要核实 Dokploy Source/Git 配置、整理排除未验证 `pos-api` 改动的候选变更，并对任何包含后端文件的候选 SHA 先通过 Java 21 `mvn -B clean verify`。线上真实价格保存仍待隔离 Odoo UAT。

## 2026-10-21 库存定价与 Odoo 目录 UI 本地复验续轮

- 库存定价 3 页本地 fixture 回归 `6/6 PASS`（390/1440）；目录深链 `6/6`、空状态/恢复 `6/6`、客户/供应商表单 `6/6`，其他目录工具栏、导入/新建弹窗和 AI guard 检查均通过。两个批次 `pageErrors=0`、业务写入 `0`。
- 证据：`docs/UAT_STOCK_PRICING_BATCH_LOCAL_2026-10-21_RECHECK.json`、`docs/UAT_AI_ENTITY_DIRECTORIES_LOCAL_2026-10-21_RECHECK.json`；截图目录为 `docs/screenshots/2026-10-21-pricing-batch-recheck/` 与 `docs/screenshots/2026-10-21-directories-batch-recheck/`。未运行 production build。
- 这些本地结果不证明真实 Odoo 写入或生产运行版本；待形成候选批次并满足构建门禁后再部署验证。
- Dokploy Compose 页面当前只读请求返回 `HTTP 307 Location: /`，未能读取 Source/Git 配置；环境中没有可用的 Dokploy 凭据变量。此前 `Branch Not Match` 仍未核实解决，本轮未触发 webhook 或推送，发布保持未验证。
- 新一轮 Demo 定价只读审计仍为 `4/8 PASS`，四页 1440px 通过、四页 390px 失败；浮动 AI 与移动布局问题仍在公网运行版本中。报告 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_AFTER_LOCAL_CONTINUATION.json`，截图 `docs/screenshots/2026-10-21-pricing-online-after-local-continuation/`，`blockedWrites=0`、页面错误 `0`，runtime SHA 未核验。

## 2026-10-21 320px 小屏复验与商品字段修复

- 本地 fixture：库存定价 `9/9 PASS`、Price Suggestions `22/22 PASS`；目录 320/390/1440 深链 `9/9`、空结果恢复 `9/9`，目录表单、工具栏和 AI guard 均通过。业务/API 写入 `0`。
- 320px 商品卡片字段原先被两列布局截断，现改为 360px 以下单列；新增实际字段宽度断言，320/390 商品名称、分类、条码与库存完整显示。证据：`docs/UAT_AI_ENTITY_DIRECTORIES_320_LOCAL_2026-10-21.json`；截图 `docs/screenshots/2026-10-21-directories-320-local/product-320.png`。
- 其他证据：`docs/UAT_STOCK_PRICING_320_LOCAL_2026-10-21.json`、`docs/UAT_PRICE_SUGGESTIONS_320_LOCAL_2026-10-21.json`。Node 24 typecheck、目标 ESLint、UAT 脚本语法、diff check 通过；未运行 production build，改动未部署。
- UI 静态检查：`npm run typecheck`、目标 ESLint、UAT 脚本 `node --check`、`git diff --check` 均通过。
- 所有上述公网专项为只读；没有销售、退款、采购、收货、库存、现金或关班写入。

## 尚未证明

- Dokploy backend/frontend 是否构建了 `60a0394`。
- Dokploy Java 21 `mvn -B clean verify` 是否通过当前未提交后端批次。
- 容器健康状态、镜像 SHA、运行 commit 是否与目标提交一致。
- 真实 DashScope、多媒体 OCR、麦克风和真实发票/酒标图片质量。

## 发布门禁

1. Dokploy Source/Git 必须指向 `aishawn/aistore_pos`、`main`、仓库根目录 `/`、`docker-compose.yml`。
2. 先确认 checkout SHA，再读取完整 backend Maven 和 frontend build 日志。
3. 只有构建绿色、容器健康且 runtime SHA 匹配，才把结果标记为 post-deploy。
4. 部署后重跑 AI 工作流、AI features、AI UI、Sommelier、报表、设置、表格和全站矩阵。

