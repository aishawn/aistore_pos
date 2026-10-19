# Orithos POS 最终交接摘要

更新时间：2026-10-19（Asia/Shanghai）  
仓库：`aishawn/aistore_pos`  
线上站点：<https://demo.orithos.com.au/>  
当前运行时代码：`74e9412`；当前仓库/`origin/main`：`b54c11a`（后续为文档证据更新）
本轮 Dokploy webhook：HTTP `200`，返回 `Compose deployed successfully`；控制台运行容器 SHA 仍未独立回读。

## 结论

当前整体放行状态：**NO-GO**。

核心租户、POS、库存、退款、现金、采购收货和多租户隔离已有隔离租户证据；近期 AI、价格表和移动端回归也已通过。NO-GO 的原因是部署运行身份仍缺独立证明，部分 AI、硬件和运营能力仍未完成，且当前工作区还有未提交改动，不能宣称全量生产验收完成。

## 最新增量

- `74e9412` 增强 AI Metrics 表格可访问性：caption、列头 `scope` 和刷新 `aria-busy`。
- Dokploy 接受该提交后，AI Metrics 线上回归 `9/9 PASS`，覆盖管理员/匿名鉴权、assistant intent 指标、390/1440 UI 和可访问性断言；证据 `docs/UAT_AI_METRICS_ONLINE_74E9412.json`。
- 本轮未运行本地 build；TypeScript、目标 ESLint、脚本语法检查通过。Dokploy 容器 SHA、构建日志和健康状态仍需控制台独立回读。

## 已完成

### 租户和注册

- 品牌站注册、自动登录、Odoo 独立公司绑定。
- Outlet/Register 配置、数量校验和 dummy data 初始化。
- 租户商品、库存和 `res.company` 隔离。
- host、company 参数、API 参数越权读取被拒绝。
- 登出及删除租户后，登录和受保护 API 被拒绝。

### POS、库存和现金

- 开班、商品搜索、分类筛选、购物车数量修改、删除、Park/Resume/Discard。
- Cash 收款、找零、GST、现金舍入、收据和订单回读。
- Card 收款已验证为 Odoo payment method 模拟支付，不代表实体刷卡机。
- 销售扣库存；Card/Cash 全额退款创建独立退款单并恢复库存；重复退款被阻止。
- Cash in、Cash out、现金盘点关班和 session 状态回读。

### 采购和供应商

- 隔离公司内供应商校验和创建。
- 草稿 RFQ、确认、部分收货、全部收货、重复/超量收货保护。
- 采购入库库存和采购状态回读。

### 前端稳定性和 AI 迭代

- 全站静态路由、桌面/移动端布局、Retry、加载/错误态、弹窗焦点和请求竞态已有多批回归。
- Stock List、Capped Pricing、Bulk Price Edit 的响应式表格通过 `6/6` 线上只读验证。
- 价格建议支持 SKU 深链到 Bulk Price Edit；价格保存失败会回滚并允许重试；价格建议保持只读。
- 销售助手显示 intent、响应耗时、成功/失败和会话摘要，不伪造 token usage。
- AI metrics 已完成：管理员只读 `GET /api/ai/metrics?hours=24`、vendor 隔离、允许/拒绝、允许率、平均/p50/p95 延迟、report 和 assistant AI path 聚合、估算 token；匿名访问返回 `401`，线上管理员访问返回 `200`。
- AI metrics 页面已支持 390/1440 视口，线上页面错误为 `0`；估算 token 明确不是 provider billing usage。
- 聊天与语音转写能力位分离；语音不可用时按钮禁用，不启动麦克风或发送转写请求。
- 最新 AI 全功能只读矩阵 `14 PASS / 0 FAIL / 1 INFO`；AI UI `2/2 PASS`；能力位故障注入通过。

## 未完成或不能宣称通过

