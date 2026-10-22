## 2026-10-22 报表与 Odoo 空态 UI 批次（最新本地进展）

- [x] `OdooReportingDashboard` 不再把临时 Odoo `503` 当作连接缺失：503 显示错误、Retry 和 Request ID；只有 401 显示连接 Odoo 引导。
- [x] 产品目录、补货和报表的移动空态/错误态入口补齐可见键盘焦点样式。
- [x] 商品编辑/导入/新建和补货 RFQ 弹窗的关闭、取消、提交、供应商重试、数量输入和供应商选择控件补齐可见键盘焦点状态；typecheck、定向 ESLint 和 `git diff --check` 通过。
- [x] 补货页不再把 `503` 当作连接缺失；供应商加载失败、手工数量保持、RFQ 创建失败后重试流程本地 `60/60 PASS`，无非预期业务写入。正确使用 tenant host 的 fixture 证据：`docs/UAT_REPLENISHMENT_SUPPLIER_RECOVERY_2026-10-22_UI-BATCH.json`。
- [x] 本地 fixture：报表 503/401 `2/2 PASS`；Platform Audit/Failures 双视口 `4/4 PASS`；无业务写入；Node typecheck、定向 ESLint、脚本语法检查通过。
- [ ] 本批仅修改前端和 UAT 脚本，未运行 production build/Docker build；尚未部署 Dokploy。下一阶段与更多 UI 改动合批后部署，再核对 `/api/public/version` 和线上 390/1440px 结果。
- 证据：`docs/UAT_REPORTING_ERROR_LOCAL_2026-10-22_UI-BATCH.json`、`docs/UAT_PLATFORM_AUDIT_FAILURES_LOCAL_2026-10-22_UI-BATCH.json`。
- GitHub 远端仍为 `1cd417c3`，本地 main 已有文档提交至 `bbac6c72`，但两次 push 因网络连接失败未同步；手动 webhook 曾返回 `301 Branch Not Match`，版本探针仍为前后端 `582b92fb`。线上结果不能归因到本批，需先修正 Dokploy Source/Git 分支并恢复 GitHub 推送。

## 2026-10-22 AI 配套回归（最新）

- [x] Demo 线上自然语言回归 **247/247 PASS**；配套 availability **3/3**、route **9/9**、surface/auth **11/11**、metrics **9/9**、AI UI **2/2** 通过。
- [ ] Features **14 PASS / 1 BLOCKED**：Classic 发票 OCR 旧接口返回 `41001`，前端保持 Odoo Purchases/Replenishment 引导；Reports **15/16**：实时库存数据源 unavailable，其余销售日期、AUD、时区和 Odoo 对账通过。
- [x] 全部请求为只读，业务写入为 0。证据文件：`docs/UAT_*_2026-10-22_POST-ROUTE.json`。
- [ ] Demo runtime `582b92fb` 与当前工作区 source `1cd417c3` 不一致；不能把本轮结果当作最新候选部署证明。
- [x] Capability gates：聊天可用、语音清晰显示 unavailable；无页面错误、无写入。证据：`docs/UAT_AI_CAPABILITY_GATES_2026-10-22_POST-ROUTE.json`。
- [ ] History/platform **9 PASS / 2 BLOCKED**（缺第二门店和 platform-operator 凭据）；transcription **2 PASS / 2 BLOCKED**（缺音频 fixture）。证据：`docs/UAT_AI_HISTORY_PLATFORM_2026-10-22_POST-ROUTE.json`、`docs/UAT_AI_TRANSCRIPTION_2026-10-22_POST-ROUTE.json`。

## 2026-10-22 AI 用户问法回归

- [x] 247 条自然语言问法已在线只读执行：**246 PASS / 0 BLOCKED / 1 FAIL**。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_7911D0D4_DATA-AWARE-247.json`。
- [ ] 唯一失败为 `Recommend something in stock for steak`：route 已到 `/sommelier`，intent 却为 `report_adhoc`。工作区已补充 `in stock` 推荐短语的确定性路由和回归断言；涉及 `pos-api`，尚未通过同 SHA Java 21 `mvn -B clean verify`，不可部署或宣称已修复。
- [x] 用户问法目录继续覆盖补货、定价、侍酒推荐、库存/目录、报表、发票、帮助、权限、提示注入和执行型安全边界；所有本轮请求均为 Assistant API-only，业务写入为 0。

## 2026-10-22 交互验收最终结果（最新）

- [x] 线上交互 UAT 已重新执行：**10 PASS / 4 BLOCKED / 0 FAIL**。证据：`docs/UAT_INTERACTION_2026-10-22_RUNTIME-E0A867B-BLOCKED-DATA-FINAL.json`。
- [x] 已通过：移动导航抽屉、账户菜单、设置侧栏展开、分类弹窗和焦点恢复、商品新建/CSV 预览保护、客户表单与移动卡片、报表周期选择、旧报表只读提示；本轮业务写入 `0`。
- [ ] BLOCKED：商品搜索与商品编辑缺少 Odoo R2 商品卡片；销售历史退款收据缺少销售记录；补货覆盖计算缺少商品需求数据。需要隔离 Odoo 夹具后复验，不应当作代码失败。
- 用户确认 Dokploy 最新部署成功；已核验的线上基线仍为前后端 `e0a867b0387c7760c1dfc1bea9a5c374debb0930`。本次脚本分类修订、证据文件和文档更新未部署，因此不改变线上运行版本。

## 2026-10-22 AI 问法回归续验（最新）

- [x] 重试增强后的 247 条助手问法完成线上只读回归：**244 PASS / 0 BLOCKED / 3 FAIL**；所有请求仅调用 Assistant API，`writeRequests` 为 0。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_E8CAC11_RETRY-FULL-247.json`。
- [x] 明确的 502/503/504、50210/50301 和网络瞬断重试已生效；本轮全部用例一次完成，之前的商品查询阻断未复现。
- [ ] 两条中文自动下单能力问法仍在旧 `e8cac11` runtime 返回 `unknown`；本地 `601ae0dd` 已修复，但尚未通过同 SHA Java 21 `mvn -B clean verify` 并部署。
- [ ] `直接把这些商品补到50件` 仍误导航到补货页；该数量型执行问法需补 fail-closed 后端守卫，完成 Java 门禁后再部署。

## 2026-10-22 Dokploy 成功部署与 SHA 复核（最新）

- 用户确认 Dokploy 最新部署成功；随后 Demo `/api/public/version` 返回 HTTP 200，前端与后端服务运行 SHA 均为 `3edd72d84f514856923c0c0d50b01fe7b015e120`，与本地 `main` / `origin/main` 精确匹配。证据：`docs/UAT_RELEASE_IDENTITY_2026-10-22_SUCCESS_RECHECK.json`。
- 已重新执行库存/定价四页线上只读验收，覆盖 390/1440px 共 **8 项**。页面加载、移动端布局、无横向溢出及无 JS 错误均通过；结果 **8 PASS / 0 FAIL / 2 BLOCKED**。两项阻断均为 Capped Pricing 页面没有配置 Odoo price rules，数据为空，不能验收真实价格规则流程。证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-22_SUCCESS_RECHECK.json`；截图：`docs/screenshots/2026-10-22-pricing-success-recheck/`。
- UAT 拦截的业务写请求为 **0**。此前同 SHA 的助手自然问法 **216/216 PASS**（仅调用 Assistant API），运营只读交互 **13/13 PASS**；AI Stock RPC 仍为 **4 PASS / 5 BLOCKED / 0 FAIL / 1 INFO**，阻断项因测试公司/仓库上下文无匹配商品行。
- 本地未部署 UI 批次：Bulk Price Edit 的 Odoo 清除搜索按钮现在使用准确的 `Clear product search` accessible name 和 focus-visible 状态；Stock List 对成本由采购管理的商品使用窄列可读标签 `Managed`，完整说明通过 tooltip 和 `aria-describedby` 保留。五视口 Stock List/Capped Pricing/Odoo Bulk Price Edit fixture **15/15 PASS**，含成本占位符宽度和描述断言；价格建议预填/人工确认/丢失响应只读对账/未知结果阻止重试 fixture **12/12 PASS**。证据：`docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-22_COST-LABEL-PASS.json`、`docs/UAT_PRODUCTIZATION_UI_LOCAL_2026-10-22_BATCH_RECHECK.json`。Node 24 typecheck、目标 ESLint、两条 UAT 脚本语法检查通过；未运行 build/Maven。
- 以上 UI 修改仍在本地工作树，未包含于 `3edd72d` 线上镜像；待与更多前端改进合批后再部署。Turbopack 开发模式遇到全局 CSS 转换异常，验收改用独立 `.next-uat-clear` 目录的 Webpack dev 实例；临时实例和目录已关闭清理。
- 仍未完成：价格建议上游错误/可用性、实时库存 AI 报表、真实 Odoo 价格规则和其他隔离业务写入闭环、第二租户与跨租户授权验收、备份恢复及设备现场验收。整体试点仍 **NO-GO**；线上页面与只读接口通过不构成交易放行。
- 本轮未运行本地 build 或 Maven；只做线上版本探针、只读浏览器复验与截图检查。

## 2026-10-21 AI 助手全量问法续测（最新）

- 216 条完整只读问法结果仍为 **75 PASS / 116 BLOCKED / 25 FAIL**；随后将 25 条 FAIL 单独复测，仍为 **0 PASS / 0 BLOCKED / 25 FAIL**。复现类别：7 条写入意图误路由、10 条历史/报表边界误路由、1 条中文批量改价目的页错误、7 条销售回复 AUD/单日措辞不符。证据：`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-216-CURRENT-CONTINUATION.json`、`UAT_AI_WORKFLOW_PREVIOUS-FAILS_RECHECK_2026-10-21.json`。
- 另以只读补货问法验证 runner 与版本探针：`Restock list please` 为 **1/1 PASS**，进入 `/stock/replenishment`，业务写入为 0。Demo `/api/public/version` HTTP 200，但前后端 commit 均为空，`matchesSourceCommit=false`；线上行为不代表当前工作区已部署。
- `pos-api` 工作区已有上述四类的回归测试及修复，但没有运行 Java 测试。遵守不本地 build 的要求；在远端 Java 21 对完全相同候选 SHA 成功执行 `mvn -B clean verify` 前，不推送后端改动。现有后端 WIP 较多，不能混入无关改动构造候选。
- 当前完整 AI 专项已在历史 `AI_ASSISTANT_TEST_PLAN.md` 与 `AI_ASSISTANT_TEST_MATRIX.md` 中记录：features 13/14（价格建议 Cloudflare 502）、reports 15/16（实时库存安全 unavailable）、Sommelier 10/10、发票 OCR preview 6/6、ASR 4/4、route 9/9、surface/auth 11/11、UI 2/2、metrics 9/9、History/platform 9 PASS / 2 BLOCKED。线上 AI 调用不写业务数据，但可能新增 usage/audit 记录。

## 2026-10-21 AI 助手专项续验（最新）

- 当前 216 条自然问法全量复跑为 **75 PASS / 116 BLOCKED / 25 FAIL**；25 条失败定向复测仍为 **0 PASS / 0 BLOCKED / 25 FAIL**。线上版本接口没有前后端 SHA，结果只代表 Demo 旧运行版本。
- 配套只读能力：availability 3/3、capability gates PASS、route 9/9、surface/auth 11/11、UI 2/2、Sommelier 10/10、invoice OCR 6/6、metrics 9/9、英/中文合成转写 4/4；features 13/14（价格建议 Cloudflare 502）、reports 15/16（实时库存安全 unavailable）。
- History/Platform 9 PASS / 2 BLOCKED（缺第二门店用户和 platform-operator 凭据）；stock RPC 4 PASS / 5 BLOCKED / 1 INFO，阻塞均为测试公司/仓库范围无匹配行，未扩大数据范围。
- 所有检查为只读；助手/指标可能新增 usage/audit telemetry，但没有销售、库存、采购、收货、价格或收银业务写入。证据统一见 `docs/UAT_AI_*_2026-10-21_CURRENT-CONTINUATION3*.json`。
- 本轮未运行本地 build/Maven。`pos-api` 现有修复仍需 Java 21 对完全相同候选 SHA 执行 `mvn -B clean verify` 后才能推送。

## 2026-10-21 AI 助手完整回归续轮

- 当前工作流问法目录 **210 条唯一用例**已全部对 Demo 执行：**79 PASS / 113 BLOCKED / 18 FAIL**。113 条全部为 HTTP 200 / 脱敏 `50210`；18 条与既有误路由一致：7 条执行意图、10 条历史/报表边界、1 条中文批量改价。新增 `What did we take on 16 October 2026?` 同样被 `50210` 阻断，不能判为线上通过。证据：`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-210-CURRENT-ITERATION.json`。
- 其它只读在线专项：AI features **13 PASS / 1 BLOCKED**（价格建议 958ms Cloudflare HTML 502；OCR 探针仅 INFO），reports **15/16**（库存数据源安全不可用），availability **3/3**、route **9/9**、surface/auth **11/11**、UI **2/2**（390/1440）、Sommelier **10/10**、invoice OCR preview **6/6**、metrics **9/9**，History/platform **9 PASS / 2 BLOCKED**（缺第二门店用户与 platform-operator 凭据）。证据文件均使用 `*_2026-10-21_FULL-ITERATION.json`；所有线上运行身份均未核验。
- Invoice OCR 的合成供应商发票字段、两条商品行、GST 与应付总额均匹配，预览写入边界 `writes=[]`。侍酒推荐与商品库存/价格对账通过；AI UI 在手机与桌面各通过 1 组。指标测试会新增 assistant 使用审计事件，但无业务或配置写入。
- 截图复核发现销售摘要缺少币种且显示 `1 day(s)`。工作区 `ReportRespondNode` 已改为显示 `AUD` 并按数量显示 `day/days`、`sale/sales`，新增单日、跨日和单笔 AOV 测试断言；这些 Java 测试尚未执行，改动仍待远程 Java 21 同 SHA 门禁。
- `/api/public/version` 为 HTTP 200，但 `frontend.commit=null`、`backend=null`；最新可见前端 `builtAt=2026-10-21T12:58:05.809Z` 不能代替运行 SHA。价格建议 Cloudflare 502 缺 JSON 与 correlation ID；报表库存返回明确 unavailable 提示，二者根因分别待查。
- 本轮未运行本地 build/Maven。`pos-api` WIP 与回归测试尚未对同一候选 SHA 通过远程 Java 21 `mvn -B clean verify`；18 条源码修复不可推送或声明已部署。Demo 测试只调用 AI/只读接口，没有销售、采购、收货、价格、库存或收银写入；完整历史和本轮状态已同步至测试计划、矩阵、功能说明及 capability status。

## 2026-10-24 公网只读全站续验

## 2026-10-24 AI 用户问法与发票入口修复

## 2026-10-24 Demo AI proxy recovery and full recheck

- Demo anonymous probes recovered to the expected `401` JSON boundary. The full 216-case assistant catalogue passed **216/216**, and the representative five-case smoke passed **5/5**; both used Assistant API only and issued no business writes.
- Evidence: `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_HEAD-3FC821C.json` and `UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-24_CURRENT.json`.
- Runner source was `3fc821cde40f70bb05857909ac0f505a8e56a014`; `/api/public/version` reported frontend/backend runtime `3edd72d84f514856923c0c0d50b01fe7b015e120`, so `matchesSourceCommit=false`. Treat this as served-runtime verification only.
- Companion results: availability 3/3, route 9/9, surface/auth 11/11, metrics 9/9, UI 2/2 and capability fallback PASS; features 14 PASS + invoice OCR `41001` BLOCKED; reports 15/16 with live stock unavailable; History/Platform 9 PASS + 2 BLOCKED; transcription 2 PASS + 2 BLOCKED for missing fixtures.

- 新增 `docs/AI_ASSISTANT_USER_TEST_CASES_2026-10-24.md`，按门店真实问法覆盖补货、定价、推荐/查货、销售报表、发票识别、帮助、权限和提示注入；每类同时定义同义表达、数据不可用、权限限制和执行型问法边界。
- 新增线上只读证据：AI metrics **9/9 PASS**（390/1440px）、AI UI **2/2 PASS**、能力降级门禁 **PASS**；History/Platform **9 PASS / 2 BLOCKED**（缺第二门店与 platform-operator 凭据）；转写 **2 PASS / 2 BLOCKED**（本轮未提供音频 fixture）。上述检查均无业务写入。
- 定位到 Odoo-only 模式下 `/api/orders/receives/scan` 被 `OdooOnlyModeFilter` 正确返回 `41001`，但前端此前仍允许上传并提供无效重试。`ScanInvoicePage` 现在识别 `41001`，显示 Odoo Purchases/Replenishment 引导并禁用上传与重试；未放开 Classic POS 路径。
- 该前端修复已通过 `npm run typecheck`、`node --check scripts/pilot-ai-workflow-utterances-online-uat.mjs` 和 `git diff --check`；未运行本地 build/Maven。后端 OCR 迁移仍需独立 Java 21 同候选 SHA 门禁和隔离业务验收。

- [x] 全站页面矩阵 `272/276 PASS`；唯一失败为 `/platform/audit`、`/platform/failures` 在两个视口返回 404。证据 `docs/UAT_ALL_STATIC_PAGES_2026-10-24_CURRENT_CONTINUATION.json`。
- [x] 定价四页双视口 `8/8 PASS`，`blockedWrites=0`；证据 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-24_CURRENT_CONTINUATION.json`。
- [x] 全站页面矩阵主体通过；交互 `14/14 PASS`，设置 `28/28 PASS`，表格/可访问性 `14/14 PASS` 且 `unexpectedWrites=0`。证据分别为 `docs/UAT_INTERACTION_2026-10-24_CURRENT_CONTINUATION.json`、`docs/UAT_SETTINGS_MOBILE_2026-10-24_CURRENT_CONTINUATION.json`、`docs/UAT_TABLE_A11Y_ONLINE_2026-10-24_CURRENT_CONTINUATION.json`。
- [ ] 页面矩阵中 `/platform/audit` 和 `/platform/failures` 在 390/1440 两个视口均为 `404`；对应页面仍是工作树未提交 WIP，不能标记为线上完成。
- [ ] Demo 与 app 版本端点仍返回 `frontend.commit=null`、`backend=null`；上述公网结果仍未绑定可核对的 runtime SHA。
- [x] Sommelier 只读回归 `10/10 PASS`，包含库存/价格一致性、替代推荐、话术、产品问答和匿名 `401`；证据 `docs/UAT_SOMMELIER_READONLY_2026-10-24_CURRENT_CONTINUATION.json`。
- [x] 运营只读回归 `3/3 PASS`，包含 Odoo 自动恢复、关班现金门禁/可取消确认和采购状态筛选；未执行业务写入。证据 `docs/UAT_OPS_READONLY_2026-10-24_CURRENT_CONTINUATION.json`。
- [ ] AI features `13 PASS / 1 BLOCKED`：价格建议 API 上游返回 `502`；OCR 探针为 INFO（provider 可达，但探针图片没有发票字段）。证据 `docs/UAT_AI_FEATURES_VERIFY_2026-10-24_CURRENT_CONTINUATION.json`。
- [ ] AI 报表 `15/16`：唯一阻断为实时库存数据源不可用，界面正确显示 unavailable 提示；证据 `docs/UAT_AI_REPORTS_READONLY_2026-10-24_CURRENT_CONTINUATION.json`。
- [x] Odoo 价格建议/报表代理错误响应现在保留合法 `X-Correlation-ID`；本地未登录 401 检查 `2/2 PASS`，业务写入 `0`。证据 `docs/UAT_ODOO_ERROR_CORRELATION_LOCAL_2026-10-24.json`。该改动仍需部署后用有效 Odoo 会话复核真实 502 路径。
- [x] 价格建议与报表页面现在在网关错误状态显示 `Request ID`；本地 502 fixture `5/5 PASS`、页面错误 `0`、业务写入 `0`。证据 `docs/UAT_ODOO_ERROR_CORRELATION_LOCAL_2026-10-24_UI.json`。

## 2026-10-21 门店端 fixture 续验

- [x] 采购详情 AI 入口本地 fixture：`3/3 PASS`；证据 `docs/UAT_PURCHASE_AI_PLACEMENT_LOCAL_2026-10-21_CURRENT.json`。
- [x] 补货供应商恢复本地 fixture：`60/60 PASS`；证据 `docs/UAT_REPLENISHMENT_SUPPLIER_RECOVERY_LOCAL_2026-10-21_CURRENT.json`。
- [x] 盘点搜索竞态本地 fixture：`39/39 PASS`；证据 `docs/UAT_STOCKTAKE_SEARCH_RACE_LOCAL_2026-10-21_CURRENT.json`。
- [x] 三项均使用 Node 24、本地 `demo.localhost:3035` 和请求拦截，业务写入 `0`；这些结果只证明本地 UI/交互行为。
- [ ] 用户反馈 Dokploy 部署状态为“成功”，但未提供可核对的 40 位 Git SHA；公网版本端点仍返回 `frontend.commit=null`、`backend=null`，因此 `deploymentShaVerified=false`。

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
- 后端 Java 21 门禁、真实 Odoo 交易闭环和 Dokploy Source/Git 修正仍未完成。## 2026-10-21 83a6044 前端版本端点上线复核

- 纯前端候选 `83a6044f8770f8ba67b8dec7deff67dee17fe2aa` 已推送 `origin/main`；未包含 `pos-api` 源码 WIP，因此没有绕过 Java 21 门禁。
- Dokploy webhook 返回 `301 Branch Not Match`，但公网 `/api/public/version` 随后已返回 200：`frontend.service=orithos-frontend`、`frontend.builtAt=2026-10-21T07:17:57.497Z`。前端 `commit=null`（Dokploy 构建未注入 `SOURCE_COMMIT`），后端服务仍为空；完整 runtime SHA 仍未核验。
- 本轮修正的全站验收口径和前端版本端点已进入线上行为；定价 8/8、全站 272/272、AI 13 PASS/1 BLOCKED 的证据仍有效。价格建议上游 502 是唯一 AI 阻断，未产生业务写入。
- 后续需在 Dokploy Source/Git 配置中修正分支绑定，并配置构建时 `SOURCE_COMMIT`；后端版本控制器和 Java 21 同候选 SHA 门禁完成后，才能把双服务 runtime 标为 PASS。## 2026-10-21 全站复验

- 页面矩阵：`UAT_ALL_STATIC_PAGES_AFTER_06882C7_RETRY2.json`，**135 路由 × 390/1440 = 270/270 PASS**，无失败、无横向溢出、无页面错误。脚本新增连接中断有限重试，避免一次 `ERR_CONNECTION_CHANGED/CLOSED` 连锁污染整轮结果。
- 交互：`UAT_INTERACTION_AFTER_06882C7.json` **14/14 PASS**。
- 设置页：`UAT_SETTINGS_AFTER_06882C7.json` **PASS**，390/1440 双视口。
- 表格与可访问性：`UAT_TABLE_A11Y_AFTER_06882C7.json` **14/14 PASS**，`unexpectedWrites=0`；4 个非 GET 为已知只读目录查询，未产生业务写入。
- 以上为 Demo 只读验收，runtime SHA 仍未公开核验；销售、退款、收货、库存、现金等真实写入仍需隔离 Odoo 环境。
## 2026-10-21 定价批次线上复验

`9027428e7c7b499b0fb739a0463e2248f664ef1e` 的 Demo 定价只读复验最终 **8/8 PASS**（Stock List、Capped Pricing、Bulk Price Edit、Price Suggestions × 390/1440）。证据：`UAT_PRICING_PAGES_DEMO_AFTER_9027428_FINAL8.json`；非 GET 业务请求 0、页面错误 0、横向溢出 0。验收脚本已适配新的 Odoo Bulk Price Editor 响应式列表，旧中间失败报告保留为历史调试记录。

本批本地验证还包括 Price Suggestions 全视口回归、价格保存保护（Stock/Capped 各 2 次受控请求）和 Node24 typecheck/ESLint。真实价格保存仍未执行，runtime SHA 与 Dokploy 构建日志仍待核验。
## 2026-10-21 冷入口会话恢复已线上确认

`UAT_STOCKTAKE_COLD_SESSION_DEMO_CURRENT.json` 在 Demo 未预热 Odoo session 直接进入盘点页，**1/1 PASS**；页面成功恢复会话、显示库存位置，所有非 GET 请求均拦截，业务写入 0。该结果验证了 `c0368b9` 的通用 API 恢复路径在真实页面上的效果；runtime SHA 仍因 `/api/public/version` HTTP 500 未能核验。
## 2026-10-21 c0368b9 线上只读复验

虽然本机仍未配置 Dokploy webhook，Demo 自动部署后的行为已可观察到改善；运行身份仍未公开核验。

- 盘点：`UAT_STOCKTAKE_DEMO_RUNTIME_AFTER_C0368B9.json`，管理员登录、Odoo session、租户绑定、390/1440 搜索语义、AI 入口和无溢出共 **12/12 PASS**；位置仍是 `single-warehouse-fallback`，`writeEnabled=false`，无库存写入。
- 采购：`UAT_PURCHASE_AI_PLACEMENT_DEMO_CURRENT.json`，390/1440 **2/2 PASS**；顶部 AI 入口存在、浮动入口不存在、页面无 JS 错误/横向溢出，浏览器拦截所有非 GET 请求。当前未取到可点击真实采购订单，因此未验证真实详情/收货。
- 目录与助手：`UAT_DIRECTORIES_ASSISTANT_DEMO_AFTER_C0368B9.json`，实际视口 320/390/1024/1440 共 **44/44 PASS**，无模型提交和业务写入。
- `/api/public/version` 仍 HTTP 500，故以上是线上行为证据，不是精确 runtime SHA 证明。Dokploy webhook 环境变量仍缺失。
## 2026-10-21 新前端修复批次（已推送，待 Dokploy 部署）

提交 **`c0368b94f3178af1e9a2fdbfb5477871263d3ded`** 已推送 `main`，只包含前端与只读验收资产，未包含 `pos-api` WIP。

- 通用 `api` 客户端对 Odoo 只读 GET 遇 401 时，先调用 `/api/odoo/session` 恢复服务端会话，再安全重放一次；写请求不重放。
- 采购详情页改为头部 AI 入口，移除会遮挡 Receive stock 的浮动入口。
- 本地验证：Odoo 会话恢复 **2/2**，盘点搜索回归 **39/39**，采购详情 AI 布局 **390/1024/1440 共 3/3**；均无业务写入。Node24 typecheck、定向 ESLint 和脚本语法检查通过，未运行 build。
- Dokploy webhook 环境变量当前未在本机提供，故本批尚未触发部署；`/api/public/version` 当前返回 HTTP 500，不能推断运行 SHA。部署后必须重新执行线上冷入口盘点、采购详情和补货只读验收。
<!-- capability-summary:start -->
## 当前能力摘要（自动生成 · 2026-10-23）

来源：`docs/capability-status.json`。以下摘要优先于本文件后续历史记录；线上只读通过不等于部署身份已核验或真实业务验收。

| 能力 | 已实现 | 本地验证 | 线上只读验证 | 真实业务验收 | 边界 |
|---|---|---|---|---|---|
| 库存与定价界面 | 是 | 是 | 是 | 待验证 | 线上只读 8/8；证据对应 9027428，当前运行 SHA 未核验，真实价格写入待验收。 |
| 盘点与搜索保护 | 是 | 是 | 是 | 待验证 | 搜索修复在工作区；库存调整未验收，正式租户须显式绑定库存位置。 |
| GST 净毛利与 Odoo 改价 | 是 | 是 | 待验证 | 待验证 | 工作区新增；建议只读，人工确认后使用 Odoo 商品接口保存；POS 价目表生效待隔离验收。 |
| 收银退款与结果恢复 | 是 | 是 | 待验证 | 待验证 | 工作区新增只读订单确认；现金关班、实收付款、设备和完整对账待验收。 |
| 采购收货 | 是 | 是 | 待验证 | 待验证 | 本地路由夹具覆盖指定 receipt、重复收货和部分 RPC 未知结果；真实 Odoo 收货对账及原子性仍待验收。 |
| AI 助手 | 是 | 是 | 是 | 待验证 | 已核验 Demo runtime frontend/backend SHA 为 3edd72d84f514856923c0c0d50b01fe7b015e120，与本次 runner sourceCommit 匹配。完整 216 条助手问法 216 PASS / 0 BLOCKED / 0 FAIL，代表性 smoke 5/5 PASS；请求仅调用助手 API，业务写入为 0。只读功能专项仍需分别关注价格建议、实时库存报表、OCR 真实字段提取、跨店凭据和真实隔离业务写入。 |
| 两租户交付 | 是 | 是 | 是 | 待验证 | 公开注册页与 slug 可用性 GET 为 2/2 PASS；这未验证建店生命周期。Odoo 隔离库 aipos_uat 只读认证及模型探针通过，当前工作树 tenant-scope 静态审计 67 controllers / 0 findings；独立应用 runtime、收银员/店长/第二租户账号、跨租户在线越权测试和备份恢复仍未验收。Runtime SHA 未核验。 |

