# 采购迁移验证

更新日期：2026-11-09。负责人：采购 owner 待指定。

## 最近适用结果

- Source/runtime SHA：`9703508f92c762c7f02ce9bd79f1790bc96678c1`；2026-11-09 Demo、SKR、App `/api/public/version` 均报告 frontend/backend 匹配该 SHA。
- Demo 登录只读 smoke：`/purchases` HTTP 200；`/api/orders?page=1&size=1&type=ORDER&status=OUTSTANDING` 返回 `code=0`、`total=0`；`/api/shopfront/purchasing?type=purchase-orders` 返回 enabled/readOnly，`sourceTotal=2366`、`total=2366`、首屏 40 条；旧 `/purchases/odoo` 返回 HTTP 307、Location `/purchases`。
- `https://crawler.orithos.com.au/healthz` 最近历史证据见此前记录；本次未重新探测 crawler health。
- 环境：本地 POS UI；Node `v22.22.2`（项目 engines 要求 Node `>=24`）。
- `npm run typecheck`：PASS。
- `npm run test:unit`：PASS，211 tests，0 failures；新增测试覆盖允许与拒绝的来源 host 映射。
- `git diff --check`：PASS。
- 定向 ESLint：PASS，无诊断。
- `python scripts/check-project-docs.py`：PASS，81 Markdown files；修复了 reporting validation 中指向缺失 session 的历史链接。
- 线上 Demo 页面/API 及旧路由检查：PASS；本次 SKR 登录后的业务数据读取未重跑。三个 host 的部署 SHA 均匹配。
- 数据库业务写入：0。没有创建采购单、收货、供应商或库存变更。

## 验收范围与限制

只读验收证明部署路由、Demo 认证范围内的订单读取及 crawler 归档接口可用；它不证明采购写 API 的数据库事务、收货幂等、Shopfront 原站页面数量一致或迁移对账。正式采购闭环、数据库集成、收货幂等和迁移对账仍是放行门槛。

完整记录：[2026-11-09 purchase page native route](../../../test-sessions/2026-11-09-purchase-page-native-route.md)。
