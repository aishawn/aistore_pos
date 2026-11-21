# Settings 1:1 — validation

## 2026-11-21 Sale Keys Position 实际收银界面验收（线上 SHA 086ecea1）

| 检查 | 环境/版本 | 结果 | 证据/范围 |
|------|-----------|------|-----------|
| Runtime identity | SKR + Demo，`086ecea17b69a5c6579746a326b0ad86bdb59bfb` | PASS | 前后端 SHA 一致；验收前后稳定 |
| 目标配置 | SKR + Demo | PASS | 两店 `company.misc.sale_keys_position=LEFT`；策略 API 同步读回 `LEFT`，与 Shopfront 全局 `sale_keys_position=left` 对齐 |
| 实际 `/sell` 桌面位置 | SKR + Demo，1440px | PASS | 浏览器测得快捷键面板在购物车左侧；几何断言基于真实面板边界框，不创建销售 |
| 实际 `/sell` 手机顺序 | SKR + Demo，390px | PASS | 快捷键面板纵向位于购物车之前；不打开购物车付款流程 |
| 所有设置页面/主题 | SKR + Demo，390/768/1440px | PASS | 每店 17 路由 × 3 视口 × light/dark；102 个页面主题组合通过，无横向溢出 |
| Company 字段状态 | SKR + Demo | PASS | 每店 60 项中 23 项运行时支持/可编辑，37 项仅保存/禁用；Sale Keys Position 已改为运行时支持 |
| 页面错误及业务写入 | SKR + Demo | PASS | 页面错误 0、拦截/尝试的业务写请求 0；设置改值仅为目标布局，不产生销售或现金流水 |

本机报告：`temp/settings-audit-sale-position-final-20261121.json`。脚本共 121 条记录，119 项显式 PASS，另有 2 项 Runtime identity 原始记录不带 `result` 字段；0 FAIL。Demo 员工权限弹窗核验通过；SKR Add staff 不可用，跳过该项。

根因记录：先前实现接到了没有挂载 `/sell` 路由的 `SellPage`，首次线上几何验收显示真实 `/sell` 仍是固定右侧。已改接实际 `OdooRegisterPage` 主布局和加载骨架，并在完整 SKR/Demo `/sell` 验收中验证 LEFT 坐标。Shopfront 仍保持只读，未进入 Shopfront Register。`Default Sale Keys` 组未导入，成本/调拨/低于成本折扣策略仍未完成等价映射。

## 2026-11-21 当前线上 Settings 只读复验（线上 SHA 6006f5e2）

| 检查 | 环境/版本 | 结果 | 证据/范围 |
|------|-----------|------|-----------|
| Runtime identity | SKR + Demo，`6006f5e2d02f1424d2a880204f100586156e2e23` | PASS | 前后端版本一致；验收前后 SHA 稳定 |
| Settings 页面、主题与导航 | SKR + Demo，390/768/1440px | PASS | 各店 17 路由 × 3 视口 × light/dark，共 102 个页面主题组合；无文档横向溢出 |
| Company 字段运行时状态 | SKR + Demo | PASS | 每店 60 字段中 22 项可编辑且有运行时支持说明，38 项禁用并标注仅保存 |
| 注册策略与现金入口 | SKR + Demo | PASS | `sale-policy` 的 Cash Out 值与公司设置一致；当前 false 时 Sell 页入口隐藏 |
| Settings 数据路由、账号连接页及重试 | SKR + Demo | PASS | 税率/付款/门店加载无错误；连接状态展示；未知账号 tab 回退；注入 502 后 Retry 恢复 |
| 员工权限对照 | Demo | PASS | 角色模板弹窗权限条目与真实角色权限 API 一致；SKR Add staff 不可用，跳过 |
| 浏览器错误与业务写请求 | SKR + Demo | PASS | 页面错误 0；被拦截/尝试的业务写请求 0 |

本机报告：`temp/settings-audit-resume-20261121.json`。这是只读 UI/API 验收，不验证 Shopfront 完整页面语义、设置保存流程或全部业务消费者；字段状态 PASS 只证明 UI 正确地区分已接入与仅保存，不表示 60 项均已实现。

## 2026-11-21 Require Note on Parked Sale（线上 SHA 86b73a45）

