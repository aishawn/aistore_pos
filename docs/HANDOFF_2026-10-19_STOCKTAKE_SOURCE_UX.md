# 盘点库位来源提示批次交接

更新时间：2026-10-19（Asia/Shanghai）  
代码提交：`3cd5be03f16adbec84aca3ae30327f697aaec927`

## 改动

- 盘点 GET 响应新增 `locationSource`。
- 页面在使用单 warehouse 兜底时显示提示：当前库位来自门店唯一 Odoo warehouse，并建议管理员保存显式租户绑定后再开启盘点写入。
- 租户显式绑定时不显示兜底提示。

## 部署后线上验证

证据：[UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json](/C:/shawn/1code/1project-new/aistore_pos/v1/orithopos-master/docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json)

- 管理员登录：PASS
- Odoo session 恢复：PASS
- 租户 binding：PASS，company `1`，显式 location 为空，provision `ready`
- 盘点 location GET：PASS，HTTP 200，1 个 location，`locationSource=single-warehouse-fallback`
- 390px / 1440px 页面：PASS，无横向溢出
- 非 GET 盘点请求：0
- `writeEnabled=false`

本地 typecheck、目标 ESLint、fixture 三视口 UAT、线上 UAT 脚本语法检查均通过；没有运行 build。真实隔离 Odoo 写入仍未验收，生产写入开关必须保持关闭。
