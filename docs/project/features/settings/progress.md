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
- Tax Rates：曾 203 行全是 GST；用既有 `PUT /api/tax-rates/{id}/merge` 清到 **GST + GST Free（2）**。
- Payment Methods：仍 **204**（Cash×202 + EFTPOS + Gift Card）— 待 dedupe 部署后一键清理。
- 证据：`docs/UAT_SETTINGS_2026-11-11_ONLINE.json`。

## 下一步

1. 部署 catalogue dedupe 后对 Demo 调 `POST /api/settings/import/dedupe`，确认支付方式约 3 行。
2. 在 crawler `daily_sync` 空闲时跑 `settings_import`（skr），再 Integrations promote。
3. 定价算法（High Mix / Family / Redistribute）单独验收。

## 阻塞

- Shopfront OAuth scopes 可能对部分 settings 根返回 403；导入会记 entity errors，不阻断 Orithos 本地编辑。
- 当前 runtime 尚无 payment dedupe API（本候选推送后解除）。
