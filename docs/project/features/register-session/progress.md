# 收银班次进展

更新日期：2026-11-09。负责人：POS owner 待指定。

## 已部署

- 原生班次 API 随 `0132cf78` 部署至 SKR、Demo、App；三处 frontend/backend runtime SHA 一致。
- Demo 只读冒烟以 vendor `1` / outlet `1` 验证 register 列表、当前班次和 Sell 商品浏览可用；1 台收银机、当前无班次、目录 1 项。没有创建班次或销售。
- 付款方式解析已限定为认证 outlet 下、当前 register 绑定的方式；无匹配时 checkout 拒绝。
- `f950b241` 将 Demo 的 `/`、`/sell`、`/register`、`/close` 切到原生 Orithos 页面；SKR 继续使用 Odoo 页面。
- Demo 路由、认证只读 API 与匹配 runtime 已验收；写入门禁仍关闭，真实收银业务写入为 0。

## 已实现，本地候选

- 新增 `/api/retail/payment-methods` 只读接口，要求 `settings.view`，从认证主体取 vendor/outlet，并返回已分配的收银机付款方式；只对原生 POS 已启用的租户查询 Orithos 绑定。
- `/settings/payment` 对已启用租户读取 Orithos；尚未切换的租户沿用当前 Odoo 配置，避免提前丢失生产配置。切换完成后应移除 Odoo 回退。
- 控制器回归覆盖认证租户范围、权限检查及未切换租户不读取 Orithos 绑定。

- 认证 vendor/outlet 范围内的收银机列表、当前班次、开班、现金进出和关班 API。
- 开班/现金变动/关班幂等键；重复键请求内容不一致时拒绝。
- checkout 要求当前门店有效 Orithos 班次；支付行与关班记录显式写入认证 outlet。
- checkout 与关班通过班次行锁协调；有未结付款或缺失 payment method 时阻断关班。
- 关班按 cash rounding、EFTPOS cash-out、备用金、现金流水和 register payment methods 对账。
- POS 收银页面已接入 Orithos 商品、开班、服务端报价、现金结账和关班汇总；Demo 运行 `f950b241`，SKR 仍走 Odoo 页面。
- 前端 typecheck 与 209 项单测通过，定向 ESLint 0 errors / 1 existing warning；Java 21 exact-SHA 验证与部署通过。
- 目前两个目标门店统一使用 Adelaide 时区；班次交易笔数按显式写入的 `local_sold_at` 计数，并补充跨营业日/DST 单测。逐 outlet 时区字段、数据库时间语义集成验证仍未完成。
- Odoo-only 模式放行新零售班次 API，旧 Classic register API 保持退役。
- Java 21 本地全量 `mvn -B test`：541/541 通过；测试只使用 mocks，没有数据库或线上写入。

## 问题和下一步

| 优先级 | 问题 | 状态 | 下一步 / 关闭条件 |
|---|---|---|---|
| P0 | Demo 原生收银页面已部署，但写入门禁关闭且没有真实收银闭环验收 | OPEN | 授权 Demo 测试租户后完成开班、现金售货、退款、关班与幂等对账；不在 SKR 写测试交易 |
| P0 | PostgreSQL 锁、SQL 聚合和 schema migrator 无数据库集成证据 | OPEN | 在专用测试租户运行 exact-SHA Java 21 gate 和隔离 PostgreSQL 集成验证 |
| P0 | POS 时间目前为全局 Adelaide，未按 outlet 配置；时间列存储语义缺少数据库集成证据 | OPEN | 新增逐 outlet 时区与统一 UTC/本地营业时间映射；用 PostgreSQL 验证 DST、午夜边界和班次聚合 |
| P1 | Refund/cash-out/payments terminal settlement 未进关班聚合验收 | OPEN | 按实际 payment/tender 规则补齐交易回读和对账用例 |
| P1 | migration 目前由启动时的幂等 DDL runner 执行，未进入统一版本化失败阻断机制 | OPEN | 纳入 versioned database migration runner，并验证备份/恢复 |

## 发布边界

`f950b241` 已将 Demo 的 `/`、`/sell`、`/register`、`/close` 路由到原生 Orithos 页面；SKR 仍使用 Odoo 页面。Demo vendor `1` 的写入门禁当前返回 403，线上仅完成只读验收，没有创建班次或销售。数据库集成、退款闭环、逐 outlet 时区及备份恢复仍未验证，Odoo 仍是 SKR 的实际账本。
