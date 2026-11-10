# CAP-SET — Shopfront Settings → Orithos 1:1

更新日期：2026-11-10。

Orithos 是 Settings 权威。Shopfront 仅首次/按需导入，不覆盖日常配置。Account & Billing 使用 Orithos 账号模型（不计费克隆）。Enterprise Policies 与 Push Notifications 纳入首期。

| 状态 | 说明 |
|------|------|
| 设计中 | 否 |
| 已实现 | Wave 0–3 源码候选（导航、公司 KV、目录 CRUD、导入/promote、引擎 round_to） |
| 本地验证 | 后端单测候选；完整 `mvn verify` 见 progress |
| 已部署 | 待 push/Dokploy |
| 线上验证 | 待 UAT_SETTINGS |

入口：[design](design.md) · [progress](progress.md) · [validation](validation.md)
