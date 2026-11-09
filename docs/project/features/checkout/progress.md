# 收银迁移进展

更新日期：2026-11-09；负责人：POS owner 待指定。

## 已完成

- 本地候选按认证租户/门店限定 Sell 商品搜索、浏览、快捷键和客户搜索。
- 挂单列表拒绝缺少认证范围时的全局查询；箱规读取限定门店；挂单使用已校验的商品和服务端价格保存。
- checkout 使用服务端当前门店价目与税率重算销售金额；商品/价格/税率缺失时拒绝；客户端 userId/价格不再授权或决定账务金额。
- 校验收银机属于当前门店且处于开启状态；库存查询限定当前门店。
- 幂等摘要仅绑定交易意图，客户端价格变化不阻止原请求重放。
- Odoo-only 过滤器只开放销售读取与受控 checkout；旧任意销售 create/update/void 继续退役。
- 基于 `15d06c68` 的本地 Java 21 后端回归：537/537 通过，业务数据库写入 0。见 [2026-11-09 session](../../../test-sessions/2026-11-09-native-checkout-safety.md)。
- Checkout 付款方式现按认证 outlet、register 和该 register 已配置的 payment methods 解析；缺少配置时拒绝结账，避免跨门店映射或产生无法关班对账的支付。提交 `0132cf78` 已部署至 SKR、Demo、App。
- 2026-11-09 Demo 原生闭环：vendor `1` 白名单 + 库身份 `postgres` 通过后，完成开班 / 现金售 / 退 / 关班及幂等重放。证据 [checkout loop session](../../../test-sessions/2026-11-09-demo-native-checkout-loop.md)。

## 问题与下一步

| 问题 ID | 优先级 | 问题 / 证据 | 状态 | 负责人 | 下一步 / 关闭条件 |
|---|---|---|---|---|---|
| POS-MIG-001 | P0 | Demo 路由已切到 Orithos 原生收银；写入门禁关闭，SKR 仍走 Odoo，完整退款/关班闭环未验收 | CLOSED | POS owner | Demo 开班-售-退-关班-幂等已通过；见 2026-11-09 checkout loop session |
| POS-MIG-002 | P0 | 退款、关班现金差异、物理收单、完整支付回读未形成闭环证据 | CLOSED | POS owner | Demo cash 售/退/关班幂等通过；物理收单与多 tender 仍待 SKR |
| POS-MIG-003 | P0 | 商品/客户/库存/未结采购和余额的迁移差异未核清 | OPEN | 数据迁移 owner | 只读抽取与盘点报告逐项一致；未知价税数量阻断导入 |
| POS-MIG-004 | P1 | Shopfront 外部销售事件的 Orithos 正式入账、幂等和对账未完成 | OPEN | 集成 owner | 来源 ID 重放、库存流水和来源回执端到端通过 |
| POS-MIG-005 | P1 | Xero CSV/GST 日结尚未验收 | OPEN | 财务/POS owner | 按门店营业日核实销售、退款、税额、支付及来源追溯 |
| POS-MIG-006 | P1 | 多租户隔离和恢复演练不完整 | OPEN | 平台 owner | 跨租户拒绝用例、备份还原和恢复后核对通过 |

## 切换策略

先专用测试租户，再逐店授权；每店冻结旧账本写入，做增量抽取和实体盘点后将 Orithos 设为唯一写账本。任何关键差异都暂停该店切换。当前 Odoo 仍在用，迁移未完成。
