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
