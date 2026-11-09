# 收银班次设计

更新日期：2026-11-09。负责人：POS owner 待指定。

## 数据范围

每个 `register_session` 记录 vendor、outlet、register、开班人、开班时间、备用金和开班幂等键。`register_cash_movement` 记录现金进出、原因、操作人和幂等键。关班结果写入既有 closure/payment 表，并保留 session 到 closure 的引用。

## API

| Method | Route | Contract |
|---|---|---|
| GET | `/api/retail/registers` | 认证门店的收银机 |
| GET | `/api/retail/registers/{id}/sessions/current` | 认证门店当前班次 |
| POST | `/api/retail/registers/{id}/sessions` | `Idempotency-Key`、`openingFloat` |
| POST | `/api/retail/registers/sessions/{id}/cash-movements` | `Idempotency-Key`、`CASH_IN/CASH_OUT`、金额和原因 |
| POST | `/api/retail/registers/{id}/sessions/close` | `Idempotency-Key`、`countedCash`、按支付方式点款、备注 |
| GET | `/api/retail/payment-methods` | `settings.view` 权限；返回认证门店的 register/payment method 绑定及原生 POS 是否已启用 |

请求体不接受 tenant/outlet 覆盖。越店收银机或班次不可见；重复键只在归一化请求相同的情况下回放，键复用不同内容返回冲突。

付款方式设置页根据认证 vendor 的原生 POS gate 选择活动账本。已切换租户读取 Orithos register 绑定；未切换租户继续读取 Odoo 当前配置。完成逐店验收后移除 Odoo 回退。

## 并发与金额

开班锁收银机；checkout 和关班都锁当前班次，关班与现金进出共用班次行锁。关班等待已开始的 checkout 完成后再汇总；checkout 若遇到已关班则拒绝。现金抽屉应有额为开班备用金、现金进出、现金销售净额、现金舍入和 EFTPOS cash-out 的合计。非现金支付按 register 配置的 payment method 汇总，未映射付款或未结欠款阻断关班。

所有金额使用 `BigDecimal` 和两位小数。营业时间暂沿用 Orithos `AustraliaTime` helper；其当前 zone 为 `Australia/Sydney`，与 Adelaide 门店的半小时时差仍需统一到门店配置后，才能用于线上最终验收。

## 待验证

- 新建数据库、升级数据库和重复启动时的迁移行为。
- PostgreSQL/MyBatis 查询和 `FOR UPDATE` 的集成行为。
- POS 页面开班、现金操作、支付分摊、关班点款与错误恢复。
- Adelaide 营业时区、退款/现金退款、cash-out、现金舍入和支付终端结算口径。
