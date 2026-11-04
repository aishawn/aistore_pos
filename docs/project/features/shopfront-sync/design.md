# Shopfront 同步设计

更新日期：2026-11-04。状态：已实现；数据准确性以对账证据为准。

## 数据流

Shopfront API -> crawler 数据库 -> POS staging / Odoo 同步镜像。crawler 使用稳定的来源门店、Sale ID、商品 ID 和 SaleItem 行键执行幂等 upsert。POS/Odoo staging 不等同于正式 POS 订单或库存账本。

## 完整销售快照

- 只有 crawler 确认原始 Sale 的 items 与 payments 均为列表，且来源行数与已保存行数一致时，才发送 `source_complete=true`。
- POS staging 与 Odoo 镜像仅对完整 Sale 清理来源清单之外的旧销售行和支付；来源不完整的 Sale 保留旧子记录，避免误删。
- 全历史销售对账仅写 POS/Odoo 镜像，不写正式业务销售、库存或商品。当前库存由独立完整库存快照负责。
- 任务按 250 笔销售分批，持久化偏移并使用幂等 upsert，失败可从已保存进度继续。

## 失败与数据缺失

API 认证失败、来源分页不完整、批次失败或目标 coverage 不一致，都不能标记为数据完整。成本、图片、品牌等源字段缺失时保留缺失，不推测填充。
