# Orithos 功能清单与验证状态

更新时间：2026-10-20

## 状态说明

- **已实现**：代码路径存在，且有对应静态检查或 UAT 证据。
- **旧线上基线**：公网当前版本通过，但未证明来自最新提交。
- **待部署验证**：代码已推送，尚未进入可核验的 Dokploy 镜像。
- **明确未接入**：页面保留真实边界说明，不使用假数据或假写入。

## 功能清单

| 模块 | 当前能力 | 状态 | 主要证据 |
| --- | --- | --- | --- |
| 登录与租户路由 | 管理员登录、host 到 tenant、未认证 API 拒绝 | 旧线上基线 | `UAT_AUTH_REPLAY_*.json`、匿名 `401` |
| POS 销售 | Odoo 商品搜索、客户、报价、税额、支付前锁定 | 旧线上基线 | `UAT_POS_DIALOG_*`、`UAT_ORDER_PAGES_*` |
| 商品目录 | Odoo 商品分页、搜索、分类、编辑、创建、CSV 导入/导出 | 待部署验证 | 当前提交 `dd5253d`；typecheck/ESLint 通过 |
| 客户目录 | Odoo 客户查询、分页、创建、编辑、移动端卡片 | 旧线上基线 | `UAT_TABLE_A11Y_ONLINE_CURRENT.json` |
| 供应商与采购 | Odoo 供应商、采购单详情、收货边界 | 旧线上基线 | `UAT_SUPPLIER_*`、`UAT_PURCHASE_*` |
| 库存与补货 | 库存列表、价格建议、补货建议、盘点只读 | 旧线上基线 | `UAT_PRICING_PAGES_ONLINE_READONLY_*`、`UAT_ODOO_STOCKTAKE_*` |
| 报表 | Overview、销售/库存/采购报表、Odoo 绑定时区 | 待部署验证 | `UAT_AI_REPORTS_READONLY_ONLINE*`；新时区代码未核验运行 SHA |
| AI 助手 | 语音按住说话、意图路由、实体操作 allowlist、错误脱敏、多轮记忆/工具调用、cashier history、平台 AI usage、常见报表/工作流确定性快捷路由 | 待部署验证 | `UAT_AI_UI_*`、`UAT_AI_FEATURES_VERIFY_*`；当前源码 Java 21 `230 tests, 0 failures`，最新改动待镜像 |
| AI Sommelier | 商品识别、酒标识别、推荐、相似酒款 | 旧线上基线 | `UAT_SOMMELIER_*`；租户 Odoo context 待部署验证 |
| 发票 OCR | 预览识别，禁止预览阶段写供应商/采购/收货 | 旧线上基线 | `UAT_INVOICE_SCAN_MOCK_*`、`UAT_INVOICE_OCR_PREVIEW_*` |
| 账户与设置 | 公司、门店、用户、角色、税务、支付设置页面 | 旧线上基线 | `UAT_SETTINGS_MOBILE_*`、全站矩阵 |
| 全站页面 | 134 路由在 390/1440 下 HTTP 200、无页面错误 | 旧线上基线 | `UAT_ALL_STATIC_PAGES_2026-10-15.json`，重试 `268/268 PASS` |
| 条码工具 | 明确未连接打印；提供真实 Odoo 商品和集成状态入口 | 明确未接入/待部署 UI | 当前提交 `dd5253d` |
| 旧版 Utilities 假列表 | 不展示假商品、假客户或假库存；引导到 Odoo 页面 | 明确未接入 | `/utilities/products`、`/utilities/customers` |

## 当前已验证

- `npm run typecheck`：通过。
- 目标 ESLint：`OdooProductCataloguePage`、`SellAiPanel`、`ai-entity-actions`、条码页通过。
- 相关 UAT 脚本 `node --check`：通过。
- `pos-api` Java 21 `mvn -B clean verify`：通过，230 tests、0 failures。
- 公网只读基线：AI UI `2/2`、价格/库存 `8/8`、表格/表单 `14/14`、全站 `268/268`；意外业务写入 `0`。

## 尚未验证

- 本地 Maven/Next/Docker build：按用户要求未运行；本机 Maven 使用 Java 8，项目要求 Java 21。
- 最新提交中的产品分类重试、价格/名称边界、条码导航、价格建议交互、Sell AI 指针取消和非法操作提示：等待新镜像。
- Dokploy backend/frontend 构建日志、健康状态和运行容器 SHA：尚未取得。
- 真实 DashScope 质量、真实麦克风、真实酒标照片和真实发票照片：不能用 mock 或页面可达性替代。
- Dokploy #38 的 `AiProviderConfig` 错误未在当前源码复现；当前 Java 21 编译通过，部署前需核对 Dokploy 分支绑定和运行 SHA。

## 下一次部署后

1. 在 Dokploy 修正 Compose 的仓库/分支绑定，确认目标为 `main`。
2. 部署当前 `main`（`24f9e44` 或其后提交），并回读 frontend/backend 构建日志、健康状态、运行 SHA。
3. 重跑 AI UI、AI features、Sommelier、AI reports、产品/价格、表格/表单和全站矩阵。
4. 只把运行 SHA 与目标提交一致的结果标为 post-deploy；写入类 UAT 继续使用隔离 Odoo 数据库。
