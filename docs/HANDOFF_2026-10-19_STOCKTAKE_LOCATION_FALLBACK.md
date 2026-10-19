# Odoo 盘点 location 兜底批次交接

更新时间：2026-10-19（Asia/Shanghai）  
代码提交：`5afab93247ad09aa239ede01cc731b08d57c9067`  
部署 webhook：HTTP 200 `Compose deployed successfully`

## 改动

Demo 租户的 Odoo binding 为 `ready`、company `1`，但没有配置 `odooStockLocationId`。盘点 API 现在只读查询该 company 的 `stock.warehouse.lot_stock_id`：

- 恰好一个 warehouse：使用其库存根库位；不写入 Orithos binding。
- 没有或多个 warehouse：继续返回 409，避免猜错库存范围。
- 已配置 binding location：优先使用 binding，不受兜底影响。

## 线上只读 UAT

证据：[UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json](/C:/shawn/1code/1project-new/aistore_pos/v1/orithopos-master/docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json)

- 管理员登录：PASS
- Odoo session 自动恢复：PASS
- 租户 binding 读取：PASS（company `1`、binding location `null`、provision `ready`）
- 盘点 location GET：PASS，返回 1 个 location，HTTP 200
- 盘点页面 390px：PASS，无横向溢出
- 盘点页面 1440px：PASS，无横向溢出
- 非 GET 盘点请求：`0`
- `writeEnabled`: `false`
- 截图：`docs/screenshots/2026-10-19-stocktake-online/`

## 本地检查

- `npm run typecheck`：PASS
- 盘点 API/页面/导航 ESLint：PASS
- 本地 fixture 盘点 UAT 三视口：PASS
- online UAT 脚本 `node --check`：PASS
- `git diff --check`：PASS
- 本地 build：未运行

## 后续边界

真实隔离 Odoo 写入、库存数量回读、quant 引用核对仍未执行；生产 `ODOO_STOCKTAKE_WRITE_ENABLED` 必须保持关闭。Demo 当前是单 warehouse 只读推导成功，不代表写入权限或业务写入验收完成。
