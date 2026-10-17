# Orithos POS 最终交接入口

更新时间：2026-10-17（Asia/Shanghai）  
适用仓库：`aishawn/aistore_pos`  
品牌站仓库：`aishawn/aistore_orithos`

## 1. 接手结论

当前项目可以继续做线上业务验收，不需要重建整个项目仓库。若测试租户状态异常、数据已经污染或无法确认归属，应新建一个一次性 disposable tenant；不要修复或复用历史测试租户，也不要在生产 Demo 公司上做写入测试。

当前基础 POS 业务闭环已有线上证据：注册、租户隔离、Outlet/Register、dummy data、Odoo 公司绑定、销售、退款、现金管理、现金盘点关班、采购收货和供应商隔离。整体仍标记为 **NO-GO**，因为实体硬件、分单收款、离线 POS、生产 AI 和正式门店现金运营尚未覆盖。

## 2. 仓库与运行位置

### POS

- 本地目录：`C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master`
- GitHub：`https://github.com/aishawn/aistore_pos.git`
- 分支：`main`
- 前端：`pos-ui`
- 后端：`pos-api`
- 权威能力矩阵：[`CAPABILITY_STATUS.md`](./CAPABILITY_STATUS.md)

### 品牌站

- 本地目录：`C:\shawn\1code\1project-new\aistore_pos\v1\shipany-template-dev`
- GitHub：`https://github.com/aishawn/aistore_orithos.git`
- 线上注册页：`https://orithos.com.au/signup`

## 3. 当前工作树规则

- `pos-ui/tsconfig.json` 有既有未提交修改，必须保留。
- 修改前先执行 `git status --short`，不要使用 `git add -A`。
- 不使用 `git reset --hard` 或 `git checkout --` 覆盖并行修改。
- 不提交 `.env`、密码、JWT、bootstrap token、Odoo cookie/session 或 API key。
- 本机 Java 8 不能代替后端 Java 21 构建。
- 本轮只运行：

  ```text
  cd C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master\pos-ui
  npm run typecheck
  npm run lint
  cd ..
  git diff --check
  ```

- 未明确要求时不运行本地 `build`。

## 4. 已通过的线上能力

每次线上写入均应使用全新租户，并在结束后删除租户、验证删除后的认证拒绝。

| 能力 | 结论 | 主要证据 |
|---|---|---|
| 品牌站注册、自动登录、Outlet/Register 配置 | Accepted | `UAT_BRAND_SIGNUP_8CHAR_E2E_2026-10-17.json`、`UAT_BRAND_SIGNUP_OUTLET_DUMMY_E2E_2026-10-17.json` |
| 每租户独立 Odoo company、warehouse、stock location、POS config | Accepted | `UAT_PROVISION_COMPANY_CONTEXT_FIX_LIVE_2026-10-17.json`、`UAT_RICHER_DUMMY_SEED_LIVE_2026-10-17.json` |
| Dummy data | Accepted | 14 个 DEMO 商品、4 个客户、约 32 笔销售、最多 2 笔退款；`UAT_RICHER_DUMMY_SEED_LIVE_2026-10-17.json` |
| Card 模拟收款、Cash 收款和找零 | Accepted | `UAT_WRITE_2026-10-13.json` 及后续线上回归 |
| 销售退款和库存恢复 | Accepted | `UAT_WRITE_2026-10-13.json` |
| Cash in / Cash out | Accepted | `UAT_RECEIVE_MANAGE_CASH_2026-10-16.json` |
| 现金盘点关班 | Accepted | `UAT_CLOSE_REGISTER_INCOME_ACCOUNT_FIX_LIVE_2026-10-17.json`；session closed、difference 0 |
| 供应商 tenant-scoped 创建和 ABN 重复拒绝 | Accepted | `UAT_SUPPLIER_ISOLATION_LIVE_2026-10-17.json` |
| 采购确认、部分收货、全部收货、重复收货拒绝 | Accepted | `UAT_PURCHASE_RECEIVE_LIVE_2026-10-16.json` |
| Sample data 清理和幂等 | Accepted | `UAT_SAMPLE_DATA_PURGE_FIX_LIVE_2026-10-17.json` |
| 多租户隔离、删除租户后的认证拒绝 | Accepted | `UAT_FULL_ISOLATION_REGRESSION_2026-10-16.json` 及各 live UAT |

