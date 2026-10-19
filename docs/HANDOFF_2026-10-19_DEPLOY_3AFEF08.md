# 2026-10-19 部署与线上验证记录

## 部署

- Git 提交：`3afef0848e44884660d8344bcf4823d46ed3754e`
- Dokploy webhook：HTTP 200，`Compose deployed successfully`
- 验证目标：`https://demo.orithos.com.au`
- 未执行任何库存、销售、采购、现金或平台状态写入。

## 本批次功能清单

- 平台店铺状态转换矩阵：后端拒绝非法转换，前端只展示当前状态可用按钮。
- AI 生产关闭策略与匿名鉴权保护。
- Odoo Stocktake 只读 location 查询、单 warehouse fallback、来源提示和页面响应式布局。
- Stocktake 生产写入开关继续保持 `writeEnabled=false`。

## 线上测试结果

| 测试 | 结果 | 证据 |
|---|---|---|
| AI surface、配置读取与匿名 API 保护 | 11/11 PASS | `docs/UAT_AI_SURFACE_2026-10-19_POST-3AFEF08.json` |
| Stocktake 管理员登录与 Odoo session 恢复 | PASS | `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19_POST-3AFEF08.json` |
| 租户 binding/company/location 读取 | PASS，1 个 location，`single-warehouse-fallback` | 同上 |
| Stocktake 390px / 1440px 页面 | PASS，无横向溢出 | 同上 |
| Stocktake 非 GET 请求 | 0 | 同上 |

## 仍未完成

- 状态转换页面的线上点击回归尚未执行；本轮只读回归没有调用 PATCH。
- Odoo Stocktake 隔离环境真实写入、取消/重复提交、库存回读和 quant 引用仍未验收。
- 普通店员对 Stocktake 和 AI 配置写接口的线上拒绝仍需验证。
- Dokploy 控制台 frontend/backend 容器 SHA、完整构建日志和健康状态仍未独立回读；本记录证明 webhook 接受和公网页面行为，不替代容器级证据。
- 本地 build 未运行；后端 Maven 未运行，因为本机只有 Java 8，项目要求 Java 21。

整体发布结论继续为 **NO-GO**，直到隔离写入、权限和容器身份证据补齐。

