# 采购迁移验证

更新日期：2026-11-09。负责人：采购 owner 待指定。

## 最近适用结果

- Source 基线：`3a1712a2aaed13c24f3c82ff25f617f2659d95ea`；本次 UI/API route 改动尚未提交，故 candidate SHA 暂无。
- Runtime：改动前 Demo、SKR、App `/api/public/version` 均报告 POS `3a1712a2`；crawler `/healthz` 返回 200，source fingerprint `47cfc1e1e05ca9e9188c74360df09f78eb37a6b0008d9f205ef7f6d8e0ae0597`。
- 环境：本地 POS UI；Node `v22.22.2`（项目 engines 要求 Node `>=24`）。
- `npm run typecheck`：PASS。
- `npm run test:unit`：PASS，211 tests，0 failures；新增测试覆盖允许与拒绝的来源 host 映射。
- `git diff --check`：PASS。
- 定向 ESLint：PASS，无诊断。
- `python scripts/check-project-docs.py`：PASS，81 Markdown files；修复了 reporting validation 中指向缺失 session 的历史链接。
- 线上 `/purchases` 登录后页面/API检查：NOT RUN；当前过程没有从环境读取到门店登录变量。
- 数据库业务写入：0。没有创建采购单、收货、供应商或库存变更。

## 验收范围与限制

测试证明 UI 类型和现有前端 helper 回归通过，不证明新 route 已部署、采购 API 可连接数据库、租户权限在线生效或 crawler 归档与 Shopfront 页面数量一致。正式采购闭环、数据库事务、收货幂等和迁移对账仍是放行门槛。

完整记录：[2026-11-09 purchase page native route](../../../test-sessions/2026-11-09-purchase-page-native-route.md)。
