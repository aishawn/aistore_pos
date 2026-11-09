# 收银班次与现金交接

更新日期：2026-11-09。负责人：POS owner 待指定。当前阶段：API 候选已实现并通过本地单元测试；未部署、未接入 POS 页面、未进行线上业务写入。

## 功能范围

门店内开班、备用金、现金进出、支付方式汇总、点款差额、关班和幂等恢复。班次是 POS checkout 的前置条件；结账和关班由数据库行锁串行化。

## 当前边界

- 新 API 位于 `/api/retail/registers`，只从认证主体取得 vendor/outlet/user。
- checkout 只接受当前门店已开启的 Orithos 班次；旧 `/api/registers` 路由继续退役。
- 支付流水按认证 outlet 持久化；关班按 register 配置的支付方式核算现金舍入、EFTPOS cash-out、备用金与现金变动。
- Demo 使用原生 Orithos POS 页面；SKR 仍走 Odoo register/session/close，直到该店完成授权切换。付款方式设置页按门店 gate 选择 Orithos 或当前 Odoo 配置，因此后端实现不能单独作为切换收银的依据。

## 设计、进展与证据

- [设计与金额口径](design.md)
- [进展和阻塞](progress.md)
- [验证范围](validation.md)
- [POS-003 测试索引](../../../TEST_REPORT_INDEX.md)
