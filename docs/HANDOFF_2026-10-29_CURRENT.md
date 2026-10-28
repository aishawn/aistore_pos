# Orithos 当前交接（2026-10-29）

## 当前部署

- Demo POS：`https://demo.orithos.com.au/`
- 管理后台：`https://app.orithos.com.au/`
- Dokploy 自动部署来源：GitHub `main`
- 最近一次线上 `/api/public/version` 观测到前后端 runtime SHA：`b825a4fa3b6563e201b791f115e670e9278a8c69`。
- 补货路由修复候选 `6bc07cfb` 已在 Demo 与 SKR 部署；后续测试/文档提交不改变行为 runtime。
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
- SKR 商店认证只读巡检 `docs/UAT_OPERATIONS_RUNTIME_ONLINE_SKR_2026-10-29.json`：13/13 PASS，覆盖库存搜索竞态、补货故障提示与 Retry 恢复、真实 Odoo 补货读取，0 个业务写入。
- SKR 客户组真实 CRUD `docs/UAT_CUSTOMER_GROUPS_LIVE_CRUD_SKR_2026-10-29.json`：8/8 PASS，创建、读回、重命名、删除和清理后不存在验证通过，3 个业务写入。
- SKR 硬件/离线边界模拟 `docs/UAT_HARDWARE_OFFLINE_STATUS_ONLINE_SKR_2026-10-29.json`：4/4 PASS；仅证明 UI 明确标示设备未验收和离线结算不支持，不替代现场设备测试。
- SKR AI assistant 只读 probe `docs/UAT_AI_ASSISTANT_READONLY_SKR_2026-10-29.json`：3/3 HTTP 200、无写请求；均走 `llmFallback=true`，响应约 1.9–4.7 秒。
- SKR 公开 Wikimedia 酒标 probe `docs/UAT_AI_PUBLIC_WINE_LABEL_ONLINE_SKR_2026-10-29.json`：HTTP 200、约 17 秒，识别标签但店内匹配 0；不能替代真实脱敏样本准确率/成本验收。

## 当前结论：NO-GO（正式生产）

仍需完成：采购部分/超量/重复收货、库存盘点并发与恢复、现金关班差异策略、两租户越权、备份恢复后的登录与 POS 交易、真实硬件（打印机/钱箱/扫码器/EFTPOS）和真实脱敏票据 OCR。AI provider 图片/OCR 仍受上游配额限制，不能作为客户承诺能力。

共享 `aipos_uat` 只适合受控试用和调试。客户试用应限制商品、交易量和管理员权限，并每日核对销售、GST、库存与现金关班。

## 本轮续验

- 线上 `/api/public/version`：frontend/backend 均为 `8ecd8fc7f25ed782b194238f09001ce1775dcb81`；Demo 与 SKR 的 `/api/public/uat-context` 均为 HTTP 200、`isolated=false`。
- 未认证公开巡检：根路径和受保护业务路由均按预期 307 到 `/login?next=...`；登录页 HTTP 200；关键路由未发现 5xx。
- 候选 `pos-ui` `npm run typecheck` 通过；硬件/离线线上验收脚本 `node --check` 通过。
- 本机未发现 `INITIAL_ADMIN_PASSWORD`、Dokploy/Odoo 凭据，也没有打印机、钱箱、扫码器或 EFTPOS；因此 Demo 认证写入验收和现场设备验收保持 `BLOCKED`，没有伪造 PASS。SKR 只读认证使用用户提供的测试账号完成。
- 源码边界仍明确显示设备未连接、EFTPOS 未验证和离线 POS 不支持；这只能证明 UI 合约，不能替代现场验收。
