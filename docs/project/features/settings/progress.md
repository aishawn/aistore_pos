# Settings 1:1 — progress

更新日期：2026-11-10。

## 本轮候选

- pos-api：`CompanySettingsService` / keys、`SettingsImportService`、`SettingsImportController`、`SettingsPromoteController`、Enterprise/Push controllers、Checkout `round_to` 接线、所有权保护单测。
- pos-ui：Setup 侧栏 23 项、Company KV 全分区、目录 CRUD、Integrations promote、Account Billing 壳、Enterprise/Push 可保存。
- shopfront-crawler：settings collectors + `settings_import` job + `/api/stores/{store}/settings/import`。

## 本地验证

- `mvn -B clean verify`（Java 21）PASS，含 `CompanySettingsServiceTest` 与 CashRounding `roundTo` 断言。
- `pos-ui` `npm run typecheck` PASS。

## 下一步

1. push `main`（POS + crawler）→ Dokploy 自动部署。
2. 触发 `settings_import` for `skr`，再在 Demo Integrations promote；更新 UAT_SETTINGS 为线上结果。
3. 定价算法（High Mix / Family / Redistribute）单独验收。

## 阻塞

- Shopfront OAuth scopes 可能对部分 settings 根返回 403；导入会记 entity errors，不阻断 Orithos 本地编辑。
