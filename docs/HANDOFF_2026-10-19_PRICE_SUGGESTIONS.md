# 只读价格建议与 AI enablement gate 交接

更新时间：2026-10-19

## 已完成

- 新增 Odoo 价格建议页：`/stock/price-suggestions`。
- 只读读取近 28 天 POS 销售、成本、现价和库存，按 GST-inclusive shelf price 与目标 margin 生成建议。
- 页面明确显示 `writeEnabled=false`，没有 list price 写入接口；变更需进入 Products 或 Bulk Price Edit 人工执行。
- 新增 AI enablement checklist，明确 AI 关闭时 POS 继续可用，生产开关和 DashScope secrets 不写入仓库。

## 已验证

- `npm run typecheck`：通过。
- 本地 fixture 价格建议：通过；建议行、Raise price、Open product、AI 悬浮入口均出现，API 写请求 `0`。证据：`docs/UAT_PRICE_SUGGESTIONS_LOCAL_2026-10-19_CURRENT.json`。
- AI gate：脚本执行无 hard fail，生产 `AI_ENABLED=false`，没有模型调用或价格写入。证据：`docs/UAT_AI_ENABLED_GATE_2026-10-19_CURRENT.json`。

## 线上状态

- 已将包含价格建议的 `23f9b76` 推送并调用 Dokploy webhook，webhook 返回 `HTTP 200 Compose deployed successfully`。
- 等待部署窗口后，经过认证访问 `/stock/price-suggestions` 仍返回 HTTP `404`；AI availability 仍 `3/3 PASS`。因此不能把价格建议标记为线上通过。
- 可能原因是 Dokploy 构建失败、服务仍运行旧镜像或 Compose frontend 没有切换到最新 Git SHA。需要从 Dokploy 控制台读取构建日志、frontend 容器 SHA、健康状态和部署时间。

## 安全边界

- 没有对 Demo `aipos` 执行价格、库存、销售、采购或现金写入。
- 在 AI enablement isolation UAT、预算和 operator 批准完成前，保持生产 `AI_ENABLED=false`。

## 下一步

1. 在 Dokploy 控制台确认 `23f9b76` 是否构建成功；若失败，保存完整 frontend 日志并修复后再部署。
2. 确认 `/stock/price-suggestions` 返回页面后，运行认证只读 gate，并验证 `writeEnabled=false` 和非 GET 请求为 `0`。
3. 仅在获批隔离环境验证 AI=true 的模型、语音、识标和发票 preview；不在 Demo 生产环境开启。
