# Settings 1:1 — validation

| 检查 | 环境 | 结果 | 证据 |
|------|------|------|------|
| CompanySettingsService ownership unit tests | 本地 | PASS | `CompanySettingsServiceTest` |
| Settings catalogue dedupe unit | 本地 | PASS | `SettingsImportServiceDedupeTest` |
| CashRounding custom increment | 本地 | PASS | `AustraliaComplianceTest` / CashRounding |
| Setup sidebar 23 routes reachable | Demo 只读 | PASS | `UAT_SETTINGS_2026-11-11_ONLINE.json` |
| Company / Enterprise / Push APIs | Demo 只读 | PASS | code 0 after OdooOnly allowlist |
| Tax rates unique after cleanup | Demo write (merge) | PASS | 203→2 via `/api/tax-rates/{id}/merge` |
| Payment methods unique | Demo | FAIL→fix pending | Cash×202；dedupe candidate ready |
| Import does not overwrite owned keys | SKR | PASS | prior online session |
| Cash round_to engine online | Demo | NOT_RUN | — |

限制：未声称像素级 UI 克隆；未声称定价算法语义 1:1；Sell/register 未写入。
