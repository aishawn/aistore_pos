# Settings 1:1 — validation

| 检查 | 环境 | 结果 | 证据 |
|------|------|------|------|
| CompanySettingsService ownership unit tests | 本地 | PASS | `CompanySettingsServiceTest` |
| Settings catalogue dedupe unit | 本地 | PASS | `SettingsImportServiceDedupeTest` |
| CashRounding custom increment | 本地 | PASS | `AustraliaComplianceTest` / CashRounding |
| Setup sidebar 23 routes reachable | Demo 只读 | PASS | `UAT_SETTINGS_2026-11-11_ONLINE.json` |
| Company / Enterprise / Push APIs | Demo 只读 | PASS | code 0 after OdooOnly allowlist |
| Tax rates unique after cleanup | Demo write (merge) | PASS | 203→2 via `/api/tax-rates/{id}/merge` |
| Payment methods unique | Demo | PASS | 3 rows after `511b3fd4` dedupe deploy |
| Catalogue dedupe endpoint | Demo | PASS | `POST /api/settings/import/dedupe` |
| Import does not overwrite owned keys | SKR | PASS | prior online session |
| Cash round_to engine online | Demo | NOT_RUN | — |

限制：未声称像素级 UI 克隆；未声称定价算法语义 1:1；Sell/register 未写入。

## 2026-11-21 当前线上 Settings / Pricing 只读验收

| 检查 | 环境/版本 | 结果 | 证据/范围 |
|------|-----------|------|-----------|
| 当前应用版本探测 | SKR + Demo，2026-11-21 | PASS | 只读 `/api/public/version`；稳定复验两店 frontend/backend 均为 `d30165c0027e8664538eec401f2fce2d2642f4dc` |
| Settings 页面/主题/权限/502 重试矩阵 | SKR + Demo，`d30165c0`，2026-11-21 | PASS | 每店 51 页面/视口组合（17 路由 × 390/768/1440）；无错误/写入；Demo 角色权限对照 PASS，SKR 因 Add staff 不可用而跳过该项；证据 `temp/settings-audit-current-20261121/retry/report.json`（本地，不提交） |
| Company settings bundle 键和值一致 | SKR + Demo，`d30165c0`，2026-11-21 | PASS | 当前只读 API 两边键集合相同，关键值完全一致；公司资料 7 键缺失属已知资料缺口 |
| Tier pricing read-back + quote | 上次记录 | PASS（限定样本；运行 SHA 未在本次资料中关联） | `-196 LEMON P/F 6% 330ML`，数量 1/3/4/7/10；报价依次 `$8.99/$26.97/$26.99/$53.96/$51.99` |
| 设置读回关键值 | SKR + Demo，`d30165c0`，2026-11-21 | PASS | Melbourne、`DD/MM/YYYY`、`HH:mm:ss`、Monday、High Mix、Match Price Points、Redistribute、Require Password=true；值相同 |
| 设置保存/登录登出写入验收 | SKR + Demo | NOT_RUN | 本轮未修改设置，也未执行登录登出操作 |
| Shopfront 设置页逐字段在线复核 | Shopfront | NOT_RUN | 当前浏览器 URL 许可校验阻断自动化；Shopfront 仍只读 |
| 全部 60 个公司字段的真实业务消费者 | 源码 + 线上 | PARTIAL | 约 43 字段静态扫描未见明确消费点；须逐项人工追踪，不可据此宣告所有字段失效 |

限制：Pricing PASS 仅适用于记录的商品、阶梯及数量；不是全目录、价格表、会员价或促销的完整等价证明。此前 Settings UAT 的运行 SHA 未能从现存摘要与当前版本探测建立对应关系；需要在 `37ab0d5` 上重跑。线上读回、只读报价、源码验证和未执行的写入验收分别记录，不相互替代。

## 2026-11-21 定价 UAT（先前运行版本 9bf25860）