| 检查 | 环境 | 结果 | 证据/范围 |
|------|------|------|-----------|
| 策略开启时 API 拒绝空白备注且不写停放销售 | 本地 Java 21 | PASS | `SellServiceParkedSaleNoteTest` |
| API trims 并存储有效备注 | 本地 Java 21 | PASS | `SellServiceParkedSaleNoteTest` |
| 策略关闭时 API 仍允许空备注 | 本地 Java 21 | PASS | `SellServiceParkedSaleNoteTest` |
| 策略接口按公司设置返回值 | 本地 Java 21 | PASS | `RetailRegisterControllerTest` |
| 本地草稿备注必填判定与清理 | 本地 Node 22 | PASS | `parked-sale-note.test.ts`，2 tests |
| Sell 页面类型检查 | 本地 | PASS | `npm run typecheck` |
| SKR / Demo frontend/backend 运行 SHA | 线上 | PASS | 设置矩阵验收前后，两店 frontend/backend 均为 `eed54213c9a381f444d66f244812d0a3cbbc65a3` |
| SKR / Demo Company bundle 键和值 | 线上 API 只读 | PASS | 两店各 66 键；键集合相同，值差异 0 |
| 停放备注策略与设置一致 | SKR + Demo API 只读 | PASS | `company.sell.require_note_on_parked_sale=false`；`sale-policy.requireNoteOnParkedSale=false` |
| Settings UI 页面/字段状态 | SKR + Demo，1440px | PASS | 每店 17 个页面组合；22 项运行时支持 / 38 项仅保存；无页面错误或尝试的业务写请求。报告：`../temp/settings-audit-current-20261121/after-note-86b73a45.json` |
| Shopfront `/settings` 页面逐字段 UI | Shopfront 只读 | NOT RUN | 页面停在 Location Selector；没有选 outlet 或进入 Register |
| Shopfront 全局/门店设置 API 读取 | Shopfront GraphQL 只读 | PASS（原始行读取） | crawler 只读 endpoint 返回 `Vendor.settings` 69 项、SKR outlet overrides 33 项；6 个凭据字符串值已脱敏。空白值代表设置行没有显式值，不能直接当作 effective false |
| Shopfront Note on Held Sale 源行 | Shopfront GraphQL 只读 | PARTIAL | Vendor `note_on_held_sale` 存在但值为空；与 Orithos `require_note_on_parked_sale=false` 的有效行为等价仍待确认 |

限制：设置矩阵/API 证明 Orithos 两店在当前版本上一致，不能证明与 Shopfront 完整 1:1。SKR Outlet 的 `sale_keys_position=default` 使用 Vendor 全局 `left`；Orithos 两店已设为 `LEFT`，且实际 Sell 布局 UAT 通过。默认 Sale Keys 组、`use_global_cost`、average/last cost transfer flags、`discount_below_cost_behaviour` 仍无已验证的 Orithos 等价实现。Shopfront 页面有效值和停放备注 true/false 页面流程仍未验收。

## 2026-11-21 当前 main 定价 UAT 复验（线上 SHA c5565986）

| 检查 | 环境/版本 | 结果 | 证据/范围 |
|------|-----------|------|-----------|
| Runtime identity | SKR + Demo，`c55659861e2b4840a3f0ad97501e3b3b2e084d91` | PASS | 前后端 `/api/public/version` 均返回同一 SHA |
| 定价设置 | SKR + Demo | PASS | 当前值 `HIGH_MIX_PRICE / MATCH_PRICE_POINTS / REDISTRIBUTE`；此次只读报价不修改设置 |
| 数量阶梯报价 API + Sell 页面 | SKR + Demo，当前 main | PASS | `-196 LEMON`、`4 PINES NEW WORLD`、`4 PINES PACIFIC`；选定数量节点的报价 API 和页面总额均符合 Shopfront 源阶梯样本；最终结账按钮可用 |
| 业务写入监测 | SKR + Demo | PASS | 两店各 10/10 项通过，`productionBusinessWrites=0`；没有 checkout、sale 或 cash movement 写入 |
| 首轮 SKR 报价响应 | SKR，`eed54213` | TRANSIENT | 第一商品通过；第二商品首次报价等待 30 秒超时。SKR 随后完整重跑 10/10 通过，Demo 串行运行 10/10 通过 |
| Shopfront Register 交易对照 | Shopfront | NOT_RUN | 保持源站只读；不创建交易，不能据此声称 Register 全流程等价 |

本机详细报告：`temp/settings-audit-current-20261121/pricing-current-skr-retry.json`、`temp/settings-audit-current-20261121/pricing-current-demo.json`（临时 UAT 输出，不纳入版本库）。当前证据覆盖三个普通数量阶梯商品；不覆盖 Family、促销、客户价、价表继承或 Shopfront Register 交易对照。Family 当前没有可用 Shopfront 样本，不能据单测宣称线上等价。

