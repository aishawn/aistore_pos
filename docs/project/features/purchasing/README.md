# 采购、供应商与收货

更新日期：2026-11-09。负责人：模块 owner 待指定。当前状态：采购列表已在 Demo、SKR、App 部署为 Orithos 原生订单页；生产采购写入闭环仍未验收。

## 功能范围

供应商、RFQ/采购单、确认、部分/超量收货、发票匹配与失败恢复。

## 业务账本边界

- Orithos `/api/orders` 是新建采购单及正式收货目标；请求范围由认证 vendor/outlet 确定。
- Shopfront crawler 采购记录只作为来源历史镜像展示，不自动生成 Orithos 收货或库存变化。
- Odoo 仍是尚未切换门店的业务账本。逐店完成数据核对、业务闭环和获批切换后，Orithos 才成为该店唯一可写账本；切换后保留 Odoo 只读历史并移除该域的 Odoo BFF 与会话依赖。
- [专题资料](../../../SUPPLIER_INVOICE_API_INGEST.md)是历史设计资料，按其日期和范围阅读。
- [测试目录](../../../TEST_CATALOG.md)中 PUR-001 定义验收范围；[测试索引](../../../TEST_REPORT_INDEX.md)保存 session 结果。

## 当前进展

- `/purchases` 已切换为 Orithos 采购单列表；`/purchases/odoo` 旧入口重定向至新页面。
- Shopfront 历史采购区直接读取 crawler，只读展示，不再要求 Odoo 登录或合并 Odoo 采购台账。
- 部署后 Demo 登录只读验证通过：`/purchases` 与 `/api/orders` 可读，Shopfront 归档返回 2,366 条只读来源记录，旧 `/purchases/odoo` 返回 307 并跳转到 `/purchases`。实施和验证记录见 [design](design.md)、[progress](progress.md)、[validation](validation.md) 和 [本次 session](../../../test-sessions/2026-11-09-purchase-page-native-route.md)。

采购单创建、部分收货、幂等重试、库存流水、迁移对账及 Xero 导出仍未完成端到端验收。
