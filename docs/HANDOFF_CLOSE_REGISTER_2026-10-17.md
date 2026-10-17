# Orithos POS 交接文档：关班验收阻塞

更新时间：2026-10-17（Asia/Shanghai）  
仓库：`aishawn/aistore_pos`  
分支：`main`

## 1. 当前结论

关班阻塞已修复并完成真实线上验收。新 disposable tenant 的 Cash sale、正确现金盘点、Odoo session 关闭和租户删除均已通过；缺少 counted cash 仍在 Odoo 写入前返回 HTTP 422。

整体验收仍为 **NO-GO**，仅因为实体硬件、分单收款、离线 POS、生产 AI 等其他能力不在当前基础 POS 通过范围内。后续关班回归继续使用全新 disposable tenant，不复用历史公司。

最终证据：[UAT_CLOSE_REGISTER_INCOME_ACCOUNT_FIX_LIVE_2026-10-17.json](UAT_CLOSE_REGISTER_INCOME_ACCOUNT_FIX_LIVE_2026-10-17.json)

最终线上结果：company `35`、config `77`、session `30`、receipt `260-77-000035`、expected/count `790.80`、session `closed`、cash difference `0`、删除后认证 `402`。

## 2. 仓库与工作区约束

- 本地路径：`C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master`
- Remote：`https://github.com/aishawn/aistore_pos.git`
- 当前分支：`main`
- 当前远端基线：`5b23591` 及其后续已推送提交，以 `git log --oneline -1` 为准
- `pos-ui/tsconfig.json` 存在既有未提交修改，必须保留，不要覆盖或提交
- 不运行本地 `build`
- 允许运行：`npm run typecheck`、`npm run lint`、`git diff --check`
- 本机 Java 8 不能代替后端 Java 21 构建
- 禁止提交 `.env`、密码、JWT、bootstrap token、Odoo cookie/session
- 禁止使用 `git reset --hard`、`git checkout --`、`git add -A`

## 3. 已完成并有线上证据的能力

证据文件均在 `docs/`：

- 品牌站注册、bootstrap 登录、Outlet/Register 配置和 dummy data
- 每租户独立 Odoo `res.company`、warehouse、stock location、POS config
- richer dummy data：14 个 DEMO 商品、4 个 DEMO 客户、约 32 笔已支付订单、最多 2 笔退款
- Card 模拟收款、Cash 收款和找零
- 销售退款、重复退款拒绝、库存恢复
- Cash in / Cash out
- 采购订单确认、部分收货、全部收货及重复收货保护
- 现金盘点关班：Cash sale 后使用 Odoo expected cash 成功关闭 session，差异为 0
- sample data 清理：商品和客户归档、销售保留、二次清理幂等
- 产品 CSV 导出
- 多租户访问隔离
- 租户删除后认证返回 HTTP 402

重点证据：

- `docs/UAT_RICHER_DUMMY_SEED_LIVE_2026-10-17.json`
- `docs/UAT_SAMPLE_DATA_PURGE_FIX_LIVE_2026-10-17.json`
- `docs/UAT_PRODUCT_EXPORT_LIVE_2026-10-17.json`
- `docs/UAT_PROVISION_COMPANY_CONTEXT_FIX_LIVE_2026-10-17.json`
- `docs/UAT_PURCHASE_RECEIVE_LIVE_2026-10-16.json`

## 4. 已解决缺陷：现金盘点关班

历史失败曾使用全新一次性租户验证：

- slug：`ccv-20261017111359`
- vendor：`28`
- Odoo POS session：`20`
- POS config：`51`
- opening cash：`0`
- Odoo expected cash end：`758.80`
- 缺少 `countedCash` 时：HTTP `422`，提示 `Count the cash in the drawer before closing this register.`
- 使用正确 `countedCash=758.80` 时：HTTP `422`，提示 `Please define income account for this product: 'DEMO Shiraz 750ml' (id:5753).`
- session 最终仍为 `opened`
- 测试租户已删除，删除后认证返回 HTTP `402`

历史根因依次包括 DEMO 商品收入科目、库存估值/成本科目、POS journal 默认科目，以及 payment method 的 intermediary/outstanding account 未配置。最终修复已覆盖这些 company-scoped 会计关系；最新线上证据显示 Cash sale 与正确 counted cash 关班均成功。

修复提交链：`01f1c5a`、`a4be900`、`dc90682`、`7f0baf9`、`740cb9a`、`1c7e87a`、`d53ccd0`。

## 5. 推荐修复位置与方向

文件：`pos-api/src/main/java/com/orithos/tenant/OdooTenantProvisioner.java`

已有相关方法：

