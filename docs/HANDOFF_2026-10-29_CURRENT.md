# Orithos 当前交接（2026-10-29）

## 当前部署

- Demo POS：`https://demo.orithos.com.au/`
- 管理后台：`https://app.orithos.com.au/`
- Dokploy 自动部署来源：GitHub `main`
- 当前前后端 runtime SHA：`1604f3fbf1f681b88e76182f0492531b467ce668`
- `/api/public/version` 已确认 frontend/backend SHA 一致。
- Java 8 仍作为本机默认 Java；Java 21 安装于 `C:\Users\ai_sh\.jdks\jdk-21.0.12.1+1`，`JAVA21_HOME` 已写入用户环境变量。
- 同 SHA GitHub Actions Java 21 门禁通过：`mvn -B clean verify`，447 tests，0 failures，0 errors。

## 数据库约定

当前按用户要求统一为共享 UAT：

```text
ODOO_DATABASE=aipos_uat
ODOO_DATABASE_UAT=aipos_uat
ISOLATION_ODOO_DATABASE=aipos_uat
```

这三个值相同意味着 `isolated=false`。所有调试和获授权的试用写入都属于共享 `aipos_uat`，不能宣称为客户生产隔离，也不能把当前门禁当作正式生产放行。

## 已完成验证

- 前后端 exact-SHA Java 21 构建与部署一致性通过。
- 认证后的 `GET /api/sell/parked` 已从旧 runtime 的 500 修复为 200；GET 不执行过期挂单清理写入，清理由定时任务负责。
- 普通 AI assistant provider quota 已接入；线上 121 个只读请求在应用层被限流，未执行 provider，也未产生 Odoo 写入。
- 共享 UAT 销售/退款曾完成一组人工对账，GST、退款链路和库存回读均有记录；这不替代完整客户验收。

## 当前结论：NO-GO（正式生产）

仍需完成：采购部分/超量/重复收货、库存盘点并发与恢复、现金关班差异策略、两租户越权、备份恢复后的登录与 POS 交易、真实硬件（打印机/钱箱/扫码器/EFTPOS）和真实脱敏票据 OCR。AI provider 图片/OCR 仍受上游配额限制，不能作为客户承诺能力。

共享 `aipos_uat` 只适合受控试用和调试。客户试用应限制商品、交易量和管理员权限，并每日核对销售、GST、库存与现金关班。
