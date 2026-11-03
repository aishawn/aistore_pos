# 商品、库存与盘点

更新日期：2026-11-03。负责人：模块 owner 待指定。当前库存同步修复已实现并通过本地测试；部署与线上库存对账待完成，不代表现有库存已恢复可信。

## 功能范围

商品目录、分类/条码、库存、库存报表与盘点；包括单位、公司、仓库和历史导入质量。

## 已知资料与事实来源

- [产品边界](../../../PRODUCT_BOUNDARIES.md)规定 Odoo SoT 与写入验收。
- [专题资料](../../../INVENTORY_REPLAY_REPAIR_2026-11-03.md)是原设计/历史记录，按其日期和范围阅读。
- [测试目录](../../../TEST_CATALOG.md)中 INV-001 定义验收范围；[测试索引](../../../TEST_REPORT_INDEX.md)保存 session 结果。
- [设计](design.md)、[验证](validation.md)、[进度](progress.md)记录本次 Shopfront 完整库存刷新修复及其限制。

## 下一轮盘点

先部署 crawler 与 Odoo 协议修复；然后从 Shopfront 重新抓取完整库存，核对 outlet、商品匹配、未匹配和预留冲突；最后在 `aipos_uat` 重新读取 company 5 / location 48 的 Odoo 库存并与来源逐商品对账。来源含大量负数，不能把负库存归零或当作同步缺陷。