- `ensureCashDifferenceAccounts(...)`，约第 659 行
- `ensureCashDifferenceAccount(...)`，约第 718 行
- `seedDummyExperience(...)`
- `seedDummyCatalog(...)`
- `ensureDummyCategories(...)`
- `ensureProductCategory(...)`

建议实现：

1. 增加可复用的 `findIncomeAccount(sessionId, companyId)`，查询该 company 下 `account.account` 的 income account。
2. `seedDummyCatalog` 先取得 income account id。
3. 将该 id 传入 `ensureDummyCategories` 和 `ensureProductCategory`。
4. 新建分类时设置 `property_account_income_categ_id`。
5. 已有分类如果收入科目为空，补写该字段。
6. 若 Odoo 20 商品模板确认存在 `property_account_income_id`，同时为商品模板补写；字段名必须先通过 Odoo 20 schema 或真实 RPC 确认。
7. 保留当前 provisioning 顺序，不要回退：

```java
String sessionId = authenticate();
long companyId = createCompany(sessionId, vendor.getName());
addCompanyToServiceUser(sessionId, companyId);
prepareCompanyBasics(sessionId, companyId, vendor.getName());
```

不要用字符串替换绕过 Odoo 错误，也不要把 DEMO 公司或历史租户作为修复验证目标。

## 6. 修复后的验证顺序

### 代码检查

```text
cd C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master\pos-ui
npm run typecheck
npm run lint
cd ..
git diff --check
```

只提交审查过的 Java 文件和必要的证据/文档文件；推送 `main` 后等待 Dokploy 部署，并记录线上实际 commit/chunk。

### 新租户线上回归

使用新 slug，例如 `codex-close-<timestamp>`：

1. 注册密码使用 12 位以上。
2. 配置 `Main Store` 2 个 Register、`Back Bar` 1 个 Register。
3. 选择 dummy data，确认 DEMO 商品可读且初始库存为 5。
4. 建立 Odoo session，完成至少一笔现金销售。
5. 回读 expected cash end 和 session id。
6. 不传 `countedCash`，确认仍返回 HTTP 422。
7. 用 expected cash 作为 `countedCash` 调用关班。
8. 回读并保存：HTTP 状态、session state、`cash_register_balance_end_real`、`cash_register_difference`、订单和库存。
9. 用错误 counted cash 验证差异提示及阻止逻辑；失败请求不得关闭 session。
10. 通过平台 Web UI 删除该租户，确认删除后登录及受保护 API 返回 HTTP 402。

证据文件建议命名：`docs/UAT_CLOSE_REGISTER_INCOME_ACCOUNT_FIX_LIVE_YYYY-MM-DD.json`。证据中不得写密码、token、cookie 或 `.env` 内容。

## 7. 未覆盖或不计入基础通过门槛

以下项目仍必须明确标记为“未验证/未实现”：

- 真实实体刷卡终端
- 打印机、钱箱
- 分单收款
- 离线 POS
- 生产 AI
- SMTP 实际发信
- 正式门店现金实点差异处理完整闭环

在关班修复完成并有真实线上证据前，整体状态保持 **NO-GO**。

## 8. 交接完成定义

接手者完成以下事项后，才能更新为新的交接基线：

- income、库存估值、POS journal 和 payment method 账户修复已提交并推送 GitHub
- Dokploy 已部署目标 commit
- 新 disposable tenant 的正确现金盘点可以成功关班，且 session state 为 `closed`
- 错误盘点会被阻止，失败不会写入 Odoo
- session、现金差异、销售和库存均有 JSON 回读证据
- 测试租户已删除，删除后认证拒绝已确认
- 文档记录 commit、部署信息、缺陷状态和未覆盖能力

## 9. 最新部署与构建修复（2026-10-17）

本地修复已提交并推送至 `f022c28`：`a4be900` 为 dummy 商品/分类配置收入科目，`dc90682` 为 POS Card/Cash journal 配置默认账户，`b34acb4` 补充 dummy inventory account，`f022c28` 移除 future-costs/future-prices Client Component 布局中的冗余 `revalidate` 导出，修复 Next prerender 的 `Invalid revalidate value` 构建错误。

最新线上关班证据保存在 `docs/UAT_CLOSE_REGISTER_INCOME_ACCOUNT_FIX_LIVE_2026-10-17.json`。隔离租户已删除，删除后认证返回 HTTP 402；现金销售和 counted cash 必填校验通过，但运行中的旧部署仍返回 `Missing required account on accountable line`，因此不能把关班标记为通过。Dokploy 部署 `f022c28` 后，必须创建新的 disposable tenant 重跑完整关班验收。
