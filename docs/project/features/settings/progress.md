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

## 2026-11-21 继续验收（当前运行版本 d30165c0）

- `7b8e9cc` 仅更新 `scripts/settings-audit-readonly.cjs`，不是应用部署版本。文档提交期间两店先后从 `37ab0d5` 自动部署到 `d30165c0`；最终稳定版本已完成下述复验。
- 本轮文档提交后，脚本运行时 API 观察到自动部署从 `86802d13` 更新到 `d30165c0`；中间一次 SKR company settings 请求返回 502 并终止。部署稳定后完整重跑通过，SKR 与 Demo 起止 frontend/backend SHA 均稳定为 `d30165c0027e8664538eec401f2fce2d2642f4dc`。本轮结果文件在本地 `temp/settings-audit-current-20261121/retry/report.json`，不提交。
- 稳定版本复验：每店 51 个路由/视口页面组合 PASS（17 个页面 × 390/768/1440 三个视口），公司设置 API/地区数据、导航/溢出、旧路由、地区 API 故障重试、无浏览器错误/无业务写入均 PASS。Demo 的只读员工角色权限对照 PASS；SKR 当前账号不显示可用的 Add staff，故该项安全跳过。该脚本没有逐项比较所有两个套餐店的 setting KV 值。
- 更早的 UAT 摘要未保存与应用 SHA 可关联的完整结果文件；它仅作历史记录，不作为本次 `d30165c0` 复验依据。
- 当前 `d30165c0` 的只读 API 比对确认 SKR/Demo 键集合相同，且关键值一致：时区 `Australia/Melbourne`、日期格式 `DD/MM/YYYY`、时间格式 `HH:mm:ss`、周起始 `MONDAY`、定价 `HIGH_MIX_PRICE / MATCH_PRICE_POINTS / REDISTRIBUTE`、Require Password `true`。公司资料目录的 7 个资料键（名称、ABN、地址、城市、邮编、电话、邮箱）仍不在 bundle；没有来源资料，不得代填。
- 定价只读 UAT 商品 `-196 LEMON P/F 6% 330ML` 的阶梯读回为 `1→$8.99、4→$6.7475、10→$5.199`；数量 1/3/4/7/10 的报价为 `$8.99/$26.97/$26.99/$53.96/$51.99`，SKR 与 Demo 一致。没有创建销售或修改设置。该样本只验证此商品和这些数量，不证明所有价格表、促销或客户等级定价等价。
- 认证源码链路含员工选项、租户设置读取、密码必填 UI 和后端校验。本轮只读读回 Require Password=true；没有重新做登录登出操作或变更设置。
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

## 2026-11-21 现金理由消费路径修复（本地候选）

- 根因：Manage Cash 与 Sell/Register 曾通过需要 `settings.view` 的 `/api/settings/company` 读取完整设置；普通收银员没有该权限时会静默回退到自由输入，保存的 `cash_in_reasons` / `cash_out_reasons` 无法被消费。现金提交客户端还会在理由为空时写入通用理由，掩盖未选择的情况。
- 实现：新增已认证、按当前 vendor 作用域的 `/api/retail/registers/cash-reason-options`，只读两组现金理由并返回 JSON 数组；两个现金操作表单改读该窄接口，支持配置项、自定义理由和空配置时自由输入，提交前要求非空理由。客户端移除通用理由兜底。
- 本地验证：`RetailRegisterControllerTest`（2）与 `RegisterSessionServiceTest`（5）PASS；`company-setting-options.test.ts`（4）PASS；`npm run typecheck` PASS；限定 ESLint 退出码 0、0 errors、13 warnings（既有 React hooks 规则与 `ODOO_QUOTE_TIMEOUT_MS` 未使用告警）。`git diff --check` PASS。
- 验收边界：尚未部署，未做线上收银员登录或现金调整写入；Shopfront 只读、未复核理由列表设置值。因此只证明本地代码路径与租户作用域，不证明线上配置/页面已生效，也不构成 Settings 与 Shopfront 全面对齐结论。

## 2026-11-21 定价 UAT 初次复核（线上 SHA 9bf25860）

