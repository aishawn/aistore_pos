# 库存同步设计

更新日期：2026-11-03。状态：实现候选，线上尚未验收。

## 来源与目标

Shopfront 是当前库存快照来源。crawler 本地镜像供 POS staging 和 Odoo 集成消费；Odoo 的库存数量在 company/location 映射范围内校正。历史销售重放不得再次扣减当前库存。

## 每日库存快照

- 每个 daily sync 的首个日期分片执行独立的 Shopfront `products` 游标分页库存查询，不依赖产品 `updatedAt`。库存变化并不保证商品资料更新时间变化。
- 所有产品 ID 必须存在且唯一；每条库存行必须有有效数量。明确的零和负数是有效来源值，不能替换为零或丢弃。
- 只有分页完整结束、全部行验证通过后，才 upsert `(store, source product ID, outlet ID)` 并删除来源已不存在的旧键。空结果、GraphQL/分页错误、缺失 ID 或无效数量不得覆盖旧快照。
- 失败不推进同步游标或 catalog checkpoint。任务必须失败并可重试。
- POS staging 收到 crawler 的完整库存集合。Odoo 先分批 upsert；所有批次无未匹配项后，再以本次完整 source product ID 集合调用 finalizer。不得在每个批次执行全量清理。
- Odoo 对 source quantity 与当前 on-hand 做绝对差额校正，以稳定 source ID 隔离商品身份；保留 reservations。来源量低于已预留量时隔离并报告，禁止强行改写。

## 已知限制

Shopfront 页面分页期间不是原子时点快照。当前多 outlet 需与 Odoo 单个映射仓位核对；本轮本地代码不推断跨 outlet 汇总规则。重复身份、未匹配商品和预留冲突都需要对账清单，不以 API 200 或 job completed 宣称数据可信。