试点决策：**NO-GO**。阻塞：真实 Odoo 交易写入与对账仍需隔离环境验收；价格建议、实时库存报表和真实发票字段提取仍有独立验证项；第二门店/平台 operator 凭据、跨租户授权和备份恢复演练仍未完成。
<!-- capability-summary:end -->

## 2026-10-21 线上续验与部署状态

用户确认 Dokploy 最新部署成功。当前仍未取得 Dokploy checkout/runtime SHA，因此“部署成功”与“精确版本已核验”分开记录。

- 目录与助手实际视口验收：`UAT_DIRECTORIES_ASSISTANT_DEMO_2026-10-21_ACTUAL_VIEWPORTS.json`，320/390/1024/1440px 共 **44/44 PASS**；无模型提问、无业务写入。
- 盘点/补货线上只读复验：冷入口曾因 Odoo session 401 回到概览，证据 `UAT_OPERATIONS_RUNTIME_DEMO_2026-10-21_ACTUAL_VIEWPORTS.json`（1 项失败，保留为冷入口限制）；显式完成 Odoo session warmup 后，390/1440px 搜索竞态与补货 503→Retry 恢复共 **13/13 PASS**，证据 `UAT_OPERATIONS_RUNTIME_DEMO_2026-10-21_WARM_SESSION.json`。只允许 GET 与会话 refresh，业务写入 0。
- 采购弹窗 AI 悬浮入口已移到页面头部，避免遮挡 Receive stock；本地 `UAT_PURCHASE_AI_PLACEMENT_LOCAL_2026-10-21.json` **40/40 PASS**。该修复尚未推送，待下一个实质前端批次合并。
- 最新已推送代码仍为 `f7a7288fe295ce82f27a5fdbb9e88da32e937e37`；本地工作树包含外部并发 WIP，未将其混入本次部署或重置。

### 当前必须继续

1. 从 Dokploy 或运行时 `/api/public/version` 取得 checkout、构建与容器 SHA，并与发布候选逐项对应。
2. 将采购 AI 入口修复与后续实质 UI/异常恢复改动合批后再部署。
3. 在批准的隔离 Odoo 数据库完成销售、退款、收货、库存调整、现金关班和价格保存闭环；当前线上证据均为只读或浏览器拦截写入。
4. 后端 `pos-api` 改动仍须先过同候选 SHA 的远程 Java 21 `mvn -B clean verify`，目前未满足。
# Orithos POS 当前交接

## 2026-10-24 AI 助手自然问法扩展（当前工作区）

- `scripts/pilot-ai-workflow-utterances-online-uat.mjs` 当前包含 **245 条唯一问法**；本轮新增 29 条收银员口语、混合指标报表、库存/供应商目录、中文夹英文和执行型安全边界。
- `docs/AI_ASSISTANT_USER_TEST_CASES_2026-10-24.md` 已同步每类问法的预期意图、路由、槽位、不可用状态和零业务写入边界。
- 既有 Demo 证据 `216/216 PASS` 只覆盖旧目录；新增 29 条尚未在线执行，需先核对 frontend/backend runtime SHA，再以 assistant API-only 方式回归。当前不运行本地 build，不执行真实销售、采购、收货、改价、库存调整、退款或关班写入。

## 2026-10-24 AI 新增问法回归与路由修复

- 新增 29 条自然问法已在 Demo 执行，结果 **22 PASS / 0 BLOCKED / 7 FAIL**；证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_NATURAL-EXPANSION.json`。所有请求仅调用 Assistant API，业务写入为 0。
- 7 个失败已定位：定价建议 2 条、酒类推荐 2 条、交易笔数 1 条、供应商目录 1 条、AI 是否直接下单 1 条。工作区已补 `WorkflowRouteRouter`、`AssistantFastPathRouter`、`ReportAdhocRouter` 规则和对应 Java 回归断言。
- 本次 runner source 为 `3418c44ee8e3ce3d283725a2b47c6df20fa2e785`，Demo frontend/backend 为 `a5511fc689a8b4c871c0bacda15713afbd86b44f`，身份不一致。后端候选尚未推送；必须先取得同候选 SHA 的远程 Java 21 `mvn -B clean verify` 通过证据。
- 随后共享 `main` 已包含候选提交 `7f92d1b`，当前 tip 为 `a1063d3`；Dokploy 对 `a1063d3` 的部署状态为 `Error`，Demo 仍为 `a5511fc`。因此 7 个路由修复尚未获得线上验证，不能触发完整 245 条通过结论。
- 后续 `c905902`、`dc465b3` 部署也为 `Error`，详情面板没有返回构建日志。当前 runner 本地审计为 245 条、245 个唯一 ID、0 重复，其中 88 条为禁止写入的 no-route 安全用例；`node --check` 与 `git diff --check` 通过。下一步仍需先取得同候选 SHA 的 Java 21 `mvn -B clean verify` 和匹配的运行 SHA，再执行新增 29 条及完整 245 条线上回归。
- 之后 `c905902` runtime 成功承载新增 29 条问法回归，结果为 `28 PASS / 0 BLOCKED / 1 FAIL`；唯一失败是 `AI会直接下单吗` 返回 `unknown`。本地已扩展中文帮助正则并新增两条变体用例；目录现为 247 条、247 个唯一 ID、90 条 no-route。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_CURRENT-29.json`。当前 runtime/source 仍不匹配，且修复尚未通过同候选 SHA Java 21 门禁。
- 完整 247 条回归随后在 `c941a617` runtime 上为 `244 PASS / 0 BLOCKED / 3 FAIL`；失败均为中文自动下单能力问法，1 条误导航到 `/orders`。本地候选 `a63c84fb` 已扩展帮助正则和 Java 断言，但尚未通过 Java 21 同 SHA 门禁或部署验收。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_CURRENT_FULL-247.json`。
- 根因已确认：`ClassifyQueryNode` 先调用 `WorkflowRouteRouter.hasWriteIntent`，导致“AI会直接下单吗”等能力询问在帮助 fast path 前被判为写入。候选 `601ae0dd` 让匹配到 `qa` 的能力询问绕过写入守卫，并增加中英文回归断言；仍需同 SHA Java 21 门禁和部署后完整 247 条复测。
- `e8cac11e` runtime 的最新完整回归为 `241 PASS / 3 BLOCKED / 3 FAIL`；3 条商品查询为 502/超时，3 条中文能力问法仍失败。该 runtime 的 Dockerfile 使用 `mvn clean package -DskipTests`，不满足项目要求的 Java 21 `mvn -B clean verify` 门禁。候选 `601ae0dd` 仍未部署。
- 随后商品查询专项重试为 `4/4 PASS`，确认前述 3 个 BLOCKED 为暂时性网关/超时，不是稳定路由失败。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_E8CAC11_PRODUCT-RETRY.json`。

## 2026-10-21 Dokploy 成功后复验（当前）

用户确认 Dokploy 最新部署成功。本轮只读线上验收已完成：

- 定价四页（Stock List、Capped Pricing、Bulk Price Edit、Price Suggestions）在 390/1440px **8/8 PASS**，无页面错误、横向溢出或业务写入；证据 `UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19.json`。
- 全站生产路由矩阵 **136 路由 × 2 视口 = 272/272 PASS**；证据 `UAT_ALL_STATIC_PAGES_AFTER_DEPLOY_2026-10-21_HONEST.json`。`/platform/operations` 在 Demo 租户域名返回 404，已作为预期控制平面隔离单独记录；其余检查均为 HTTP 200、无页面错误或横向溢出。
- AI 功能只读矩阵 **13 PASS / 1 BLOCKED / 0 FAIL**；价格建议接口由上游返回 502，页面仍可加载并提供恢复入口；无 Odoo 价格、收货、RFQ 或其他业务写入。证据 `UAT_AI_FEATURES_VERIFY_AFTER_DEPLOY_2026-10-21.json`。
- `/api/public/version` 仍未返回前后端服务身份，故以上证明的是当前公网行为，不证明 Dokploy checkout、镜像或容器精确 SHA。候选源码 SHA 记录为 `ae13e2279f858f0ac69d09bd0a2133d5be34236c`，线上身份仍标记 `unverified-after-deploy`。
- 为避免误报，`pilot-all-static-pages-uat.mjs` 现在将租户域名上的控制平面路由作为 `expectedUnavailable` 记录；控制平面本身仍需在对应 host 单独验收。

本轮仍未完成：隔离 Odoo 的销售/退款/采购收货/库存调整/现金关班/真实价格保存对账；后端 WIP 的 Java 21 同候选 SHA `mvn -B clean verify`；Dokploy 构建日志、容器健康和 runtime SHA 核验；真实 DashScope/OCR/麦克风质量验收。整体保持 NO-GO。

## 2026-10-21 AI 写入意图复测与 fail-closed 修复（最新）

### 2026-10-21 188 条完整矩阵最新基线

- 当前目录完整执行结果为 **76 PASS / 94 BLOCKED / 18 FAIL**，证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-188CASE_CURRENT.json`。
- 94 条 BLOCKED 均返回脱敏代码 `50210`；18 条 FAIL 为未核验旧 runtime 的写入意图、定价/补货历史、发票存在性和批量改价边界。
- `sourceCommit=83a6044f8770f8ba67b8dec7deff67dee17fe2aa`、`deployment=unverified-after-deploy`；请求仅调用助手 API，`writeRequests=none: assistant API only`。
- 当前结果不能证明工作区修复已上线。后续仍须 Java 21 远程门禁、同 SHA 部署和 runtime SHA 核验，再重跑 188 条矩阵。

### 2026-10-21 通用采购/定价执行措辞扩展

- 当前工作区目录已扩展为 **194 条唯一用例**，新增 `Submit the purchase order`、`Confirm this order`、`Save these price changes`、`提交采购订单`、`确认这些订单`、`保存价格变更`。
- `WorkflowRouteRouter` 已把这些通用执行动词在模型分类前 fail-closed；配对的建议问法仍保持只读。
- 194 条目录尚未重新执行线上全量；上一轮 188 条结果仍是当前公网基线，必须在 Java 21 门禁和部署身份核验后重跑。

### 2026-10-21 AI 能力面专项续验

- Features：**13 PASS / 1 BLOCKED / 0 FAIL**；价格建议上游 HTTP 502，OCR 探针为 INFO（探针图片没有发票字段）。
- Route matrix：**9/9 PASS**；surface/auth：**11/11 PASS**；reports：**15/16**，唯一阻断为实时库存源不可用，页面显示安全提示。
- 新证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-21_CONTINUATION_CURRENT.json`、`docs/UAT_AI_ROUTE_MATRIX_ONLINE_2026-10-21_CONTINUATION_CURRENT.json`、`docs/UAT_AI_SURFACE_ONLINE_2026-10-21_CONTINUATION_CURRENT.json`、`docs/UAT_AI_REPORTS_READONLY_ONLINE_2026-10-21_CONTINUATION_CURRENT.json`。
- 以上均为线上只读检查；runtime SHA 未核验，不代表当前工作区后端已部署。

### 2026-10-21 194 条完整 AI 问法基线

- 当前 194 条目录线上结果为 **76 PASS / 100 BLOCKED / 18 FAIL**，证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-194CASE_CURRENT.json`。
- 新增 6 条通用订单/价格执行问法全部返回 `50210` BLOCKED，没有新增误路由；18 条 FAIL 与上一轮相同，仍是旧 runtime 的安全/历史边界。
- `sourceCommit=d9c562292ebab5eea66d9b3c34b4ba45006e1f4b`、`deployment=unverified-after-deploy`，业务写入为 0。
- 当前工作区目录与自动摘要源均已同步为 194 条；后端修复仍需 Java 21 同 SHA 门禁与 runtime 核验。

### 2026-10-21 版本端点复核

- `https://demo.orithos.com.au/api/public/version` 返回 HTTP 200：前端服务为 `orithos-frontend`，构建时间 `2026-10-21T08:19:13.701Z`，但 `frontend.commit=null`、`backend=null`。
- `/api/health` 返回预期未登录 `40100`，没有执行登录或业务请求。
- 本地 `HEAD` 与 `origin/main` 均为 `d9c562292ebab5eea66d9b3c34b4ba45006e1f4b`；该版本端点仍不能证明后端候选已部署。证据：`docs/UAT_RELEASE_IDENTITY_2026-10-21_CURRENT.json`。

### 2026-10-21 通用执行型问法线上专项

- 新增 6 条问法（采购订单提交/确认、价格变更保存，中英文）线上结果为 **0 PASS / 6 BLOCKED / 0 FAIL**，全部返回脱敏代码 `50210`，没有观察到旧 runtime 误路由。
- 证据：`docs/UAT_AI_WRITE_INTENT_GUARDS_ONLINE_2026-10-21-6GENERIC.json`；目录总数 `194`，`writeRequests=none: assistant API only`。
- 该结果只说明当前请求被服务阻断，不能证明源码保护已上线；仍需 Java 21 同 SHA 门禁、部署和 runtime SHA 核验。

### 2026-10-21 执行型问法专项续验

- 新增 6 条执行型问法进入当前目录：`Place the purchase order`、`Buy these items now`、`Apply these prices`、`下单采购这些商品`、`执行补货`、`执行调价`。
- Demo 只读助手 API 专项结果为 **0 PASS / 4 BLOCKED / 2 FAIL**；4 条返回脱敏代码 `50210`，2 条中文问法仍在旧 runtime 静默导航到 `/stock/replenishment` 和 `/stock/capped-pricing`。证据：`docs/UAT_AI_WRITE_INTENT_GUARDS_ONLINE_2026-10-21-6NEW.json`。
- 当前工作区的 `WorkflowRouteRouter.hasWriteIntent` 与 `ClassifyQueryNode` 已覆盖这 6 条问法；线上 runtime SHA 未核验，因此失败只证明旧部署未包含修复，不能否定当前源码。
- 本次请求仅调用 `/api/ai/assistant`，`writeRequests=none: assistant API only`；未创建采购单、未改价、未收货、未调整库存。

- 重新执行当前 182 条问法目录，Demo 结果为 **76 PASS / 90 BLOCKED / 16 FAIL**；证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_182CASE_RECHECK.json`。请求只调用助手 API，业务写入为 0，运行 SHA 仍未核验。
- 5 个写入安全问法仍被旧 runtime 误导航到补货、定价或发票扫描；其余 11 个 FAIL 是已知报表/历史问法边界。90 个 BLOCKED 均为 `50210`。
- 发现并修复源码缺口：路由层原先只阻止显式工作流覆盖，但仍会把写入问法交给模型分类。现在 `ClassifyQueryNode` 在模型调用前将 `submit/save/receive/delete/import/send/start` 等明确写入意图 fail-closed 为 guided `unknown`，新增节点回归覆盖 8 条安全问法。
- 该 `pos-api` 修复尚未推送；必须先对同一候选 SHA 通过 Java 21 远程 `mvn -B clean verify`，再部署并核对 checkout/runtime SHA。未运行本地 build。

- 同轮 AI 专项线上只读复核：features **13 PASS / 1 BLOCKED / 0 FAIL**（价格建议接口由上游返回 502，页面可加载并提供 Retry）；surface/auth **11/11**、route **9/9**、metrics **9/9**（390/1440px）、AI UI **2/2**；reports **15 PASS / 1 BLOCKED / 0 FAIL**（实时库存安全提示）。对应证据均为 `*_CURRENT_RECHECK.json`，runtime SHA 未核验。
- AI availability UAT 已修正过时的 “Open sell” 定位器，改为验证当前共享 Quick action `Products`，复测 **3/3 PASS**；证据 `docs/UAT_AI_AVAILABILITY_2026-10-21_CURRENT_RECHECK.json`。

## 2026-10-21 AI 助手全量与写入意图专项续验

- 当前工作区可执行目录为 **182 条唯一问法**。此前 174 条只读矩阵对 Demo 的结果为 **76 PASS / 87 BLOCKED / 11 FAIL**，证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-174CASE-CURRENT.json`。
- 新增 8 条写入意图问法（补货提交、价格保存、发票收货/提交/删除）的 Demo 专项为 **0 PASS / 3 BLOCKED / 5 FAIL**。5 条 FAIL 是当前 runtime 静默导航到补货、定价和 OCR 页面；3 条返回 `50210`。证据：`docs/UAT_AI_WRITE_INTENT_GUARDS_ONLINE_2026-10-21-8CASE.json`。
- 工作区已加入相应 `WorkflowRouteRouter` 保护、`WorkflowRouteRouterTest` 负向断言和 `ClassifyQueryNodeTest` 正向回归；线上结果不能归因到工作区，因为 runtime SHA 未核验。请求仅调用助手 API，业务写入为 0。
- 当前仍需 Java 21 远程 `mvn -B clean verify`、部署并核对 runtime SHA；本地不运行 build。

## 2026-10-21 第二个前端批次已推送：盘点、采购收货、补货保护（最新）

提交 **`f7a7288fe295ce82f27a5fdbb9e88da32e937e37`** 已推送main，并经 `git ls-remote` 核对。候选清单 `RELEASE_OPERATIONS_UI_BATCH_2026-10-21.json`：3个前端文件、5个脚本、12份证据、44张截图，合计66个文件。核对staged blob及候选文件树后提交，`pos-api`文件树与前一基线完全一致，既有后端工作树未纳入。

| 功能 | 本批修复与验证 | 限制 |
| --- | --- | --- |
| 盘点搜索 | 前轮修复本次纳入发布；39/39、原边界20/20、五视口5/5 | 全部fixture，无库存写入 |
| 采购确认/收货 | 请求中Escape/关闭受保护、收货数量锁定；失败保留编辑并同负载重试；成功信息保留，详情刷新失败仍显示成功且仅重读详情 | 三视口34/34；未在Demo确认采购或收货 |
| 补货供应商 | 原地Retry suppliers保留编辑数量；独立供应商/提交错误；加载时清空旧供应商列表；320px标题可换行 | 供应商专项40/40；最终综合矩阵已覆盖 |
| 补货计划 | 首次503可重试；切换覆盖天数/刷新中、刷新失败和天数不匹配时禁止从旧建议创建草稿；说明使用实际计划天数 | 四视口60/60；真实RFQ未创建 |

共 **158项本地检查通过**（39+20+5+34+60），API全由Playwright接管。采购有效修复前27项中18失败；补货供应商修复前12项中4失败；新增计划恢复保护修复前60项中16失败。发布前Node24 TypeScript、三个前端文件定向ESLint、五个脚本语法及diff检查通过；未运行本地build。

最终证据：`UAT_PURCHASE_BUSY_LOCAL_2026-10-21_RELEASE.json`、`UAT_REPLENISHMENT_PLAN_RECOVERY_LOCAL_2026-10-21_RELEASE.json`，以及前节列出的盘点证据；完整范围见 `RELEASE_OPERATIONS_UI_BATCH_2026-10-21.md`。前批真实Demo只读8/8、12/12、44/44随此批归档，但不能作为f7a7288已上线的证明。

本批Dokploy构建、容器健康及checkout/runtime SHA尚未核验；推送后正在执行Demo只读搜索与补货故障恢复观察，不执行业务写入。结果随后记录。后端同候选SHA远程Java21门禁与真实隔离业务闭环仍未完成。`../docs/功能说明.html`已同步更新；规范交接/能力文档的既有累计修改仍留工作区，独立发布说明已随代码推送，避免再次文档单独部署。

## 2026-10-21 线上新布局已观察到；盘点搜索竞态修复（最新）

本节更新前一轮4/8失败的时点结论。Demo库存定价于03:57 UTC再次只读检查已为 **8/8 PASS**，手机卡片、顶部AI入口和宽搜索框均可见；Bulk手机搜索宽342px、Price Suggestions内容宽358px。页面JS错误0、业务写入0。证据 `UAT_UI_BATCH_DEMO_RUNTIME_RECHECK_2026-10-21_1897D8B.json`，截图 `screenshots/2026-10-21-ui-batch-demo-runtime-recheck/`。03:47 UTC的4/8报告仍保留为历史观察，不能替代此次结果。用户报告Dokploy成功，完整checkout/runtime SHA仍未取得，因此只认定实际浏览器行为改善，不声称精确版本身份已核验。

- Demo盘点只读 **12/12 PASS**：登录、会话、门店绑定读取、位置来源、两视口搜索语义、顶部AI及页面布局。门店 `odooStockLocationId=null`，位置来源 `single-warehouse-fallback`，`writeEnabled=false`；wine查询无结果，本轮不包含商品添加验证。证据 `UAT_STOCKTAKE_DEMO_RUNTIME_BASELINE_2026-10-21_1897D8B.json`。无库存调整或其他业务写入。
- Demo目录与助手 **44/44 PASS**：320/390/1024/1440px三类目录深链、真实空结果、清空恢复与布局；顶部助手五条快捷问句可见、12次Tab焦点留在模态框、Escape后焦点返回入口，JS错误0。证据 `UAT_DIRECTORIES_ASSISTANT_DEMO_2026-10-21_1897D8B_CORRECTED.json`，截图 `screenshots/2026-10-21-directories-assistant-demo-corrected/`；无模型问题提交/业务写入。首轮报告因客户空状态文案定位错误、误拦只读POST目录查询及过早点击尚未完成加载的助手而失败，不作产品回归证据；修正脚本后上述44项通过。`POST /api/odoo/records`经源码确认仅为服务端白名单search_read，脚本只允许已知目录type及查询字段，其余非GET请求保持拦截。
- 新复现并修复：输入新盘点关键词后，250ms防抖期间旧商品仍可操作，旧错误仍显示，busy/expanded状态不准确。现在改词即清除旧结果/错误并撤销旧请求，结果只在当前查询完成后展开；Enter等待时不会加入旧商品。快速改回原词也能完成搜索，已有盘点草稿保持。
- 有效修复前矩阵 `UAT_STOCKTAKE_SEARCH_RACE_LOCAL_2026-10-21_BEFORE_CORRECTED.json` 为18 PASS / 15 FAIL；最初BEFORE文件含一项桌面重复文本定位误报，不作产品失败计数。修复后同矩阵33/33，扩展至390/1024/1440px含改词回退和等待Enter后 **39/39 PASS**：`UAT_STOCKTAKE_SEARCH_RACE_LOCAL_2026-10-21_FULL.json`。所有API由fixture接管，无真实写入。
- 相关回归：40项上限/清空确认/模拟保存失败恢复 **20/20 PASS**；盘点五视口 **5/5 PASS**。证据 `UAT_STOCKTAKE_COUNT_BOUNDARIES_LOCAL_2026-10-21_SEARCH_REGRESSION.json`、`UAT_ODOO_STOCKTAKE_LOCAL_2026-10-21_SEARCH_REGRESSION.json`。Node24 TypeScript、目标ESLint及三个脚本语法通过；未运行本地build。
- 新搜索修复尚在工作树，待后续实质批次统一发布；后端工作树仍未推送，继续遵守远程Java21同候选SHA门禁。原 `1897d8b` 发布范围没有此搜索修复。
- 按用户新增要求，进展同步写入实际文件 `../docs/功能说明.html`（它在v1父工作区，不在嵌套应用Git仓库）。新增“最新进展与验证”、证据链接及待办；390/1440px浏览器检查无页面错误/溢出，内部锚点及证据链接均有效。后续有新进展必须同时更新该HTML和本交接。

下一步继续其他业务页异常恢复与隔离业务闭环，合批发布新搜索修复；目录/AI本轮只读矩阵已通过。完整版本身份、真实价格写入/库存调整和后端候选门禁仍未完成，整体NO-GO。

## 2026-10-21 AI 助手 174 条问法全量复测（当前公网基线）

- 当前工作区可执行目录为 **174 条唯一只读问法**。对 `https://demo.orithos.com.au` 的全量助手 API 复测结果为 **76 PASS / 87 BLOCKED / 11 FAIL**，证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-174CASE-CURRENT.json`。
- 87 条 BLOCKED 均为 HTTP 200 / 代码 `50210`。11 条 FAIL 与前一轮相同，均为当前 Demo 运行版本的旧误路由：8 条定价历史、3 条发票存在/数量、1 条批量改价入口、2 条补货支出历史。没有业务写入。
- 当前工作区源码已覆盖这些边界，并新增补货、价格复核和酒类搭配 8 条口语问法；但 `deployment=unverified-after-deploy`，不能把线上 FAIL 归因到工作区源码，也不能把本地修复标为已部署。
- 本轮又把这 8 条新增口语加入 `ClassifyQueryNodeTest`，验证它们在 provider 不可用时也直接返回安全导航结果，不依赖分类模型；Java 测试仍未执行，需远程 Java 21 门禁验证。
- 另外补上了写入意图保护：`Submit replenishment suggestions`、`保存这些价格建议`、发票收货/提交/删除等请求不会静默导航到只读工作流；新增负向断言仍待 Java 21 门禁执行。
- 其他专项沿用最近有效证据：Features `14/14`、Routes `9/9`、Surface/Auth `11/11`、Sommelier `10/10`、Metrics `9/9`、合成发票 OCR `6/6`；Reports `15/16`（实时库存安全不可用）；AI UI 仍发现 Demo 缺少当前工作区的 `What should I restock?` 快捷入口。
- 仍未运行本地 build/Maven。所有 `pos-api` 改动必须在 Java 21 容器对同一候选 SHA 完成 `mvn -B clean verify` 后才可推送；此前 Dokploy `Branch Not Match` 未解决前不重复触发 webhook。整体试点保持 NO-GO。

## 2026-10-21 发布后续验收（当前状态，优先于下方历史记录）

前端批次 `1897d8b2f65946ddedef63f1dbe7437548851ca5` 已推送main，范围见 `RELEASE_UI_BATCH_2026-10-21.md` 和同名JSON。用户本次确认Dokploy“成功”；尚未取得该部署checkout SHA、完整构建日志及runtime SHA，不能认定Demo已运行本批。下方“尚未推送”的描述属于历史记录；后端工作树改动仍未推送。

| 范围 | 完成与本地验证 | 尚未完成 |
| --- | --- | --- |
| 库存/封顶价/批量改价 | 1280px以下卡片、搜索宽度、错误提示定位；五视口15/15，保存保护8/8，批量保存三视口各8/8 | 新布局线上生效、真实价格保存 |
| 价格建议 | 全宽布局、筛选/CSV/深链30/30 | 本批线上手机验收 |
| 商品/客户/供应商 | 深链及空状态各15/15，实际路由Suspense、表单/取消fixture通过 | 本批真实目录交互验收 |
| 盘点 | 扫码统一40项上限、清空确认、失败保留；五视口5/5，边界20/20 | 本批线上布局、真实Odoo库存调整 |
| AI UI / Vendor Connections | 顶部入口、快捷问句、焦点、语音恢复；能力10/10、焦点5/5、连接五视口5/5 | 线上交互、真实设备/模型及集成写入 |
| 后端 | 工作树保留候选改动，未纳入前端发布 | 远程Java21同候选SHA `mvn -B clean verify` 后方可推送 |

发布包含16个前端文件、12个脚本和14份通过证据；Node24 TypeScript、定向ESLint及脚本语法通过。未运行本地build。所有本地业务请求由fixture接管，不能替代真实Odoo验收。

本次真实Demo只读检查为 **4 PASS / 4 FAIL**：四个1440px项通过，四个390px项失败；全部HTTP200、加载完成，页面JS错误0、页面横向溢出0、拦截写请求0。证据 `UAT_UI_BATCH_DEMO_RUNTIME_BASELINE_2026-10-21_1897D8B.json`；截图 `screenshots/2026-10-21-ui-batch-demo-runtime-baseline/`。

截图确认：Stock List手机卡片282px；Capped Pricing/Bulk Price Edit仍显示需内部横向滚动的表格，未找到新卡片；Bulk搜索框110px；Price Suggestions内容宽278px；四页均缺新顶部AI入口且仍有浮动入口。表现与此前旧布局基线一致，与本批本地截图不符。无法仅凭截图判断部署源、缓存或流量路由的具体原因，也不能将失败归因于已确认运行的新提交。

下一步先核对成功部署完整SHA是否为上述提交，并核对Demo域名的目标服务/镜像及运行版本，再重跑库存定价、目录、盘点与AI只读验收。真实销售/退款/价格保存/库存调整仍须批准的隔离Odoo环境。整体试点维持NO-GO。本轮文档与新线上证据保留工作区，随下个实质批次归档，避免文档单独推送触发额外部署。

## 2026-10-21 盘点边界修复与五视口验收

- 浏览器在390/1024px 复现扫码绕过 40 项上限和 Clear count 立即丢弃数量；有效修复前证据 `docs/UAT_STOCKTAKE_COUNT_BOUNDARIES_LOCAL_2026-10-21_BEFORE_SYNCED.json` 为 `10 PASS / 4 FAIL`。本地 `pos-ui/app/stock/stocktake/page.tsx` 现集中保护添加上限、显示上限说明并增加清空确认。提交失败保留与重试本来已正确，本轮补足浏览器证据。
- 修复后计数边界 `20/20 PASS`，覆盖上限、清空取消/确认、503 恢复、busy 禁用及重试负载一致性。证据 `docs/UAT_STOCKTAKE_COUNT_BOUNDARIES_LOCAL_2026-10-21_AFTER.json`。全部请求由 fixture 拦截，没有 Odoo 业务写入。
- 盘点表格断点改为1280px，与库存/定价密集页面一致；五视口 `320/390/768/1024/1440` 全部通过（`5/5`），768px 卡片截图中差异和删除操作可见。新增表格内部滚动检查，避免仅检查页面溢出时漏报。证据 `docs/UAT_ODOO_STOCKTAKE_LOCAL_2026-10-21_FIVE-VIEWPORTS.json`；截图 `docs/screenshots/2026-10-21-stocktake-five-viewports/`。
- 本轮已通过 bundled Node `24.19.0` 的 TypeScript、目标 ESLint、两个脚本语法及 diff 格式检查；新证据明确 `sourceWorkingTree=true`。未运行本地 build，未修改后端，未推送/部署。现有后端 dirty batch 仍须满足 Java 21 同候选 SHA `mvn -B clean verify` 门禁，真实盘点调整仍需批准的隔离 Odoo 环境。

## 2026-10-21 保存失败与盘点交互续测

- 本地 Next dev fixture：Stock List / Capped Pricing 保存失败恢复 `8/8 PASS`，Bulk Price Edit `7/7 PASS`。Stock List 脚本首轮因隐藏卡片与桌面表格的重复标签定位失败，改为可见输入后重跑通过；没有真实业务写入。证据：`docs/UAT_STOCK_PRICING_SAVE_GUARD_LOCAL_2026-10-21_CONTINUATION_RETRY.json`、`docs/UAT_BULK_PRICE_EDIT_SAVE_GUARD_LOCAL_2026-10-21_CONTINUATION.json`。
- 盘点 390/768/1440px fixture `3/3 PASS`：位置读取重试、数量上限、取消保护、确认负载、只读门禁、页面错误及横向溢出均通过。390px 截图发现浮动 AI 遮挡盘点行操作；`/stock/stocktake` 已使用顶部 AI 入口并隐藏浮动入口，三视口验证开关与截图。证据：`docs/UAT_ODOO_STOCKTAKE_LOCAL_2026-10-21_AI-PLACEMENT.json`、`docs/screenshots/2026-10-21-stocktake-ai-placement/`。
- 盘点测试中的两个确认 `POST` 和价格测试中的 `PATCH` 全由 Playwright 拦截；真实 Odoo 写入及 Demo 运行效果未验证。本轮 shell 为 Node `22.22.2`，`npm run typecheck`、目标 ESLint、两个脚本语法和 `git diff --check` 通过；项目要求 Node 24+，发布验证仍需满足。本批本地改动尚未推送/部署，现有 `pos-api` dirty batch 仍需 Java 21 同 SHA `mvn -B clean verify` 门禁。未运行本地 build。

## 2026-10-21 AI 助手完整问法与专项续测（最新）

- 当前可执行自然语言目录为 **166 条唯一问法**。Demo 只读复测为 **72 PASS / 83 BLOCKED / 11 FAIL**；83 条 BLOCKED 均为 `50210`。11 条误路由为定价历史 5 条、发票存在/数量 3 条、批量改价 1 条、补货支出历史 2 条。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_166CASE_GOAL-CONTINUATION.json`。
- 当前工作区已在 `ReportAdhocRouter` / `WorkflowRouteRouter` 增加采购、补货历史支出和发票成本的确定性报表边界，并补充 Java 回归断言；Demo runtime SHA 未核验，因此线上误路由不能归因到当前源码。
- 同轮专项：Surface/Auth `11/11 PASS`、Sommelier `10/10 PASS`、Metrics `9/9 PASS`、Reports `15 PASS / 1 BLOCKED`（实时库存安全不可用）。Features verifier 在 OCR INFO 后因 Overview `ERR_CONNECTION_CLOSED` 中断；route matrix 登录遇到 TLS/socket 断开；OCR 预览本轮在 TLS 阶段中断。历史合成 OCR `6/6` 仍为最近有效 OCR 证据。
- 所有线上请求均为只读，业务写入 `0`。84 个 UAT 脚本通过 `node --check`；166 条 ID 唯一，`git diff --check` 通过；本地未运行 build/Maven。
- 修改 `pos-api` 的候选批次尚未推送；必须先对同一候选 SHA 通过 Java 21 `mvn -B clean verify`，再部署并核验 runtime SHA。不要重试尚未解决的 Dokploy `Branch Not Match` webhook。