Shopfront Developer Documentation 的 `Determine Product Prices` 将标准数量定价描述为 High Mix Price 与 Quantity Rate；Orithos 还提供 Low Mix Price、Average 两个扩展算法，这两项没有 Shopfront 等价证明。Shopfront 文档要求 Family 内商品价格点一致，但没有定义 Orithos `MATCH_PRICE_POINTS` / `PROPORTIONAL` 的分配行为；后者应视为 Orithos 扩展，直到取得源端行为样本。当前可据官方示例与线上样本确认 High Mix，Quantity Rate 有本地官方示例单测，但没有线上切换设置的 UAT。

较早的 Shopfront 源设置读取曾遇到认证/基础设施限制：员工网页登录成功，但该会话对 GraphQL introspection 返回 401；crawler 数据库连接在查询只读 OAuth token 时由数据库端提前断开。历史 `outlets` 全量扫描 job `111` 以 Shopfront `429` 结束。以上限制已由下方 crawler 窄范围只读 API 绕过；不要重跑宽查询，也不要把早期“未刷新”记录当作当前状态。

## 2026-11-21 Shopfront 设置 API 值比对（SKR）

| Shopfront 源值 | Orithos SKR 当前值 | 结果/影响 |
|----------------|---------------------|-----------|
| `family_distribution=match_price_points`、`rounding_mode=redistribute` | `MATCH_PRICE_POINTS`、`REDISTRIBUTE` | 值一致；High Mix 及三个普通数量阶梯商品已在线上报价验收 |
| `timezone=Australia/Melbourne`、`date_format=DD/MM/YYYY`、`time_format=HH:mm:ss`、`start_of_week=monday` | Melbourne、相同日期/时间格式、`MONDAY` | 值一致；周起始大小写已规范化 |
| `round_to=0.05`、`sign_in_require_password=1`、`require_refund_reason=1` | `0.05`、`true`、`true` | 值一致 |
| `cost_calculation_method=last` | `LAST_COST` | 存储值映射一致，但该 Orithos 字段没有运行时消费者，改值不会切换实际成本行为 |
| Vendor `sale_keys_position=left`；SKR Outlet `sale_keys_position=default` | `company.misc.sale_keys_position=LEFT`（SKR + Demo） | 与全局布局对齐；SKR + Demo 实际 `/sell` 桌面/手机位置 UAT 通过 |
| `default_sale_keys=<Shopfront set id>` | `company.misc.default_sale_keys=""`，`GET /api/sale-keys` 返回 0 组 | 明确配置缺口；Orithos Sell 使用内建分类快捷键回退，没有导入 Shopfront 默认 sale-key 布局 |
| `use_average_cost=1`；门店 `use_global_cost=1`、调拨平均/最新成本开关均为 `1` | 无直接等价的 Orithos 公司设置/成本选择运行路径 | 成本来源及转库存成本行为未对齐；不能只把 `LAST_COST` 字段值相同视作已实现 |
| 门店 `discount_below_cost_behaviour=ignore` | 无直接对应字段 | 低于成本折扣的规则缺失 |
| `use_quantity_rate`、`discount_require_reason`、`allow_cashout_without_sale`、`note_on_held_sale` 等全局 boolean 行值为空 | Orithos 对应值分别为 High Mix、false、false、false | PARTIAL；空白不是可直接证明的 false。Quantity Rate、折扣理由、cash-out 与停放备注仍需确认 Shopfront 默认/有效值 |

只读读取 endpoint 由 crawler `main` 的 `8204c43`、`2266347`、`f434c4d` 加入/加固；查询同时读取 Vendor 全局设置与映射 outlet 覆盖，绝不调用 settings import/promote。crawler 配置的是 Shopfront `skr` 源，`demo` 不是有效 Shopfront source key；POS Demo 是 crawler 将同一 SKR 来源数据镜像的目标。Shopfront schema 有无参数 `salesKeys` 列表根和按 ID 查询的 `saleKeys(id)`：现有只读 grant 下 `salesKeys` 返回 403，`saleKeys(id)` 又无可批准的安全 ID 来源；因此没有进入 Register，也没有尝试复制该布局。

## 2026-11-21 Allow cash out without sale（线上 SHA f6ce8b23）

