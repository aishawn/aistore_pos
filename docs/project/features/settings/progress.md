# Settings 1:1 — progress

更新日期：2026-11-11。

## 本轮候选

- pos-api：`CompanySettingsService` / keys、`SettingsImportService`、`SettingsImportController`、`SettingsPromoteController`、Enterprise/Push controllers、Checkout `round_to` 接线、所有权保护单测。
- pos-ui：Setup 侧栏 23 项、Company KV 全分区、目录 CRUD、Integrations promote、Account Billing 壳、Enterprise/Push 可保存。
- shopfront-crawler：settings collectors + `settings_import` job + `/api/stores/{store}/settings/import`。
- **迭代修复**：promote 用内存 `seen` 防同名连插；`POST /api/settings/import/dedupe` 合并税种/支付方式重复行；CRUD 页重复名警告。

## 本地验证

- `mvn -B clean verify`（Java 21）PASS，含 `CompanySettingsServiceTest` 与 `SettingsImportServiceDedupeTest`。
- `pos-ui` Integrations / SettingsCatalogCrud 已接 dedupe 动作。

## 线上核对（2026-11-11 Demo）

- Setup 侧栏 23 项可达；`/settings/company/general` 字段完整。
- `/api/settings/company`、`/enterprise`、`/push` → code 0（OdooOnly allowlist 修复已生效）。
- Tax Rates：**GST + GST Free（2）**。
- Payment Methods：部署 `511b3fd4` 后 **Cash + EFTPOS + Gift Card（3）**（原先 Cash×202 / 204）。
- `POST /api/settings/import/dedupe` 已上线并返回 200。
- 证据：`docs/UAT_SETTINGS_2026-11-11_ONLINE.json`（PASS）。

## 下一步

1. 在 crawler `daily_sync` 空闲时跑 `settings_import`（skr），再 Integrations promote。
2. 定价算法（High Mix / Family / Redistribute）单独验收。
3. 可选：Setup 侧栏分组缩短滚动（功能已齐）。

## 阻塞

- Shopfront OAuth scopes 可能对部分 settings 根返回 403；导入会记 entity errors，不阻断 Orithos 本地编辑。

## 2026-11-21 继续验收（运行版本 7b8e9cc）

- SKR 与 Demo 的运行 SHA 均为 `7b8e9cc826cefd629470f65c64b13f4d09c27e18`；Settings 只读审计脚本在两店通过 390/768/1440 三个视口矩阵。覆盖设置路由/主题溢出、员工角色只读权限、502 重试恢复、运行 SHA 稳定和无业务写入断言。
- 两店 `/api/settings/company` 均返回 66 个键，键和值完全一致。公司资料目录的 7 个资料键（名称、ABN、地址、城市、邮编、电话、邮箱）未出现在当前 API bundle；没有来源资料，不得代填。
- 定价只读 UAT 商品 `-196 LEMON P/F 6% 330ML` 的阶梯读回为 `1→$8.99、4→$6.7475、10→$5.199`；数量 1/3/4/7/10 的报价为 `$8.99/$26.97/$26.99/$53.96/$51.99`，SKR 与 Demo 一致。没有创建销售或修改设置。该样本只验证此商品和这些数量，不证明所有价格表、促销或客户等级定价等价。
- 当前读回设置为 `Australia/Melbourne`、`HIGH_MIX_PRICE`、`MATCH_PRICE_POINTS`、`REDISTRIBUTE`、`Require Password=true`。认证源码链路含员工选项、租户设置读取、密码必填 UI 和后端校验；当前没有在此轮重新做登录登出线上操作。
- `company-settings-catalog.ts` 定义 60 个字段。此前静态消费者盘点中约 43 个字段没有找到明确的运行时消费点；此计数用于排查优先级，不是运行时失效结论。必须逐项追踪动态 key、专页设置及最终业务动作后，才能决定补引擎、标记仅保存或移除入口。高影响成本算法、盈利展示、自动登出、搜索选项、组件/重量/箱售及多项收银行为仍需单独核实。
- Settings UAT 本轮没有写入设置。Shopfront 保持只读；浏览器自动化本轮因 URL 许可校验未能继续，因此不把本轮记为 Shopfront 页面逐字段复核。
- 定价字段已接入报价路径，但完整公式语义没有 Shopfront 官方公式/完整例子佐证；继续按当前商品阶梯和 family 数据结构做分批 UAT，不用单个样例宣称 1:1。

## 2026-11-15 Orithos-first 验收继续

- 审计基线：GitHub `main` `3b3b79a3068e55e43791c3b0b313981b8e63a183`。本地维护 checkout 有用户未提交改动，因此本轮在独立工作树检查和修改。
- 已修复 `/api/settings` 可按请求参数跨 vendor/outlet 读取或写入的问题；默认读取当前 vendor，读旧配置时只合并 `scope_id IS NULL` 的兼容行，当前 vendor 值优先。公司设置新写入和 checkout cash rounding 均按当前 vendor 读取。
- Tax Rates 和 Payment Methods 修改时现按当前 outlet 做大小写/首尾空白不敏感的重复名校验；税率创建/修改设为默认值时在同一事务中先清理该 outlet 其他默认值。
- 定价检查：High Mix、Family distribution、Redistribute 仍只有配置目录值，当前售价/报价流程没有对应算法调用；需先定义 Orithos 价格规则，再实现与验收，不复制未定义的 Shopfront 语义。
- 页面分类：company KV、税率、付款、register/outlet 是可保存的核心设置路径；Roles 页面当前为只读；Account & Billing 是 Orithos 账号/连接状态，不实现 Shopfront 计费；Hardware、Barcode Templates、Sale Keys、Customer Display、Surcharging 等界面能存配置，但本轮未证明实体设备或对应业务引擎已端到端接入。多条旧 `/settings/registers/**`、`/settings/outlets/**` URL 是兼容重定向，不按独立页面验收。
- 商品 CSV 导出当前实际分页读取 Orithos `/api/products`，只是 `exportOdooProductsCsv` 旧名称/注释未清理，不属于 Odoo 数据依赖故障。
- 尚未完成线上验收或部署。本轮未访问 Shopfront、未写 SKR/Demo 线上设置；发布仍需精确候选 SHA 的 Java 21 `mvn -B clean verify` 远端工作流，以及部署后 SKR 只读、Demo 可回滚验证。