关班最终线上结果：新租户 Cash sale 成功，正确 `countedCash=790.80`，Odoo session 为 `closed`，`cash_register_difference=0`，删除租户后认证返回 HTTP 402。

## 5. 尚未通过或不计入基础门槛

- `Replenishment approval audit`：Accepted。新租户已真实创建 draft RFQ，并回读 Odoo chatter audit；证据见 `UAT_REPLENISHMENT_AUDIT_LIVE_2026-10-17.json`。
- 供应商发起 draft RFQ：Accepted（仅创建草稿，不确认采购）；未知供应商会被当前租户公司范围拒绝。跨公司真实供应商 ID 用例因 Demo 租户没有供应商而未执行。
- 实体刷卡终端、打印机、钱箱：未接现场设备。
- 分单收款：Planned，不能用 Card 模拟收款替代。
- 离线 POS：Planned。
- 生产 AI、OCR 实际写入、SMTP 实际发信：未验证或未启用。
- 正式门店现金实点差异运营：自动化正确盘点已通过，现场差异处理仍需真实门店验收。

## 6. 推荐的下一步

### A. 只需要继续验收时

1. 从 `git status --short` 和 `git log --oneline -5` 开始，不改动既有并行文件。
2. 使用 slug `codex-replenishment-<timestamp>` 新建一次性租户，密码至少 12 位。
3. 配置 `Main Store` 两个 Register、`Back Bar` 一个 Register，选择 dummy data。
4. 通过 `/api/odoo/suppliers` 创建测试供应商。
5. 使用真实 DEMO 商品调用 `/api/odoo/purchase-requests`，创建 draft RFQ。
6. 回读 PO、供应商、订单行和 chatter audit，确认零数量建议只进入 audit、不进入 PO line。
7. 保持 RFQ 为草稿，不确认采购；保存不含密钥的 JSON 证据。
8. 通过平台 Web UI 删除租户，并确认登录和受保护 API 返回 HTTP 402/未授权。

### B. 测试租户已经异常时

直接删除异常租户并新建，不要在同一租户上反复补数据。新租户必须重新回读 `vendor`、`odoo_company_id`、warehouse、stock location、POS config、商品库存和 register。租户重建不等于项目重建。

### C. 发现代码缺陷时

1. 修改对应 GitHub 仓库并只提交审查过的文件。
2. 推送 `main`，等待 Dokploy 普通 Deploy 完成；禁止 Fresh Volumes。
3. 在 Dokploy 记录实际运行的 commit SHA。没有控制台证据时，不要伪造部署 SHA。
4. 只在线上重新执行受影响用例，再执行固定冒烟链路：

   `signup → bootstrap login → Odoo binding → outlet/register → dummy catalog → open session → cash/card sale → refund → close register → platform delete`

## 7. 证据要求

每个 JSON 场景至少记录：时间、tenant slug、vendor、Odoo company、session、receipt/order、库存前后值和 HTTP 状态。禁止写入密码、token、cookie、`.env` 内容和 API key。测试结束必须记录租户删除结果及删除后的认证拒绝。

## 8. 交接完成定义

下一位接手者完成以下事项后，才能更新本文件：

- 真实 draft RFQ 和 replenishment audit 有线上 JSON 证据。
- 受影响代码已推送 GitHub，Dokploy 部署结果可回读。
- 新租户完成销售、退款、现金、关班和采购回读。
- 跨租户读取和越权操作被拒绝。
- 测试租户已删除，删除后认证被拒绝。
- 能力矩阵同步更新，明确区分 Accepted、In progress、Planned。

## 9. 相关文档

- [`HANDOFF_CURRENT_2026-10-17.md`](./HANDOFF_CURRENT_2026-10-17.md)：当前批次和 richer dummy data 细节
- [`HANDOFF_CLOSE_REGISTER_2026-10-17.md`](./HANDOFF_CLOSE_REGISTER_2026-10-17.md)：关班缺陷及修复过程
- [`ISOLATION_ODOO_UAT_RUNBOOK.md`](./ISOLATION_ODOO_UAT_RUNBOOK.md)：隔离租户验收运行手册
- [`PILOT_RELEASE_READINESS.md`](./PILOT_RELEASE_READINESS.md)：试点发布门槛