| 项目 | 状态 |
|---|---|
| Dokploy 运行身份 | webhook 已返回成功，线上功能回归证明新 assistant metrics 行为可用；仍缺控制台独立回读 frontend/backend SHA、构建日志、健康状态和部署完成时间。 |
| AI metrics 的 assistant 覆盖 | 已提交并部署到 `74e9412`；真实 assistant 请求返回 `entity_action`，metrics `byPath` 严格匹配对应 assistant intent，管理员 `200`、匿名 `401`。估算 token 仍不是 provider billing usage。 |
| 真实发票 OCR | 当前为 preview-only；没有真实供应商发票图片字段提取的完整证据。不得据此创建供应商、采购单、收货单或库存。 |
| Stocktake 写入 | 管理员只读和前置保护已完成；隔离公司中的确认、取消、库存回读和幂等写入尚未验收，生产写入开关保持关闭。 |
| 实体支付和设备 | 实体刷卡机、打印机、钱箱、终端断网和硬件对账未接入/未验收。 |
| 分单支付和离线 POS | 未实现或未验收，不计入基础 POS 通过门槛。 |
| SMTP 和运营财务 | 邀请/密码重置真实邮件、正式现金差异审批、财务对账和采购财务流程未完成。 |

## 当前问题和风险

1. **版本证据断链**：当前 `origin/main` 为 `b54c11a`，运行时代码为 `74e9412`，历史证据仍包含旧 deployment 字段；公网返回 200 和 webhook 成功不能替代 Dokploy 控制台运行 SHA、构建日志和健康状态证据。
2. **AI 环境记录不一致**：历史批次曾记录 `AI_ENABLED=false`，最新批次记录 `enabled=true`。必须以 Dokploy 当前容器环境和真实请求结果为准。
3. **证据类型混杂**：`docs/` 同时包含真实隔离租户、只读、fixture、mock 和旧版本证据；阅读时必须检查 `generatedAt`、`sourceCommit`、`deployment` 和是否产生写入。
4. **生产写入风险**：后续销售、退款、采购、收货、现金、关班和 Stocktake 只能使用一次性隔离租户，禁止写入 Demo 公司。
5. **本地构建边界**：本轮按约束未运行本地 build；typecheck、目标 ESLint、脚本语法和 diff 检查不能替代 Dokploy 构建证据。
6. **工作区未提交改动**：仍存在用户已有 UAT JSON、截图、页面目录、`pos-ui/tsconfig.json` 和其他脚本改动。接手时只能按文件精确提交，禁止 `git add -A`、`git reset` 或 `git clean`。

## 本轮 AI 指标迭代（`e8e6c69`）

- 新增管理员只读接口 `GET /api/ai/metrics?hours=24`，窗口限制为 1 小时至 7 天。
- 指标按当前 vendor 隔离，返回请求数、允许/拒绝、允许率、平均/p50/p95 延迟、按 report path 聚合和估算 token 数。
- 接口不返回原始问题、生成 SQL、JWT、API key 或 provider 错误；估算 token 明确不是真实 provider billing usage。
- 新增 `/reports/ai/metrics` 管理页面，支持 390/1440 视口、窗口切换和重试。
- 线上证据：`docs/UAT_AI_METRICS_ONLINE_E8E6C69.json`；部署后复验：`docs/UAT_AI_METRICS_ONLINE_2275378.json`。两次均为管理员 `200`、匿名 `401`、UI `2/2 PASS`、页面错误 `0`、业务/配置写入 `0`。
- 同批线上 AI 复验：功能 `14 PASS / 0 FAIL / 1 INFO`、AI UI `2/2 PASS`、Sommelier `10/10 PASS`。发票 OCR 仍为 `50212 INFO`，需要真实发票图片才能继续验收。

## 已部署 AI 指标扩展（`02faa09` + `7cf7c3a` + `c91043a` + `74e9412`，线上行为在 `74e9412` 验证）

- assistant 请求记录 `path=assistant:<intent>`、允许/拒绝、耗时和估算 token。
- 指标表新增持久化 `estimated_tokens`，旧数据继续使用字符数 fallback。
- assistant 审计不保存原问题、答案或 SQL；失败请求记录统一的 `ASSISTANT_FAILED` 原因。
- AI 关闭、provider 未配置或 base URL 无效时，认证 assistant 请求也会写入 rejected audit，避免失败率漏统计。
- 管理页面和 UAT 定位文案已从 report metrics 更新为 AI metrics。
- 已通过本地 `pos-ui` typecheck、目标 ESLint、UAT 脚本语法和 `git diff --check`。
- 线上验证：assistant `entity_action` 成功；`byPath` 出现 `assistant:entity_action`，requests `2`，allowed `2`，estimatedTokens `32`；metrics 管理员 `200`、匿名 `401`，390/1440 页面均无 JS 错误。
- 最新线上验证：assistant `search_product` 成功；metrics UAT 严格检查 `assistant:search_product`，并通过管理员 `200`、匿名 `401`、390/1440 页面无 JS 错误。
- 延迟分位数也已验证：有请求时 API 返回有效 `p50`/`p95`，本轮线上值为 `2755ms` / `6474ms`。
- 看板摘要文案已改为 `AI requests`、`AI guard passed`，不再把 assistant 请求误称为 report；390px 线上检查确认旧文案不存在且无页面错误。
- 表格补充 caption、列头 `scope` 和刷新时 `aria-busy`，线上 390/1440 可访问性断言均通过。

