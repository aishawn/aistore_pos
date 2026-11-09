# 采购迁移进展

更新日期：2026-11-09。负责人：采购 owner 待指定。

## 已完成

- 主采购页改为渲染 Orithos `OrithosPurchaseOrdersPage`，正式列表读取 `/api/orders`。
- 旧 `/purchases/odoo` 地址重定向到 `/purchases`。
- Shopfront 采购历史 API 改为用认证门店 host 映射到固定 `skr` crawler 来源；不再读取 Odoo company binding 或 Odoo purchasing ledger。
- 历史来源读取校验页数、总行数和唯一来源 ID；失败时不返回部分结果。历史记录保持只读，不写库存。
- Candidate 基于已部署 `3a1712a2`。UI typecheck 和完整单测已运行；结果与边界见 [validation](validation.md)。

## 问题与下一步

| 问题 ID | 优先级 | 问题 / 证据 | 状态 | 负责人 | 下一步 / 关闭条件 |
|---|---|---|---|---|---|
| PUR-MIG-001 | P0 | 候选路由未部署；线上 runtime 当前仍是 Odoo 采购页 | OPEN | POS owner | 推送 main；确认 SKR/Demo runtime SHA，再登录只读验证 `/purchases` 与 `/api/orders` |
| PUR-MIG-002 | P0 | 原生采购创建/逐行收货的 PostgreSQL/生产数据库集成和完整回执未核验 | OPEN | POS/API owner | 隔离租户完成下单、部分收货、重放和库存流水对账，确认无重复收货 |
| PUR-MIG-003 | P0 | Odoo 未结采购、商品/供应商映射和期初库存未迁移对账 | OPEN | Migration owner | 生成逐行差异；所有未知价、税、数量、箱规均人工清零后再批准切换 |
| PUR-MIG-004 | P1 | Shopfront 归档与 Orithos 正式采购之间尚无完整来源/差异报表 | OPEN | Integration owner | 按来源 ID 比对覆盖、缺失和重复，明确历史单据不影响库存 |
| PUR-MIG-005 | P1 | Xero GST 采购摘要导出未验收 | OPEN | Finance/POS owner | 按营业日核对供应商、含税/税额、来源单号及防重复导出 |

## 发布边界

本次仅迁移采购列表和历史来源读取路径。未执行真实下单、收货或库存写入；Odoo 仍是生产中其他未迁移域和当前部署采购功能的旧账本。
