# Stocktake 权限检查顺序优化

## 改动

`POST /api/odoo/stocktake` 现在在解析盘点 payload、检查数量和读取 `ODOO_STOCKTAKE_WRITE_ENABLED` 之前先验证 Orithos 管理员身份。

这样普通店员的任何盘点写请求都会稳定返回 HTTP `403` / 业务码 `40300`，不会因为空 payload、数量错误或写开关关闭而泄露业务状态或返回误导性的 400/423。管理员请求仍继续经过 payload、功能开关、租户/company/location 和 Odoo 业务校验。

## 本地验证

- `pos-ui/npm run typecheck`：通过。
- `pos-ui/npx eslint app/api/odoo/stocktake/route.ts`：通过。
- `node --check scripts/pilot-stocktake-admin-guard-uat.mjs`：通过。
- `git diff --check`：通过。
- 未运行 build；后端 Maven 未运行（本机 Java 8，项目要求 Java 21）。

## 部署后验证

使用 `pilot-stocktake-admin-guard-uat.mjs` 创建临时非管理员用户，验证 GET 和 POST 均为 HTTP 403 / `40300`，然后清理临时账号和角色。Demo `aipos` 不执行库存写入。

