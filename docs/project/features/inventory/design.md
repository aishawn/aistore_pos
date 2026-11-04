# 库存同步设计

更新日期：2026-11-03。状态：实现候选，线上尚未验收。

## POS 库存导航职责（2026-11-04）

- Sidebar 保持不变；Products 的 More 菜单提供 Stock list 直达入口，要求 `stock.products.view`，不依赖导入或价目表权限。
- Stock list 展示商品、分类、在手数量/单位和零售价；数量为只读，商品名/零售价编辑要求 `stock.products.edit`。采购收货通过 Purchases 订单流程完成。
- `/reports/inventory` 负责库存分析和异常筛选。Dashboard 库存总数进入库存报表，负库存提示带 `view=negative-stock` 深链；Products 与库存报表共用筛选视图并保留 URL 状态。
- 这项导航/呈现调整不改变 Odoo 库存来源、库存写入规则或已有 `/stock/list` 路由。未部署前不代表线上入口已更新。

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
