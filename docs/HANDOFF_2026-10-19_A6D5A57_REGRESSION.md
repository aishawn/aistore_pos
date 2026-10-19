# `a6d5a57` 部署回归汇总

## 已部署改动

- Stocktake POST 在 payload/写开关检查前执行管理员授权，非管理员稳定返回 HTTP 403 / 业务码 40300。
- Stocktake 管理员只读查询和既有租户/company/location 隔离保持不变。

## 回归结果

- 普通店员 Stocktake guard：`2/2 PASS`。
- Stocktake 管理员只读：PASS，390/1440 无横向溢出，非 GET 请求 0。
- 全站静态页面：`132 × 2 = 264/264 PASS`，无 HTTP 失败、页面错误或横向溢出。
- 生产 `ODOO_STOCKTAKE_WRITE_ENABLED=false`，未执行库存写入。

证据：

- `docs/UAT_ODOO_STOCKTAKE_ADMIN_GUARD_2026-10-19_POST-A6D5A57.json`
- `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19_POST-A6D5A57.json`
- `docs/UAT_ALL_STATIC_PAGES_2026-10-19_POST-A6D5A57.json`

## 当前缺口

隔离 Odoo 数据库尚未配置，真实盘点调整、取消/重复提交、库存前后值和 quant 引用仍未验收。平台状态转换已完成只读页面回归，但尚未执行状态写入和租户登录阻断回归。

