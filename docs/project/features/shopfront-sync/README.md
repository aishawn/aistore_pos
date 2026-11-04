# Shopfront 数据同步

状态：已实现；逐类数据完整性需按线上 coverage 和来源对账确认。负责人：集成 owner 待指定。

Shopfront `skr` 数据经 crawler 保存后，经受控 API 镜像到 POS staging 与 Odoo。数据分为商品、库存、销售、销售行、支付及供应链记录；每类必须独立核对来源数、目标数和完整性。

2026-11-04 核查：crawler 与 POS staging 均有 155,665 笔销售、305,052 条销售行；Odoo 同步镜像多 7 条销售记录，包含 PARKED 和一个占位来源 ID，未作删除。库存 crawler 有 10,851 条，5,372 条负数，有符号净量 -257,488；Odoo 既有净库存基线 -1,334,367 尚需复查。crawler 已发现完整库存快照收尾门槛缺陷，候选修复待部署。负库存确实来自 Shopfront 源快照，不应同步时截零；记录净量不代表实盘正确。

详见 [设计](design.md)、[进展](progress.md) 和 [验证](validation.md)。