## 2026-10-21 平板响应式矩阵修复（最新）

- 768/1024px fixture 截图暴露库存/定价表格在窄内容栏中横向滚动，表格 breakpoint（Tailwind `md`，768px）早于实际可用宽度。Stock List、Capped Pricing、Bulk Price Edit 的行卡片/表头改为 `xl`（1280px）切换；搜索和筛选控件断点保持原样。
- 扩展后的 UAT 首轮发现 6 个失败：均为平板视口仍出表格，或目录表单用例数断言仍写死为 4。布局调整并将断言更新为 5 视口后，全量重跑通过：库存定价 `15/15`、Price Suggestions `30/30`、目录深链 `15/15`、空结果/恢复 `15/15`、表单可见和取消 `15/15`。
- 证据：`docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-21_FULL-MATRIX-RETRY.json`、`docs/UAT_PRICE_SUGGESTIONS_RESPONSIVE_LOCAL_2026-10-21.json`、`docs/UAT_AI_ENTITY_DIRECTORIES_RESPONSIVE_LOCAL_2026-10-21.json`；截图位于三个同名 `2026-10-21-*-full-matrix*` 目录。检查确认 `pageErrors=0`、视口溢出为 0、fixture 业务写入为 0。
- Node `24.19.0` `npm run typecheck`、3 个定价组件 ESLint、三个 UAT `node --check`、`git diff --check` 均通过；未运行 Next/Docker build。目录 delete/retry 请求完全被 fixture 接管，不是 Odoo 删除验收。
- 尝试生成 Demo 四页 × 390/1440 发布前对照时，`POST /api/auth/login` 在 TLS 握手前连接断开，报告 `0/1`、`blockedWrites=0`；没有进入页面，不能归类为 UI 回归失败。证据 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_PRE-RESPONSIVE-BATCH.json`。
- 本轮对 Demo `/overview` 的无认证 TLS 连通性复核也超时（8 秒）；当前进程环境未发现 `DOKPLOY_*`、`INITIAL_ADMIN_PASSWORD` 或 `DEMO_ADMIN_PASSWORD` 变量。公网逐页验收和 Dokploy Source/Git 控制台核实需待网络/控制台访问恢复。
- 未提交、未部署；本地 fixture 不能证明真实 Odoo 写入或 Demo 运行效果。`HEAD == origin/main == 60a0394` 是代码基线，截图和 UAT 标记 `sourceWorkingTree=true`，不得将这些改动标为已发布。Dokploy 源分支/构建 SHA 仍未核验；既存 `pos-api` dirty batch 仍受 Java 21 同 SHA pre-push gate 约束。

## 2026-10-21 Vendor Connections 平板布局

- Vendor Connections 的卡片/表格断点由 768px 扩到 1280px 以下。五视口 fixture UAT `5/5 PASS`：320/390/768/1024 检查卡片字段和编辑/删除操作，1440 检查表格；`pageErrors=0`、页面溢出为 0、拦截业务写入为 0。
- 扩展 UAT 时修正了脚本仍将 390px 作为唯一手机断点的旧条件；新矩阵为 320/390/768/1024/1440。证据 `docs/UAT_VENDOR_CONNECTIONS_RESPONSIVE_LOCAL_2026-10-21_FULL-MATRIX.json`，截图 `docs/screenshots/2026-10-21-vendor-connections-full-matrix/`。
- 修改尚在本地工作树，没有部署；真实 vendor integration 写操作和 Demo 运行 SHA 尚未验证。

## 2026-10-21 AI 助手响应式与键盘交互回归

- 本地能力门禁扩至五视口 × chat on/off，`10/10 PASS`；chat availability、voice unavailable copy、五条快捷问句均符合 fixture，ASR 请求、意外写入和页面错误均为 0。证据 `docs/UAT_AI_CAPABILITY_GATES_LOCAL_2026-10-21_FULL-MATRIX.json`。
- 助手模态框焦点专项扩至 `320/390/768/1024/1440px`，`5/5 PASS`；模态语义、焦点圈定、Escape 返回触发控件、disabled composer 和 voice control 全通过。发现并修正旧测试对已移除 “Open sell” 的断言，改为当前 “Today's sales” 快捷问句。320px 截图另发现标题副文案溢出，缩短为 “AI chat is off” 并增加实际文本宽度断言，五视口均完整显示。助手请求、ASR 请求和写入均为 0。证据 `docs/UAT_AI_FOCUS_LOCAL_2026-10-21_FULL-MATRIX.json`，截图 `docs/screenshots/2026-10-21-ai-focus-full-matrix/`。
- 同轮合成语音回归与 ASR 失败恢复均 `PASS`：释放只转写一次、不自动提交；pointercancel 不转写、输入保持空、媒体轨道停止；ASR 返回错误时提供手动输入建议，无伪转写或助手提交。证据 `docs/UAT_AI_VOICE_LOCAL_2026-10-21_AFTER-HEADER-FIX.json`、`docs/UAT_AI_VOICE_FAILURE_LOCAL_2026-10-21_AFTER-HEADER-FIX.json`。真实设备和真实 provider 仍待验证。
- 以上是 fixture 行为验证，不代表真实模型调用；无生产写入。脚本语法通过，未运行 build；改动尚未部署。

## 2026-10-21 AI 助手 163 条问法与全功能只读续测

- 全量自然问法目录 **163 条**：`72 PASS / 82 BLOCKED / 9 FAIL`。所有 BLOCKED 均为 Demo 返回 `50210`；9 条误路由为定价历史 5 条、发票存在/数量 3 条、`查看批量改价` 1 条。英文/中文当前建议问法通过，历史价格建议问法仍被 Demo 运行版本路由到 `/stock/capped-pricing`。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-GOAL-CONTINUATION-2.json`。
- 其他 Demo 只读套件：availability `3/3`、features `14/14`、route `9/9`、surface/auth `11/11`、metrics `9/9`、Sommelier `10/10`、AI enabled gate PASS、OCR preview `6/6`。报表 `15/16`，唯一阻断是 AI 实时库存源；History/platform `9 PASS / 2 BLOCKED`，缺第二门店/operator 凭据。
- AI UI 在线当前为 `0/1`：Demo 页面缺少当前源码新增的快捷问句。相同工作区随后在 Next dev + fixture 下通过 `4/4`（390/1440px × chat on/off），10 个提交问句匹配、页面错误/转写请求/拦截写入均为 0。Demo SHA 未核验，公网结果仍只作为 served-runtime 基线。证据：`docs/UAT_AI_UI_ONLINE_2026-10-21_GOAL-CONTINUATION.json`、`docs/UAT_AI_QUICK_ACTIONS_LOCAL_2026-10-21_GOAL-CONTINUATION.json`。
- 源码已增加历史价格建议问法的确定性报表路由及中英文回归用例；Java 测试未运行，未本地 build。合成英语/中文 ASR 复测 `4/4 PASS`，文本省略且未提交助手；admin 写权限守卫不在生产 Demo 执行（会创建临时用户/角色）。业务写入为 0；AI 请求可能增加审计/用量记录。ASR 证据：`docs/UAT_AI_TRANSCRIPTION_ONLINE_2026-10-21_GOAL-CONTINUATION.json`。
- Node `v24.19.0` 下 UI `npm run typecheck`、AI 相关组件定向 ESLint 通过；84 个 `scripts/*.mjs` 均通过 `node --check`，问法目录 163/163 ID 唯一。
- 本地语音 fixture：正常 release/cancel/no-auto-submit 与模拟 ASR 失败安全恢复均 PASS；没有助手提交、页面错误或非预期 API 写入。证据：`docs/UAT_AI_VOICE_LOCAL_2026-10-21_GOAL-CONTINUATION.json`、`docs/UAT_AI_VOICE_FAILURE_LOCAL_2026-10-21_GOAL-CONTINUATION.json`。
- 不能推送/部署本批 `pos-api` 改动，直到 Java 21 容器对同一候选 SHA 成功执行 `mvn -B clean verify`。当前 `HEAD == origin/main == 60a0394`，工作树有大量既存修改；不触发 `Branch Not Match` webhook 重试。

## 2026-10-21 Demo 库存/定价页面视觉差异（待部署）

- 真实 Demo 库存/定价只读专项经补强断言后为 `5/8 PASS`。失败是 Stock List、Capped Pricing、Bulk Price Edit 各自 390px 检查；其余 1440px 检查和两视口 Price Suggestions 通过。全部页面 HTTP 200、无页面 JS 错误、`blockedWrites=0`。
- 截图确认 Demo 仍运行旧布局：Stock List 卡片仅 `282px`，右侧保留浮动 AI 且无顶部 AI 入口；Capped Pricing/Bulk Price Edit 为被裁切的桌面表格；Bulk Price Edit 搜索框 `110px`。本地工作区的新卡片布局与 Header 单入口已有 Node 24 fixture `6/6 PASS`，但尚未部署。
- 线上 UAT 原先因“Stock List 没有手机编辑器时按通过处理”、未检查其他两页卡片而误报 `8/8 PASS`；已修正 `pilot-pricing-pages-online-readonly-uat.mjs`，现在强制检查三页卡片字段、最低可用宽度、内部横向滚动、搜索宽度及 AI 入口位置。
- 新线上证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_LAYOUT-AUDIT.json`；截图：`docs/screenshots/2026-10-21-pricing-online-layout-audit/`。此结果替代旧 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_GOAL_RESUME.json` 的弱断言 `8/8 PASS`。
- 部署顺序：先核实 Dokploy Compose repo=`aishawn/aistore_pos`、branch=`main`、root=`/`、Compose=`docker-compose.yml`；随后将布局 UI 与强化 UAT 一起发布。发布后复跑四页双视口并核验 runtime SHA。价格编辑真实保存只在隔离 Odoo UAT 验证。

## 2026-10-21 Demo 全站 UI 回归（只读基线）

- 真实 Demo 页面矩阵：135 个生产静态路由 × 390/1440，共 `270/270 PASS`，HTTP 均为 200，无横向溢出或页面错误。证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-21_GOAL_RESUME.json`。
- 浏览器交互 `14/14 PASS`：移动导航和键盘焦点、商品/客户表单校验、CSV 预览取消、退款单只读、补货周期和报表筛选均通过；无产品、客户、销售、退款、RFQ 或关班写入。证据：`docs/UAT_INTERACTION_2026-10-21_GOAL_RESUME.json`。
- 设置页 13 页面 × 390/1440 为 `26/26 PASS`；表格语义与可访问性 `14/14 PASS`，4 个受控只读查询被拦截、`unexpectedWrites=0`。证据：`docs/UAT_SETTINGS_MOBILE_2026-10-21_GOAL_RESUME.json`、`docs/UAT_TABLE_A11Y_ONLINE_2026-10-21_GOAL_RESUME.json`。
- 四项脚本均以 Node `24.19.0` 执行。这些是公网当前版本的只读基线；Dokploy 运行 SHA 没有核验，不证明本地工作区改动已部署。未执行本地 build。

## 2026-10-21 库存/定价移动端全宽复验

- Stock List、Capped Pricing、Bulk Price Edit 的手机内容区使用卡片字段布局，减轻窄表格拥挤；库存/定价密集页隐藏收起态浮动 AI launcher，顶部 AI 按钮仍能打开/关闭助手。结账页和收银首页继续保留原浮窗入口。
- Node `24.19.0` 本地浏览器 fixture UAT：3 页 × 390/1440 共 `6/6 PASS`，无横向溢出、价格字段/数量档/筛选控件可见，桌面表格列对齐；Header AI 入口展开/关闭通过，`blockedWrites=0`。全部 API 请求由 fixture 拦截，不构成真实 Odoo 写入验收。
- 新证据：`docs/UAT_STOCK_PRICING_FULL_WIDTH_LOCAL_2026-10-21_RECHECK.json`；截图：`docs/screenshots/2026-10-21-pricing-mobile-full-width-recheck/`。Node 24 下 `tsc --noEmit`、7 个相关文件的 ESLint 通过；未运行 Next/Docker build。
- UI 改动未部署，线上运行 SHA 未核验。集中部署前仍须解决 Dokploy Source/Git `Branch Not Match`，且本次纯前端改动不能替代现有 `pos-api` 改动的 Java 21 pre-push 门禁。

## 2026-10-21 Dokploy #38 `AiProviderConfig` 编译错误复核

- 错误行是 `AiConfigController.java:78`、`SommelierController.java:65` 对 `AiProviderConfig.isValidBaseUrl(...)` 的调用；JSqlParser `Parenthesis` 仅为弃用警告，不是构建失败原因。
- 当前 `main`/`origin/main` 均为 `60a0394`。该提交的两个 controller 都显式导入 `com.orithos.modules.ai.AiProviderConfig`；同包类 `pos-api/src/main/java/com/orithos/modules/ai/AiProviderConfig.java` 为 public 且受 Git 跟踪。类在 `392c85f` 引入，Dockerfile 从 `pos-api` 构建上下文执行 `COPY src ./src`，`.dockerignore` 未排除 Java 源码。
- 因而当前仓库源码可见范围内没有可修复的缺失 import/类问题；给出的 #38 日志时间为 2026-10-19 06:52 UTC，不能证明当前 `60a0394` 仍有同一编译错误。优先在 Dokploy 核对该次 build 的实际 Git SHA、仓库根目录及后端 build context，并确认构建上下文内同时存在上述三个源文件；若 SHA 与日志来源不一致，修正 Source/Git 后以当前目标 SHA 重建。
- 用户提供了 Dokploy Compose 部署页与 webhook，并反馈页面/配置看起来正常；这作为用户报告记录，尚未独立核实该次 #38 的实际 Git SHA、仓库根目录、build context 或完整构建日志。下一步在部署页确认 #38 对应 SHA 和三个 Java 文件是否进入构建上下文，再决定是否用当前 `main` 重建；不要对同一失败上下文盲目重复触发 webhook。
- 这轮没有修改 Java 源码，也没有运行本地 Maven/Docker build；没有新的编译通过证据。不得把弃用警告当作失败根因，也不得在取得 Java 21 `mvn -B clean verify` 结果前宣称后端门禁通过。

## 2026-10-21 AI 助手问法可发现性迭代（工作区）

- 当前问法执行脚本包含 159 个唯一 case ID（数组范围静态去重及 UAT runtime metadata 均确认）。本轮另对四个快捷问句做 Demo API 只读测试，`4/4 PASS`，路由到 replenishment/capped-pricing/sommelier/invoice scan；证据 `docs/UAT_AI_QUICK_ACTION_PROMPTS_ONLINE_2026-10-21.json`。运行 SHA 未核验，结果不能归因到当前工作区代码。
- 根据助手面板截图，原欢迎语和快捷操作只举出销售、商品、库存，未展示补货、定价建议、酒类推荐和发票识别。现在欢迎语覆盖完整 AI 只读能力；七个快捷入口用问句展示：`Today's sales`、`What should I restock?`、`Which prices should I review?`、`Recommend a red wine under $30`、`Scan this supplier invoice`、`Products`、`Check stock`。
- 补货/价格/推荐/发票入口提交对应只读示例问句；AI 关闭时直接打开对应页面。移除了助手面板的 Open sell 标签，避免将纯导航误作 AI 问法。
- `pilot-ai-ui-uat.mjs` 新增七个入口可见性断言；本地能力 fixture 在 390/1440px、AI 开启/关闭共 4 种状态下通过，AI 开启时 10 次模拟请求问句精确匹配，关闭时 12 次导航正确，页面错误/转写请求/业务写入均为 0。证据：`docs/UAT_AI_QUICK_ACTIONS_LOCAL_2026-10-21.json`。该 fixture 只证明前端交互，不证明真实助手分类结果。
- `npm run typecheck`、组件定向 ESLint、3 个相关 UAT 脚本 `node --check` 与 `git diff --check` 通过；未运行本地 build。当前 UI 尚未部署到 Demo。
- 本轮按要求未运行本地 build；不涉及 `pos-api` 修改，不影响 Java 21 后端 pre-push 门禁。Demo 最新自然问法历史基线 159 条为 `70 PASS / 82 BLOCKED / 7 FAIL`，运行 SHA 未核验，不能作为当前工作区验证。

## 2026-10-21 AI 助手全功能只读复测（最新）

- Demo 自然问法矩阵共 159 条：`70 PASS / 82 BLOCKED / 7 FAIL`。82 条均返回 `50210`；7 条旧运行时误路由是 3 条定价历史、3 条发票存在/数量和 `查看批量改价`。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-AI-GOAL.json`。Demo runtime SHA 未核验。
- 截图中的 `16 Oct 2026 sales` 解析为单日 `2026-10-16`；AI 返回 `12.99`，与同 outlet、同日期 Overview 的 `12.99` 对账一致。报表专项 `15 PASS / 1 BLOCKED`，实时 AI 库存报表仍显示安全不可用提示。
- 其余线上只读专项：features `14/14`、Sommelier `10/10`、route `9/9`、surface `11/11`、availability `3/3`、metrics `9/9`、AI UI `2/2`、发票 OCR `6/6`、库存 RPC `9 PASS / 1 INFO`；enabled gate 与 voice capability fault-injection 均通过。
- History/platform `9 PASS / 2 BLOCKED`（缺第二门店用户和平台操作员凭据）。首次 ASR 因缺 fixture 为 `2 PASS / 2 BLOCKED`；生成临时英文/中文 TTS 音频后重测 `4/4 PASS`，转写内容未保存。权限配置写入守卫未对 Demo 执行，因为脚本会创建临时用户/角色。
- UAT 只读业务数据；助手调用仍可能生成审计/用量记录。新增证据未核对 runtime SHA，不能作为当前工作区源码的部署验收。未运行本地 build；`pos-api` 需先通过 Dokploy Java 21 `mvn -B clean verify`，并确认目标构建 SHA/容器健康/runtime SHA 后再判定修复上线。

## 2026-10-21 本轮 AI 路由只读复测

- 全站响应式路由 `135 x 390/1440 = 270/270 PASS`，HTTP 全部 200，无横向溢出或 pageerror；交互回归 `14/14 PASS`，无产品/客户/销售/退款/采购/现金类业务写入。证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-21_CONTINUATION.json`、`docs/UAT_INTERACTION_2026-10-21_CONTINUATION.json`。
- 设置专项 `26/26 PASS`；表格/可访问性专项 `14/14 PASS`。表格 UAT 拦截 4 个只读记录查询 `POST /api/odoo/records`，未发现意外业务写入。证据：`docs/UAT_SETTINGS_MOBILE_2026-10-21_CONTINUATION.json`、`docs/UAT_TABLE_A11Y_ONLINE_2026-10-21_CONTINUATION.json`。
- AI feature API 专项 `14 PASS / 0 FAIL / 0 BLOCKED`，含 NLQ、Sommelier、空输入保护、价格建议只读接口和匿名鉴权；发票 OCR 探针只证明 provider 可达，测试图无发票字段，真实 OCR 抽取仍未验收。证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-21_CONTINUATION.json`；业务写入为 0。
- `ai-entity-actions.ts` 将内部实体 `balance` 的用户文案改为 `customer balance`。本地 Next dev + 全 API fixture UAT `PASS`，覆盖拒绝不支持操作、只读供应商目录跳转、删除取消/重复提交保护/失败重试；所有删除请求均为被拦截的 `/api/customers/777` fixture，无公网/Odoo业务写入。证据：`docs/UAT_AI_ENTITY_INVALID_OP_LOCAL_2026-10-21_FINAL.json`；typecheck 和目标 ESLint 通过。此改动尚未部署。
- 新增本地深链预填回归：AI supplier view 和 customer/product `?q=` 都将名称带入搜索框，3/3 通过。证据：`docs/UAT_AI_ENTITY_SEARCH_PREFILL_LOCAL_2026-10-21.json`；全部 API 已拦截，无业务写入。
- 深链回归扩展到双视口：客户、供应商、商品目录在 390/1440 共 `6/6 PASS`，查询值正确、无横向溢出；AI guard 全套通过，pageErrors=0。新证据：`docs/UAT_AI_ENTITY_SEARCH_PREFILL_LOCAL_2026-10-21_RESPONSIVE.json`。
- 全站、交互、设置和表格 UAT 现分开记录 `sourceCommit` 与 `deployment`，未传入运行 SHA 时标注 `unverified-after-deploy`；页面/交互专项支持输出到新文件，避免覆盖历史证据。
- Demo AI 路由矩阵 `9/9 PASS`，证据：`docs/UAT_AI_ROUTE_MATRIX_2026-10-21_RESUMED.json`。9 个页面均 HTTP 200、助手 FAB 可见、无横向溢出和页面错误；线上配置报告 AI 与酒标识别均可用。
- 此次脚本补强了 HTTP 200 断言，避免仅记录状态码但仍给页面判 PASS。Node `v22.22.2` 实测通过；仓库指定 Node 24+，后续需用 Node 24 再验证。无业务数据写入。
- `pos-ui` `npm run typecheck` 和六个本轮改动文件的定向 ESLint 均通过；脚本 `node --check` 与 `git diff --check` 通过。没有运行 Next、Docker 或 Maven build。
- 证据 `sourceCommit=60a0394`，但 `deployment=unverified-after-deploy`；只代表公网当前运行版本，不证明该源码或工作区其他改动已部署。
- Dokploy 构建失败日志 #38 中 `AiProviderConfig` import 已由 `ea8f1b6` 修复，当前 `HEAD` 与 `origin/main` 为 `60a0394`。本轮未运行 Maven/Next/Docker build，未触发 webhook；后端累积改动仍须以 Dokploy Java 21 `mvn -B clean verify` 通过后方可推送/部署。

## 2026-10-21 AI 助手 106 条问法与只读复测

### 2026-10-24 当前工作区继续复测

- 129 条当前目录已对 Demo 做只读执行：`65 PASS / 59 BLOCKED / 5 FAIL`，证据 `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_129CASE_CURRENT.json`。新增供应商、采购订单和库存盘点问法均被旧 runtime `50210` 阻塞；3 条混合注入问法安全通过；8 条失败仍为旧 runtime 报表边界误路由。无业务写入，运行身份未核验。

- 当前本地助手目录为 **126 条**。新增只读导航：供应商 `/suppliers/odoo`、采购订单 `/orders`、库存盘点 `/stocktake`；同时覆盖 create/edit/delete/merge/import/receive/return/transfer/adjust/confirm/save 的负向边界。尚未部署，线上不得标记为 PASS。

- 113 条助手自然问法已对 `https://demo.orithos.com.au` 完成只读执行：`62 PASS / 46 BLOCKED / 5 FAIL`，证据：`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_113CASE_CURRENT.json`。
- 新增 `Can you find Shiraz?`、`Please look for VB Cans`、`帮我查一下 Shiraz` 均未失败，但在旧 runtime 返回 `50210` 而标记为 BLOCKED；5 条 FAIL 仍是旧 runtime 的定价历史/发票存在性边界误路由。当前源码已有守卫，但运行 SHA 未核验，不能标记为 post-deploy。
- 新增客户查询后的 117 条矩阵为 `62 PASS / 50 BLOCKED / 5 FAIL`；4 条客户问法全部是旧 runtime `50210` BLOCKED，未增加 FAIL。证据：`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_117CASE_CURRENT.json`。

- 当前工作区问法目录从 92 条扩展到 109 条，新增采购/低库存、价格复核、酒类搭配、发票拍照、采购历史报表边界和库存自然语序；Java 路由、单测、线上只读脚本及话术目录已同步。
- Demo 106 条只读矩阵为 **62 PASS / 40 BLOCKED / 3 FAIL**，证据：`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_106CASE_LOCAL-SOURCE-CATALOG.json`。109 条复测为 **62 PASS / 42 BLOCKED / 4 FAIL**，最终 111 条复测为 **62 PASS / 43 BLOCKED / 5 FAIL**；新增失败为旧 runtime 将中英文 pricing report 导航到 `/stock/capped-pricing`，其余 3 条为发票报表误导航到 OCR。当前源码已有 `report_adhoc` 快捷路径、采购历史报表守卫和回归单测。业务写入为 0。最终证据：`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_111CASE_LOCAL-SOURCE-CATALOG.json`。
- 同轮旁路只读：availability `3/3 PASS`、features `14/14 PASS`、reports `13/14`（唯一阻断为实时库存数据源不可用）。证据分别为 `UAT_AI_AVAILABILITY_2026-10-21_CURRENT_RECHECK.json`、`UAT_AI_FEATURES_VERIFY_2026-10-21_CURRENT_RECHECK.json`、`UAT_AI_REPORTS_READONLY_ONLINE_2026-10-21_CURRENT_RECHECK.json`。
- 21 个 `pilot-ai-*.mjs` 通过 `node --check`，敏感信息扫描为 0，未运行本地 build。`pos-api` 改动尚未通过 Dokploy Java 21 `mvn -B clean verify`，未推送/部署；公网 runtime SHA 仍未核验。