## 本轮视觉能力位修复（`39e0dc8`）

- Identify Wine Label 和 Scan Supplier Invoice 在 `/api/ai/config/client` 返回前保持上传按钮禁用，避免页面刚打开时误发视觉请求。
- 能力检查中显示明确状态；能力检查失败时按钮保持禁用并提示刷新，姓名/条码搜索仍可使用。
- 线上专项验证：能力未知时两个入口均 `disabled=true`，配置返回后均 `enabled=true`，页面未产生图片、模型或业务写入。证据：`docs/UAT_AI_CAPABILITY_LOADING_ONLINE_39E0DC8.json`。
- 同批线上发票预览 fixture、AI 功能和 UI 回归均通过；发票仍严格为 preview-only。

## 本轮真实 provider OCR 预览验证

- 使用合成但可读的测试发票图片调用真实线上 OCR provider，成功提取供应商、发票号、日期、2 条明细和总额。
- preview-only 边界通过：没有调用保存接口，没有创建供应商、采购单、收货单或库存。
- 证据：`docs/UAT_INVOICE_OCR_PREVIEW_ONLINE_39E0DC8.json`。
- 该结果证明 provider 和字段映射链路可用，但合成票据不替代现场真实供应商发票验收；真实票据仍需抽样复验。

## 关键证据

- `docs/UAT_AI_FEATURES_VERIFY_2026-10-19_POST-9E6B01A.json`
- `docs/UAT_AI_UI_2026-10-19_POST-9E6B01A.json`
- `docs/UAT_AI_CAPABILITY_GATES_ONLINE_2026-10-19_POST-9E6B01A.json`
- `docs/UAT_AI_DIAGNOSTICS_ONLINE_2026-10-19_SESSION-SUMMARY.json`
- `docs/UAT_STOCK_TABLES_RESPONSIVE_ONLINE_READONLY_2026-10-19_POST-9E6B01A.json`
- `docs/CAPABILITY_STATUS.md`
- `docs/UAT_AI_METRICS_ONLINE_E8E6C69.json`
- `docs/UAT_AI_METRICS_ONLINE_2275378.json`
- `docs/UAT_AI_METRICS_ONLINE_6AA867C.json`
- `docs/UAT_AI_METRICS_ONLINE_7CF7C3A.json`
- `docs/UAT_AI_METRICS_ONLINE_C91043A.json`
- `docs/UAT_AI_METRICS_ONLINE_74E9412.json`

这些证据未保存密码、JWT、cookie、API key 或 provider 原始错误。

## 接手后的优先顺序

1. 在 Dokploy 控制台保存本轮部署的实际运行 SHA、构建日志、容器状态和部署时间；当前 webhook 与线上行为已通过，但控制台证据仍缺。
2. 核对 `AI_ENABLED`、语音/视觉开关和 provider 配置，明确当前生产能力。
3. 新建一次性隔离租户，重跑基础写入链路：

   `signup → bootstrap login → Odoo binding → outlet/register → dummy catalog → open session → cash/card sale → refund → close register → platform delete`

4. 使用真实可解码发票图片做 preview-only OCR，只保存字段提取证据，不写入供应商、采购或库存。
5. 补做隔离公司 Stocktake 写入和幂等验收；若要实现正式放行，再规划 SMTP、财务和硬件接入。
6. 每次部署后等待 Dokploy 完成，核对实际 commit/chunk，再重跑受影响用例和固定冒烟链路。

## 放行标准

只有在部署身份可证明、核心写入链路绑定当前版本、跨租户访问持续被拒绝、失败请求无部分写入，并完成明确的生产 AI/运营能力边界后，才可将整体状态从 **NO-GO** 改为分阶段放行或 **GO**。
