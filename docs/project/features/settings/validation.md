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
