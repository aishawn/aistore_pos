# Orithos 当前交接文档

更新时间：2026-10-17（Asia/Shanghai）  
适用仓库：`aishawn/aistore_pos`  相关品牌仓库：`aishawn/aistore_orithos`

## 1. 当前结论

当前项目保持 **NO-GO**，原因是本工作树有一批尚未审查、提交和线上验收的 richer dummy data 改动。此前的品牌注册、租户隔离、POS 销售、退款、现金管理、采购收货和页面回归已有线上证据，但不能把这些历史证据当作新代码已经部署。

下一步不要复用历史租户，也不要写入生产 Demo 公司。先审查并验证代码，再推送并确认 Dokploy 的实际部署 SHA，最后用新的 disposable tenant 完成一次线上回归并删除租户。

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

## 4. 当前批次：richer dummy data（已提交，待线上部署验收）

提交 `7c51683` 中的 `OdooTenantProvisioner.java` 在选择 sample data 时创建：

- 14 个 `DEMO-` 商品
- 5 个分类
- 4 个客户
- 最近 14 天约 32 笔已支付订单，最多 2 笔退款
- 一个保持打开的 POS register

这批代码已完成代码级检查，但仍必须在隔离新租户上检查：

1. `pos.order.sync_from_ui` 的订单 payload 是否兼容 Odoo 20。
2. payment method、税、退款和 session API 是否使用正确字段及状态。
3. 库存扣减、退款恢复和公司上下文是否严格绑定新租户。
4. 种子失败时是否会留下部分写入，是否可安全重试。
5. 每次创建租户是否只执行一次，避免重复订单和重复商品。

`docs/UAT_RICHER_DUMMY_SEED_2026-10-17.json` 在真实线上回读前仍只能视为计划/待验收记录，不能标记为 PASS。

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
