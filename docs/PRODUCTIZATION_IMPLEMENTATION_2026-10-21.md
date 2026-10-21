# Orithos POS 产品化实施记录（2026-10-21）

## 本轮已实施

- 发布身份：前端构建写入 service、完整提交 SHA、构建时间；后端提供白名单 `/api/public/version`；隔离 UAT 提供双方数据库和 SHA 一致性证明。
- 能力状态：新增 `docs/capability-status.json` 和生成脚本，统一“已实现 / 本地验证 / 线上只读验证 / 真实业务验收”，历史证据保留。
- 价格闭环基础：建议以 Odoo `compute_all` 核算净售价、GST、货架价；税缺失、复杂税和成本缺失时不建议；批量改价页面改为 Odoo 只读复核后逐项确认、回读。
- 交易恢复：结账和退款沿用 `orderUuid`；网络或 5xx 后只读回查，不自动重放；浏览器保留待确认购物车/退款；外置终端必须人工确认。
- 采购与盘点恢复：收货要求指定 picking、已完成收货只读返回；部分 RPC 失败标记待确认并保留 receipt 身份；盘点要求租户绑定库存位置，调整结果异常时禁止重试。
- 权限与租户：改价、采购收货、盘点和建议读取增加应用管理员与 Odoo 公司范围校验；建店按稳定租户标识和数据库锁避免同名公司复用。
- AI：新增服务端关联 ID 和按异常类型的分层诊断，响应不泄露模型、URL、提示词或凭证。

## 本地验证

- Node 24 TypeScript 检查通过。
- 定向 ESLint（收银、退款、采购、盘点及新增路由）通过。
- `scripts/productization-local-verify.mjs`：31/31 PASS；纯路由夹具，无真实 Odoo 写入。
- `scripts/productization-ui-local-uat.mjs`：390/1440 和 1440/1440 视口共 12/12 PASS；无 Classic 改价接口调用。
- 生成的本地证据：`docs/UAT_PRODUCTIZATION_LOCAL_2026-10-21.json`、`docs/UAT_PRODUCTIZATION_UI_LOCAL_2026-10-21.json`。

## 当前未完成和外部阻塞

- 未获得 Dokploy checkout、镜像健康和前后端实际运行 SHA；`scripts/verify-release-identity.mjs` 只能在部署后执行。
- 后端新增 Java 尚未通过远程 Java 21 同候选 SHA 的 `mvn -B clean verify`，因此不推送后端候选。
- 没有已确认的专用隔离 Odoo 数据库、角色账号和真实写入环境；收银、退款、GST、库存、采购、关班和设备仍未完成业务对账。
- 租户静态审计已通过，但运行时双租户生命周期、伪造门店参数、直接访问记录 ID、Odoo company/warehouse/location 绑定和备份恢复仍未验收。
- 真实支付终端、打印机、钱箱、扫码器和断网策略待现场验收。
- AI 174 条目录、配额/成本、完整租户生命周期、跨租户越权、备份恢复和人工套餐计费仍待隔离环境验收。

## 下一执行顺序

1. 配置专用隔离 Odoo 和四类角色账号，启动 `docker-compose.uat.yml`，执行发布身份核验。
2. 在同一候选 SHA 通过远程 Java 21 验证后再部署；部署后重新生成能力摘要。
3. 先验收开班→销售→退款→现金/外置终端→关班和设备，再验收采购收货与盘点并发/恢复。
4. 通过价格保存回读和 GST 对账后进入单店试点；随后执行 AI 目录、双租户隔离、备份恢复。

`.env.uat.example` 只包含占位符；真实密钥放在忽略的 `.env.uat`。
