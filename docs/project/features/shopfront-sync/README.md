# Shopfront 数据同步

状态：已实现；逐类数据完整性需按线上 coverage 和来源对账确认。负责人：集成 owner 待指定。

Shopfront `skr` 数据经 crawler 保存后，经受控 API 镜像到 POS staging 与 Odoo。数据分为商品、库存、销售、销售行、支付及供应链记录；每类必须独立核对来源数、目标数和完整性。

本轮已确认 crawler 有 155,665 笔销售、305,052 条销售行；POS staging 有相同销售数、305,339 条销售行；Odoo 同步镜像有 155,672 笔销售、305,103 条销售行。销售行差异需要在部署销售专用全量镜像修复后重新核对。库存记录三端均为 10,849；来源正数合计 49,993，负库存属于 Shopfront 来源记录，不能以有符号净额作为 dashboard 库存件数。

详见 [设计](design.md)、[进展](progress.md) 和 [验证](validation.md)。
