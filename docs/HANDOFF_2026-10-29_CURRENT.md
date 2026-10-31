# Orithos 当前交接（2026-10-29）

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
