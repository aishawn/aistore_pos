# Settings 1:1 — validation

| 检查 | 环境 | 结果 | 证据 |
|------|------|------|------|
| CompanySettingsService ownership unit tests | 本地 | 待 `mvn verify` | `CompanySettingsServiceTest` |
| CashRounding custom increment | 本地 | 待 `mvn verify` | `AustraliaComplianceTest` |
| Setup sidebar 23 routes reachable | 线上只读 | NOT RUN | 待部署后浏览器 |
| Import does not overwrite owned keys | 本地/线上 | NOT RUN | promote + save round-trip |
| Enterprise/Push persist | 线上 | NOT RUN | `/api/settings/enterprise` `/api/settings/push` |

限制：未声称像素级 UI 克隆；未声称定价算法语义 1:1。