| 检查 | 环境/版本 | 结果 | 证据/范围 |
|------|-----------|------|-----------|
| 运行版本 | SKR + Demo，`9bf25860b1436f5b3749fb29ccd9728d654c726b` | PASS | `/api/public/version` 两店 frontend/backend SHA 相同 |
| 定价设置读回 | SKR + Demo，`9bf25860` | PASS | `HIGH_MIX_PRICE / MATCH_PRICE_POINTS / REDISTRIBUTE` |
| 整包价到 POS 单位价归一化 | Crawler + POS 源码 | PASS | Shopfront 官方文档定义数量档整包价；crawler 按数量换算单位价，POS 定价器按数量还原档位总价 |
| High Mix 只读报价 | SKR + Demo，`9bf25860` | PASS（单商品） | `-196 LEMON P/F 6% 330ML` 数量 1/3/4/7/10：`$8.99/$26.97/$26.99/$53.96/$51.99`；无 sale 写入 |
| Shopfront 官方数量定价示例 | 官方文档 + 本地代码 | PASS | High Mix 数量 7 `$18.50`、Quantity Rate `$17.50`；本地单测包含对应示例 |
| Family 源数据可用性 | Shopfront GraphQL + SKR/Demo API | PASS（确认无样本） | Shopfront families 0 条；SKR/Demo family filter options 均 0；Family 线上价格 UAT NOT_RUN |
| 定价器回归 | Java 21 本地 | PASS | `TierPriceCalculatorTest` + `FamilyPriceCalculatorTest`，18 tests |
| 两店产品目录一致性（同步前 source ID 基线） | SKR/Demo，`9bf25860` | PARTIAL / 差异 | 两店各 11,508 个映射 source ID，集合相同、每店 11,506 个可见映射商品；Demo 另有 37 条未映射 `NOT_ACTIVE`。21 个映射商品价格点不同、15 个名称不同、1 个状态不同；均需以 job `1256` 终态及同步后回读为准。早先按名称候选得出的 14/51/45 和价格差异 0 已作废。 |

限制：此次报价仅验证一个商品的五个数量；没有做 Shopfront Register 销售对照、促销/客户价/继承价格表测试。Shopfront Family 为空使 Family 只能通过本地单测验证。同步前目录基线已用稳定 source ID 复核；全量商品目录同步 job `1256` 仍在运行，最终结果尚未验收。

## 2026-11-21 当前线上版本定价复验（0e2290c6）

| 检查 | 环境/版本 | 结果 | 证据/范围 |
|------|-----------|------|-----------|
| Runtime identity | SKR + Demo，`0e2290c6325860eacd64be2e0b2be21197a5fd28` | PASS | 2026-11-20 UTC `/api/public/version`；两店 frontend/backend SHA 一致 |
| 时区及定价设置读回 | SKR + Demo，`0e2290c6` | PASS | 两边 `Australia/Melbourne`；`HIGH_MIX_PRICE / MATCH_PRICE_POINTS / REDISTRIBUTE` |
| High Mix 只读报价 | SKR + Demo，`0e2290c6` | PASS（单商品） | `-196 LEMON P/F 6% 330ML`；两店各自现有 register session；数量 1/3/4/7/10 总价相同，为 `$8.99/$26.97/$26.99/$53.96/$51.99`，GST `$0.82/$2.45/$2.45/$4.91/$4.73`；未创建 sale |
| Crawler 调度时区 | 生产 crawler | MISMATCH | `/api/sync/schedule` 报 `Australia/Adelaide`，本地 crawler `.env` 是 `Australia/Melbourne`；当前有目录 job `1256` running 和 interval job `1257` queued，暂不重启服务 |
| 商品目录同步 | crawler `1256` → SKR + Demo | RUNNING | `products_only=true`、`full_catalog_snapshot=true`；截至 2026-11-20 22:13 UTC `products:fetched:4550`、heartbeat 正常；`1257` 已合并 2 个 interval windows |
| 同步后 source ID / 商品字段比对 | SKR + Demo | PENDING | 等 `1256` terminal receipt 后调用 `/api/pos/products/reconcile` 复核 |

限制：High Mix 结果仍只覆盖一个商品及五个数量；Family 无源商品样本，未做促销、客户价、价格表继承或 Shopfront Register 对照。Crawler 时区差异和目录同步后的字段差异尚未处理/验收。

## 2026-11-15 latest-main 源码及回归检查

