# Orithos POS 最终交接文档

更新时间：2026-10-19（Asia/Shanghai）  
仓库：`aishawn/aistore_pos`  
线上站点：<https://demo.orithos.com.au/>  
当前仓库提交：`2bc8046`
历史部署记录：`7544d03`、`f5413e0`；不能将历史部署号当作当前运行版本。
本轮 Dokploy webhook：HTTP `200`，返回 `Compose deployed successfully`。

## 一句话结论

当前整体验收仍为 **NO-GO**。核心租户、POS、库存、退款、现金、采购收货、多租户隔离，以及本轮 AI 功能和 AI metrics 回归均有证据；但 Dokploy 运行 SHA、构建日志、容器健康状态和若干生产能力仍缺独立证据或尚未实现，因此不能宣称全量生产验收完成。

## 已完成并有证据

### 注册、租户和隔离

- 品牌站注册、自动登录、Odoo 独立公司绑定。
- Outlet/Register 配置、数量校验、dummy data 初始化。
- 商品、库存、`res.company` 按租户隔离。
- 修改 host、company 参数或 API 参数读取其他租户数据会被拒绝。
- 登出及删除租户后，登录和受保护 API 被拒绝。

### POS、库存和现金

- 开班、商品搜索、分类筛选、购物车数量修改、删除、Park/Resume/Discard。
- Cash 收款、找零、GST、现金舍入、收据和订单回读。
- Card 收款已验证为 Odoo payment method 模拟支付，不代表实体刷卡机。
- 销售扣库存；Card/Cash 全额退款创建独立退款单并恢复库存；重复退款被阻止。
- Cash in、Cash out、现金盘点关班和 session 状态回读。

### 采购、供应商和收货

- 隔离公司内供应商校验和创建。
- 草稿 RFQ、确认、部分收货、全部收货，以及重复/超量收货保护。
- 采购入库库存和采购状态回读。

### 前端、价格和 AI

- 桌面/移动端布局、加载/错误态、Retry、弹窗焦点和请求竞态已有回归。
- Stock List、Capped Pricing、Bulk Price Edit 线上只读响应式验证通过 `6/6`。
- 价格建议支持 SKU 深链到 Bulk Price Edit；保存失败会回滚并允许重试；价格建议保持只读。
- 销售助手显示 intent、响应耗时、成功/失败和会话摘要，不伪造 token usage。
- AI metrics 管理员只读接口：请求量、允许/拒绝、允许率、平均/P50/P95 延迟、report/assistant path 聚合和估算 token。
- AI metrics 线上回归：管理员 `200`、匿名 `401`、390/1440 页面和可访问性均通过，页面错误为 `0`。
- Identify Wine Label / Scan Supplier Invoice 已区分视觉能力不可用与 AI 全部关闭；视觉不可用时明确保留 assistant、名称和条码搜索能力。
- 发票 OCR 已验证 preview-only：可提取合成测试发票字段，但不会创建供应商、采购单、收货单或库存。

## 最新线上证据

### AI metrics（提交 `2bc8046`）

证据文件：`docs/UAT_AI_METRICS_ONLINE_2BC8046.json`

- 总体状态：`PASS`。
- 检查项：`9/9 PASS`，业务和配置写入：`0`。
- 管理员登录：`200`。
- assistant audit seed：`entity_action`。
- metrics：`200`，`paths=2`，总体 `p50=2951ms`、`p95=6582ms`。
- assistant path：`assistant:entity_action`，`16` requests、`16` allowed、`p50=3348ms`、`p95=6998ms`、`estimatedTokens=221`。
- 匿名 metrics：`401`。
- 390/1440 UI 与可访问性：均通过，caption、scoped headers、`aria-busy` 均存在。
- `estimatedTokens` 是字符数估算，不是 provider billing usage。

### 其他已保存证据

- AI 功能矩阵：`14 PASS / 0 FAIL / 0 BLOCKED`。
- Sommelier 回归：`10/10 PASS`。
- AI metrics 历史回归：`docs/UAT_AI_METRICS_ONLINE_F5413E0.json`、`docs/UAT_AI_METRICS_ONLINE_74E9412.json`。
- 视觉能力加载门禁：`docs/UAT_AI_CAPABILITY_LOADING_ONLINE_39E0DC8.json`。
- 发票 OCR preview：`docs/UAT_INVOICE_OCR_PREVIEW_ONLINE_39E0DC8.json`。