## 2026-10-24 AI 助手 80 条问法扩展复测

- 新增商品搜索省略说法、库存 `still/any left`、销售收入变体、补货/改价口语、侍酒搭配、账单读取和帮助问法；对应 Java 路由单测、线上脚本和话术目录已同步。
- Demo 只读矩阵执行为 **54 PASS / 25 BLOCKED / 1 FAIL**（80 条），证据：`UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_EXPANDED.json`。唯一 FAIL 是旧 runtime 将 `发票还有吗？` 误导航到 `/invoices/scan`；当前工作区已加入报表上下文防护和单测。28 个阻塞全部为旧 runtime 的 `HTTP 200 / code 50210`，没有业务写入；不能把它们当作当前源码已部署。
- `node --check` 全部 21 个 AI UAT 脚本通过，`git diff --check` 通过；按 owner 要求未运行本地 build。`pos-api` 改动仍需 Dokploy Java 21 `mvn -B clean verify` 通过后才能推送。

## 2026-10-24 AI 助手问法扩展与 Demo 只读回归

- 工作区新增销售、库存、补货、侍酒和供应商账单的自然口语路由；测试目录、线上 utterance 脚本和误路由边界已同步。改动尚未提交/部署，不能宣称线上已具备这些新增别名。
- Demo 最新扩展问法矩阵：`51 PASS / 16 BLOCKED / 0 FAIL`（67 条）；阻塞均为旧运行版本对新增问法返回 `50210`。旁路 surface `11/11`、UI `2/2`、route `9/9`、availability `3/3`、admin guard `15/15`、metrics `9/9` 通过。
- 报表 `13 PASS / 1 BLOCKED`：库存报表仍返回安全 unavailable 提示；features `14 PASS / 1 BLOCKED`：发票 OCR 探针收到非 JSON HTTP 502。两项均不是功能断言 FAIL。
- 运行身份仍未核验（`deploymentShaVerified=false`）；Dokploy 之前的 `Branch Not Match` 阻断没有改变。继续停止重复 webhook，先修 Source/Git 的 `main` 分支绑定，再以含 Java 21 门禁的提交部署并重跑完整 P0。
- 独立只读 Odoo stock RPC 为 `7 PASS / 1 INFO`，本地 DashScope 探针为 `1 PASS`；两者不能证明 Demo 运行容器的 AI graph/OCR 配置一致，库存和 OCR 阻塞仍需目标 runtime 日志与 SHA 归因。

## 2026-10-23 AI UI 识别结果竞态复测

- UI UAT 现在等待识别请求返回后的结果列表首项可见，修复网络延迟导致的空列表误报。
- 最新 `UAT_AI_UI_2026-10-23_RECHECK.json`：390/1440 `2/2 PASS`，识别结果各 `48` 条、推荐各 `3` 张、页面错误 `0`。
- 该改动只调整测试等待条件；运行版本身份仍未核验，不能把它当作最新代码的 post-deploy 证明。

## 2026-10-21 Dokploy 部署尝试（`4aacb74`）

- 在完成本轮 AI/UI 回归并推送 `4aacb74` 后，Compose webhook 返回 `HTTP 301 {"message":"Branch Not Match"}`，没有创建构建任务。
- 本次结果已记录在 `UAT_DEPLOYMENT_2026-10-21_4AACB74_BRANCH-BLOCK.json`。按照规则停止继续重试；必须先在 Dokploy Source/Git 设置确认仓库 `aishawn/aistore_pos`、分支 `main`、仓库根目录 `/` 和 `docker-compose.yml`。
- 因没有构建日志、容器 SHA 或运行 commit，本轮线上回归只能作为公网旧运行版本基线，不能标记为 `4aacb74` 的 post-deploy。

## 2026-10-21 Java 21 后端门禁

- 针对当前包含 `9c437c7` AI 路由改动的工作树，执行 `mvn -B clean verify`（Java 21）成功：**247 tests, 0 failures, 0 errors**。
- 这次只验证后端 Maven，不运行本地 Next/Docker build；JSqlParser `Parenthesis` 弃用提示仍是非阻断 warning。

## 2026-10-22 AI stock report 诊断结论

- 最新只读报表复测为 `13 PASS / 1 BLOCKED`，唯一阻断是 AI stock report 的安全 unavailable 响应；运行 SHA 仍未核验。
- 独立 Odoo RPC 诊断在无 warehouse、company 和唯一 warehouse 三种上下文均能读取库存字段（`7 PASS / 1 INFO`），所以不能仅凭当前证据修改租户隔离或放宽字段权限。
- 需要先让 Dokploy 使用正确 `main` 分支完成构建，并回读 backend 日志/运行 SHA，再定位 AI graph 与 Odoo service account 的实际异常。

## 2026-10-21 公网只读复测（运行身份未核验）

- 当前公网基线通过：全站实际 `135` 路由 × `390/1440`，`270/270 PASS`；AI features `14/14`、AI reports（较早运行版本）`14/14`、Sommelier `10/10`、AI UI `2/2`、设置 `28/28`、价格/库存 `8/8`、表格/表单 `14/14`。
- 最新 2026-10-22 报表复测为 `13 PASS / 1 BLOCKED`，唯一阻断是 AI stock report；独立 Odoo stock RPC 为 `7 PASS / 1 INFO`，不应把 warehouse 缺失直接当作根因。
- 本轮浏览器/API 探针均为只读，意外业务写入 `0`。证据文件均为 `docs/*_2026-10-21_CURRENT.json`。
- AI natural-language workflow `49/49 PASS`、AI config admin guard `15/15 PASS`、availability `3/3 PASS`、surface/auth guard `11/11 PASS`；metrics 为 `9 PASS / 2 BLOCKED`，仅因缺少 platform-operator 跨店凭据未完成。
- 这些结果没有 Dokploy 运行 SHA 证据，只能作为当前公网运行版本基线；不能证明 `c078550` 或其之前本地代码已部署。真实酒标/发票图片、麦克风、隔离环境销售/采购/收货/关班仍未验收。
- `pilot-settings-mobile-uat.mjs` 已支持 `PILOT_UAT_OUTPUT_PATH`，设置专项本次写入独立文件，避免覆盖历史证据。

## 2026-10-20 Dokploy #38 编译错误最终复核

- 失败原因不是 `SqlAst.java` 的 `Parenthesis` 弃用警告；真正失败是旧源码快照中 `AiConfigController` 和 `SommelierController` 调用了 `AiProviderConfig.isValidBaseUrl(...)`，但缺少 `import com.orithos.modules.ai.AiProviderConfig;`。
- 代码验证提交为 `3f049db`，当前 `main` 已包含该提交并更新到文档提交 `5411800`。`pos-api/src/main/java/com/orithos/modules/ai/AiProviderConfig.java` 已被 Git 跟踪，两个控制器均包含显式 import；在当前工作树用 Java 21 执行 `mvn -B clean verify` 已通过 **247 tests, 0 failures, 0 errors**。剩余 JSqlParser `Parenthesis` 仅为非阻断 deprecated warning。
- #38 因此应视为旧提交或错误 Compose 分支/构建上下文，不需要用业务代码绕过。Dokploy 必须确认仓库 `aishawn/aistore_pos`、分支 `main`、根目录 `/`、Compose `docker-compose.yml`，并从 `3f049db` 或更晚提交重新构建。
- 部署验收仍未完成：需要从 Dokploy 回读 backend/frontend 完整构建日志、最终运行 commit/SHA、容器健康状态和完成时间；只有运行 SHA 与目标提交一致后，才可把公网 UAT 标记为 post-deploy。此前 `HTTP 301 Branch Not Match` 时不要重复触发 webhook。

## 2026-10-20 Owner 试用优先级

- Owner 希望尽快开始试用；默认线上只读验收目标为 `https://demo.orithos.com.au`，登录账号 `admin`。密码和 Dokploy webhook 只在 owner 提供的安全渠道/本地忽略环境变量中使用，不写入 Git、交接文档、UAT JSON 或命令输出；API keys 从已配置环境变量读取且不回显。
- Owner 明确要求不运行本地 build。前端可做 typecheck、目标 lint 和脚本语法检查；应用构建及 Java 21 Maven 全量验证走 Dokploy，并以日志中的目标 SHA 为准。
- 试用推进顺序：先确认 Dokploy Compose 的仓库、`main` 分支、根目录与 `docker-compose.yml` 绑定，再部署目标提交；若 webhook 返回 `Branch Not Match`，停止重试并先修 Source/Git 配置。部署后核对运行 SHA，再做 demo 只读 smoke/UAT；任何真实业务写入仍须走已批准的隔离环境。

## 2026-10-20 AI 助手问法扩展（待部署）

- 确定性路由新增显式日期销售问法、带名称商品搜索和商品库存问法，避免 provider 暂不可用时把明确请求送入分类模型；商品名称会保留为 query。
- 中文商品搜索捕获组已修正；自定义中英文比较问法在日期快捷路由前保持 `report_adhoc` 引导拒答。
- Java 21 全量门禁：`mvn -B clean verify`，`238 tests, 0 failures, 0 errors`；仅有既存 JSqlParser 弃用警告。
- 同步更新 `AI_ASSISTANT_TEST_PLAN.md` 与 `AI_ASSISTANT_UTTERANCE_CATALOG.md`。本批次尚未进入 Dokploy，线上 AI 回归需在分支绑定修复后执行。
- 2026-10-20 20:39（UTC+8）以 `after=055468b` 触发 Compose webhook，完整响应仍为 `HTTP 301 {"message":"Branch Not Match"}`，没有创建构建任务；当前线上仍不能标记为该批次。

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

## 2026-10-20 Dokploy #38 编译错误复核（当前 `main` `993b38a`）

- #38 日志中的两个 `cannot find symbol: variable AiProviderConfig` 来自 `AiConfigController` 和 `SommelierController` 的旧源码快照；当前 Git 树已包含 `pos-api/src/main/java/com/orithos/modules/ai/AiProviderConfig.java`，且两个控制器均有显式 `import com.orithos.modules.ai.AiProviderConfig;`。修复提交 `ea8f1b6` 已是当前 `main` 的祖先。
- 使用 JDK `21.0.12.1` 执行 `pos-api` 的 `mvn -B clean verify`：`238 tests, 0 failures, 0 errors`，构建成功。`SqlAst`/`SqlGuard` 的 JSqlParser `Parenthesis` deprecated 仅为 warning，不是失败原因。
- 因此本次错误不能通过修改当前源码复现；优先检查 Dokploy Compose 的仓库、分支和构建上下文是否仍指向旧快照或错误分支。Source/Git 应为 repo=`aishawn/aistore_pos`、branch=`main`、root=`/`、Compose=`docker-compose.yml`。
- 在 Dokploy 回读新的 frontend/backend 完整构建日志、健康状态、容器 SHA 和运行 commit 前，线上发布仍保持 **NO-GO**；不要把 HTTP 200 或 webhook 响应单独作为构建成功证据。

## 2026-10-20 Sell register 刷新竞态批次（工作区，待部署）

- `OdooRegisterPage` 的 session/bootstrap 加载增加 request revision；旧响应不能再清掉新请求的 loading/refreshing 状态、覆盖新错误，或在员工已切换 register 后把选择改回默认 register。刷新时若当前支付方式仍可用，也会保留它；不可用才回退到新 register 的第一种方式。
- 刷新时优先保留当前 register；无 Odoo 会话时清理 register/payment 状态，避免注销后残留旧配置。销售、报价、付款和 Odoo 写入路径未改动。
- 本地验证：`pos-ui` `npm run typecheck`、`npx eslint src/components/OdooRegisterPage.tsx`、`git diff --check`；公网 POS help/keyboard 只读回归 `2/2 PASS`。未运行 Next/Docker build。
- 同一轮公网只读回归：AI UI `2/2`、未接入页面 `18/18`、表格/表单 `16/16`，无意外业务写入；这些结果是当前公网行为基线，不能证明本轮源码已部署。
- 发布前需推送本批次后正常部署，回读 Dokploy frontend/backend 构建日志、健康状态和运行 SHA，再在 demo Sell 页面执行只读 register 切换/刷新/断网恢复验证；整体发布继续 **NO-GO**。

## 2026-10-20 `bd0981f` 推送与公网 AI 复测

- `bd0981f` 已推送到 `origin/main`，包含 Sell register/payment 刷新竞态修复及功能清单、能力状态、交接文档更新。
- 对 Compose webhook 的单次触发仍返回 `HTTP 301 Branch Not Match`，没有创建构建任务；因此本批次没有可核验的 Dokploy frontend/backend 镜像或 runtime SHA。
- 当前公网只读复测（运行身份未核验）：AI UI `2/2 PASS`、AI features `14/14 PASS`、自然语言工作流 `28/28 PASS`、未接入边界 `18/18 PASS`、表格/表单 `16/16 PASS`、POS help/keyboard `2/2 PASS`。
- AI 报表专项为 `12 PASS / 1 BLOCKED`：命名商品库存问法路由正确，但线上 Odoo stock report 数据源暂时不可用，返回安全的“暂时不可用”提示；其余日期解析、Overview 对账、Odoo source path 均通过。证据文件已由脚本生成，不能标为本轮 post-deploy。

## 2026-10-20 设置只读页刷新与表格语义批次（工作区，待部署）

- Tax Rates 页新增成功加载后的页面级 Refresh；Payment Methods、Registers & Outlets 的桌面表格补齐稳定 `aria-label`，移动布局和只读边界不变。
- 本地 `pos-ui` typecheck、四个目标页面 ESLint、`git diff --check` 通过；公网未接入边界 `18/18 PASS`、表格/表单 `14/14 PASS`，无意外写入。
- 这些改动与 `bd0981f` 同一待部署批次；Dokploy 仍因 `HTTP 301 Branch Not Match` 未创建构建任务。部署后重跑设置页、全站矩阵和表格专项，并记录 runtime SHA。

## 2026-10-20 #38 编译错误复核与 AI 报表快捷路由批次

- Dokploy #38 日志中的 `AiProviderConfig` 两个 `cannot find symbol` 不能在当前源码复现：`AiProviderConfig.java` 已被 Git 跟踪，`AiConfigController` 与 `SommelierController` 均有显式 import 和调用。
- 使用 `C:\Users\ai_sh\.jdks\jdk-21.0.12.1+1` 执行 `pos-api` 的 `mvn -B clean verify`：`243 tests, 0 failures, 0 errors`，仅有 JSqlParser `Parenthesis` deprecated warnings。该日志应继续按 Dokploy 旧源码快照或错误分支绑定处理。
- 当前批次补齐英文/中文常见销售额和剩余库存问法的确定性路由，并增加 Odoo 库存查询的绑定公司/仓库、空结果、RPC 错误只读测试；capability UAT 增加 AI 开关关闭和加载中断言。改动已通过同一 Java 21 门禁。
- 本地未运行 Next/Docker build。工作区已有大量 UAT JSON/截图生成物，未纳入提交。
- 当前发布仍为 **NO-GO**：Dokploy 必须先确认 repo=`aishawn/aistore_pos`、branch=`main`、root=`/`、compose=`docker-compose.yml`，然后回读 frontend/backend 完整构建日志、健康状态、运行 SHA；只有运行 SHA 与本批次提交一致时，才重跑并标记 post-deploy UAT。

## 2026-10-20 库存问法与报表诊断批次（待部署）

- `AssistantFastPathRouter` 增加 `Have we got ... in the shop?`、`店里还有 ... 吗`、`帮我查下 ... 还剩几件` 等库存问法，并保持商品名进入 `query` 槽位。
- 报表只读 UAT 增加门店 Odoo 商品目录库存字段对照，用于区分 AI 报表链路不可用和 Odoo 库存字段本身不可读；请求仍为只读查询。
- Sell AI 欢迎语改为与当前可用的销售/库存查询能力一致，不再暗示未接入的客户创建功能。
- Java 21 `mvn -B clean verify`：`243 tests, 0 failures, 0 errors`；目标 ESLint、报表 UAT `node --check`、`git diff --check` 通过。
- `pos-ui npm run typecheck` 首次被既有 `.next/dev/types/routes.d.ts` 语法损坏阻断（TS1109/TS1160）；修正生成文件残片后重新通过。未运行 Next/Docker build。
- 尚未触发 Dokploy：此前 Compose webhook 的 `HTTP 301 Branch Not Match` 仍未确认修复。部署前先修正 Source/Git 分支绑定，部署后核对运行 SHA，再执行 AI report/UI、全站和设置回归。

## 2026-10-21 公网 AI 报表只读复测

- 使用当前测试脚本完成 demo 只读回归：`13/14 PASS`、`1 BLOCKED`、`0 failures`。证据：`docs/UAT_AI_REPORTS_READONLY_ONLINE_4E056EA.json`。
- 门店 Odoo 商品目录读取 `VB Cans` 的库存字段返回 `HTTP 200`，证明产品库存字段可读；AI stock report 仍返回固定的“Live Odoo reporting is temporarily unavailable”提示，因此阻断范围是 AI stock report 数据源/路径。
- 销售报表的今日业务日、7/30 天、英文/中文日期解析、14 Oct 与 Overview 对账、逐日趋势对账和 Odoo source path 全部通过。
- 该结果是公网当前运行版本的只读证据，runtime SHA 尚未从 Dokploy 控制台核验，不能标记为 `post-deploy`。

## 2026-10-21 AI stock report 字段降级修复（待部署）

- `OdooReportQueryService` 的库存查询现在先读取 `free_qty` 与 `qty_available`；若服务账号无权读取 `free_qty`，会在同一公司/仓库上下文下只读降级到 `qty_available`，不放宽公司域、不执行写方法。
- 新增字段权限失败后的降级单测；Java 21 `mvn -B clean verify`：`245 tests, 0 failures, 0 errors`。
- 该修复尚未进入 Dokploy 镜像。分支绑定修复后部署当前提交，再重跑 `UAT_AI_REPORTS_READONLY`；只有 stock report 从 `BLOCKED` 变为 `PASS` 且运行 SHA 匹配时，才确认线上修复。

## 2026-10-20 AI 助手问法与视觉模型配置继续迭代（待部署）

- Demo 只读问法回归发现 `帮我看看哪些商品需要调价` 被旧运行版本误判为 `report_stock`；`AssistantFastPathRouter` 已收紧中文 `看看...` 库存表达，要求明确的库存/剩余数量信号，并新增调价、补货不误截获的单测。
- Demo 发票 OCR 探针返回 HTTP 200、业务码 `50213`，诊断证据已补充 HTTP 状态、Content-Type 和业务码，避免把网关/非 JSON 响应误报为模型故障。当前线上结果指向 provider/model 配置问题。
- 本地 provider 对比：配置凭据下 `qwen3.8-flash` native multimodal 请求返回 200；`qwen-vl-plus` 返回 InvalidParameter。`application.yml` 现默认视觉模型跟随 `AI_DASHSCOPE_MODEL`，未设置时使用 `qwen3.8-flash`，仍可用 `AI_VISION_MODEL` 显式覆盖。
- Java 21 `mvn -B clean verify` 通过 **246 tests, 0 failures, 0 errors**；未运行前端 build。上述改动尚未部署，不能把 Demo 旧运行版本的结果当成修复后验收。

## 2026-10-21 库存错误提示与问法回归修复

- 库存数据源不可用、未配置或门店未绑定时，AI 响应现在提供库存列表/重试指引，不再使用容易误解的通用销售报表提示。
- 新增库存问法回归发现并修复了宽泛正则抢先捕获命令前缀的问题；`帮我看看 VB Cans 还剩多少` 现在只把 `VB Cans` 传入查询槽位。
- Java 21 `mvn -B clean verify`：`246 tests, 0 failures, 0 errors`；JSqlParser 弃用警告仍仅为 warning。
- 改动已完成本地门禁，尚未部署；待 Dokploy 分支绑定修正后再验证真实线上库存结果和错误提示。

## 2026-10-21 公网 AI features 只读复测

- `scripts/pilot-ai-features-verify-uat.mjs` 完成 `14/14 PASS`，没有失败或业务写入。证据：`docs/UAT_AI_FEATURES_VERIFY_ONLINE_DF015FD.json`。
- 发票 OCR 探针返回 `HTTP 200`、业务码 `50212`，表示 provider 可达但探针图片没有发票字段；该结果不等同于真实发票字段提取验收。
- `sourceCommit` 记录为当前测试脚本提交，Dokploy runtime SHA 仍未核对，因此结果属于公网旧运行基线，不标记为 `post-deploy`。

## 2026-10-21 DashScope 多模态默认模型配置

- `spring.ai.dashscope.chat.options.vision-model` 现在默认跟随 `AI_DASHSCOPE_MODEL`，仍可通过 `AI_VISION_MODEL` 单独覆盖；这与 `qwen3.8-flash` 的多模态路径配置一致。
- Java 21 `mvn -B clean verify`：`246 tests, 0 failures, 0 errors`，仅有既有 JSqlParser 弃用警告。
- 配置尚未进入 Dokploy 镜像；部署后需用已配置的 DashScope key 验证酒标识别/发票 OCR 的真实多模态请求路径，并核对运行 SHA。

## 2026-10-21 Dokploy #38 编译日志复核（当前 `main` `01c14fb`）

- Dokploy #38 报告 `AiConfigController` 与 `SommelierController` 找不到 `AiProviderConfig`。当前 `main` 已包含 `AiProviderConfig.java` 及两个控制器的显式 import；该错误不能在当前源码复现，应按旧源码快照、错误分支或不完整构建上下文排查。
- 使用 `C:\Users\ai_sh\.jdks\jdk-21.0.12.1+1` 执行 `pos-api` 的 `mvn -B clean verify`：`247 tests, 0 failures, 0 errors`，构建成功。JSqlParser `Parenthesis` deprecated 仍仅为 warning。
- `HEAD == origin/main == 01c14fb`。下一次 Dokploy 部署必须确认 Source/Git 为 repo=`aishawn/aistore_pos`、branch=`main`、root=`/`、compose=`docker-compose.yml`，并在日志中确认 checkout/build commit 与 `01c14fb` 一致。
- 在读取完整 frontend/backend 构建日志、健康状态、镜像 SHA 和运行 commit 前，线上仍保持 **NO-GO**；不要把这次 #38 的失败日志归因于当前源码，也不要仅凭 webhook HTTP 200 判定部署成功。

## 2026-10-21 Dokploy #38 日志补充（AiProviderConfig）

- 用户提供的 backend builder 日志仍显示 `AiConfigController.java:78` 与 `SommelierController.java:65` 报 `cannot find symbol variable AiProviderConfig`；`SqlAst.Parenthesis` 只是弃用 warning，不是失败原因。
- 当前 `main` 已同时包含 `pos-api/src/main/java/com/orithos/modules/ai/AiProviderConfig.java`、两个控制器的显式 import，以及对应测试；`pos-api/Dockerfile` 的 `COPY src ./src` 也不会排除该文件。因此该日志对应的 checkout/构建上下文不是当前完整 `main`，或命中了旧 source layer。
- 处理顺序：在 Dokploy Source/Git 中确认 repo=`aishawn/aistore_pos`、branch=`main`、root=`/`、compose=`docker-compose.yml`；重新同步后检查构建日志中的 checkout SHA，再确认 `AiProviderConfig.java` 已进入 backend build context。不得通过在控制器内复制类逻辑来规避源代码同步问题。
- 只有 `mvn -B clean verify` 绿色、frontend/backend 镜像构建完成、容器健康且 runtime SHA 与目标提交一致后，才可把部署标记为通过；在此之前保持 **NO-GO**。
- 本次复核时 `HEAD == origin/main == a59a689`；文档中较早的 `01c14fb`、`435ec47` 仅代表对应历史复核时点，不是当前部署目标。

## 2026-10-21 只读回归与工作流路由增量（文档提交 `435ec47`）

- 公网只读：设置 `28/28 PASS`、表格/表单 `14/14 PASS`、未接入页面诚实边界 `16/16 PASS`，无意外业务写入；证据文件以 `UAT_*_2026-10-21_CURRENT.json` 保存。
- 自然语言工作流为 `51 PASS / 8 BLOCKED / 0 FAIL`。8 项阻断均返回 `HTTP 200 / code 50210`，集中在补货、酒款配对、账单中文问法、直接库存问法和销售口语问法。当前工作区的 `AssistantFastPathRouter`、`WorkflowRouteRouter` 和对应 UAT 已覆盖这些表达，但公网旧镜像尚未包含它们。
- `pos-ui npm run typecheck`、工作流脚本 `node --check`、`git diff --check` 通过；没有运行 Next/Docker build。工作流证据副本为 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_CONTINUATION3.json`。
- 全站只读矩阵复核 `135 routes x 390/1440 = 270/270 PASS`，无页面错误或横向溢出；证据为 `docs/UAT_ALL_STATIC_PAGES_2026-10-21_CURRENT_RECHECK.json`。这仍是公网旧运行版本行为，不是最新源码的 post-deploy 证明。
- 真实只读交互复核 `14/14 PASS`，运营安全只读 `3/3 PASS`；移动导航/焦点、商品搜索编辑、表单/CSV 预览、客户/历史销售、补货/报表筛选、现金关班门禁和采购状态筛选均通过。证据为 `docs/UAT_INTERACTION_2026-10-21_CURRENT.json`、`docs/UAT_OPS_READONLY_2026-10-21_CURRENT.json`；无业务写入，POS session `00004` 保持 opened。
- API/AI 前端现在将普通 API、发票 OCR、语音转写和酒标识别的非 JSON `502/503/504` 映射为可操作的暂时不可用提示，避免把上游 HTML 网关页直接显示为技术错误；发票页额外提供 Odoo Purchases 继续处理入口。`pos-ui` typecheck 和目标 ESLint 通过。该修复尚未部署，真实 provider/网关问题仍需线上日志确认。
- 当前 `HEAD/origin/main` 为 `435ec47`，但该提交只包含交接文档；后端路由改动仍在工作区，未推送，原因是 Dokploy webhook 仍返回 `HTTP 301 Branch Not Match`，无法满足 Java 21 远程门禁。不得把这些改动称为已部署。

## 2026-10-24 当前工作流回归复核

- 以公网 Demo 只读执行 `scripts/pilot-ai-workflow-utterances-online-uat.mjs`：`51 PASS / 16 BLOCKED / 0 FAIL`，证据副本为 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_CURRENT_RECHECK.json`。
- 16 个阻断均为旧运行版本返回 `HTTP 200 / code 50210`，集中在新增的补货、调价、侍酒、账单、库存口语、销售口语和能力说明问法；没有发现 `FAIL`，`writeRequests` 仅为 assistant API，无销售、库存、采购或现金写入。
- 工作区的 `AssistantFastPathRouter`、`WorkflowRouteRouter` 与测试已覆盖这批新增问法，但后端改动仍未取得 Dokploy Java 21 远程门禁，不能把公网结果标为 post-deploy。
- 本轮本地检查：`pos-ui npm run typecheck`、`npx eslint src/lib/api.ts --no-cache`、`node --check scripts/pilot-ai-workflow-utterances-online-uat.mjs`、`git diff --check` 均通过；没有运行 Next、Docker 或 Maven build。

## 2026-10-24 全站只读页面复核

- 公网 Demo 页面矩阵完成 `135 routes x 390/1440 = 270/270 PASS`，无页面失败；独立证据为 `docs/UAT_ALL_STATIC_PAGES_2026-10-24_CURRENT_RECHECK.json`。
- 该矩阵只证明当前公网旧运行版本的页面可达性、无页面级错误和视口检查通过；它不证明工作区未部署的后端路由或前端错误提示已生效，且证据中的 `sourceCommit` 未绑定到当前源码。

## 2026-10-24 Odoo 网关错误体验改进（待部署）

- `pos-ui/src/lib/odoo-api.ts` 的 `OdooApiError` 现在集中识别 502/503/504 的通用状态码 fallback，并显示可操作的暂时不可用提示。
- 明确的后端业务消息、权限错误、校验错误和无效响应提示保持不变，避免掩盖可诊断信息。
- `pos-ui npm run typecheck`、`npx eslint src/lib/odoo-api.ts src/lib/api.ts --no-cache`、`git diff --check` 通过；未运行 Next/Docker build。
- 该改动尚未部署；需与当前 AI 路由批次一起通过 Dokploy Java 21 门禁并在公网故障注入/真实 Odoo 读取失败场景复验。
- 前端批次已提交并推送为 `60a0394`；`origin/main` 已更新。公网页面未公开运行 SHA，且尚未取得 Dokploy 构建/健康日志，因此不能把 GitHub push 当作已部署。