| 检查 | 环境 | 结果 | 证据 |
|------|------|------|------|
| 通用设置 GET/PUT 强制使用认证 vendor/outlet，不接受客户端 scope 越权 | Java 21 本地 | PASS | `SettingControllerScopeTest`（3） |
| vendor company settings 优先读当前 vendor，缺项回退旧 NULL scope | Java 21 本地 | PASS | `CompanySettingsServiceTest`（5） |
| Tax/Payment 编辑重名校验；税率默认项写入事务 | Java 21 本地 | PASS | `TaxRateControllerTest`（3）、`PaymentMethodControllerTest`（1） |
| Checkout、CashRounding、register close、settings import/dedupe 回归 | Java 21 本地 | PASS | 聚焦 Maven 套件（47 tests） |
| 页面入口/占位和调用链源码盘点 | latest `main` | PARTIAL | 已识别旧 URL 重定向、Roles 只读及硬件/打印配置未端到端接入；不等价于页面运行验证 |
| Setup 全部入口线上可达及无浏览器错误 | Demo | NOT_RUN | 需部署后浏览器验收 |
| 按 vendor 隔离的线上保存/刷新/权限检查 | Demo | NOT_RUN | 本轮未写线上配置 |
| SKR Setup 线上只读复核 | SKR | NOT_RUN | 本轮未访问线上店铺 |
| Setup candidate `mvn -B clean verify` 精确 SHA Java 21 工作流 | GitHub Actions | PENDING | 候选已提交到隔离工作树；Actions 尚未派发 |
| Demo/SKR 部署 SHA 与候选一致 | Dokploy | PENDING | 尚未部署 |

限制：47 项结果是工作树内的定向 Maven 测试，不是完整 `mvn clean verify`；也不是 Dokploy 运行版本或线上门店验收。High Mix / Family / Redistribute 尚无已定义且实际调用的定价算法；读取配置成功不代表售价受这些配置影响。

## 2026-11-21 定价 UAT 终态复核

| 检查 | 环境/版本 | 结果 | 证据/范围 |
|------|-----------|------|-----------|
| Crawler job `1256` / `1257` | 生产，2026-11-20 UTC | PASS | 两任务均 completed，无错误；`1256` 单日目录快照，`1257` 覆盖 5 个 interval windows |
| catalog-only 销售隔离 | crawler `main` `bfb95ce` | PASS（源码/测试） | 修复通过 `include_sales=false` 禁用销售查询与导入、`replay_sales_window=false`；`test_products_only_job_disables_inventory_in_source_and_pos_paths` 与 `test_completed_daily_sales_import_advances_report_coverage` 共 2 passed。修复已在 GitHub main，生产 source fingerprint 与本地 main 一致。下一次目录专用 job 的线上零 upsert 验证仍 PENDING |
| 旧任务销售回执 | job `1256`、`1257` → SKR + Demo | 需关注 | 每目标分别回执 159、165 笔 imported，均 0 skipped/rejected/unmatched；计数不能证明全为新建交易，也不能据回执确认数据库新增量 |
| 同步后 source ID 映射 | SKR + Demo | PASS | 最新目录 10,862 个 source ID 全部可在 POS 找到；每目标 POS 有 11,506 个映射 |
| 同步后字段比较 | SKR + Demo | PASS（预期条码冲突除外） | 仅 102 个条码 mismatch，均分类为预期冲突；99 个重复条码涉及 188 个源商品；未解决/未解释差异均为 0；自动写入/删除均为 false |
| POS-only 历史映射 | SKR + Demo | 已分类，保留 | 462 条 POS-only 映射都有历史采购单引用；644 条历史映射总量不属于最新目录删除范围 |
| 历史成本候选 | SKR + Demo | PARTIAL | 179 条未由当前目录确认；未自动改价，需单独核验成本来源 |
| Crawler 调度时区 | 生产 crawler | MISMATCH / 未修复 | `/api/sync/schedule` 为 `Australia/Adelaide`，POS 与本地 crawler 配置为 `Australia/Melbourne`。所有 job 空闲；Dokploy URL 许可校验停止了浏览器自动化，本轮没有写环境变量或重启 |

限制：价格报价仍只覆盖一个商品和五个数量；Shopfront Family 无真实样本，促销、客户价、价格表继承与 Shopfront Register 对照未做。目录专用修复尚未用下一次新线上任务验证销售 upsert 为 0；179 条历史成本候选需要复核。Shopfront 保持只读，未创建 Shopfront Register 销售。

## 2026-11-21 当前线上三商品报价复验