- Shopfront 官方 `Determine Product Prices` 文档确认价格点的 `price` 是数量档的整包总价；High Mix 官方示例为 1 件 `$3.50`、6 件 `$15` 时，7 件 `$18.50`，Quantity Rate 为 `$17.50`。Crawler 的 `product_price_points` 明确将 Shopfront 整包价按数量换算为 Orithos 单位价；POS 再将单位价乘档位数量还原整包总价。两处转换与官方示例一致，本轮没有发现重复乘数量问题。
- 两店当前 frontend/backend 均为 `9bf25860b1436f5b3749fb29ccd9728d654c726b`。只读读回定价设置一致：`HIGH_MIX_PRICE / MATCH_PRICE_POINTS / REDISTRIBUTE`。
- 两店 `-196 LEMON P/F 6% 330ML` 阶梯一致：`1→$8.99`、`4→$6.7475`、`10→$5.199`（Orithos 存储的单位价）。只读 `/api/sales/quote` 对数量 `1/3/4/7/10` 分别返回 `$8.99/$26.97/$26.99/$53.96/$51.99`，SKR/Demo 完全相同；未创建销售或改变设置。
- Shopfront GraphQL `families(first:100)` 返回 0 条，SKR/Demo `GET /api/products/filter-options` 也都返回 0 个 family。因此 Family 算法暂无真实 family 样本可做端到端价格 UAT；不能据单测宣称线上 Family 对齐。
- 本地 Java 21 定向测试 `TierPriceCalculatorTest` + `FamilyPriceCalculatorTest`：18 tests PASS。该结果验证当前已定义规则，不证明未覆盖的促销、价格表继承、客户价或跨 Family 规则与 Shopfront 完全等价。
- 后续按稳定 Shopfront source ID 核验后，SKR 与 Demo 各有 11,508 个 source ID 映射，source ID 集合相同；每店 11,506 个可见映射商品。Demo 另有 37 条未映射商品，状态均为 `NOT_ACTIVE`。映射商品中有 21 条价格点不同、15 条名称不同、1 条状态不同；这 21 条商品在 Shopfront 均为 `ACTIVE`，POS 对应记录为 `NOT_ACTIVE`、`catalog_confirmed=false` 且没有 `shopfront_source_updated_at`。因此早先按名称推断的 14/51/45 差异和“价格点差异 0”均作废，不作为修复清单。
- 已排队原有 crawler 全量商品目录同步 job `1256`（source `skr`，目标 SKR + Demo；`products_only=true`，不刷新库存/销售/设置）。截至 2026-11-20 21:44 UTC，状态 `running`、阶段 `products:fetched:1850`、心跳正常；待终态回执后再按 source ID 复核，不重复排队。
- Shopfront 只用于只读登录及 GraphQL 查询；未选择 Shopfront Register。Orithos 报价使用已有会话要求的 quote 接口，仅生成报价，没有创建 sale 或 cash movement。

## 2026-11-21 定价 UAT 终态复核

- 上述运行中状态已由 crawler API 最新回执取代：job `1256`（11 月 20 日单日目录同步）与 `1257`（11 月 20–21 日，5 个 interval windows）均 `completed`，无错误。查询时没有 queued/running job。
- 两个回执分别记录向 SKR、Demo 各 upsert 159 和 165 笔销售，0 skipped/rejected/unmatched。`imported` 是接口回执计数，不能区分新增与幂等更新；没有证据表明这些都是新销售。
- 两个任务均早于 crawler `main` 修复提交 `bfb95cefcae09983fa49cc26cb0304f1160f4544` 启动。该修复显式关闭 `products_only` 任务的销售查询、重放及 POS 导入，已位于 GitHub `main`。生产 `/healthz` 的 `git_sha=unknown`，但运行 source fingerprint `c28be0e1c039d7b799aff216617d6d16aaee16c716cff154af23b100b67d1ec4` 与本地 main 完全相同。新版本尚未由下一次目录专用 job 在线验证销售 upsert 为 0。
- 修复的定向回归 `test_products_only_job_disables_inventory_in_source_and_pos_paths` 与正常日常销售覆盖 `test_completed_daily_sales_import_advances_report_coverage`：2 passed。
- 同步后只读 reconciliation：SKR 与 Demo 各有 11,506 条 POS 商品映射；Shopfront 最新完整目录 10,862 个 source ID 全部匹配，`crawler_missing_in_pos=0`。10,862 个商品仅有 102 个条码差异，全部为预期冲突；99 个重复条码涉及 188 个 Shopfront 商品，未解决/未解释差异均为 0。无自动写入或删除。
- 额外 644 条历史映射被保留；462 条 POS-only 映射均有历史采购单引用。成本审计有 179 条历史成本候选尚未由当前目录确认，需独立复核，不自动改价。
- 生产调度时区仍是 `Australia/Adelaide`，POS 两店及本地 crawler 配置为 `Australia/Melbourne`。所有 job 空闲后已满足变更条件；Dokploy browser URL 许可校验未通过，本轮没有改线上环境变量或重启服务。

## 2026-11-21 定价 UAT 复验（当前线上 SHA 0e2290c6）

- 2026-11-20 UTC 只读探测确认 SKR/Demo frontend/backend 均部署 `0e2290c6325860eacd64be2e0b2be21197a5fd28`，两店公司时区均为 `Australia/Melbourne`，定价键均为 `HIGH_MIX_PRICE / MATCH_PRICE_POINTS / REDISTRIBUTE`。
- 使用已有 register session 调用不落销售的 `/api/sales/quote`；SKR 商品 ID `11129`、Demo 商品 ID `22114`，两边商品均为 `ACTIVE` 且 `shopfrontCatalogConfirmed=true`。价格档为 `1→$8.99、4→$6.7475、10→$5.199`；数量 1/3/4/7/10 两边总价均为 `$8.99/$26.97/$26.99/$53.96/$51.99`，对应 GST 为 `$0.82/$2.45/$2.45/$4.91/$4.73`。未创建 sale、未改变设置。
- 生产 crawler `/api/sync/schedule` 当前报告 `Australia/Adelaide`，本地 crawler `.env` 为 `Australia/Melbourne`；与 SKR/Demo 当前 POS 时区不同。更改生产环境变量需等活动目录 job 和排队增量 job 完成，避免中断同步。
- 商品目录 job `1256` 仍在进行：source `skr` 映射目标 `skr` + `demo`，`products_only=true`、`full_catalog_snapshot=true`；2026-11-20 22:13 UTC 阶段 `products:fetched:4550`、heartbeat 正常。常规 interval job `1257` queued（已合并 2 个 interval windows）。终态回执与同步后 source ID 差异待查。

