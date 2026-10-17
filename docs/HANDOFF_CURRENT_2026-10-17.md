# Orithos 当前交接文档

更新时间：2026-10-17（Asia/Shanghai）  
适用仓库：`aishawn/aistore_pos`  相关品牌仓库：`aishawn/aistore_orithos`

## 1. 当前结论

当前 richer dummy data、sample data 清理和现金盘点关班均已通过全新的线上 disposable tenant 回读，但整体项目仍保持 **NO-GO**，因为实体硬件、分单收款、离线 POS、生产 AI 和正式门店硬件/现金运营验收仍未覆盖。此前的品牌注册、租户隔离、POS 销售、退款、现金管理、采购收货和页面回归也已有线上证据。

后续不要复用历史租户，也不要写入生产 Demo 公司。每次代码变更仍需推送并确认 Dokploy 的实际部署 SHA，再用新的 disposable tenant 回归并删除租户。

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

## 5. 接手后的执行顺序

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

## 6. 验收边界

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

## 7. 常见陷阱

- 品牌域 `/signup` 是 6 步实现；`app.orithos.com.au` 上可能存在旧的 4 步实现，不能混为同一源码。
- “At least 12 characters” 曾与真实 API 的 8 位规则不一致；以当前线上 API 和前端实际响应为准，修改后必须重新做负向请求和真实注册验证。
- 页面返回 200 不等于租户、Odoo、库存或订单写入成功；必须回读业务数据。
- Dokploy 部署完成必须以实际构建日志和线上响应确认，不能只看 GitHub 已 push。
- 不要在真实 Demo 公司执行销售、退款、采购、库存、现金、关班或账户权限写入。

## 8. 交付完成定义

只有满足以下条件，才能把本批次标记为完成：

- richer dummy data 已通过 Java 21 构建或等价 CI 证据。
- Dokploy 已部署目标 commit，线上容器运行正常。
- 新租户的商品、库存、客户、订单、退款和 register 均有真实回读。
- 关键 POS 链路和跨租户拒绝有 JSON 证据。
- 测试租户已删除，删除后的认证拒绝已确认。
- GitHub commit、部署 SHA、缺陷和未覆盖能力已记录。

在此之前，整体状态保持 **NO-GO**。
