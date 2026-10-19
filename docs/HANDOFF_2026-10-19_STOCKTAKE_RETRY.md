# 盘点库位 Retry 批次交接

更新时间：2026-10-19（Asia/Shanghai）  
代码提交：`14a052a70cb881f2ec1ee7b2505af08acfed3d71`

## 改动

- 库位首次读取失败时不再整页 reload。
- Retry 只重新请求库位并保留页面上下文。
- Retry 按钮在请求期间禁用，错误提示继续可见。

## 验证

- 本地 fixture 390px 首次库位 GET 返回 503，点击 Retry 后恢复：PASS。
- 本地 390/768/1440 盘点流程、取消、确认一次性、payload 和无横向溢出：PASS。
- 线上管理员登录、Odoo session 恢复、binding/location 读取、390/1440 页面：PASS。
- 线上 `locationSource=single-warehouse-fallback`、`writeEnabled=false`、非 GET 盘点请求为 0。
- 证据：[UAT_ODOO_STOCKTAKE_LOCAL_2026-10-19.json](/C:/shawn/1code/1project-new/aistore_pos/v1/orithopos-master/docs/UAT_ODOO_STOCKTAKE_LOCAL_2026-10-19.json)、[UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json](/C:/shawn/1code/1project-new/aistore_pos/v1/orithopos-master/docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json)。
- 本地 build 未运行；真实隔离库存写入仍未验收。
