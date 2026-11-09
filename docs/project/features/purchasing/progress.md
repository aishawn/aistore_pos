# 采购迁移进展

更新日期：2026-11-09。负责人：采购 owner 待指定。

## 已完成

- 主采购页改为渲染 Orithos `OrithosPurchaseOrdersPage`，正式列表读取 `/api/orders`。
- 旧 `/purchases/odoo` 地址重定向到 `/purchases`。
- Shopfront 采购历史 API 改为用认证门店 host 映射到固定 `skr` crawler 来源；不再读取 Odoo company binding 或 Odoo purchasing ledger。
- 历史来源读取校验页数、总行数和唯一来源 ID；失败时不返回部分结果。历史记录保持只读，不写库存。
- `9703508f92c762c7f02ce9bd79f1790bc96678c1` 已部署到 Demo、SKR、App；三个 host 的 frontend/backend runtime SHA 均匹配。
- Demo 登录后只读验收：`/purchases` 200；`/api/orders` 返回成功（当前未结采购数为 0）；Shopfront 历史采购返回 2,366/2,366 条、40 条首屏且标记只读；旧 `/purchases/odoo` 返回 307 到 `/purchases`。无采购、收货或库存写入。
- UI typecheck 和完整单测已运行；结果与边界见 [validation](validation.md)。

## 问题与下一步

| 问题 ID | 优先级 | 问题 / 证据 | 状态 | 负责人 | 下一步 / 关闭条件 |
|---|---|---|---|---|---|
| PUR-MIG-001 | DONE | 原生采购列表已部署，runtime 与 `9703508f` 匹配；Demo 登录只读检查页面、订单 API、Shopfront 归档和旧路由跳转通过 | CLOSED | POS owner | 采购正式写入闭环仍由 PUR-MIG-002 跟踪 |
| PUR-MIG-002 | P0 | 原生采购创建/逐行收货的 PostgreSQL/生产数据库集成和完整回执未核验 | OPEN | POS/API owner | 隔离租户完成下单、部分收货、重放和库存流水对账，确认无重复收货 |
| PUR-MIG-003 | P0 | Odoo 未结采购、商品/供应商映射和期初库存未迁移对账 | OPEN | Migration owner | 生成逐行差异；所有未知价、税、数量、箱规均人工清零后再批准切换 |
| PUR-MIG-004 | P1 | Shopfront 归档与 Orithos 正式采购之间尚无完整来源/差异报表 | OPEN | Integration owner | 按来源 ID 比对覆盖、缺失和重复，明确历史单据不影响库存 |
| PUR-MIG-005 | P1 | Xero GST 采购摘要导出未验收 | OPEN | Finance/POS owner | 按营业日核对供应商、含税/税额、来源单号及防重复导出 |

## 发布边界

本次仅迁移采购列表和历史来源读取路径。未执行真实下单、收货或库存写入；Odoo 仍是尚未逐店切换域的旧账本，不得把列表上线视作采购账本完成迁移。
