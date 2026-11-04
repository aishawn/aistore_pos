# Shopfront 同步设计

更新日期：2026-11-04。状态：已实现；数据准确性以对账证据为准。

每日增量同步使用 `Australia/Adelaide` 的 `02:00、10:00、18:00、23:00`。23:00 包含当前营业日，02:00 再覆盖刚结束的完整营业日；Compose 必须传入与配置模型一致的 `SYNC_DAILY_HOURS`。

## 数据流

Shopfront API -> crawler 数据库 -> POS staging / Odoo 同步镜像。crawler 使用稳定的来源门店、Sale ID、商品 ID 和 SaleItem 行键执行幂等 upsert。POS/Odoo staging 不等同于正式 POS 订单或库存账本。

## 完整销售快照

- 只有 crawler 确认原始 Sale 的 items 与 payments 均为列表，且来源行数与已保存行数一致时，才发送 `source_complete=true`。
- POS staging 与 Odoo 镜像仅对完整 Sale 清理来源清单之外的旧销售行和支付；来源不完整的 Sale 保留旧子记录，避免误删。
- 全历史销售对账仅写 POS/Odoo 镜像，不写正式业务销售、库存或商品。当前库存由独立完整库存快照负责。
- 任务按 250 笔销售分批，持久化偏移并使用幂等 upsert，失败可从已保存进度继续。

## 完整库存快照

- crawler 只有在 Shopfront 全量库存查询成功、产品 ID 唯一、库存字段和每行数量有效时，才标记库存快照完整，并保存完整产品 ID 清单。
- Odoo 逐条应用库存；无法安全应用的来源行必须保留待核对告警，不能用零覆盖或伪造数量。
- 完整来源 ID 清单仍可用于清理清单之外的旧 Shopfront 库存镜像。被隔离的来源 ID 会留在清单中，不会被 stale cleanup 删除；单条冲突不得阻止其它过期来源记录清理。
- 若来源 ID 清单为空或完整性验证失败，不发送 Odoo snapshot finalizer，也不清理目标端库存。

## 正式销售回执

- `sales_reconcile` 明确关闭 Odoo 正式业务写入，只核对 POS/Odoo 同步镜像；不得把这类任务描述为正式销售已补齐。
- 是否要求 Odoo 正式订单回执，必须依据本次任务的有效 `odoo_business_write` 值，而不是全局配置值。其它启用正式写入的销售同步仍必须核对 imported、updated 和允许跳过的订单总数。
- 任务结果中的写入标记和阶段名称必须反映本次任务实际模式，区分 `odoo_business`、`odoo_mirror` 和 `pos_mirror`。

## 失败与数据缺失

API 认证失败、来源分页不完整、批次失败或目标 coverage 不一致，都不能标记为数据完整。成本、图片、品牌等源字段缺失时保留缺失，不推测填充。