| 检查 | 环境/版本 | 结果 | 证据/范围 |
|------|-----------|------|-----------|
| Runtime identity | SKR + Demo，`b81890a7bb9e7b9e95a917860378c2d854f96c47` | PASS | 两店 `/api/public/version` 的 frontend/backend SHA 相同，且与本地 `main` / `origin/main` HEAD 一致 |
| Shopfront 同步源阶梯 | crawler `skr` 只读商品归档 | PASS（有限样本） | `-196 LEMON`：1/4/10 件 `$8.99/$26.99/$51.99`（源更新时间 11/16）；`4 PINES NEW WORLD`：1/6/18 件 `$5.99/$23.99/$57.99`（11/19）；`4 PINES PACIFIC`：1/6/18 件 `$4.99/$19.99/$51.99`（11/11） |
| High Mix 数量报价 | SKR + Demo，`b81890a7` | PASS | Lemon，1/3/4/7/10 件 `$8.99/$26.97/$26.99/$53.96/$51.99`；New World，1/6/7/18 件 `$5.99/$23.99/$29.98/$57.99`；Pacific，1/6/7/18 件 `$4.99/$19.99/$24.98/$51.99`。每店 API 响应和页面金额一致 |
| 报价 API / Sell UI | SKR + Demo，`b81890a7` | PASS | 每店 10 项检查通过；报价按请求数量逐一匹配 `/api/sales/quote` 200，最终结账按钮可用 |
| 业务写入监测 | SKR + Demo，`b81890a7` | PASS | 0 checkout/sale/cash movement 写入；独立报价会话退出，没有提交交易 |
| Shopfront 设置页面 / Register | Shopfront | NOT_RUN | 价格档来自 crawler 最近同步的 Shopfront 归档，不是本轮直连 Shopfront 页面的对照；没有进入 Shopfront Register |

本机详细报告：`temp/continued-settings-uat-20261121/pricing-skr-quote.json`、`temp/continued-settings-uat-20261121/pricing-demo-quote.json`（本地临时验收证据，未纳入仓库）。限制：三个商品均为普通数量阶梯；Shopfront 当前无 Family 源商品，Family 真实样本、促销、客户价及价表继承仍未覆盖，不能据此宣称全部定价规则 1:1。

## 2026-11-21 当前线上定价 UAT 复验（8d387b5c）

| 检查 | 环境/版本 | 结果 | 证据/范围 |
|------|-----------|------|-----------|
| Runtime identity | SKR + Demo，`50cd5440374c7a08ab8005416214bdd4a6bb67c6` | PASS | 两店 frontend/backend SHA 一致 |
| 定价设置与 Shopfront 只读读回 | SKR + Demo + Shopfront `/settings` | PASS（设置值） | 三项值逐项一致：`HIGH_MIX_PRICE` / `High Mix Price`、`MATCH_PRICE_POINTS` / `Match Price Points`、`REDISTRIBUTE` / `Redistribute` |
| 数量阶梯报价 API + Sell 页面金额 | SKR + Demo，`50cd5440` | PASS | `-196 LEMON`、`4 PINES NEW WORLD`、`4 PINES PACIFIC`；覆盖 1–18 件的选定数量节点，API 应答与页面显示均匹配源阶梯总价；最终结账按钮可用 |
| 业务写入监测 | SKR + Demo，`50cd5440` | PASS | 两店各 10/10 项检查通过；报价会话没有 checkout/sale/cash-movement 写入，结束时退出登录 |
| Shopfront Register 交易对照 | Shopfront | NOT_RUN | 按只读约束未创建源站交易；设置值一致和数量报价矩阵不等于 Register 全流程等价 |

本机详细报告：`temp/continued-settings-uat-20261121/pricing-skr-debug-78f.json`、`temp/continued-settings-uat-20261121/pricing-demo-debug-78f.json`（临时 UAT 输出，未纳入仓库）。两店并行复跑曾在第三件商品的报价响应等待阶段超时；改为每店串行运行后均 10/10 通过，后续应串行执行该 UAT。当前证据覆盖三件普通数量阶梯商品；不证明 Family、促销、客户价、价格表继承或 Shopfront Register 对照已实现/等价。Shopfront 仍只读，没有创建交易。

## 2026-11-21 crawler 环境修复与运行验收

| 检查 | 环境/版本 | 结果 | 证据/范围 |
|------|-----------|------|-----------|
| Crawler Compose 环境 | Dokploy `ShopfrontCrawler` | PASS | 补齐之前缺失的必需 `CRAWL_DATABASE_URL`，目标为项目约定的独立 crawler 数据库 `45.63.26.89:5679`；未记录连接凭据 |
| 部署 | Dokploy，crawler main `8746babf8def8e8286cde894a363fd036453f2a8` | PASS | 修复环境变量后最新部署 `Done`；先前同 SHA 的失败记录不再是最新结果 |
| 运行健康 / 队列 | Production crawler | PASS | `/healthz` 200，授权 `/api/sync/status?store=skr` 200；最新 job `1282` 为 `extended_data/completed`，没有 queued/running job |
| 调度时区 | Production crawler | PASS | `/api/sync/schedule` 返回 `Australia/Melbourne`，计划时间带 Melbourne `+11:00` 偏移 |

