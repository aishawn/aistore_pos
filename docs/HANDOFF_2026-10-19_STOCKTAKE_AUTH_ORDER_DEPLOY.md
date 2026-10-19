# Stocktake 权限顺序修复部署记录

## 部署

- 代码：`a6d5a579761cdce9d755c691f00deae5f749ee4a`
- Dokploy：HTTP 200，`Compose deployed successfully`
- 目标：`https://demo.orithos.com.au`

## 线上结果

- 普通店员 Stocktake 权限：`2/2 PASS`。
- GET `/api/odoo/stocktake`：HTTP 403，业务码 `40300`。
- POST `/api/odoo/stocktake`：HTTP 403，业务码 `40300`，在 payload 校验和写开关之前拒绝。
- 临时用户/角色已清理，未创建库存调整。
- 管理员只读 Stocktake：PASS；Odoo session、binding、location 读取均正常。
- `locationSource=single-warehouse-fallback`，`writeEnabled=false`。
- 390px/1440px 页面无横向溢出，非 GET Stocktake 请求为 0。

证据：

- `docs/UAT_ODOO_STOCKTAKE_ADMIN_GUARD_2026-10-19_POST-A6D5A57.json`
- `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19_POST-A6D5A57.json`

## 仍未完成

这次只验证权限拒绝和只读链路，不等于隔离 Odoo 库存写入验收。生产 `ODOO_STOCKTAKE_WRITE_ENABLED` 继续保持 `false`。

