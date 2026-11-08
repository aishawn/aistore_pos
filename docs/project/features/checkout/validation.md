# 收银迁移验证

更新日期：2026-11-09；负责人：POS owner 待指定。

## 最近适用结果

- 环境：本地 Java 21，POS API unit/regression tests；source 基于 `15d06c68` 的未提交工作树；runtime SHA：不适用；数据库：不适用；业务写入：0。
- `mvn -B test`：537 tests, 0 failures, 0 errors, 0 skipped，PASS。
- 重点覆盖 checkout 金额意图幂等摘要、服务端门店定价、篡价忽略、无价/跨店商品拒绝、挂单读取门店范围、销售旧写入口在 Odoo-only filter 下退役。
- `git diff --check`：PASS。

## 未验证

- 本候选尚未提交、构建镜像或部署；Demo/SKR runtime SHA 匹配：NOT RUN。
- 没有线上或隔离数据库业务写入；数据库 schema、门店价格与显式 GST 配置是否齐备：NOT RUN。
- 销售、退款、现金舍入、支付终端、班次关账及库存对账闭环：NOT RUN。
- 测试不覆盖前端完整结账浏览器流、POS 服务启动迁移和生产数据迁移。

## 放行限制

本结果只证明 Java 单元/回归测试通过，不能作为切换生产门店或停用 Odoo 的依据。完整证据和限制见 [session](../../../test-sessions/2026-11-09-native-checkout-safety.md)。