| 检查 | 环境 | 结果 | 证据/范围 |
|------|------|------|-----------|
| 新现金支出在设置关闭时被拒绝，且不写流水 | 本地 Java 21 | PASS | `RegisterSessionServiceTest` |
| 设置开启时允许新现金支出 | 本地 Java 21 | PASS | `RegisterSessionServiceTest`；mock 服务验证，不代表线上写入 |
| 销售策略 API 返回租户设置 | 本地 Java 21 | PASS | `RetailRegisterControllerTest` |
| 收银条仅在策略为 true 时显示 Cash Out | 本地静态路径 + TypeScript | PASS | `OdooRegisterPage` → `RegisterSellPaymentBar`；默认 false 时隐藏 |
| 后端聚焦测试 | 本地 Java 21 | PASS | 13 tests，0 failures/errors |
| POS UI typecheck | 本地 | PASS | `npm run typecheck` |
| SKR / Demo 策略与 Sell 页面只读验收 | SKR + Demo，`f6ce8b23` | PASS | `settings-audit-readonly.cjs`；策略 API 与设置读回均为 false，按钮隐藏；无业务写入 |
| Settings 路由与字段分类 | SKR + Demo，1440px | PASS | 每店 17 个路由；60 个公司字段中 21 项支持、39 项仅保存；控件状态正确 |
| 浏览器错误及写入拦截 | SKR + Demo | PASS | 每店 0 页面错误、0 被阻止/尝试的业务写请求；报告 `temp/settings-cashout-readonly.json`（本地） |

限制：线上页面矩阵本次仅覆盖 1440px，没有重跑 390/768px；Cash Out 只验证当前 false 分支，true 分支由本地服务测试和 TypeScript 路径覆盖。Shopfront 对应设置值未复核。本次无线上写入、无 Shopfront 操作。

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
- 部署后线上只读验收（SKR + Demo，`da7265b7d1bccc0dd917f1990985f86358843fb2`）：`/api/retail/registers/sale-policy` 均返回 `discountsRequireReason=false`，与当前门店配置一致；Settings 审计每店检查 18 个路由，60 个公司字段中 19 个可编辑、41 个禁用并标注仅保存；无页面异常、无非认证业务写请求。UAT 脚本报告保存在本机临时目录 `temp/settings-audit-current-20261121/discount-reason-deploy-audit.json`，不纳入仓库。
- 尚未做任何销售写入 UAT，也未更改 SKR/Demo 策略值。服务端开启策略时的拒绝/保存行为由单测覆盖；线上复验仅确认当前关闭策略读回和 Settings UI 字段状态。视口为 1440px 桌面，不代表移动视口或全站 Settings 与 Shopfront 完全一致。

## Refunds Require Reason 运行时接线

- `company.sell.refunds_require_reason` 现由服务端退款事务按租户配置执行，默认值仍为 `true`；开启时拒绝空白原因，关闭时接受空原因但仍限制最多 255 字符。收银台会读同一销售策略，显示可选标记；策略请求失败时，有填写原因的退款仍可继续，由服务端最终校验。
- 退款原因不再充当退款身份标记。原生退款始终有 `linked_sale_id`，所以 refundable 数量/金额/GST、销售/退款报表、AI 预测、补货、客户/供应商销售汇总均改用关联关系、退款金额，并兼容历史 `refund_reason` 数据。
- Settings 字段审计计数更新为 20 项运行时支持 / 40 项仅保存字段。
- 聚焦验证：`RefundServiceTest`、`RetailRegisterControllerTest` 和 POS UI `npm run typecheck` 通过；`git diff --check` 通过。UI 单测仍受本地缺少 `tsx` 限制，未安装依赖。
- 部署后只读验收（SKR + Demo，runtime `dc708c3e767d84792e97bcbe7837a13f79437969`）：`/api/retail/registers/sale-policy` 两店均返回 `discountsRequireReason=false`、`refundsRequireReason=true`；每店 18 个 Settings 路由通过，60 个公司字段中 20 个可编辑、40 个禁用并标注仅保存；无页面错误、无非认证业务写请求，UAT 前后 runtime SHA 未变化。报告位于本机临时文件 `temp/settings-audit-current-20261121/refund-reason-deploy-audit.json`，不纳入仓库。
- 尚未做线上退款写入 UAT，也未修改 SKR/Demo 策略值。策略启用/关闭两条分支由服务测试覆盖；Shopfront 的对应 Refunds Require Reason 值尚未读取，因此本次只证明 Orithos 两店一致，不证明该设置与 Shopfront 相同。线上退款账本不使用真实交易验证。