## 未完成、未覆盖或不能宣称通过

| 项目 | 当前状态 | 交接动作 |
|---|---|---|
| Dokploy 运行身份 | webhook 成功，功能回归通过；仍缺 frontend/backend 实际 SHA、构建日志、容器健康状态和部署完成时间 | 在 Dokploy 控制台保存截图或导出证据，并与 `2bc8046` 对照 |
| 真实供应商发票 OCR | 目前只有合成票据 preview-only 证据 | 使用真实可脱敏发票抽样，仍保持不落库，单独记录字段准确率 |
| Stocktake 写入 | 只读、权限和前置保护已验证；确认、取消、库存回读和幂等写入未完成 | 在一次性隔离租户补做完整写入验收 |
| 实体支付和设备 | 实体刷卡机、打印机、钱箱、断网和硬件对账未接入/未验收 | 需要现场设备和支付服务商环境 |
| 分单支付、离线 POS | 未实现或未验收 | 记录为产品未实现，不计入基础 POS 通过门槛 |
| SMTP 和运营财务 | 邀请/密码重置真实邮件、现金差异审批、财务对账和采购财务流程未完成 | 配置真实邮件和财务环境后另做验收 |
| 生产 AI | provider、环境开关和视觉/语音能力在不同历史批次曾不一致 | 以当前 Dokploy 容器环境和真实请求结果为准，补一份配置快照 |

## 当前问题和风险

1. **部署证据链不完整。** 公网 `200` 和 webhook `200` 只能证明请求被接受、页面可访问，不能证明运行容器就是 `2bc8046`。
2. **历史证据版本混杂。** `docs/` 同时包含真实隔离租户、只读、fixture、mock 和旧版本证据；阅读时必须检查 `generatedAt`、`sourceCommit`、`deployment` 和是否产生写入。
3. **AI 环境记录不一致。** 历史记录出现过 `AI_ENABLED=false` 和 `enabled=true`；需以当前容器环境和真实请求结果为准。
4. **生产写入风险。** 后续销售、退款、采购、收货、现金、关班和 Stocktake 只能使用一次性隔离租户，禁止写入 Demo 公司。
5. **本地构建证据不足。** 本轮只执行 typecheck、目标 ESLint、脚本语法检查和 `git diff --check`，未运行本地 build；不能替代 Dokploy 构建证据。
6. **工作区有大量既有改动。** 接手时只能精确提交相关文件，禁止 `git add -A`、`git reset`、`git clean` 或强制推送。

## 接手后的优先顺序

1. 在 Dokploy 控制台保存当前部署的实际 frontend/backend SHA、构建日志、容器状态和部署时间。
2. 核对 `AI_ENABLED`、语音/视觉开关和 provider 配置，并保存脱敏配置快照。
3. 用一次性隔离租户重跑固定冒烟链路：

   `signup → bootstrap login → Odoo binding → outlet/register → dummy catalog → open session → cash/card sale → refund → close register → platform delete`

4. 用真实可解码发票做 preview-only OCR 抽样，不写入供应商、采购或库存。
5. 补做隔离公司 Stocktake 确认、取消、库存回读和幂等测试。
6. 每次部署等待 Dokploy 完成，核对实际 commit/chunk，再重跑受影响用例和固定冒烟链路。

## 放行标准

只有同时满足以下条件，整体状态才可从 **NO-GO** 改为分阶段放行或 **GO**：

- 部署运行身份、构建和健康状态可独立证明。
- 核心写入链路绑定当前版本，并落到正确隔离公司。
- 跨租户读取和越权操作持续被拒绝。
- 失败请求不产生部分业务写入，销售、退款、采购、现金和关班状态可回读。
- Stocktake 写入、幂等和库存结果完成验收。
- 真实发票 OCR、SMTP、财务和硬件能力按产品范围明确标记为已验收或未实现。
