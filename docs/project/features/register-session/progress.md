# 收银班次进展

更新日期：2026-11-09。负责人：POS owner 待指定。

## 已实现，本地候选

- 认证 vendor/outlet 范围内的收银机列表、当前班次、开班、现金进出和关班 API。
- 开班/现金变动/关班幂等键；重复键请求内容不一致时拒绝。
- checkout 要求当前门店有效 Orithos 班次；支付行与关班记录显式写入认证 outlet。
- checkout 与关班通过班次行锁协调；有未结付款或缺失 payment method 时阻断关班。
- 关班按 cash rounding、EFTPOS cash-out、备用金、现金流水和 register payment methods 对账。
- Odoo-only 模式放行新零售班次 API，旧 Classic register API 保持退役。
- Java 21 本地全量 `mvn -B test`：541/541 通过；测试只使用 mocks，没有数据库或线上写入。

## 问题和下一步

| 优先级 | 问题 | 状态 | 下一步 / 关闭条件 |
|---|---|---|---|
| P0 | POS 页面仍依赖 Odoo session/register/checkout BFF | OPEN | 将 POS UI 接到 Orithos API；开班、售货和关班浏览器流程通过后再发布 |
| P0 | PostgreSQL 锁、SQL 聚合和 schema migrator 无数据库集成证据 | OPEN | 在专用测试租户运行 exact-SHA Java 21 gate 和隔离 PostgreSQL 集成验证 |
| P0 | Adelaide 与 `AustraliaTime` Sydney zone 不一致 | OPEN | 增加门店时区配置并验证营业日边界和 DST |
| P1 | Refund/cash-out/payments terminal settlement 未进关班聚合验收 | OPEN | 按实际 payment/tender 规则补齐交易回读和对账用例 |
| P1 | migration 目前由启动时的幂等 DDL runner 执行，未进入统一版本化失败阻断机制 | OPEN | 纳入 versioned database migration runner，并验证备份/恢复 |

## 发布边界

当前 POS runtime 尚未包含本候选；SKR 最近只读版本探针为 `5dc69fdf`，Demo TLS 探针失败。本地通过不表示已部署或已验收。共享 `aipos_uat` / Demo 数据未证明是独立测试账本；不得把新班次业务写入真实门店。