## 2026-11-21 Sale Keys 与成本消费者追查

- 本轮再次调用 crawler 只读 `shopfront-settings` endpoint 刷新 SKR 原始值：Vendor 的 `use_quantity_rate`、`discount_require_reason`、`allow_cashout_without_sale`、`note_on_held_sale` 均为空字符串；`require_refund_reason=1`、`cost_calculation_method=last`、`sale_keys_position=left`。SKR Outlet 的 `sale_keys_position=default`、`default_sale_keys=default`、`discount_below_cost_behaviour=ignore`、`use_global_cost=1`、三项 transfer cost 开关均为 `1`。这些是原始行值，不代表空布尔有效值为 false。
- Shopfront 官方 `Objects/Settings` 文档只定义通用 name/value/datatype/updatedAt 字段，没有规定空值的 effective default 或继承规则；页面有效值仍不能从 GraphQL 原始行推断。尝试检查 Shopfront 页面时，Computer Use 的 URL 许可校验停止了操作；没有绕过，也没有输入凭据。
- Shopfront schema 同时有无参数的 `salesKeys`（返回 `SaleKeys[]`）和按 ID 查询的 `saleKeys(id)`（返回单个 `SaleKeys`）。不能将前者仅凭名称判断为可读列表。
- crawler 既有只读 Query scan 记录显示：`salesKeys` 请求到 Shopfront 后返回 `403 permission_denied`，读取数为 0；`saleKeys(id)` 被安全扫描器阻止，因为必需的 `id` 没有已批准的只读来源策略。生产 crawler `main` 源指纹 `fdd91fd2db1ceda99aeff20ff3d9551db2cd40d73c9e7d4be47a28fb873cf54` 与其运行指纹相同。没有请求 `modify_sale_keys` scope，也没有进入 Shopfront Register。
- `company.general.cost_calculation_method` 只在设置默认值/UI catalog 中定义，没有 POS 运行时读取点；设置值不决定实际成本算法。当前购买优化器在无供应商价文件时固定使用 `last_cost`；部分 AI 预测/补货/价格建议 SQL 则优先 `average_cost` 再回退 `cost`。这些路径分别取值，不能声称受公司成本方法控制。
- `use_global_cost`、调拨采用平均/最新成本、`discount_below_cost_behaviour` 仍没有可确认的 POS 对应执行路径。本轮没有改算法或成本数据，因为现有文档/样本不足以决定这些路径的安全等价行为。
- 下一步：由 Shopfront 管理员确认 `salesKeys` 是否有可授予的只读 scope（不授予管理写 scope）；若无，需在可合法读取的导出/API/页面中取得默认布局。成本功能需先明确受影响操作（采购、调拨、库存估值、利润与折扣门禁）及各自规则，再做独立 UAT；不能用一个全局 `COST_METHOD` 字段覆盖不同业务成本消费者。

## 2026-11-21 Sale Keys 租户隔离修复（本地，待部署）

- 根因：`sale_keys` 表已带 `outlet_id`，但 API 原列表、按 ID 查询、创建、更新、删除都没有 outlet 条件；任意已认证门店可读写其他 outlet 的组。创建也允许客户端实体直接写入，无法可靠建立租户归属。
- 修复：`SaleKeys` 补 `outletId`；全部 Mapper 查询/更新/删除按当前 `outlet_id` 过滤，创建和复制强制使用认证用户当前 outlet；所有端点要求有效的 vendor/outlet 上下文；跨 outlet ID 返回 not found。原有 `settings.store` 写权限继续保留。
- 验证：新增 `SaleKeysControllerTest`（7 项）与 `SaleKeysMapperSqlTest`（1 项），覆盖未认证、创建/更新强制当前 outlet、跨 outlet 读删、复制及 SQL 范围；POS API 全量 `mvn -B test`：1,044 tests，0 failures/errors。仅本地验证，尚未推送/部署。
- 仍未完成默认组功能：`/sell` 实际路由挂载 `OdooRegisterPage`，快捷分类来自 `RegisterSellCatalogWorkspace` 的固定 `SALE_KEY_CATEGORIES`；`useDefaultSaleKeys` 与自定义 `SaleKeysPanel` 只在未挂载的旧 `SellPage`。因此 `company.misc.default_sale_keys` 仍仅保存，不能影响实际收银台。Shopfront 默认布局也仍无法从现有只读 grant 导出，不能猜造。