环境变量仅保存到 Dokploy Compose 配置并通过重新部署生效，没有手动启动同步任务。Shopfront 页面只核对了三项定价设置，没有保存设置或进入 Register。

## Settings 字段可用性保护（当前 main 候选）

- 源码逐字段核查了 Settings 的 60 个公司字段：18 个有明确运行时代码消费者，另外 42 个此前只被保存/读回，没有改变 Orithos 行为。这是配置 UI 与运行能力之间的根本差距。
- Settings 现在保留这些 Shopfront 对照项及其当前值，但对尚未实现的 42 个字段禁用编辑并标注“仅保存、不影响 Orithos 行为”；避免店铺人员误以为改值已改变 POS 行为。已有运行路径的 18 个字段仍可编辑。
- 聚焦验证：`company-settings-form.test.ts` 6/6 PASS；POS UI `npm run typecheck` PASS；`git diff --check` PASS。
- 页面级禁用态验收已在后续线上版本完成，见下方 2026-11-21 页面验收记录。此项修复不会让 42 个未实现字段获得 Shopfront 功能等价；它阻止无效配置继续被当作已完成能力。

## 2026-11-21 公司设置字段线上页面验收

| 检查 | 环境/版本 | 结果 | 证据/范围 |
|------|-----------|------|-----------|
| Runtime identity | SKR + Demo，`40ae2470b6012dd887bc05203056bb4b0b705cd2` | PASS | 两店 frontend/backend SHA 相同，且与本轮 GitHub `main` 一致；包含 Settings 修复 `6c008620` |
| Settings 页面矩阵 | SKR + Demo，1440px 桌面视口 | PASS | 每店 17 个设置路由；导航、主题切换、无横向溢出、权限只读弹窗、旧路由、区域接口故障重试均通过；无浏览器异常、无非认证写请求 |
| 公司设置字段可用性 | SKR + Demo，10 个 Company 分区 | PASS | 每店实测 60 个表单字段：18 个运行时支持项均可编辑且无“Stored only”提示；42 个尚无运行时消费者的字段均禁用且有明确提示 |
| 页面验收稳定性 | SKR + Demo | PASS | UAT 前后各自 `/api/public/version` frontend/backend SHA 未变化；脚本阻断全部非认证 API 写入。详细临时报告 `temp/settings-audit-current-20261121/latest-main-stable-report.json` 不纳入版本库 |
| 设置保存行为 | SKR + Demo | NOT_RUN | 本轮没有改动或保存线上设置，也没有创建销售/现金交易 |
| Shopfront 全字段页面复核 | Shopfront | NOT_RUN | 本轮只验收 Orithos Settings UI。已有定价字段值和只读报价记录不代表 Shopfront 全部设置逐字段一致 |

本轮把 60 项字段可用性断言加入 `scripts/settings-audit-readonly.cjs`，避免未来只验证页面可达而漏掉受支持与仅保存字段的真实交互状态。本轮是桌面视口验收；不代替移动视口复验、设置保存/刷新 UAT，也不证明被禁用的 42 项已经实现 Shopfront 行为。

## Discounts Require Reason 运行时接线

- 将 `company.sell.discounts_require_reason` 从仅保存字段改为运行时支持字段。收银台启动后读取当前租户销售策略；策略开启时折扣操作必须填写 1–255 字符理由，取消输入会取消折扣操作。
- 后端结账再次按租户设置强制校验，拒绝缺少理由或超长理由的折扣；折扣理由进入幂等请求身份并写入 `sale_item.discount_reason`。策略默认关闭，现有线上行为不变，门店策略值未被更改。
- `scripts/settings-audit-readonly.cjs` 将公司字段可编辑断言更新为 19 项支持 / 41 项仅保存字段。
- 聚焦验证：`CheckoutServiceFlowTest` 与 `RetailRegisterControllerTest` 通过；POS UI `npm run typecheck` 通过；`git diff --check` 通过。UI 单测未能启动：当前 checkout 缺少 `tsx`，`npm run test:unit` 因命令不可用退出；没有安装依赖或改动锁文件。
- 尚未做线上销售写入 UAT，也未更改 SKR/Demo 策略值。服务端开启策略时的拒绝/保存行为由单测覆盖；线上只读页面与策略读回需要部署后复验，不能据此宣称全站 Settings 与 Shopfront 完全一致。