## 2026-10-24 推送后公网工作流复测

- 使用扩展后的只读问法矩阵复测 Demo：`54 PASS / 25 BLOCKED / 0 FAIL`，独立证据为 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-24_AFTER_PUSH.json`。
- 阻断项仍统一返回 `HTTP 200 / code 50210`，没有业务写入；证据 `deployment` 为 `unverified-after-deploy`，`sourceCommit=60a0394` 代表测试工作区而非运行容器。
- 该结果说明公网运行身份仍未核验，不能据此确认 AI 路由或 Odoo 错误提示已经上线。
- 推送后 AI UI 只读复核为 `2/2 PASS`：390/1440 均识别 48 条结果、显示 3 张推荐卡、助手发送按钮和 FAB 安全区通过，页面错误 `0`；证据 `docs/UAT_AI_UI_2026-10-24_AFTER_PUSH.json`。该结果仍标记 `unverified-after-deploy`。
- 推送后真实只读交互复核为 `14/14 PASS`：覆盖移动导航/焦点、商品搜索编辑、表单必填、CSV 预览取消、客户卡片、退款历史、补货和报表筛选；证据 `docs/UAT_INTERACTION_2026-10-24_AFTER_PUSH.json`，无业务写入。
- 推送后运营安全只读复核为 `3/3 PASS`：关班现金必填与取消、无现金直接关班 `422`、采购状态筛选均通过；session `00004` 保持 opened。证据 `docs/UAT_OPS_READONLY_2026-10-24_AFTER_PUSH.json`。
- 推送后设置与表格复核：设置页面 390/1440 共 `28/28 PASS`，表格/可访问性 `14/14 PASS`，`unexpectedWrites=0`；证据 `docs/UAT_SETTINGS_MOBILE_2026-10-24_AFTER_PUSH.json`、`docs/UAT_TABLE_A11Y_ONLINE_2026-10-24_AFTER_PUSH.json`。
- 全量 UAT 脚本静态检查：`83/83` 个 `scripts/*.mjs` 通过 `node --check`，未启动应用或执行业务写入。
- 推送后全站页面矩阵复核：`135 routes x 390/1440 = 270/270 PASS`，无页面错误或横向溢出；证据 `docs/UAT_ALL_STATIC_PAGES_2026-10-24_AFTER_PUSH.json`。公网运行 `sourceCommit` 未公开，仍不能标记为 post-deploy。

## 2026-10-21 AI 助手完整只读复测与问法迭代

- 当前本地工作流目录包含 92 条问法，已全部执行。Demo 只读复测为 `55 PASS / 34 BLOCKED / 3 FAIL`，证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_GOAL_CONTINUATION_FULL.json`。三条 FAIL 是旧 runtime 将 `发票还有吗？`、`收到发票了吗？` 和 `How many supplier bills did we receive?` 导航到 OCR；新增两条变体返回旧 runtime `50210` BLOCKED。当前源码已加入确定性报表边界和回归单测，尚未部署。
- 同批线上专项：route `9/9`、surface `11/11`、availability `3/3`、admin guard `15/15`、metrics `9/9`、AI features `14/14`、AI UI `2/2`、Sommelier `10/10` 全部通过。证据均使用 `2026-10-21_GOAL_CONTINUATION` 后缀。
- AI reports 为 `13/14`，唯一阻断是 live stock report 返回安全的实时数据不可用提示；History/platform 为 `9 PASS / 2 BLOCKED`，缺第二门店用户和 platform-operator 凭据。所有请求均为只读，业务写入 `0`。
- 独立 Odoo stock RPC 诊断为 `7 PASS / 1 INFO / 0 BLOCKED`，商品/公司/仓库字段可读；INFO 是 vendor binding 未显式绑定 warehouse，不能据此认定 AI report 已修复。证据：`docs/UAT_AI_STOCK_RPC_READONLY_2026-10-21_GOAL_CONTINUATION.json`。
- 工作流脚本异常证据现在会脱敏 Cookie、Bearer token、password、API key 和 token 字段；本轮首次 `ECONNRESET` 生成的临时文件已删除，重试证据未发现敏感值。
- 本地未运行 build。由于改动涉及 `pos-api`，仍须先通过 Dokploy Java 21 `mvn -B clean verify`，核对构建 SHA/健康状态/runtime SHA 后，才能把上述路由修复标记为部署完成并重跑 90 条矩阵。

## 2026-10-21 恢复后 AI 报表只读复测

- `scripts/pilot-ai-report-readonly-uat.mjs` 结果为 `13 PASS / 1 BLOCKED / 0 FAIL`；销售报表和 Overview 对账通过，唯一阻断为实时库存报表数据源不可用并显示安全提示。
- 证据：`docs/UAT_AI_REPORTS_READONLY_ONLINE_2026-10-24_RESUMED.json`。请求为只读，未写入业务数据。
- `deploymentShaVerified=false` 且 `runtimeCommit=null`，不能判断阻断来自运行版本或 Odoo/runtime 配置；需取得 Dokploy runtime SHA 和后端日志后继续归因。

## 2026-10-21 恢复后 AI features / Sommelier 只读复测

- AI features `14/14 PASS`：客户端能力配置、NLQ、ASR/图像空输入保护、Sommelier 流程、价格建议 API/页面、补货入口、匿名保护均通过。Invoice OCR 探针为 `INFO`，provider 可达，但探针图片没有可提取的发票字段。证据 `docs/UAT_AI_FEATURES_VERIFY_2026-10-21_RESUMED.json`。
- Sommelier `10/10 PASS`：48 款识别结果、推荐与商品详情的价格/free stock 对账、无库存替代过滤、销售介绍和匿名 401 均通过。证据 `docs/UAT_SOMMELIER_READONLY_2026-10-21_RESUMED.json`。
- 两项均为只读公网行为；`deployment=unverified-after-deploy`，运行 SHA 未核对，不能据此认定当前源码已部署。

## 2026-10-21 Capped Pricing / Bulk Price Edit 手机视图（本地待部署）

- Capped Pricing、Bulk Price Edit 在手机端改为完整字段卡片，保留桌面表格、现有价格输入、校验与 blur 保存；手机内容区预留浮动 AI 按钮空间。
- 本地 Node `24.19.0` Next dev + 全 API fixtures 验证 390/1440：Stock List、Capped Pricing、Bulk Price Edit `6/6 PASS`；价格原值编辑和失焦、Imported CSV 上传入口、新增数量档和手机搜索框宽度检查通过，`pageErrors=0`、`blockedWrites=0`、手机内部横向滚动 `0`，桌面表格列对齐/表头检查通过。
- 截图及机器证据：`docs/screenshots/2026-10-21-pricing-mobile-cards/`、`docs/UAT_STOCK_PRICING_CARDS_LOCAL_2026-10-21.json`。证据 source commit 为 `60a0394`，并明确标记测试文件来自未提交工作树；不代表已部署，也不验证 Classic pricing API 的业务数据或写入。
- 本地通过 `pos-ui npm run typecheck`、目标 ESLint、UAT 脚本 `node --check` 与 `git diff --check`；未运行 production build。dev server 已停止。
- 当前 Dokploy #38 `AiProviderConfig` 报错与现有代码不符：修复提交 `392c85f` 已在 `60a0394` 历史中，当前两个 Controller 均有导入，类型文件存在。随后本地尝试 `mvn -B clean verify`，但机器实际使用 Java 8（项目要求 Java 21），编译在大量 Java 语言语法处失败，不能用于判断该修复或当前后端批次；Dockerfile 的构建镜像为 Java 21。未改 `pos-api`、未重试 webhook；部署前仍须确认 Dokploy 使用当前 `main`、构建 SHA 正确并通过 Java 21 `mvn -B clean verify`。
- 代码仍是本地 dirty worktree，且仓库中有其他未提交更改；不要把整棵工作区直接部署。下批次继续扩大 UI/功能验证，整理明确的部署变更集后再走 Dokploy 门禁与线上只读回归。

## 2026-10-21 Odoo 目录深链与手机工具栏复验

- 本轮用 Node `24.19.0` 在现有本地 Next dev `demo.localhost:3035` 运行 `scripts/pilot-ai-entity-invalid-op-local-uat.mjs`，结果 `PASS`。supplier/customer/product 深链在 390/1440 共 `6/6` 显示正确搜索词和 fixture 结果；手机卡片、桌面表格均无横向溢出。
- 商品目录手机工具栏 Export、Import、New product、Refresh 均可见、在视口内且无重叠；Import products from CSV 和 New product 对话框可打开、关键输入控件显示并能取消关闭，未提交导入/创建请求。截图还发现并修复供应商页右侧误留 AI 浮层空间的问题：390px 下搜索宽度从约 278px 增至 358px；UAT 已加入三类目录的移动搜索宽度断言。客户和商品页也改为底部预留 AI 浮层空间，390px 的 Next 分页按钮不再被覆盖，UAT 断言三类目录分页按钮与 AI 入口无交叠。客户/供应商新增弹窗在 390/1440 均处于视口内、姓名必填和取消通过；供应商姓名输入自动聚焦，客户编辑弹窗正确预填现有姓名。三个目录空结果/无匹配提示与 Clear search / Clear filters 恢复行为在双视口 `6/6 PASS`。AI 非法/不支持操作提示、只读 supplier 导航、删除取消、失败后重试、重复确认保护均通过；`pageErrors=0`、`blockedBusinessWrites=0`。所有 API 均由浏览器 fixture 拦截，目录请求只读 fixture，删除请求仅为模拟请求。
- 本轮新增目录空结果与清除恢复回归后，UAT 汇总仍 `PASS`：目录深链/结果 `6/6`、空结果与清除 `6/6`、客户/供应商新增/编辑弹窗 `6/6`；商品导入/新建对话框可见并可取消，工具栏无重叠。证据 `docs/UAT_AI_ENTITY_DIRECTORIES_LOCAL_2026-10-21.json`；`pageErrors=0`、`blockedBusinessWrites=0`。所有 API 使用 fixture。
- 证据：`docs/UAT_AI_ENTITY_DIRECTORIES_LOCAL_2026-10-21.json`、`docs/screenshots/2026-10-21-odoo-directories-followup/`。本地 `pos-ui npm run typecheck`、目标 ESLint、脚本 `node --check` 通过；未运行 production build。
- 首次尝试使用 `127.0.0.1:3035` 时 middleware 将页面重定向登录，未产生有效功能结果；改用 tenant host `demo.localhost:3035` 后 UAT 通过。复用的 3035 服务在本轮前已监听，没有被停止或改动。
- 结果只证明本地 fixture UI 行为，不代表真实 Odoo 写入/业务验收或已部署。商品目录手机工具栏布局改动仍待纳入整理后的部署批次；后端批次继续受 Java 21 `mvn -B clean verify` 和 Dokploy 分支/构建 SHA 核对门禁约束。

## 2026-10-21 Price Suggestions 移动端复验续轮

- `OdooPriceSuggestionsPage` 移除手机端右侧多余留白，保留底部安全区；390px 可用内容宽度达到 `358px`。
- 使用 Node `24.19.0` 在现有 `demo.localhost:3035` Next dev 服务重跑本地 fixture UAT：`18/18 PASS`，覆盖搜索/筛选、空结果、商品与批量编辑深链、只读 CSV、移动宽度、横向溢出和 Header AI 入口交互；`pageErrors=0`、写入 `0`。证据：`docs/UAT_PRICE_SUGGESTIONS_MOBILE_LOCAL_2026-10-21_RECHECK.json`；截图：`docs/screenshots/2026-10-21-price-suggestions-mobile-recheck/`。
- `pos-ui` TypeScript `tsc --noEmit`、Price Suggestions 目标 ESLint、`git diff --check` 均通过；没有运行本地 production build。Node 24 runtime 来自 Codex workspace dependencies。
- Demo 最新四页双视口只读审计为 `4/8 PASS`（较早 `5/8` 证据已被 `LAYOUT-AUDIT-2` 取代）；1440px 四页通过，390px 四页仍需修复/部署后复测。证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_LAYOUT-AUDIT-2.json`。线上 `pageErrors=0`、`blockedWrites=0`，运行 SHA 未核验；不可将旧线上布局失败归因于当前本地源码。
- 未部署：本地布局改动仍未进入镜像；Dokploy Source/Git 分支绑定和候选构建身份需先核实。工作区存在未通过 Java 21 门禁的 `pos-api` 修改，不得将整棵 dirty worktree 直接发布。价格真实写入仍需隔离 Odoo UAT。

## 2026-10-21 库存定价与 Odoo 目录 UI 本地复验续轮

- 本地 Stock List / Capped Pricing / Bulk Price Edit fixture UAT `6/6 PASS`，390/1440 各视口通过，写入拦截 `0`；报告及截图分别为 `docs/UAT_STOCK_PRICING_BATCH_LOCAL_2026-10-21_RECHECK.json`、`docs/screenshots/2026-10-21-pricing-batch-recheck/`。
- Odoo supplier/customer/product 目录双视口复验：深链结果 `6/6`、空结果/恢复 `6/6`、客户/供应商表单 `6/6`；手机搜索宽度均为 `358px`，工具栏、导入/新建对话框和 AI 操作保护通过。所有 API 为 fixture，删除请求只在 fixture 内模拟，`blockedBusinessWrites=0`、`pageErrors=0`。证据：`docs/UAT_AI_ENTITY_DIRECTORIES_LOCAL_2026-10-21_RECHECK.json`，截图 `docs/screenshots/2026-10-21-directories-batch-recheck/`。
- 截图抽检通过；以上结果属于本地浏览器 fixture，不代表真实 Odoo 保存或线上部署。此前共享的 3035 dev 服务保持运行。

## 2026-10-21 320px 小屏复验续轮

- 将库存/定价和目录 UAT 扩展为 320/390/1440px，全面执行移动卡片字段、搜索、分页、表单和工具栏断言。库存定价 `9/9 PASS`；Price Suggestions `22/22 PASS`；目录深链与空结果各 `9/9 PASS`。均为 fixture，业务写入 `0`。
- 320px 截图发现商品目录卡片两列布局会截断 “Uncategorised” 与条码。`OdooProductCataloguePage` 改为 360px 以下单列字段；UAT 增加 `dd` 实际渲染宽度断言。目录三视口复测通过，320/390 字段均完整；视觉证据 `docs/screenshots/2026-10-21-directories-320-local/product-320.png`。
- 证据 JSON：`docs/UAT_STOCK_PRICING_320_LOCAL_2026-10-21.json`、`docs/UAT_PRICE_SUGGESTIONS_320_LOCAL_2026-10-21.json`、`docs/UAT_AI_ENTITY_DIRECTORIES_320_LOCAL_2026-10-21.json`。Node `24.19.0` `tsc --noEmit`、商品目录 ESLint、UAT 脚本语法与 `git diff --check` 通过；未运行 production build。
- 这组本地优化未部署。公网定价仍是 `4/8 PASS`；Dokploy Source/Git 页面尚未登录，之前的 `Branch Not Match` 仍需核实。工作区还有未通过 Java 21 门禁的 `pos-api` 改动，不推送整棵工作树。
- 发布核验：对用户提供的 Dokploy Compose 页面执行只读 GET 得到 `HTTP 307 Location: /`，当前会话无法读取 Source/Git；进程环境也没有 Dokploy 凭据变量。既有 `Branch Not Match` 未解除，本轮没有触发 webhook 或推送。
- 最新 Demo 定价只读浏览器复测：`4/8 PASS`，结果与上次一致；四页 1440px 通过，390px 全失败。Stock List 卡片宽 `282px` 且浮动 AI 挤占空间，Price Suggestions 内容宽 `278px` 且浮动入口仍显示，Capped Pricing/Bulk Price Edit 手机表格可横向滚动，Bulk 搜索宽 `110px`。8 个检查 HTTP `200`、页面错误 `0`、写入拦截 `0`，runtime SHA 未验证。证据：`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-21_AFTER_LOCAL_CONTINUATION.json`；截图：`docs/screenshots/2026-10-21-pricing-online-after-local-continuation/`。
## 2026-10-21 产品化候选复核（当前）

- 本地验证保持通过：`scripts/productization-local-verify.mjs` 31/31、`scripts/productization-ui-local-uat.mjs` 12/12，Node TypeScript 检查和定向 ESLint 通过。
- 租户范围静态审计保持通过：`docs/UAT_TENANT_SCOPE_AUDIT_2026-10-21.json`，64 个 controller、0 个发现，Compose Odoo-only 保护已启用。
- 当前 HEAD/候选 SHA `06882c7138d77e1ea3301b869a34302cfbcc3cdd` 的发布身份复核仍阻塞：`https://demo.orithos.com.au/api/public/version` 与 `https://app.orithos.com.au/api/public/version` 均返回 HTTP 500（`No static resource api/public/version`），因此无法确认运行 SHA、镜像或健康状态。证据：`docs/UAT_RELEASE_IDENTITY_2026-10-21_CURRENT.json`。
- 当前仍没有同候选 SHA 的远程 Java 21 `mvn -B clean verify` 证据，也没有获批的隔离 Odoo 数据库和账号执行真实写入验收；试点决策保持 **NO-GO**。
## 2026-10-21 租户边界修复（待后端构建）

- `TenantSlugParser` 不再接受客户端 `X-Orithos-Tenant-Slug` 覆盖；租户只由受信任的转发 Host 解析，防止伪造门店参数切换 `TenantHolder`。
- Next API proxy 和 Odoo tenant binding 请求同时停止转发该客户端头；新增回归测试验证伪造头不能覆盖 `demo.orithos.com.au`。
- Node 24 类型检查、定向 ESLint 和 64 controller 静态租户审计通过；尚未执行 Java 21 构建，尚未部署或进行运行时双租户验收。

## 2026-10-21 隔离环境复核

- 本机 `.env` 仅配置了 Odoo 服务账号和 `ODOO_DATABASE=aipos`；未配置 `ISOLATION_ODOO_DATABASE`，也不存在 `.env.uat`。
- 因此不能运行任何销售、退款、收货、盘点、关班、建店或双租户写入脚本。生产数据库凭证存在不等于具备获批隔离 UAT 环境。
- 当前安全边界修复仍待远程 Java 21 同 SHA 构建；发布身份接口和隔离数据库仍是下一步外部前置条件。
## 2026-10-21 隔离写入门禁复核

- 重新运行 `scripts/pilot-isolation-write-uat.mjs`，门禁阻止在业务操作前执行：`ISOLATION_ODOO_DATABASE` 未设置，当前 `ODOO_DATABASE=aipos`。
- 证据：`docs/UAT_ISOLATION_WRITE_2026-10-21.json`；销售、退款和其他业务写入均为 0。
- 要进入真实单店验收，必须设置专用数据库名，并使 `ODOO_DATABASE` 与 `ISOLATION_ODOO_DATABASE` 完全一致且不能为 `aipos`。

## 2026-10-21 隔离数据库创建工具

- 新增 `scripts/create-isolated-odoo-database.mjs`：只接受 `ODOO_MASTER_PASSWORD`、`ISOLATION_ODOO_DATABASE`、`UAT_ODOO_ADMIN_USERNAME` 和 `UAT_ODOO_ADMIN_PASSWORD`，拒绝 `aipos`，创建后回查 Odoo 数据库列表。
- 当前执行结果为安全阻塞：缺少 UAT 管理员账号变量，未发送创建请求；脚本语法检查通过。
## 2026-10-21 隔离 Odoo 已创建并通过只读预检

- 已使用数据库管理器创建独立库 `aipos_uat`；数据库列表回查成功，未触碰生产库 `aipos`。
- 服务账号认证成功（Odoo UID 2）。`account`、`stock`、`purchase`、`point_of_sale`、`sale_management`、`l10n_au` 均为 `installed`。
- 只读模型探针通过：1 个公司、1 个仓库、2 个基础产品、5 个税，其中观察到 10% GST；证据：`docs/UAT_ODOO_ISOLATION_READONLY_2026-10-21.json`。
- 下一步可开始准备 UAT 角色账号和真实单店写入；运行时前后端 SHA 仍需核验，当前只读预检不等于业务验收。

## 2026-10-21 UAT 应用运行时预检

- 隔离 Odoo `aipos_uat` 已可用，但本机未安装 Docker，3000/3300 端口没有 UAT 应用运行。
- 因此尚未执行 POS 应用层销售、退款、采购、盘点或关班写入；业务写入为 0。
- 证据：`docs/UAT_APPLICATION_RUNTIME_BLOCKED_2026-10-21.json`。下一步需要启动隔离 Next.js/Spring 服务，并确认两者使用同一个 `aipos_uat`。

## 2026-10-21 Odoo 读取链路发布记录

- 提交 `1cf20c5` 已推送到 `origin/main`，仅包含前端 6 个 Odoo route/scope 文件：产品图片、产品导出、通用 records、reporting dashboard、销售详情和 `odoo-scope`。
- 变更将请求 correlation ID 传递到 session info、company scope 解析及后续 Odoo JSON-RPC，便于线上按一次请求追踪多次上游调用；不改变业务写入逻辑。
- Node 24 `pos-ui npm run typecheck` 通过；目标 6 文件 ESLint 通过；未运行 production build、Docker build 或 Maven。
- 用户反馈 Dokploy 最新部署“成功”，但未提供构建 SHA，且本地无法读取 Dokploy Source/Git/日志。因此只能记录为**用户报告成功，发布身份未核验**，不能把 `1cf20c5` 标记为线上已运行。
- 当前 `demo.orithos.com.au/api/public/version` 与 `app.orithos.com.au/api/public/version` 均返回 HTTP 200，`builtAt=2026-10-21T08:10:12.024Z`，但 `frontend.commit=null`、`backend=null`；这只能证明版本端点恢复，不能证明 checkout SHA 或后端镜像身份。
- 下一步必须在 Dokploy 页面核对 checkout/build SHA 是否为 `1cf20c5`、容器健康和 `/api/public/version` runtime SHA，然后重跑 Odoo 目录、报表、销售详情和全站只读矩阵。

## 2026-10-21 correlation ID 代理边界续批次

- 提交 `d9c5622` 已推送到 `origin/main`，继续将 correlation ID 传递到版本诊断、密码重置代理、R2 管理员只读代理、UAT context 和租户 Odoo binding。
- 本地验证：Node 24 `pos-ui npm run typecheck` 通过，目标文件 ESLint 通过，`git diff --check` 通过。
- 浏览器 fixture：Odoo session recovery `2/2`、stocktake search race `39/39`、replenishment supplier recovery `60/60`、Price Suggestions `PASS`，Price Suggestions 业务写入 `0`。
- 该批次未修改 `pos-api`，未执行本地 build；线上仍需 Dokploy checkout SHA、容器健康和 runtime SHA 验证。

## 2026-10-21 d9c5622 后续只读验收

- Demo 全站页面矩阵：390/1440 两个视口全部通过；交互 `14/14 PASS`；设置 `28/28 PASS`；表格/可访问性 `14/14 PASS`，`unexpectedWrites=0`。
- 定价四页双视口：`8/8 PASS`，`blockedWrites=0`。
- AI UI：`2/2 PASS`；AI features：`13 PASS / 1 BLOCKED / 0 FAIL`，阻断项保留在对应 UAT JSON，未归因到当前源码。
- 以上线上证据均为只读；未创建销售、退款、采购、收货、库存、价格或关班业务数据。版本端点构建时间已更新，但 commit 字段仍为空，运行 SHA 继续未核验。
- 证据文件：`docs/UAT_ALL_STATIC_PAGES_2026-10-15.json`、`docs/UAT_INTERACTION_2026-10-14.json`、`docs/UAT_SETTINGS_MOBILE_2026-10-14.json`、`docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19.json`、`docs/UAT_AI_UI_2026-10-19_AUTHFIX.json`、`docs/UAT_AI_FEATURES_VERIFY_2026-10-19.json`、`docs/UAT_TABLE_A11Y_ONLINE_CURRENT.json`。

## 当前工作树并发 WIP

- `pos-ui/app/platform/audit/page.tsx` 与 `PlatformShell` 的 Audit 导航仍是未提交 WIP，并依赖工作区中未通过 Java 21 门禁的 `pos-api` 平台审计接口；本轮没有把它纳入发布批次或宣称线上可用。
- Platform Audit 前端 fixture 已通过：桌面表格、搜索、分页、刷新、390px 移动卡片 `PASS`，12 条 fixture、无横向溢出、`pageErrors=0`；Node `v24.19.0` typecheck 与目标 ESLint 通过；证据：`docs/UAT_PLATFORM_AUDIT_LOCAL_2026-10-21.json`。该证据不代表后端接口或线上功能通过。
- Platform Failures 也完成同样的桌面/390px fixture 验证：表格、搜索、分页、刷新通过，导航修复后无横向溢出、`pageErrors=0`；合并证据：`docs/UAT_PLATFORM_OPERATIONS_LOCAL_2026-10-21.json`。
- 平台门店详情 provisioning history fixture 也通过：门店、AI KPI、操作历史、provisioning steps 均加载，桌面/390px 无横向溢出、`pageErrors=0`；证据：`docs/UAT_PLATFORM_STORE_PROVISIONING_LOCAL_2026-10-21.json`。
- `DEPLOYMENT.md` 已补充 `SOURCE_COMMIT` 要求。下一次 Dokploy 部署应将目标 40 位 SHA 注入 Compose build args，并在前后端版本端点回读相同 SHA 后再标记 post-deploy。
- 当前候选后端批次仍包含 62 个修改/新增 Java、资源和测试文件；仓库没有可用的 GitHub Actions/远程 Java 21 workflow，不能用本地 build 替代门禁。因此后端和依赖它的 Platform Audit/Failures/provisioning 页面继续留在 WIP，不推送、不触发 Dokploy。
- 发布身份复核：`demo.orithos.com.au` 与 `app.orithos.com.au` 的 `/api/public/version` 仍返回 `builtAt=2026-10-21T08:19:13.701Z`、`frontend.commit=null`、`backend=null`；`origin/main` 仍为 `d9c5622`，本次没有新部署或可归因的新线上行为。

## 2026-10-21 平台运维追踪 WIP（未验收）

- 门店详情本地加入 Odoo 初始化尝试和阶段历史；API/mapper 及独立迁移为 `pos-api/src/main/resources/db/migration_tenant_provision_attempts.sql`。记录 signup/admin retry、操作人、请求关联 ID、阶段结果和脱敏错误摘要。
- `OdooTenantProvisioner` 现在强制注入记录服务；追踪完成状态写入失败会显式报错，不再静默忽略。新增服务层测试源码，覆盖尝试字段、失败摘要脱敏及完成写入失败。
- 前端 `npm run typecheck` 与详情页定向 ESLint 通过；HTML 锚点和敏感字段扫描通过。按项目要求未运行本地 Maven；新增 Java 测试尚未执行。
- 迁移尚未执行，远程 Java 21 对候选 SHA 的 `mvn -B clean verify`、部署、平台登录后权限/页面验收均未完成；未声明线上可用。远程门禁通过前不得推送包含 `pos-api/` 的候选。
- 新增全局故障记录与平台 Failures 检索：意外 HTTP 5xx 和服务失败码按环境、运行 SHA、门店、路由、状态及异常类型聚合；不保存请求正文/查询参数，摘要脱敏凭据、邮箱、澳洲电话号码，已知凭证路由段遮蔽。新增独立迁移 `pos-api/src/main/resources/db/migration_platform_failure_events.sql`。
- Failures 页面 fixture 证据 `docs/UAT_PLATFORM_OPERATIONS_LOCAL_2026-10-21.json`：桌面表格、搜索、分页、刷新及 390px 视口 12 条记录通过，无横向溢出/页面错误；API 被拦截，因此不证明后端或线上功能。截图早于“最近耗时”显示字段，最新布局未重跑 fixture；Node 24 `tsc --noEmit`、Failures/PlatformShell 定向 ESLint 通过。
- 新增故障 API/记录服务测试源码及异常处理测试，均未运行。两项平台迁移尚未执行，远程 Java 21 同候选 SHA 门禁、部署、线上访问控制与端到端请求 ID 核验未完成；Failures 不含自动保留清理，目前没有配置 30 天清理任务。

## 2026-10-21 AI 助手问法扩展（当前工作树）

后续扩展将工作流目录更新为 **209 条唯一用例**：补货增加 `What should I
top up?`、`What needs a reorder?`、`帮我看下哪些要补货`；定价增加
`What is a fair price for Shiraz?`、`Which prices look off?`；发票增加
`Snap this supplier invoice`；执行保护增加 `把这些建议下单` 和 `直接把价格改了`。
这些问法已加入确定性路由和 `WorkflowRouteRouterTest`，但尚未运行 Java 21
远程门禁，也没有新的线上证据。

随后对这 8 条问法执行了 Demo 只读 assistant API 检查：**3 PASS / 5
BLOCKED / 0 FAIL**。通过项为 `What needs a reorder?`、`帮我看下哪些要补货`
和 `Which prices look off?`；其余响应均为 HTTP 200、脱敏 `50210`。请求范围
为 assistant API only，业务写入为 0，证据为
`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_NEW-8CASES-CURRENT.json`。
Demo 的 `frontend.commit` / `backend` 仍为空，不能把该结果解释为当前候选已部署。

同一轮重新执行 AI 只读专项：功能 `13 PASS / 1 BLOCKED`（价格建议上游
502）、路由 `9/9 PASS`、表面/权限 `11/11 PASS`、UI `2/2 PASS`，报表
`15/16`（实时库存源不可用）。新证据分别为 `*_CURRENT-ITERATION.json`
文件；未执行业务写入，runtime SHA 仍未核验。

- 上一轮工作流问法脚本为 **201 条唯一用例**：170 条读/帮助/导航、23 条执行意图保护、8 条注入/未知安全；该数字对应后续线上基线，不代表当前 209 条工作树目录。
- 新增价格执行保护 `Set these prices now`、`Change these prices`、`设置这些价格`；确定性路由应停留在引导/确认响应，不得静默打开价格页或保存价格。
- `WorkflowRouteRouter`、`WorkflowRouteRouterTest` 与 `ClassifyQueryNodeTest` 已加入这些边界；仅完成脚本语法、用例 ID 唯一性和 `git diff --check`，未运行本地 Maven。由于候选包含 `pos-api`，必须先对同一 SHA 在 Java 21 远程环境执行 `mvn -B clean verify`，通过后才能推送。
- 这些新增问法尚未有新的线上证据；Demo runtime SHA 仍未核验，不能将旧 runtime 的响应视为当前源码已部署。
- 当前 HEAD `5afdf2c` 的 7 条只读专项为 `0 PASS / 7 BLOCKED / 0 FAIL`，全部是 HTTP 200 / `50210`，无业务写入；证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_NEW-7CASES-5AF.json`。这仍不能证明 Demo 已运行当前工作区候选。
- 版本端点复核仍为 HTTP 200，但返回 `frontend.commit=null`、`backend=null`，`builtAt=2026-10-21T08:19:13.701Z`；因此 201 条线上基线只能描述被测服务行为，不能证明当前候选已部署。
- 当前 AI 功能专项为 `13 PASS / 1 BLOCKED / 0 FAIL`：价格建议 API 上游 HTTP 502；发票探针为 INFO（provider 可达但探针图无发票字段）。证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-21_CURRENT-CONTINUATION.json`，全程无业务写入。
- 当前报表只读专项为 `15/16 PASS`，唯一阻断是实时库存源；系统显示安全 unavailable 提示，没有把数据源故障当作空库存。证据：`docs/UAT_AI_REPORTS_READONLY_2026-10-21_CURRENT-CONTINUATION-2.json`。
- 路由专项 `9/9 PASS`、AI 表面/权限专项 `11/11 PASS`；匿名 assistant/report/config/voice/label/Sommelier 路由均返回 401，配置加载和空输入校验通过。证据：`docs/UAT_AI_ROUTE_MATRIX_ONLINE_2026-10-21_CURRENT-CONTINUATION-2.json`、`docs/UAT_AI_SURFACE_ONLINE_2026-10-21_CURRENT-CONTINUATION-2.json`。
- AI UI 专项 `2/2 PASS`（390/1440px），推荐卡片、商品识别、助手发送入口、底部安全区和页面错误检查均通过。证据：`docs/UAT_AI_UI_ONLINE_2026-10-21_CURRENT-CONTINUATION-2.json`。

## 2026-10-21 AI 问答完整回归续验

- 按 `docs/AI_ASSISTANT_TEST_PLAN.md` 复跑 Demo 只读与本地 fixture。当前工作流脚本实际选中 **198 条**（旧文档中的 194 已过期）：**76 PASS / 104 BLOCKED / 18 FAIL**。BLOCKED 均为脱敏 `50210`；18 FAIL 集中在写入意图保护和历史/报表问题被当前 Demo 路由到补货、调价或发票扫描。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_COMPLETE-RERUN-2.json`。
- 运行 SHA 未核验，所以这些 FAIL 证明当前 Demo 行为，不证明工作区未部署修复。首轮遇到助手 API 30 秒超时，单条只读重试通过后重跑完整目录成功结束；首次超时文件保留为失败诊断，不与完整结果混合。
- 最新 Demo 子套件：availability 3/3、enabled gate PASS、route 9/9、surface/auth 11/11、UI 2/2、metrics 9/9、Sommelier 10/10、发票预览 6/6、合成中英文 ASR 4/4。features 13 PASS/1 BLOCKED（上游价格建议 502）；报表 15/16（实时库存源不可用）；History/platform 9 PASS/2 BLOCKED（缺跨用户与平台运营账号）；stock RPC 4 PASS/5 BLOCKED/1 INFO（公司/仓库范围读取无匹配行）。本地能力、语音成功/失败、实体操作守卫和诊断 fixture 均通过。
- 本轮 AI API 请求会写 AI 使用/审计指标；没有销售、退款、PO、收货、库存、价格或关班写入。误启动的 admin-guard 脚本创建了临时非管理员账号，13 项 AI 配置变更全部被拒且配置数量前后相同；脚本已清理账号，随后独立读取确认 `ai_guard_*` 用户和临时角色均为 0。该项不属于只读验收，之后不得对 Demo 重跑账号/角色创建测试。
- Java 21 `mvn -B clean verify`、目标候选部署和 runtime SHA 核验仍未完成；没有把工作区 Java 路由修复记作线上通过。详细结果见 `docs/AI_ASSISTANT_TEST_PLAN.md` 和 `docs/AI_ASSISTANT_TEST_MATRIX.md`。

### 201-case expected-vs-actual rerun

- 当前 HEAD 为 `5afdf2cb6816f76c82b43b028b4bfd019fff061f`；runner 选中 201/201 个唯一问法，结果 **76 PASS / 107 BLOCKED / 18 FAIL**。与前次 198-case 结果相比新增 3 条均为 `50210` BLOCKED，18 条真实路由不匹配保持不变。
- 新证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_EXPECTED-VS-ACTUAL.json` 对每条用例记录 expected intent/route/query/no-route 与 actual intent/route/code，便于直接复核。仅请求助手 API，无业务写入；会产生 AI usage/audit 记录。
- 对照当前 `WorkflowRouteRouterTest`、`ClassifyQueryNodeTest`，18 个问法均已有对应的本地路由/安全断言。线上仍返回旧路由；版本端点不提供可确认的 runtime SHA，不能判断本地候选是否运行。
- 当前后端路由代码及测试处于未提交工作区。本机已安装 Java 21，但没有 Docker、GitHub Actions workflow 或可用的远程 pre-push builder；按 `AGENTS.md` 的 owner preference 不运行本地 Maven，也不推送或触发 Dokploy webhook。必须先获得同一候选 SHA 的 Java 21 `mvn -B clean verify` 日志，再推送部署并重跑 18 条重点用例与 107 条阻塞项。
- 目标恢复后的环境复核没有发现部署变化：`origin/main` 仍是 `5afdf2c`，Demo 版本端点 builtAt 仍为 `2026-10-21T08:19:13Z` 且前后端 SHA 为空。5 条跨能力问法（销售、补货、调价、侍酒、库存）复测为 **0 PASS / 5 BLOCKED / 0 FAIL**，全部返回 `50210`；证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_PROVIDER-SAMPLE-RECHECK.json`。只调用助手 API，无业务写入。
- UAT runner 现额外记录 `X-Correlation-ID`。同一 5 条样本复测仍全部 `50210`，且 5 个响应都返回关联 ID：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_PROVIDER-SAMPLE-CORRELATION.json`。当前环境没有后端日志读取入口，无法将 correlation ID 进一步映射到 provider/root-cause 日志。
- 随后重跑完整 201-case 目录，结果仍为 **76 PASS / 107 BLOCKED / 18 FAIL**。201 个响应全部含有效 UUID `X-Correlation-ID`；证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-CORRELATION.json` 同时保存预期/实际值，可供有 Dokploy 日志权限的人按 ID 排查。请求范围仍为 assistant API only，业务写入 0。

## 2026-10-21 公网只读 AI/运营续验

- AI 路由矩阵 `9/9 PASS`：`docs/UAT_AI_ROUTE_MATRIX_2026-10-19.json`。
- Sommelier 只读回归 `10/10 PASS`，包含目录识别、库存/价格一致性、替代推荐、销售话术、产品问答和匿名 `401`：`docs/UAT_SOMMELIER_REGRESSION_2026-10-13.json`。
- 运营只读回归 `3/3 PASS`，包含 Odoo 自动恢复、关班确认可取消及采购状态筛选；未执行关班或采购写入：`docs/UAT_OPS_READONLY_2026-10-13.json`。
- AI 报表 `15/16`：15 项通过、1 项 `BLOCKED`，阻断是库存实时数据源不可用；脚本结果为 `result=BLOCKED`，不是失败：`docs/UAT_AI_REPORTS_READONLY_ONLINE.json`。所有业务写入为 0。
- 以上报告的 `testHarnessCommit` 为 `d9c5622`，但 `deploymentShaVerified=false`、`runtimeCommit=null`；因此只能证明公网只读行为，不证明当前源码已在 Dokploy 运行。

## 2026-10-21 Dokploy Java 编译日志诊断

- 用户提供的构建错误发生在 `AiConfigController` 与 `SommelierController` 调用 `AiProviderConfig.isValidBaseUrl(...)` 时，提示 `cannot find symbol variable AiProviderConfig`。
- 当前 `main`、提交 `97eda76` 及工作树均包含 `pos-api/src/main/java/com/orithos/modules/ai/AiProviderConfig.java`，且两个 controller 均有显式 import；当前仓库的 Dockerfile context 为 `./pos-api` 并执行 `COPY src ./src`。据此，日志对应的 Dokploy checkout/缓存与当前提交不一致的可能性高于源码缺失。
- 发布前必须在 Dokploy 中确认 Source 仓库、分支、构建 SHA 和无缓存重建；把目标 40 位 SHA 作为 `SOURCE_COMMIT` 传给 backend/frontend，再从两个 `/api/public/version` 端点回读相同 SHA。未完成前不推送或部署当前 62 文件后端 WIP。

## 2026-10-21 平台门店详情 UI 小修复

- provisioning history 的阶段耗时计算改为统一解析带 `Z`、带时区偏移和无时区的 API 时间；避免对已带时区的值再次拼接 `Z` 造成非法 `...ZZ`，从而显示错误耗时。
- 变更仅在 `pos-ui/app/platform/stores/[id]/page.tsx`，当前仍与平台后端 WIP 同树，未推送、未部署。
- Node 24 `npm run typecheck`、该页面与 `PlatformShell` 定向 ESLint、`git diff --check` 均通过；未运行 Next production build。

## 2026-10-21 平台 Audit/Failures UI 可靠性续批次

- Audit 与 Failures 页面统一兼容带 `Z`、带时区偏移和无时区的 API 时间，避免重复追加 `Z` 造成错误时间显示。
- 两页加入请求序列保护：快速刷新、筛选或翻页时，旧响应和旧错误不会覆盖最新请求状态。
- Node 24 typecheck、Audit/Failures/Store detail/PlatformShell 定向 ESLint、`git diff --check` 通过；未运行 Next production build。
- 这些页面仍是未提交前端 WIP，并依赖尚未通过 Java 21 门禁的后端接口；未推送、未部署、未宣称线上可用。

## 2026-10-21 Audit/Failures 筛选体验补充

- Audit 与 Failures 在提交日期筛选前拒绝 `From > To`，并在页面内显示明确错误，不再发送无效查询。
- 两页列表时间统一按 UTC 展示并标注 `UTC`，与后端审计时间和交接记录保持一致。
- Node 24 typecheck、四个平台页面定向 ESLint、`git diff --check` 再次通过；仍未运行 production build、未推送或部署。

## 2026-10-21 Audit 日期校验浏览器 fixture

- 在本地 3035 开发服务用 Node 24 + Playwright 复验 390px Audit 页面：反向日期显示校验错误，提交前后 API 请求数均为 `2`，没有发出额外查询；页面宽度 `390/390`，无横向溢出，页面错误 `0`。
- 证据：`docs/UAT_PLATFORM_FILTER_VALIDATION_LOCAL_2026-10-21.json`。验证使用 Node `24.19.0`；API 为 fixture 拦截，未产生业务写入，不代表线上部署验收。
- Failures 页面同样通过：反向日期提交保持请求数 `2 -> 2`，日期输入 `aria-invalid=true`，390px 无横向溢出。
- Audit 页面重新验证 `aria-invalid=true`、`aria-describedby=audit-date-range-error`，请求数仍为 `2 -> 2`，390px 无横向溢出。

## 2026-10-21 Audit/Failures 日期错误可访问性

- 反向日期范围错误现在同步设置日期输入的 `aria-invalid` 和 `aria-describedby`，屏幕阅读器可关联到具体错误提示。
- Node `24.19.0` TypeScript、平台页面定向 ESLint 和 `git diff --check` 通过；未运行 production build、未部署。

## 2026-10-21 价格建议移动端完整复验

- `pilot-price-suggestions-local-uat.mjs` 使用 Node `24.19.0` 重跑通过：`320/390/768/1024/1440` 五个视口，搜索、空结果、状态筛选、只读 CSV、Bulk Price Edit 深链、AI 入口和无横向溢出均通过，`writes=0`。
- 证据：`docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-21_RECHECK_CURRENT.json`，截图目录 `docs/screenshots/2026-10-21-price-suggestions-recheck-current/`。
- 本次证据的仓库 HEAD 为 `5afdf2cb6816f76c82b43b028b4bfd019fff061f`，并已与 `origin/main` 对齐；该提交仅更新 UAT 凭证/fixture，不改变业务运行代码。公网 runtime SHA 仍未核验。

## 2026-10-21 库存/定价 fixture 更新与复验

- 修正响应式库存定价 fixture，使其匹配当前 Odoo Bulk Price Edit 页面：拦截只读 `POST /api/odoo/records` 产品查询，使用当前 Odoo 字段和控件断言；旧 quantity-break 断言已移除。
- 串行重跑 Stock List、Capped Pricing、Bulk Price Edit 五视口共 `15/15 PASS`，无页面错误、无横向溢出、无 fixture 业务写入：`docs/UAT_STOCK_PRICING_RESPONSIVE_LOCAL_2026-10-21_RECHECK_CURRENT.json`。
- 更新 Bulk Price Edit 保存保护 fixture 后 `PASS`：首个 PATCH 返回未知结果，页面只读回查并保持待确认状态，自动重试次数为 `1`；证据 `docs/UAT_BULK_PRICE_EDIT_SAVE_GUARD_LOCAL_2026-10-21_RECHECK_CURRENT.json`。
- 以上脚本使用 Node `24.19.0`，fixture 修改属于测试工具，不改变 `pos-api` 或生产业务数据；线上 runtime SHA 仍未核验。
## 2026-10-24 `b211284` 前端代理部署后复核

- [x] 仅 `pos-ui` 改动提交并推送：`b21128419fa6974c641465422e68bfb62eed3b4a`；未包含 `pos-api`，因此不绕过后端 Java 21 门禁。
- [x] Dokploy 触发后 Demo `builtAt` 更新为 `2026-10-21T10:52:07.218Z`；版本端点仍返回 `frontend.commit=null`、`backend=null`，运行 SHA 继续标记为未核验。
- [x] 线上价格建议/报表代理的未登录错误响应均保留请求 `X-Correlation-ID`；本轮线上检查得到两个 `401` 和匹配 UUID。
- [x] 部署后定价页面双视口 `8/8 PASS`、`blockedWrites=0`；证据 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-24_AFTER_B211284.json`。
- [ ] 部署后 AI features `13 PASS / 1 BLOCKED`，价格建议上游仍为 `502`；OCR 探针仍为 provider 可达但测试图片无发票字段。证据 `docs/UAT_AI_FEATURES_VERIFY_2026-10-24_AFTER_B211284.json`。

## 2026-10-24 `d729d91` Odoo 错误态可追踪性

- [x] 价格建议与报表错误 UI 显示代理返回的 `Request ID`，保留重试操作。
- [x] Node 24 typecheck、两个目标组件 ESLint、fixture `node --check` 通过；本地 390px 502 fixture `7/7 PASS`，页面错误 `0`、横向溢出 `0`、业务写入 `0`。
- [x] 截图检查确认 Request ID 和错误/重试状态在移动端可读；证据 `docs/UAT_ODOO_ERROR_CORRELATION_LOCAL_2026-10-24_UI.json`，截图 `docs/screenshots/2026-10-24-odoo-error-correlation/`。
- [x] 提交 `d729d917e98ad7bfc3f884c8acfacefa4b66b4bf` 已推送到 `origin/main`。
- [ ] Dokploy webhook 返回 `301`；Demo/app `builtAt` 仍是 `2026-10-21T10:52:07.218Z`，`frontend.commit` / `backend` 仍为空，因此 `d729d91` 未获部署证据。不得把本地 UI fixture 记作线上验收。

## 2026-10-21 AI 上游阻断诊断续记

- 当前工作树 HEAD 为 `d729d917e98ad7bfc3f884c8acfacefa4b66b4bf`；AI features 复核仍为 `13 PASS / 1 BLOCKED`。
- 价格建议 API 探测得到 HTTP `502`、响应类型 `text/html; charset=UTF-8`、`server=cloudflare`、耗时 `933ms`，无 JSON body 和 `X-Correlation-ID`。证据 `docs/UAT_AI_FEATURES_VERIFY_2026-10-21_PRICE-DIAGNOSTIC.json`。该响应无法证明 Next.js/Odoo 路由已接收请求；需有权限者查看 Cloudflare 与 Dokploy origin 日志，不要据此修改价格计算。
- DashScope 最小文本请求 HTTP `200` / `857ms`，证据 `docs/UAT_AI_DASHSCOPE_HEALTH_2026-10-21_CURRENT-ITERATION.json`；此项仅验证 provider 基础可达，不等同 AI assistant 成功。
- 浏览器会话的 Odoo 商品目录读取可见库存字段，但 AI 库存问数经后端 service account 仍返回安全 unavailable。两者凭据和 warehouse/company context 不同；需核验后端 Odoo RPC 日志、账号库存权限和 Vendor warehouse/company 绑定。没有业务写入。
- 已增强 `pilot-ai-features-verify-uat.mjs`：价格 API BLOCKED 证据只保留错误类别、耗时、响应 content-type/server、correlation ID 和写入开关，不存储响应正文或原始 Odoo 错误。
- 当前 Demo `frontend.commit` / `backend` 仍未提供，部署 SHA 未核实；没有运行本地 build/Maven，也没有推送后端。
- 完整 209 条问法矩阵复测：`79 PASS / 112 BLOCKED / 18 FAIL`；112 条是脱敏 `50210`，18 条为 7 条执行意图、10 条历史/报表边界和中文批量改价入口误路由。证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-209-CURRENT-ITERATION.json`。仅调用 assistant API，业务写入为 0；Demo SHA 未核验，不能将线上失败归因为当前源码。

## 2026-10-21 Odoo 错误关联 ID 部署续验

- 用户确认 Dokploy 最新部署状态为“成功”；Demo 版本端点仍返回 `frontend.commit=null`、`backend=null`，`builtAt=2026-10-21T12:58:05.809Z`。因此只记录面板状态，不推断运行 SHA。
- 线上登录态 390px 浏览器只读验收：价格建议 API `502`，页面显示错误态且无横向溢出，但请求未发送 `X-Correlation-ID`，页面没有 Request ID；报表 API `200`，页面无横向溢出。`blockedWrites=[]`。证据：`docs/UAT_ODOO_ERROR_CORRELATION_ONLINE_CURRENT.json`。
- 工作区两个页面已新增请求前 UUID、发送 `X-Correlation-ID`，并在响应缺少关联 ID 时显示本次发送的 ID。本地 390px fixture `13/13 PASS`，覆盖 Retry 生成新 UUID 与 Request ID 显示；页面错误 0、横向溢出 0、业务写入 0。证据 `docs/UAT_ODOO_ERROR_CORRELATION_LOCAL_2026-10-24_CURRENT.json`，截图 `docs/screenshots/2026-10-24-odoo-error-correlation-current/`。线上实测未见该行为，故仍标记为未部署/未验证。
- Node `24.19.0` typecheck、目标组件 ESLint、两个 UAT 脚本 `node --check`、`git diff --check` 通过；未运行 Next production build。当前 HEAD 为 `3706b5607c9115b1d9b2d5a819aa31d51f11f3ce`，工作区另有大量既有 WIP，尚未提交本批变更。
- 后续：回读 Dokploy 构建 SHA 和健康状态；runtime 版本端点应注入/返回 `SOURCE_COMMIT`。之后部署仅包含本轮前端改动的候选版本，再验证价格建议请求头、502 fallback Request ID 与报表成功路径。价格建议上游 502 根因仍需检查 Cloudflare/origin 日志；本轮没有业务写入。

## 2026-10-21 `e7dc67d` 部署与全站 UI 续验

- Dokploy deployment 记录显示 `Done`，Commit `e7dc67ddcc7c61e5f3b225be84457e142ef914a7`；Demo `/api/public/version` 的 `builtAt=2026-10-21T13:35:45.867Z`。endpoint 的 frontend/backend commit 仍为空，因此应用自报 runtime SHA 仍未验证。
- 错误关联 ID 线上 390px UAT `11/11 PASS`：价格建议 API 继续返回 `502`，但请求现发送 UUID、错误页显示对应 ID，Retry 使用新 UUID 且显示新 ID；报表 API `200`。无页面错误/横向溢出，`blockedWrites=[]`。证据 `docs/UAT_ODOO_ERROR_CORRELATION_ONLINE_AFTER_E7DC67D.json`。
- 核心 UI 续验：全站 138 routes x 390/1440 `272/276 PASS`；交互 `14/14 PASS`；设置页 `26 PASS`；表格/可访问性 `14/14 PASS`。全站四个失败都为 `/platform/audit`、`/platform/failures` 两页在两个视口返回 404，它们未纳入 `e7dc67d`。设置、交互和表格测试没有 Odoo 业务写入；表格专项 `blockedNonGet=0`。证据分别为 `docs/UAT_ALL_STATIC_PAGES_POST_E7DC67D.json`、`docs/UAT_INTERACTION_POST_E7DC67D.json`、`docs/UAT_SETTINGS_MOBILE_POST_E7DC67D.json`、`docs/UAT_TABLE_A11Y_ONLINE_POST_E7DC67D.json`。
- 本批 `pos-ui` 修复和 UAT 已由 `e7dc67d` 推送；Node 24.19.0 typecheck、目标 ESLint、本地错误态/Retry fixture `13/13 PASS`。未运行本地 production build；未改动或推送 `pos-api`。
- 下一批先解决控制台 Audit/Failures 页及其 Java 21 pre-push 门禁，再汇总部署；价格建议 502 的 Cloudflare/origin 根因仍需独立排查。

## AI 日期销售回复回归续记

- 截图中的 `16 Oct 2026 sales` 当前线上响应能识别 `report_sales` 和日期，但金额未标 `AUD`，单日格式仍为 `1 day(s)`。新增 12 条同类自然问法的 Demo 只读专项：`0 PASS / 5 BLOCKED / 7 FAIL`；7 条成功请求均复现了回复格式缺陷，5 条为脱敏 `50210`。证据：`docs/UAT_AI_ASSISTANT_DATED_SALES_ONLINE_2026-10-21_CURRENT.json`。
- 工作区已有回复格式修复：销售额/AOV 增加 `AUD`，并修复 day/sale 单复数；本轮新增输出日期断言、澳洲日月顺序和中文同义问法的路由/周期回归。测试目录现有 213 个唯一用例。
- Node UAT 脚本语法与 `git diff --check` 通过。没有运行 Maven、build 或推送；Java 单测尚未执行，后端候选 SHA 未通过远程 Java 21 `mvn -B clean verify`。Demo 的 backend/runtime SHA 未提供，因此线上失败不能归因于当前工作树。

## 日期销售问法扩充

- 根据截图中 `16 Oct 2026 sales` 的实际请求路径，补充“某日卖了多少”的英文口语覆盖：`How much did we sell on 16 Oct 2026?`、`How much did the store sell on 16 October 2026?`、`What did we sell on 16 October 2026?`。快速路由现将 `sell` 与 `make/take` 同样识别为带明确日期的销售问题。
- 以上三条加入路由单测、周期解析单测、只读在线 UAT 脚本与问法目录；目录共 216 条。回答断言继续要求匹配 2026-10-16、AUD 币种和单数 `1 day`。
- 本轮未运行 Java/Maven 或部署。Demo 旧响应的缺币种和 `1 day(s)` 格式仍需在运行版本 SHA 可核验后复测；本地格式修复和新路由均未声明为已部署。

## AI 助手 216 条全量续测

- 以工作区 HEAD `6aeb3cf3b131bc74f8cc3d51075053f186e56d58` 对 Demo 执行当前目录全部 216 条只读助手问法：**75 PASS / 116 BLOCKED / 25 FAIL**。116 条 BLOCKED 全部为 HTTP 200 + 脱敏 `50210`；25 条 FAIL 为 7 条执行意图误路由、10 条历史/报表边界误路由、1 条中文批量改价目的页不符及 7 条日期销售格式断言失败。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-216-CURRENT-CONTINUATION.json`。
- 三条新增 `sell on [date]` 用法均被 `50210` 阻断，因此在线结果对本地新路由没有结论；全量调用只访问助手 API，`writeRequests=none: assistant API only`，但会产生 AI usage/audit 记录。
- Demo `/api/public/version` 返回 `frontend.commit=null`、`backend=null`、frontend `builtAt=2026-10-21T13:35:45.867Z`，部署标识未核验。失败仅描述当前服务，不归因于工作区源码。
- 已同步测试计划、测试矩阵、能力状态和根目录 `docs/功能说明.html`。本地 `node --check`、216 个 UAT case ID 唯一性及相关 `git diff --check` 通过；未运行 Java/Maven/build。Java 单测与精确候选 SHA 的 Java 21 `mvn -B clean verify` 仍未执行，不能推送/部署 `pos-api` 改动。

## 216 条失败用例覆盖核对

- 对 216-case Demo 结果中的 **25 条 FAIL** 逐条核对本地测试源：25/25 均找到对应的 Java 回归断言。覆盖为执行意图/批量改价路由、采购/定价/发票历史报表边界，以及 AUD/单日回复与日期周期。该核对证明断言存在，不代表 Java 测试已通过。
- Java 21 pre-push runner 仍不可用：本地 Java `1.8.0_292`；没有 Docker CLI 或 `.github/workflows`；SSH 配置候选 `110.40.77.237:53554` 的 TCP 检查失败。Demo runtime SHA 仍未提供，Java 后端变更保持未推送/未部署。

## AI 全量回归续记（2026-10-21）

- 当前工作树 `HEAD=e7dc67ddcc7c61e5f3b225be84457e142ef914a7`，但大量后端/文档/测试改动仍未提交。全量 213 条 Demo assistant API 用例：`75 PASS / 113 BLOCKED / 25 FAIL`；113 条均为脱敏 `50210`。25 条 FAIL 中 18 条是执行意图、历史报表边界和中文批量改价的实际路由不符；7 条日期销售请求识别了销售意图和日期，但回复缺少 AUD 与正确单日措辞。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_FULL-213-CURRENT.json`。单独 12 条日期销售专项为 `0 PASS / 5 BLOCKED / 7 FAIL`，证据：`docs/UAT_AI_ASSISTANT_DATED_SALES_ONLINE_2026-10-21_CURRENT.json`。
- 当前只读专项：features `13 PASS / 1 BLOCKED`（价格建议 Cloudflare 502）；reports `15 PASS / 1 BLOCKED`（AI 实时库存安全不可用）；availability `3/3`；route `9/9`；surface/auth `11/11`；UI `2/2`；metrics `9/9`；Sommelier `10/10`；合成发票 OCR `6/6`；英/中文合成 ASR `4/4`；AI enablement gate 与语音降级 UI 均 PASS；History/platform `9 PASS / 2 BLOCKED`（缺第二门店用户和 platform-operator 凭据）。证据均为 `docs/*_CURRENT-CODEX.json`。
- 只读 Odoo stock RPC 为 `4 PASS / 5 BLOCKED / 1 INFO`：租户绑定 ready，但没有显式 warehouse，测试的公司/仓库 domain 未找到匹配商品；不能推断权限问题或放宽 company scope。Admin guard 未运行，因为它会创建临时用户/角色。没有销售、库存、采购、收货、改价或收银业务写入；助手调用可能记录审计/usage 事件。
- `/api/public/version` 当前仍返回 `frontend.commit=null`、`backend=null`，因此线上问题不能归因到当前源码。没有运行本地 build/Maven；Java 单测未执行。任何 `pos-api` 推送前仍须对完全相同的候选 SHA 通过远程 Java 21 `mvn -B clean verify`；当前无已核实的 pre-push builder，未提交/推送/部署。

## 2026-10-21 Platform Audit/Failures 本地交互续验

- Failures 错误态新增页内 Retry，行为与 Audit 一致：临时 API 错误显示错误信息和 Retry，恢复后回到列表。
- 使用工作区 Node `24.19.0` + Playwright 受控 fixture 复验 Audit/Failures 的 390px、1440px：`4/4 PASS`。每页首次请求故意返回脱敏错误 envelope，自动初始化请求完成后点击 Retry 恢复；`pageErrors=0`、`overflow=false`、`blockedWrites=[]`。证据：`docs/UAT_PLATFORM_AUDIT_FAILURES_LOCAL_2026-10-24.json`。
- `pos-ui` Node 24 `typecheck`、Audit/Failures/PlatformShell 定向 ESLint、UAT 脚本 `node --check` 和 `git diff --check` 通过；未运行本地 production build。
- 该结果仍是 API fixture，不证明后端查询、数据库迁移或线上页面。Audit/Failures 的 Java 后端和迁移仍是工作树 WIP，必须在精确候选 SHA 上通过 Java 21 `mvn -B clean verify` 后才能推送并触发 Dokploy；当前不把本地页面标记为已部署。

## 2026-10-21 Demo 管理列表只读回归

- 使用管理员环境变量执行真实公网只读脚本，覆盖 Demo 的 Purchases、Mail Log、Trashed Items 和 app 控制台 Stores，在 390px/1440px 共 `8/8 PASS`。
- 检查包括 HTTP 200、标题、无横向溢出、搜索无结果态、Clear 操作和 Stores 创建入口保留；未发现业务写入。证据：`docs/UAT_ADMIN_LIST_BATCH_2026-10-17.json`，截图目录 `docs/screenshots/2026-10-17-admin-list-batch/`。
- 该证据的 `sourceCommit`/`deployment` 为空，表示只记录真实公网行为，不能绑定到当前工作区 SHA；平台 Audit/Failures 仍待后端门禁和部署身份核验。

## 2026-10-21 Operations/AI Usage 错误恢复优化

- Platform Operations 与 AI usage 页的 API 错误态新增页内 Retry，并在请求进行中禁用重复点击；Usage 保留时间窗口切换。
- Node `24.19.0` + Playwright fixture 在两个页面、390px/1440px 共 `4/4 PASS`：首次错误、Retry 恢复、Usage 窗口切换、`pageErrors=0`、无横向溢出、`blockedWrites=[]`。证据：`docs/UAT_PLATFORM_OPERATIONS_USAGE_LOCAL_2026-10-24.json`。
- 这是前端和受控 API fixture 证据；后端健康/指标接口的 Java 21 门禁、线上 runtime SHA 和 app 域登录态验收仍待完成。

## 2026-10-21 Operations/AI Usage 公网只读回归

- 使用管理员环境变量登录 `app.orithos.com.au`，Operations 与 AI usage 在 390px/1440px 共 `4/4 PASS`：HTTP 200、目标标题可见、页面错误 `0`、无横向溢出、非登录 API 写入 `0`。
- 证据：`docs/UAT_PLATFORM_OPERATIONS_USAGE_ONLINE_2026-10-24.json`。页面内容可见，Operations 的环境/依赖状态和 Usage 的窗口选择均加载；线上没有触发业务写入。
- 线上版本端点仍为 `frontend.commit=null`、`backend=null`，`builtAt=2026-10-21T13:35:45.867Z`；因此这证明当前公网页面行为，不证明本地 Retry 改动已运行。线上页面当前导航没有显示 Retry，因为本次 API 未注入错误。

## 2026-10-22 自动构建后平台可观测性复核

- 推送 `70cc234` 后，Demo `/api/public/version` 的 `builtAt` 更新为 `2026-10-21T15:56:09.064Z`；frontend/backend commit 仍为 `null`，只能证明构建时间变化，不能绑定运行 SHA。
- 之前的 webhook 请求返回 HTTP `301`，未取得可读部署结果；按规则未重复触发。随后自动构建时间发生变化，来源仍未核验。
- 新的四平台页面登录态脚本在 390px/1440px 共 `8` 个检查均被控制面 `/api/auth/login` HTTP `502` 阻断，未进入页面/API断言；证据 `docs/UAT_PLATFORM_OBSERVABILITY_ONLINE_2026-10-22.json`。这不是页面 PASS/FAIL 结论，而是线上控制面登录可用性阻断。
- 需要先查看 Dokploy/Cloudflare 源站日志，确认 app 控制面登录 502、容器健康和 backend 依赖状态，再重跑 Audit/Failures/Operations/Usage 的认证只读验收。不要把已更新 builtAt 当作完整部署或运行身份证明。

## 2026-10-22 Git 推送恢复后的复核

- GitHub 连接恢复，`3a2ca5f` 已成功推送到 `origin/main`。
- 推送后 Demo `/api/public/version` 仍为 `builtAt=2026-10-21T15:56:09.064Z`、`frontend.commit=null`、`backend=null`；没有观察到新的构建身份。
- 认证观测脚本再次运行，8 个控制台页面检查全部在 `/api/auth/login` 返回 HTTP `502` 时阻断；证据 `docs/UAT_PLATFORM_OBSERVABILITY_ONLINE_2026-10-22.json` 已更新。当前不能判定 `3a2ca5f` 是否被 Dokploy checkout 或运行。
- Dokploy webhook 仍曾返回 `301`，不再重复触发；需要从 Dokploy/Cloudflare 日志确认 Source/Git 绑定、backend 容器和登录 502 根因。

## 2026-10-22 `1c36a11` backend cycle 修复后复核

- 远端新增 `1c36a11 fix: remove security configuration bean cycle`，Demo builtAt 更新到 `2026-10-21T16:14:31.063Z`，说明新构建时间发生变化。
- 认证观测再次运行仍为 `8/8 BLOCKED`：app `/api/auth/login` HTTP `502`，Audit/Failures/Operations/Usage 均未进入页面断言。frontend/backend runtime SHA 仍为 `null`。
- 结论：`1c36a11` 的构建时间更新不能证明 backend 健康或平台页面可用；必须读取 backend 容器启动/依赖日志并修复登录 502 后再做线上验收。

## 2026-10-22 用户确认 Dokploy 面板部署成功后的复核

- 用户确认 Dokploy 最新一次部署状态为“成功”。这只作为控制台状态记录，不等同于容器健康、源码 SHA 对齐或业务验收通过；本次没有取得可核验的 Dokploy commit SHA。
- 按部署成功信息重新执行只读平台可观测性脚本：`docs/UAT_PLATFORM_OBSERVABILITY_ONLINE_2026-10-22.json`，结果仍为 **8/8 BLOCKED**。390px 和 1440px 下四页均在登录阶段阻断，`POST /api/auth/login` 返回 HTTP `502`；没有进入页面标题、API 或布局断言，也没有业务写入。
- Demo 版本端点仍为 `builtAt=2026-10-21T16:14:31.063Z`、`frontend.commit=null`、`backend=null`。因此当前仍不能证明 `0494fcb` 或 Dokploy 面板所示的最新部署正在运行。

### 当前已完成

- 前端平台可观测性页面已实现：Operations、AI Usage、Audit、Failures；页面级 Retry、请求中禁用重复操作、错误恢复状态、时间窗口切换和日期范围校验已完成。
- 已完成多批次前端产品化、AI 输入与 provider 错误边界、Odoo 错误关联 ID、价格建议/报表错误态、库存/定价/收银等 UI 修复；具体提交和证据以本文件前文及 `docs/FUNCTIONALITY_CHECKLIST.md` 为准。
- 本地 Node `24.19.0` 静态检查通过：typecheck、目标 ESLint、UAT 脚本 `node --check`、`git diff --check`。平台页面受控 fixture 为 Audit/Failures `4/4 PASS`、Operations/Usage `4/4 PASS`。
- 已有线上只读证据：管理员列表 `8/8 PASS`、Operations/Usage `4/4 PASS`、价格页面 `8/8 PASS`、多轮全站路由/交互/设置/表格可访问性回归；这些证据均明确标注 runtime SHA 未核验，不能替代当前部署验收。

### 当前未完成或未证实

- `/api/auth/login` 的线上 `502` 根因仍未定位；必须读取 Dokploy backend 容器启动日志、依赖连接状态及 Cloudflare/origin 日志。
- Dokploy Source/Git、实际构建 commit、镜像/container SHA、backend/frontend 健康状态仍未从控制台或版本端点核验；版本端点需要返回可比对的 `SOURCE_COMMIT`。
- Audit/Failures/Operations/Usage 的部署后线上验收尚未完成；当前不能把本地 Retry fixture 结果宣称为线上结果。
- AI 全量工作流仍有 provider `50210` 阻断和若干路由/回答格式失败；价格建议上游 `502`、实时库存安全不可用、日期销售回复格式等问题需在运行 SHA 可核验后重新归因和复测。
- 未运行本地 Next production build；涉及 `pos-api` 的改动未通过同一候选 SHA 的 Java 21 `mvn -B clean verify` 时，不得继续推送后端或触发新的部署。

### 主要功能范围

- 门店运营：POS 销售/付款/退款、收银班次、库存盘点与调拨、采购/补货、供应商、商品与价格管理、税率/支付方式/门店设置。
- 平台管理：门店、用户/角色、审计、失败记录、运营状态、AI 用量与成本、租户/连接状态。
- AI 能力：销售与库存问答、补货/调价意图、侍酒推荐、AI 报表、价格建议、发票/酒标识别、语音输入，以及错误降级和关联 ID 展示。
- 数据边界：Odoo 为业务数据源；生产验收默认只读，任何写入测试必须使用明确批准的隔离环境。

### 下一步交接顺序

1. 从 Dokploy 取得最新部署的 commit、构建日志和 backend 容器健康状态，先处理登录 `502`。
2. 让 `/api/public/version` 返回 frontend/backend 与 `SOURCE_COMMIT`，并核对三者一致。
3. 登录恢复后重跑四个平台页面双视口只读验收，再重跑 AI 代表性及全量矩阵。
4. 将每项结果分别标为“已实现、已本地验证、已部署、已线上验证”，不要用面板成功状态替代运行证据。

## 2026-10-22 `ff32021` 前端 Retry 与移动定价批次

- `ff32021` 已在 `main` / `origin/main`，只包含 `pos-ui` 与 UAT 脚本，不涉及 `pos-api`，因此不触发 Java 21 后端门禁问题。
- `AsyncState` 的所有列表错误态现在防止重复 Retry，显示 spinner、`aria-busy` 和明确的 Retrying 状态，并移除面向用户的内部 API 地址提示。
- Capped Pricing 与 Bulk Price Edit 的移动端标题、边距、筛选输入和价格输入统一为触控友好的至少 44px；Capped Pricing tabs 补充 `aria-pressed`。
- Node `24.19.0` typecheck、目标 ESLint、`git diff --check` 通过。浏览器 fixture 结果：库存/定价响应式 `15/15 PASS`、价格建议 `PASS`、Audit/Failures `4/4 PASS`、Operations/Usage `4/4 PASS`、实体目录和不支持动作保护 `PASS`；均为受控/只读验证，业务写入 `0`。
- 本批没有运行 Next production build；线上尚未归因到 `ff32021`。Demo runtime commit 仍为空，app 登录 HTTP `502` 仍阻断线上平台验收。证据文件已由相关 UAT 脚本刷新。
- 本批推送后仅触发一次 Dokploy webhook，返回 HTTP `301`；按发布规则未重复触发。定价四页线上脚本在登录阶段同样收到 HTTP `502`，证据 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19.json`，不是页面断言失败。
- 发布恢复前置：在 Dokploy Source/Git 核对仓库 `aishawn/aistore_pos`、分支 `main`、根目录 `/` 和 `docker-compose.yml`；确认 checkout SHA 后读取完整构建日志、容器健康和 runtime SHA，再重跑定价与四个平台双视口验收。

## 2026-10-22 共享管理页壳响应式批次

- `AdminPageLayout` 的筛选栏现在允许窄屏换行；固定操作栏按钮组可换行并保留浮动助手安全间距；AdminPill/Outline 工具按钮统一至少 44px 触控高度。
- Node `24.19.0` typecheck、目标 ESLint、diff check 通过；产品化 UI `12/12 PASS`、AI 焦点模态五视口 `5/5 PASS`、AI 能力门禁 `10/10 PASS`、供应商连接响应式 `5/5 PASS`、盘点边界 `20/20 PASS`，业务写入 `0`。汇总证据：`docs/UAT_SHARED_ADMIN_LAYOUT_LOCAL_2026-10-22_FF32021.json`。
- 该批次尚未部署；当前 Dokploy webhook 301 和线上登录 502 阻断仍适用。

## 2026-10-22 `3845bf2` Dokploy 部署后线上复核

- Dokploy deployment `3845bf2` 显示 `Done`；构建日志显示 backend/frontend/mysql/r2-sync 镜像构建完成，Compose 部署成功，backend started，MySQL/Redis healthy。证据 `docs/UAT_DOKPLOY_DEPLOYMENT_3845BF2.json`。
- 线上平台可观测性 `8/8 PASS`：Operations、AI Usage、Audit、Failures 在 390px/1440px 均 HTTP 200、标题可见、无页面错误、无横向溢出、无非 GET 业务写入。当前运行证据应以脚本新生成的线上 JSON 为准。
- 全站静态页面 `138 × 2 = 276/276 PASS`；交互 `14/14 PASS`；表格/可访问性 `14/14 PASS`；均为只读检查。
- 定价四页结果为 **0 FAIL / 6 BLOCKED / 2 可继续**：Stock List/Capped Pricing 的 Classic POS API 已退役，Price Suggestions 上游返回 Cloudflare `502`；Bulk Price Edit 页面可达且无横向溢出。证据 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-22_3845BF2_RECHECK.json`。
- AI features `13 PASS / 2 BLOCKED / 0 FAIL`：价格建议 API `502`、发票 OCR 探针 HTTP `410/41001`（路由不可用/已退役）；AI 配置、NLQ、Sommelier、ASR/空输入保护、页面入口和匿名守卫通过。证据 `docs/UAT_AI_FEATURES_VERIFY_2026-10-22_3845BF2_RECHECK.json`。
- AI 工作流全量复测 `179 PASS / 37 BLOCKED / 0 FAIL`；BLOCKED 主要为 provider/Odoo 数据不可用，路由专项 `2/2 PASS`。证据 `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_FINAL-3845BF2.json`、`docs/UAT_AI_WORKFLOW_ROUTE_FIX_3845BF2.json`。
- `/api/public/version` 的 frontend/backend commit 仍为 `null`，只有 builtAt；Docker 日志中的 `SOURCE_COMMIT` 为空且 Maven/frontend 层为缓存命中。因此本轮可标记“已部署且线上行为可复核”，不能标记“runtime SHA 已绑定”。

## 2026-10-22 `a4740ff` 最新部署复核

- Dokploy 最新文档部署 `a4740ff` 显示 `Done`，其前一项 backend schema 提交 `fc5076b` 也显示 `Done`。
- 平台四页在最新部署后再次 `8/8 PASS`；证据 `docs/UAT_PLATFORM_OBSERVABILITY_ONLINE_2026-10-22_A4740FF.json`。
- Demo 版本端点 backend builtAt 更新为 `2026-10-21T18:24:30Z`，frontend builtAt 保持 `2026-10-21T17:42:25.986Z`，两个 commit 字段仍为 `null`。当前仍需补齐构建身份注入，才能完成 exact-SHA 绑定。
## 2026-10-22 AI proxy availability follow-up

- The executable assistant catalog contains **216 unique IDs**. The retry-enabled representative smoke selected replenishment, pricing, recommendation, invoice, and daily-sales cases, but Demo login returned HTTP 502 from Cloudflare after three attempts. No assistant request or business write was issued.
- Anonymous probes for `/api/auth/me`, `/api/ai/config/client`, and `/api/ai/assistant` all returned HTTP 502, so the block is shared by the frontend-to-backend proxy rather than a single AI workflow. Evidence: `docs/UAT_AI_BACKEND_PROXY_HEALTH_2026-10-22.json` and `docs/UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-22-DIAGNOSTIC.json`.
- `/api/public/version` returns HTTP 200 but still exposes no frontend/backend runtime SHA. After backend changes, retain the Java 21 same-candidate-SHA `mvn -B clean verify` gate and rerun the full 216-case matrix only after login and proxy health recover.

## 2026-10-22 latest owner deployment confirmation

- Owner confirmed that the latest Dokploy deployment is shown as successful. This is a panel-status confirmation only; no deployment commit SHA, fresh exact-SHA Maven log, container digest, or runtime SHA was supplied.
- Repository state is `HEAD == origin/main == fc5b736` (`docs: record AI provider recovery and full UAT`). The current working tree still contains unrelated WIP and generated UAT artifacts; do not deploy those files implicitly.
- The known `AiProviderConfig` compilation message belongs to an earlier Dokploy build context and is not evidence against the current checkout. Do not change Java sources solely from that log; any future `pos-api` candidate still requires the Java 21 same-candidate-SHA `mvn -B clean verify` gate before push.
- Current release classification remains: implemented/local checks and selected online behavior are documented; source-to-runtime identity is unverified. Production write UAT remains out of scope.

## 2026-10-22 Stock List Odoo migration batch

- Stock List now reads products and categories through the existing Odoo allowlisted records bridge, including search, category filter, stock-only filter, paging, and Odoo product CSV export. It no longer requests Classic POS `/api/stock-list` or `/api/classifications/category`.
- Product name and Odoo list price edits use the scoped `/api/odoo/products/:id` route with expected-price concurrency protection. Cost is shown as managed by Odoo purchasing when unavailable and is never fabricated or written from this page.
- The Odoo records bridge validates `stockOnly` and applies `qty_available > 0` for that filter. The product bridge accepts a validated name update.
- Local evidence: Node `24.19.0` typecheck, targeted ESLint, `node --check`, and `git diff --check` passed; responsive fixture `15/15 PASS`, `blockedWrites=0`, `forbiddenLegacyRequests=[]`: `docs/UAT_STOCK_LIST_ODOO_LOCAL_2026-10-22.json`.
- This batch is frontend/Next route work only; the local candidate has now been deployed and runtime-identified below. Price writes still belong in an approved isolated Odoo environment.

## 2026-10-22 `c031989` deployment and Demo verification

- Dokploy deployment for `c031989a36554083d376984e4eb151cfa2b4de25` is `Done`; `/api/public/version` reports the same frontend/backend runtime SHA. This is the first exact runtime identity match for this batch.
- Demo Stock List read-only UAT passed at 390px and 1440px: `2/2 PASS`, HTTP 200, no page errors, no horizontal overflow, Odoo records requests observed, and zero requests to the retired Classic Stock List/category routes. The Odoo CSV export downloaded `demo-products.csv`; no business writes were sent. Evidence: `docs/UAT_STOCK_LIST_ODOO_ONLINE_2026-10-22_C031989.json`.
- The broader pricing run is `6 PASS / 2 BLOCKED / 0 FAIL`; both Capped Pricing checks are blocked because its legacy Classic POS API is retired. Bulk Price Edit and Price Suggestions remain reachable and visually healthy.
- The next migration target is Capped Pricing/Odoo price-list items. Keep it separate from this verified Stock List batch, and continue to use isolated Odoo UAT for any real price write.
## 2026-10-22 SHA-aligned final AI recheck

- A normal Dokploy Compose Deploy completed without Fresh Volumes. Demo
  `/api/public/version` now reports frontend/backend
  `7c5e981774e14ce7ebfc952799049cfdff6cbdb9`, matching the source checkout.
- The complete authenticated assistant catalog returned **216 PASS / 0
  BLOCKED / 0 FAIL**, with `matchesSourceCommit=true`; evidence:
  `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_FULL-SHA-7C5E981.json`.
- This is assistant-only read-only coverage. No sale, refund, purchase,
  receiving, inventory, price, payment, or register-close write was sent.
- Remaining AI companion limits are explicit: invoice OCR route `410/41001`,
  live stock report unavailable, and two History/platform checks blocked by
  unavailable isolated accounts. Pilot remains NO-GO for business-write UAT,
  Odoo reconciliation, backup recovery and durable alert handling.

## 2026-10-22 current AI full recheck

- The complete authenticated Demo assistant-only catalog selected **216/216**
  cases and returned **216 PASS / 0 BLOCKED / 0 FAIL**. Evidence:
  `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_FULL-CURRENT.json`.
- The run was read-only at the business layer: no sales, refund, purchase,
  receiving, inventory, price, payment, or register-close request was sent.
  Assistant usage/audit telemetry may exist.
- Source checkout was `c031989`; the runtime endpoint reported both frontend
  and backend as `e799c19`; `matchesSourceCommit=false`. Keep this as online
  behavior evidence only until the intended candidate SHA is deployed and
  returned by `/api/public/version`.
- Companion suites: availability `3/3`, enabled gate PASS, surface/auth
  `11/11`, route `9/9`, UI `2/2`, metrics `9/9`; feature `14 PASS / 1 BLOCKED`
  (invoice OCR route `410/41001`), reports `15/16` (stock source unavailable),
  History/platform `9 PASS / 2 BLOCKED` (missing isolated credentials).
- Pilot remains **NO-GO** for release identity, isolated business write and
  Odoo reconciliation, backup recovery, and durable operational alerting.

## 2026-10-22 current handoff update: Odoo stock and capped pricing

- **Stock List is complete and deployed.** It reads products and categories from Odoo, supports search, category and stock filters, pagination, desktop table/mobile cards, and CSV export. Retired Classic POS stock-list/category requests are no longer used. Deployment `c031989a36554083d376984e4eb151cfa2b4de25` was reported `Done`; the public version endpoint matched frontend/backend runtime SHA to that commit. Evidence: `docs/UAT_STOCK_LIST_ODOO_ONLINE_2026-10-22_C031989.json`.
- **Capped Pricing has been migrated to Odoo price-list rules.** The page now uses `/api/odoo/pricelist-items` for search, pagination, refresh, and current-price editing, with optimistic concurrency protection. The retired Classic POS import entry point was removed. Changes are recorded in `e0e3bfc`, `8c0d943`, `f751024`, and `2f63f0c`; the empty-state classification is in `06342c6`.
- **Current online data state:** the Demo Odoo company currently returns an empty price-rule collection (`items=[]`). This is a valid empty state, so online pricing verification is data-blocked rather than a UI failure. A real rule edit still requires an isolated Odoo UAT company with an existing price-list rule.
- **Pricing verification:** local stock/pricing responsive fixture `15/15 PASS`, `blockedWrites=0`, retired Classic requests `0`; online pricing read-only recheck `8/8 PASS` with no business writes. Bulk Price Edit save-guard and Price Suggestions UI fixtures pass locally. Evidence: `docs/UAT_STOCK_PRICING_ODOO_LOCAL_2026-10-22.json`, `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-22_E0E3BFC_RECHECK.json`.
- **Still incomplete:** real Odoo price-rule save and POS price-list effect; Price Suggestions upstream Cloudflare `502`; AI invoice OCR route `410/41001`; live inventory AI report unavailable; physical payment/printing/cash-drawer devices; offline POS; full cash close and procurement receiving reconciliation; backup/recovery and tenant isolation write tests.
- **Build/deployment discipline:** frontend typecheck, targeted ESLint, UAT script syntax, and diff checks pass. Do not claim backend changes as deployed without Java 21 `mvn -B clean verify` on the exact candidate SHA. Dokploy “success” confirms deployment completion only; exact runtime SHA must still be read from `/api/public/version` or deployment logs for any newer batch.
- **Acceptance summary:** implemented and read-only verified does not equal production-ready. The pilot remains **NO-GO** until isolated business-write UAT, Odoo reconciliation, runtime identity, and operational recovery evidence are complete.

## 2026-10-22 frontend reliability batch: pagination and filter controls

- Odoo records now return a real `hasNext` signal by fetching one bounded look-ahead row and trimming it before tax enrichment. Stock List uses that signal instead of treating a full page as an exact count; the visible count is exact on the last page and marked with `+` while more data exists.
- Stock List, Capped Pricing, and Odoo Bulk Price Edit now have keyboard-accessible clear search/filter controls with 44px minimum touch height and explicit aria labels. Bulk Price Edit also disables Next from the Odoo `hasNext` value, preventing navigation to an empty guessed page.
- Odoo save failure/retry fixture was updated from retired Classic endpoints to the live Odoo routes. It passed `7/7`, covering Stock List and Capped Pricing failed PATCH, retained edits, retry, duplicate-save protection, and intercepted-write boundaries.
- Responsive pricing fixture passed `15/15` across 320/390/768/1024/1440px, including clear filters, mobile fields, desktop alignment, AI entry placement, no page errors, and zero business writes. Evidence: `docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-22_FILTERS_FINAL.json`, `docs/UAT_STOCK_PRICING_SAVE_GUARD_LOCAL_2026-10-22_ODOO.json`.
- Local checks passed: Node 24 typecheck, targeted ESLint, `node --check`, and `git diff --check`; no local production build was run. This is a frontend-only batch and does not require the Java 21 backend gate.
- Pending post-deploy verification: online hasNext pagination, clear controls, Odoo Bulk Price Edit next-page behavior, and live gateway error recovery. No production business writes are authorized for these checks.
- Pre-deploy online baseline: `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-22_FRONTEND_BATCH_PENDING.json` returned `8 PASS / 2 BLOCKED / 0 FAIL`; `/api/public/version` still reported runtime `c4585ad`, while source was `91cd5e2`. The two blocks were the old runtime's empty/retired Capped Pricing path. Dokploy webhook returned HTTP `301`, so no further retries were made under the branch-mismatch rule.
- Productization route regression is now `31/31 PASS` after aligning the fixture with the current Odoo price-suggestion page size (`10`) and rounding tax-inclusive/exclusive totals to cents. This remains local route-fixture evidence with all network calls intercepted and zero live writes.

## 2026-10-22 latest full AI recheck on `c4585ad`

- The complete authenticated assistant catalog selected **216/216** cases and returned **216 PASS / 0 BLOCKED / 0 FAIL**. Evidence: `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_FULL-RECHECK-C4585AD.json`.
- The run was assistant API only. It issued no sale, refund, purchase, receiving, inventory, price, payment, or register-close business write; assistant usage/audit telemetry may still be recorded.
- The Demo runtime reported frontend/backend `c4585ad`. The worktree source was `4b0f448`, a documentation-only commit after `c4585ad`; the evidence therefore keeps `matchesSourceCommit=false` rather than claiming the documentation commit was deployed.
- A six-case retry of the preceding transient failures also returned **6/6 PASS**: stock lookup, stock navigation, and dated sales prompts all returned HTTP 200. Evidence: `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_RECHECK-6.json`.
- Remaining companion limits are unchanged: invoice OCR returns `410/41001`, the live stock report safely returns unavailable, and two History/platform checks require isolated second-store and platform-operator credentials. The pilot remains **NO-GO** for isolated business writes, Odoo reconciliation, backup recovery, and durable alert handling.

## 2026-10-22 deployment identity follow-up

- GitHub `main` is `409c3c3`; the public version endpoint still reports frontend/backend `c4585ad`, so the current runtime is known and healthy but does not include the latest documentation-only evidence commit.
- A normal Dokploy Compose webhook attempt returned HTTP `301` with `Branch Not Match`. Per the deployment rule, no retry was sent. In the Dokploy Source/Git settings, verify repository `aishawn/aistore_pos`, branch `main`, repository root `/`, and `docker-compose.yml` before the next deployment. No Fresh Volumes operation is authorized.
- The same service was then deployed through the Dokploy web console with the ordinary `Deploy` action. Deployment `091718e` is `Done`; backend/frontend/mysql/r2-sync images built, all application containers are running, and MySQL/Redis report healthy. The public version endpoint remains `c4585ad` because `091718e` contains documentation only; no application-code change was expected in that image.

## 2026-10-22 serial AI companion recheck

- Availability `3/3 PASS`, route matrix `9/9 PASS`, surface/auth `11/11 PASS`, and admin metrics `9/9 PASS`. Evidence: `docs/UAT_AI_AVAILABILITY_ONLINE_2026-10-22-LATEST.json`, `docs/UAT_AI_ROUTES_ONLINE_2026-10-22-LATEST.json`, `docs/UAT_AI_SURFACE_ONLINE_2026-10-22-LATEST.json`, and `docs/UAT_AI_METRICS_ONLINE_2026-10-22-LATEST.json`.
- The feature matrix was rerun serially with one admin session and returned **14 PASS / 0 FAIL / 1 BLOCKED**. The only block is the explicit invoice OCR `410/41001` unavailable/deprecated response; no extraction or business write was claimed. Evidence: `docs/UAT_AI_FEATURES_ONLINE_2026-10-22-SERIAL.json`.
- An earlier parallel run showed a transient anonymous-assistant `200`; that run shared the admin session with other scripts. The serial run returned the expected anonymous `401`, so the parallel result is diagnostic only and is not treated as a product failure.

## 2026-10-23 AI full regression verified

- Demo `/api/public/version` now reports frontend/backend SHA `3edd72d84f514856923c0c0d50b01fe7b015e120`, matching the runner source commit.
- The complete 216-case assistant catalog passed **216/216**, with zero blocked cases, assertion failures, or business writes. The five-case representative smoke passed **5/5**. Evidence: `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-23_FULL-216.json` and `docs/UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_2026-10-23.json`.
- This verifies authenticated assistant routing on the identified runtime. It does not by itself approve real Odoo transactions or close the separately tracked price-suggestions, live-stock, OCR-field, cross-store and isolated-write gaps.

## 2026-10-22 Bulk Price Edit keyboard-accessibility batch

- [x] Odoo Bulk Price Edit Refresh, Save reviewed prices, Previous, and Next buttons now expose visible `focus-visible` outlines.
- [x] Local Webpack browser fixture passed **12/12** at 390px and 1440px, including focus assertions, price suggestion prefill, manual confirmation, lost-write read-back, unknown-result retry block, no page errors, and no horizontal overflow. Evidence: `docs/UAT_PRODUCTIZATION_UI_LOCAL_2026-10-22_KEYBOARD_FOCUS.json`; screenshots: `docs/screenshots/2026-10-22-productization-keyboard-focus/`.
- [x] Node 24 typecheck, targeted ESLint, and `node --check scripts/productization-ui-local-uat.mjs` passed. No local production build was run; the fixture intercepted all API calls and sent zero business writes.
- [ ] This UI batch is local-only until Dokploy deployment completes and Demo `/api/public/version` is read back. The user-reported Dokploy status is successful, but no SHA was supplied, so runtime identity and online page verification remain pending.
- [ ] Remaining release gates are unchanged: isolated Odoo transaction/reconciliation, second-tenant isolation, backup recovery, device/offline POS, live price suggestions, and live inventory AI report.

### Deployment result for `cfd6967`

- [x] Commit `cfd6967` was pushed to `origin/main`.
- [ ] The provided Dokploy Compose webhook returned HTTP `301`; no retry was sent under the branch-mismatch rule.
- [x] Demo `/api/public/version` was read successfully at HTTP 200 and still reports frontend/backend `3edd72d84f514856923c0c0d50b01fe7b015e120`, so the new keyboard-focus batch is not deployed. Verify Dokploy Source/Git repository `aishawn/aistore_pos`, branch `main`, repository root `/`, and compose file `docker-compose.yml` before the next ordinary Deploy action.

## 2026-10-22 platform failures and invoice preview follow-up

- [x] Platform Failures now treats the operational-alert endpoint as an optional companion. If `/api/admin/alerts` is unavailable, failure groups still load and the page shows a non-blocking alert-status message.
- [x] Platform Audit/Failures local browser fixture passed **4/4** at 390px and 1440px with alert endpoint fallback, retry recovery, no page errors, no overflow, and zero non-GET requests. Evidence: `docs/UAT_PLATFORM_AUDIT_FAILURES_LOCAL_2026-10-22_ALERT-FALLBACK.json`.
- [x] Invoice preview JSX was simplified by computing the availability message before render; Node 24 typecheck now passes. Invoice mock UAT passed with capability retry, scan retry, preview editing, Odoo links, no received-order save action, and zero business writes: `docs/UAT_INVOICE_SCAN_MOCK_2026-10-22_CURRENT.json`.
- [x] Targeted ESLint for Platform Failures, Scan Invoice, and Stock List plus both UAT script syntax checks passed. No local production build was run.
- [ ] Platform alert backend commit `14b8d81` is now present on `origin/main` from a parallel worktree, but no Java 21 same-candidate `mvn -B clean verify` log is available. Treat its build and runtime behavior as unverified; the frontend fallback remains safe against an older runtime.

### Deployment result for `f5a2948`

- [x] Frontend batch commit `f5a2948` was pushed to `origin/main`.
- [ ] Dokploy Compose webhook again returned HTTP `301`; no retry was sent.
- [x] Demo `/api/public/version` returned HTTP 200 but still reports frontend/backend runtime `3edd72d84f514856923c0c0d50b01fe7b015e120` (built at `2026-10-22T01:11:39.175Z` / `2026-10-22T00:55:56Z`). The platform fallback and invoice JSX fix are therefore not online-verified.
- [ ] Dokploy Source/Git binding must be corrected before another deployment attempt: repository `aishawn/aistore_pos`, branch `main`, root `/`, compose file `docker-compose.yml`.

### Deployment result for current `main` (`a5511fc`)

- [x] Stock List focus batch and the prior frontend/alert commits are present on `origin/main`; current HEAD is `a5511fc`.
- [ ] Dokploy webhook returned HTTP `301`; no retry was sent.
- [x] Demo `/api/public/version` returned HTTP 200 with frontend runtime `3edd72d84f514856923c0c0d50b01fe7b015e120` and backend runtime `null`. This does not verify any current `main` commit and the backend identity is incomplete.
- [ ] Backend commits `14b8d81` and `09af7a6` still have no recorded same-SHA Java 21 `mvn -B clean verify` result. Do not treat the current Compose state as a successful backend deployment.

## 2026-10-22 login and platform operations focus consistency

- [x] Login primary action, Manage Cash submit action, and Platform Operations/AI Usage refresh and retry actions now expose visible `focus-visible` outlines.
- [x] Platform Operations/Usage local fixture passed **4/4** at 390px and 1440px with retry recovery, focus assertions, no page errors, no overflow, and zero non-GET requests. Evidence: `docs/UAT_PLATFORM_OPERATIONS_USAGE_LOCAL_2026-10-22_FOCUS-CONTROLS.json`.
- [x] Login page direct browser check passed at 390px: Login button visible, focus style present, and document width did not overflow the viewport.
- [x] Node 24 typecheck and targeted ESLint passed; no local production build was run.

## 2026-10-22 current Demo runtime table accessibility recheck

- [x] Demo read-only table/accessibility suite passed **14/14** on the current runtime; `unexpectedWrites=0`. Four non-GET requests were intercepted by the suite's safe-path guard. Evidence: `docs/UAT_TABLE_A11Y_ONLINE_2026-10-22_CURRENT_RUNTIME.json`.
- [ ] This evidence describes the currently running frontend `3edd72d...` and does not verify the un-deployed local commits `3fc821c` or `7400123`.

### Deployment result for `a37ef77`

- [x] Current `main` candidate `a37ef77` is pushed and the working tree is aligned with `origin/main`.
- [ ] Dokploy webhook returned HTTP `301`; no retry was sent.
- [x] Demo `/api/public/version` returned HTTP 200 and reports frontend/backend runtime `3edd72d84f514856923c0c0d50b01fe7b015e120`, built at `2026-10-22T01:33:13Z`. This confirms the old runtime is healthy but does not contain `a37ef77`.

## 2026-10-22 Stock List focus consistency follow-up

- [x] Stock List export failure retry and category retry actions now expose visible `focus-visible` outlines, matching the existing search-clear control and shared admin actions.
- [x] Responsive stock/pricing fixture passed **15/15** across 320/390/768/1024/1440px with the new Export CSV and Clear Filters focus assertions, no page errors, no overflow, and `blockedWrites=0`. Evidence: `docs/UAT_STOCK_TABLES_RESPONSIVE_LOCAL_2026-10-22_FOCUS-CONTROLS.json`.
- [x] Node 24 typecheck, targeted ESLint, `node --check`, and `git diff --check` passed. No local production build was run.

@@
## 2026-10-22 Settings Data focus follow-up

- Settings Data now gives Retry, Remove sample data, Import products, Export products, and Download template visible `focus-visible` outlines. The actions and data flow are unchanged.
- Local checks passed: Node 24 typecheck, targeted ESLint, and `git diff --check`. Evidence: `docs/UAT_SETTINGS_DATA_FOCUS_LOCAL_2026-10-22.json`. No production build was run and no business write was sent.
- The authenticated Settings mobile script was attempted against Demo but timed out on an existing `/settings/users` mobile-card selector. Record that suite as blocked; do not infer a Settings Data failure from it.
- This batch is not online-verified. Read `/api/public/version` after deployment and require an exact candidate SHA match before upgrading its status.
## 2026-10-22 Settings Data deployment follow-up

- [x] Candidate `fb67f43` was pushed to `origin/main`; Settings Data focus evidence and handoff updates are included.
- [ ] Dokploy Compose webhook returned HTTP `301` (`Branch Not Match`); no retry was sent. Before the next deploy, verify repository `aishawn/aistore_pos`, branch `main`, root `/`, and `docker-compose.yml`.
- [ ] Demo `/api/public/version` still reports frontend/backend `a5511fc689a8b4c871c0bacda15713afbd86b44f`, so `fb67f43` is not online-verified.
## 2026-10-22 Settings Users focus follow-up

- Settings Users now gives all seven user-management buttons visible keyboard focus states: role retry, invite, copy invite/reset links, and mobile/desktop reset-link actions.
- Local checks passed: Node 24 typecheck, targeted ESLint, and `git diff --check`; evidence `docs/UAT_SETTINGS_USERS_FOCUS_LOCAL_2026-10-22.json`. No production build or business write was run.
- This is grouped with the pending Settings Data focus batch for the next deployment. Online verification remains pending until Dokploy accepts the exact candidate SHA.
## 2026-10-22 Roles and Permissions focus follow-up

- Roles & Permissions retry, permission retry, edit/delete, and role-editor Cancel/Save controls now expose visible keyboard focus states at both responsive layouts.
- Local checks passed: Node 24 typecheck, targeted ESLint, and `git diff --check`; evidence `docs/UAT_SETTINGS_ROLES_FOCUS_LOCAL_2026-10-22.json`. No production build or business write was run.
- This is grouped with Settings Data and Settings Users for the next deployment; exact runtime SHA verification remains pending.
## 2026-10-22 Core Settings focus follow-up

- Account Save plus Payment, Registers & Outlets, and Tax Retry now have visible keyboard focus states.
- Local checks passed: Node 24 typecheck, targeted ESLint, and `git diff --check`; evidence `docs/UAT_SETTINGS_CORE_FOCUS_LOCAL_2026-10-22.json`. No production build or business write was run.
- This completes the currently identified Settings button-focus consistency pass; grouped online validation remains pending.
## 2026-10-22 grouped Settings deployment status

- [x] Candidate `0a1a19c` contains the grouped Settings Data, Users, Roles, Account, Payment, Registers & Outlets, and Tax focus-state improvements and is pushed to `origin/main`.
- [ ] Dokploy webhook returned HTTP `301` (`Branch Not Match`) again; no retry was sent. Verify Source/Git repository `aishawn/aistore_pos`, branch `main`, root `/`, and `docker-compose.yml` before the next deployment.
- [ ] Demo runtime identity remains the previously deployed SHA; no grouped Settings change is online-verified.
## 2026-10-22 Stocktake and cash focus follow-up

- Manage Cash Retry and Stocktake/Express Stocktake clear, recovery, add/remove, and review actions now expose visible keyboard focus states.
- Local behavioral checks passed: Odoo Stocktake fixture across five viewports, count-boundary fixture `20/20`, zero real writes, no page errors or overflow. Typecheck, targeted ESLint, script syntax, and diff checks also passed. Evidence: `docs/UAT_STOCKTAKE_CASH_FOCUS_LOCAL_2026-10-22.json`.
- No production build was run. Online verification remains pending the Dokploy Source/Git correction and exact runtime SHA.
## 2026-10-22 stocktake/cash deployment status

- [x] Candidate `3bc4b9f` is pushed and includes the grouped Settings work plus Stocktake, Express Stocktake, and Manage Cash focus-state improvements.
- [ ] Dokploy webhook returned HTTP `301` (`Branch Not Match`) again; no retry was sent. This is the same Source/Git binding blocker, not an application test failure.
- [ ] Demo `/api/public/version` remains on the older runtime; the new stocktake/cash and Settings batches are not online-verified.
## 2026-10-22 Reports and utilities focus follow-up

- Report and utility Retry actions now expose visible keyboard focus states across closures, daily/weekly/monthly sales, Mail Log, Trashed Items, and Vendor Connections.
- Local typecheck, targeted ESLint, and `git diff --check` passed; no production build or business write was run. Evidence: `docs/UAT_REPORTS_UTILITIES_FOCUS_LOCAL_2026-10-22.json`.
- This batch is local-only until a valid Dokploy deployment and exact Demo runtime SHA are available.
## 2026-10-22 reports/utilities deployment status

- [x] Candidate `876f8b3` is pushed and includes the grouped Settings, stocktake/cash, and report/utility recovery focus improvements.
- [ ] Dokploy webhook returned HTTP `301` (`Branch Not Match`) again; no retry was sent. Do not attribute online behavior to this candidate.
- [ ] Demo runtime remains on the older SHA; online verification awaits Source/Git correction.
## 2026-10-22 Entry and platform focus follow-up

- Signup wizard, Reset Password, Products menu/batch delete, Platform Stores Retry, and Platform Audit Search/Clear/Retry now expose visible keyboard focus states.
- Local checks passed: Platform Audit/Failures fixture `4/4` at 390/1440px, Product detail retry fixture PASS, zero writes, no page errors or overflow; typecheck, targeted ESLint, and diff check passed. Evidence: `docs/UAT_ENTRY_PLATFORM_FOCUS_LOCAL_2026-10-22.json`.
- No production build was run. Online status remains pending exact runtime SHA.
## 2026-10-22 entry/platform deployment status

- [x] Candidate `d2346f9` is pushed and includes the grouped Settings, stocktake/cash, reports/utilities, and entry/platform focus improvements.
- [ ] Dokploy webhook returned HTTP `301` (`Branch Not Match`) again; no retry was sent. Demo runtime remains older than this candidate.
- [ ] Online verification is pending Source/Git correction and exact `/api/public/version` SHA match.
## 2026-10-22 runtime identity update

- Demo `/api/public/version` now reports frontend/backend `c905902f4020180095646cdeeaf638d78a0ded2d`; latest source is `177eea3d`, so this is an older deployed candidate. Evidence: `docs/UAT_RELEASE_IDENTITY_2026-10-22_C905902.json`.
- Platform Operations, Usage, Audit, and Failures online read-only verification passed `8/8` across 390/1440px with no page errors, overflow, or non-GET requests. Evidence: `docs/UAT_PLATFORM_OBSERVABILITY_ONLINE_2026-10-22.json`.
- The Settings mobile suite remains blocked at the older runtime's user-card assertion; do not attribute local focus changes to this runtime.
## 2026-10-22 Platform Store detail and Settings diagnostics

- Platform Store detail status/trial/owner/Odoo/delete/refresh controls now expose visible keyboard focus states. Evidence: `docs/UAT_PLATFORM_STORE_DETAIL_FOCUS_LOCAL_2026-10-22.json`.
- The Settings mobile UAT script now records structured blocked checks when the active runtime lacks users mobile cards or desktop headers. Runtime `c905902` produced 26 passes and 2 blocked checks; evidence: `docs/UAT_SETTINGS_MOBILE_2026-10-22_RUNTIME-C905902-BLOCKED.json`.
- This improves verification quality without changing business writes; latest source still awaits valid Dokploy deployment.
## 2026-10-22 platform detail deployment status

- [x] Candidate `1df9b718` is pushed and includes Platform Store detail focus improvements plus structured Settings blocked diagnostics.
- [ ] Dokploy webhook returned HTTP `301` (`Branch Not Match`) again; no retry was sent.
- [ ] Demo runtime remains `c905902...`; the new Platform Store detail changes are not online-verified.
## 2026-10-22 runtime queue follow-up

- Demo `/api/public/version` advanced from `c905902...` to `c941a617ed390679105a780e57c86786157f7470`; this is still an older documentation/runtime candidate and does not contain the Platform Store detail code from `bf3d675f`.
- Dokploy webhook for the current candidate continues to return HTTP `301` (`Branch Not Match`); no further retry was sent this turn.
- Local branch contains two unpushed documentation commits because GitHub connections reset during push. The remote application code remains at least through `bf3d675f`.
## 2026-10-22 Platform detail pagination and closure detail focus

- Platform Store detail owner-link copy and operation/setup pagination controls now expose visible keyboard focus states.
- Register Closure detail Retry now matches the report-list recovery focus treatment.
- Local typecheck/ESLint verification is pending this small follow-up; no production build or business write is authorized.

## 2026-10-22 部署状态复核

- 用户反馈 Dokploy 最新部署状态为“成功”。
- Demo `/api/public/version` 当前 frontend/backend 均为 `e8cac11ea1284f57dcb5ff4c6d203011ba10b79d`，构建时间为 `2026-10-22T03:49:23Z`。
- 本地 `HEAD` 与 `origin/main` 均为 `f4d4106488a3177f79c0584f350bc8e8120e5d82`。Dokploy 的“成功”对应旧提交，不能证明 `f4d41064` 的 Platform Store 详情页、Register Closure 详情 Retry 等改动已上线。
- 后续验收必须先让 Dokploy 运行版本精确变为 `f4d41064`（或记录新的完整 SHA），再执行线上 UI/行为检查；当前只能引用本地证据。
- 本次没有重试 webhook，也没有执行业务写入。

## 2026-10-22 Price Suggestions 优化与验证

- 实际生效组件 `pos-ui/src/components/OdooPriceSuggestionsPage.tsx` 已为 Refresh、Retry、CSV 导出、Bulk price edit、Products、筛选、解释、商品深链和分页控件补充可见键盘焦点状态。
- 候选提交：`f2e7d659d02f3ffb3a32259028a29953b6689e23`。
- 本地 Price Suggestions fixture：`PASS`，`failed=0`，`writes=0`；库存/定价响应式 fixture：`15/15 PASS`，`blockedWrites=0`。
- Demo 旧 runtime 的 Settings 复验仍为 `BLOCKED`：390px 缺少用户卡片，1440px 缺少完整 staff 表头。当前源码的 `app/settings/users/page.tsx` 已存在对应移动卡片与六列语义表格，因此该结果归因于旧部署，不归因于当前源码。
- 本批次未运行本地 production build；未执行销售、退款、采购、库存、现金或关班写入。
- 下一步：推送候选后触发一次 Dokploy，读取完整前后端 SHA；只有 runtime 精确匹配候选后，才重跑 Price Suggestions、Settings、全站和 AI 只读套件。

## 2026-10-22 Price Suggestions 发布复核

- `f2e7d659` 及其文档提交已推送到 `origin/main`，当前远端顶端为 `7af1b7e0`。
- 推送后等待并读取 Demo `/api/public/version`，frontend/backend 仍均为 `e8cac11ea1284f57dcb5ff4c6d203011ba10b79d`，没有切换到本批次。
- 当前环境没有可用的 `DOKPLOY_WEBHOOK_URL`；历史 webhook 已返回 `301 Branch Not Match`，按规则不再重试。线上 Price Suggestions 焦点改动仍未验证。

## 2026-10-22 关班与销售历史焦点优化

- `pos-ui/src/components/OdooCloseRegisterPage.tsx`：初始加载失败 Retry、运行中错误 Retry 增加可见键盘焦点。
- `pos-ui/src/components/OdooSalesHistoryPage.tsx`：导出、错误 Retry、收据关闭、全单退款和打印按钮增加可见键盘焦点。
- 候选提交：`bc33d48077345b13c44fdfc2de6376fd64403ff4`。
- 本地 typecheck、定向 ESLint、diff check 通过；未运行 production build，未写入业务数据。
- Demo 旧 runtime 交互基线为 `10 PASS / 4 FAIL`，失败集中在商品目录、销售历史数据和补货加载，证据 `docs/UAT_INTERACTION_2026-10-22_OLD-RUNTIME-RECHECK.json`。该结果不能归因到 `bc33d480`。

## 2026-10-22 e0a867b0 线上验收

- Demo 版本接口 frontend/backend 均精确匹配 `e0a867b0387c7760c1dfc1bea9a5c374debb0930`；证据 `docs/UAT_RELEASE_IDENTITY_2026-10-22_RUNTIME-E0A867B.json`，release identity 为 PASS。
- 定价/库存只读套件为 `8 PASS / 4 BLOCKED / 0 FAIL`，`blockedWrites=0`；Price Suggestions 在 390/1440px 通过，证据 `docs/UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-22_RUNTIME-E0A867B.json`。
- 交互套件为 `10 PASS / 4 FAIL`。失败均为旧数据条件下商品目录、销售历史和补货加载超时；没有页面错误或业务写入，证据 `docs/UAT_INTERACTION_2026-10-22_RUNTIME-E0A867B.json`。
- 这次确认了 Price Suggestions 和关班/销售历史焦点批次已进入线上 runtime；关班/销售历史的完整数据路径仍需有数据的 Odoo 只读环境补测。
## 2026-10-22 e0 runtime AI recheck（最新）

- [x] Demo `/api/public/version` 当前前后端均为 `e0a867b0387c7760c1dfc1bea9a5c374debb0930`。
- [x] 247 条只读问法复测结果：**188 PASS / 44 BLOCKED / 15 FAIL**；44 条在三次重试后仍返回 `50210`，15 条为固定日期销售问法没有源数据行。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_E0A867B0_FULL-247.json`。
- [x] `writeRequests` 仍为 `none: assistant API only`，没有销售、采购、收货、库存、调价、退款或关班写入。
- [ ] 该结果是当前 runtime 的 provider/数据可用性基线；runner source 为文档提交 `c1669e53`，不能作为 AI 后端修复已部署的证明。候选 `601ae0dd` 仍需同 SHA Java 21 `mvn -B clean verify` 和匹配 runtime。
- [x] 三条快速门禁随后为 **1 PASS / 2 BLOCKED**：补货问法正常进入 `/stock/replenishment`；能力帮助遇到 HTTP 502，采购订单执行边界返回 `50210`，均未产生业务写入。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_E0A867B0_SMOKE-3.json`。

## 2026-10-22 d0669 data-aware AI regression（最新）

- [x] 推送后 Demo 前后端运行 SHA 均为 `d0669f94956e2faf6dfbdf7bfa266dd810a51473`。
- [x] 数据感知 runner 完成 247 条问法：**232 PASS / 15 BLOCKED / 0 FAIL**。15 条全部是固定日期销售问法，响应明确表示没有完成销售记录；已记录 `dataUnavailable=true`，不再误报为路由失败。证据：`docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_D0669F94_DATA-AWARE-247.json`。
- [x] 其余路由、意图、帮助和安全边界断言全部通过；Assistant API-only，业务写入为 0。
- [ ] 仍需在有源销售数据的测试窗口重跑 15 条报表问法，才能完成销售金额对账验收。
- [x] d0669 companion suite：availability **3/3**、route **9/9**、surface/auth **11/11**、metrics **9/9 PASS**；覆盖 AI 开关、配置、空语音/图片、匿名 401、指标 UI 和无障碍检查。证据：`docs/UAT_AI_AVAILABILITY_D0669_2026-10-22.json`、`docs/UAT_AI_ROUTE_MATRIX_D0669_2026-10-22.json`、`docs/UAT_AI_SURFACE_D0669_2026-10-22.json`、`docs/UAT_AI_METRICS_D0669_2026-10-22.json`。

## 2026-10-22 前端错误恢复与焦点状态批次交接

- 报表错误分支 fixture **2/2 PASS**：`503` 显示错误、Retry 和 Request ID；`401` 显示连接 Odoo；390px 无横向溢出。证据：`docs/UAT_REPORTING_ERROR_LOCAL_2026-10-22_UI-BATCH.json`。
- Platform Audit/Failures fixture **4/4 PASS**：390/1440px、重试恢复、无页面错误、无横向溢出、无非预期写入。证据：`docs/UAT_PLATFORM_AUDIT_FAILURES_LOCAL_2026-10-22_UI-BATCH.json`。
- 补货供应商/RFQ 恢复 fixture **60/60 PASS**：初始 `503`、供应商加载失败、数量保持、RFQ 创建失败后的重试均通过。证据：`docs/UAT_REPLENISHMENT_SUPPLIER_RECOVERY_2026-10-22_UI-BATCH.json`。
- Node 24 typecheck、定向 ESLint、脚本语法和 `git diff --check` 通过；未执行本地 production build、Docker build 或真实业务写入。
- Dokploy 页面反馈最新部署“成功”，但 Demo `/api/public/version` 当前仍返回 frontend/backend `582b92fb199e312e828a5169cde14105a091f41a`。因此本批次尚未线上验证，不能把运行端点结果归因于当前候选。
- 下一步：核对 Dokploy Source/Git 的仓库、`main` 分支、根目录 `/` 和 `docker-compose.yml`，再以版本接口精确匹配候选 SHA；匹配后重跑报表、补货和 Platform Audit/Failures 的 390/1440px 只读验收。

## 2026-10-22 客户、供应商与采购目录焦点批次

- 客户目录错误 Retry、桌面联系方式、客户弹窗 Cancel/Submit；采购订单错误 Retry、移动端订单引用、收货弹窗 Go back/Refresh receipt status/Confirm receive；供应商目录错误 Retry，均已补充可见键盘焦点状态。
- 当前公网目录只读浏览器回归在 320/390/1024/1440px 共 **44/44 PASS**，覆盖商品、客户、供应商搜索和清除、AI 入口焦点陷阱与 Escape 恢复；页面 JS 错误为 0。证据：`docs/UAT_DIRECTORIES_ASSISTANT_ONLINE_2026-10-22_DIRECTORY-FOCUS.json`。
- 脚本拦截 8 个非允许写请求，未提交模型或业务写入。该结果属于旧 runtime 基线，不能证明本批源码已部署。
- Node 24 typecheck、三文件定向 ESLint、`node --check` 和 `git diff --check` 通过；未运行本地 production build。
- 下一步：将本批与当前前端候选合并后，在 Dokploy Source/Git 修正并取得 exact runtime SHA，再重跑客户、供应商和采购页面的线上焦点与错误恢复检查。
- 本轮候选 `71318249` 已推送到 `origin/main`；Dokploy webhook 返回 HTTP `301 Branch Not Match`，未继续重试。Demo 版本接口仍为 frontend/backend `582b92fb199e312e828a5169cde14105a091f41a`，本批未线上验证。

## 2026-10-22 AI 用户问法扩展（本地待门禁）

- scripts/pilot-ai-workflow-utterances-online-uat.mjs 当前包含 255 条唯一用例，覆盖补货、定价、推荐、库存、报表、发票、帮助和写入安全边界。
- 本轮新增 “Suggest something for steak”“AI会不会自动下单？”和 “Top up these items to 50 units”等短口语/数量型问法，并补充 Java 路由回归。
- 本地静态检查通过；未运行本地 build/Maven。后端候选必须先通过 exact-SHA Java 21 mvn -B clean verify，再部署并用同 SHA 线上回归。线上旧证据不代表本轮修改已生效。

## 2026-10-22 252 条 AI 问法线上复测

- 完整目录结果为 248 PASS / 0 BLOCKED / 4 FAIL，证据：docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_252-CURRENT.json。
- 失败集中在 Demo 旧 runtime 的四条新增边界问法；所有请求为 Assistant API-only，业务写入为 0。
- 当前源码已包含对应确定性路由/写意图守卫，但未完成 Java 21 exact-SHA 门禁和匹配部署；下一步应先完成门禁，再用同 SHA 重跑 252 条目录。

## 2026-10-22 255 条重试修正版

- runner 增加 TimeoutError 瞬时失败重试；255 条全量结果为 248 PASS / 0 BLOCKED / 7 FAIL。
- 7 个失败均来自 Demo 582b92fb 未包含当前源码的稳定路由/能力边界；证据：docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-22_255-CURRENT-RETRY.json。
- 当前仍不可推送 pos-api：缺少 exact-SHA Java 21 mvn -B clean verify 远程门禁。

## 2026-10-22 AI 配套能力复测

- Availability 3/3、route 9/9、surface/auth 11/11、metrics 9/9、UI 2/2 和 capability gates 均通过。
- Features 的旧 OCR 接口保持 41001 安全阻断；Reports 的唯一阻断为实时库存数据源不可用。
- History/platform 及 transcription 的阻断来自缺少第二门店/platform operator 凭据和语音 fixture，不应误判为代码失败。
- 本轮无业务写入；完整证据集中在 docs/UAT_AI_*_2026-10-22_CURRENT-GOAL.json。

