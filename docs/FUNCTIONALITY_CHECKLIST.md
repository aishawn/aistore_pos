# Orithos 功能清单与验证状态

更新时间：2026-10-23

## 状态说明

- **已实现**：代码路径存在，且有对应静态检查或 UAT 证据。
- **旧线上基线**：公网当前版本通过，但未证明来自最新提交。
- **待部署验证**：代码已推送，尚未进入可核验的 Dokploy 镜像。
- **明确未接入**：页面保留真实边界说明，不使用假数据或假写入。

## 功能清单

| 模块 | 当前能力 | 状态 | 主要证据 |
| --- | --- | --- | --- |
| 登录与租户路由 | 管理员登录、host 到 tenant、未认证 API 拒绝 | 旧线上基线 | `UAT_AUTH_REPLAY_*.json`、匿名 `401` |
| POS 销售 | Odoo 商品搜索、客户、报价、税额、支付前锁定；刷新时保留当前 register/支付方式并忽略过期 bootstrap 响应 | 待部署验证 | `UAT_POS_DIALOG_*`、`UAT_ORDER_PAGES_*`；本地 typecheck/ESLint 通过 |
| 商品目录 | Odoo 商品分页、搜索、分类、编辑、创建、CSV 导入/导出 | 待部署验证 | 当前提交 `dd5253d`；typecheck/ESLint 通过 |
| 客户目录 | Odoo 客户查询、分页、创建、编辑、移动端卡片 | 旧线上基线 | `UAT_TABLE_A11Y_ONLINE_CURRENT.json` |
| 供应商与采购 | Odoo 供应商、采购单详情、收货边界 | 旧线上基线 | `UAT_SUPPLIER_*`、`UAT_PURCHASE_*` |
| 库存与补货 | 库存列表、价格建议、补货建议、盘点只读 | 旧线上基线 | `UAT_PRICING_PAGES_ONLINE_READONLY_*`、`UAT_ODOO_STOCKTAKE_*` |
| 报表 | Overview、销售/库存/采购报表、Odoo 绑定时区 | 部分通过，库存 AI 报告阻断 | 最新 `UAT_AI_REPORTS_READONLY_ONLINE_2026-10-22_CURRENT_RECHECK.json` 为 `13/14`；独立 Odoo stock RPC `7/7 PASS`，运行 SHA 未核验 |
| AI 助手 | 语音按住说话、意图路由、实体操作 allowlist、错误脱敏、多轮记忆/工具调用、cashier history、平台 AI usage、常见报表/工作流确定性快捷路由、库存字段权限降级和错误指引 | 待部署验证 | `UAT_AI_UI_*`、`UAT_AI_FEATURES_VERIFY_*`；当前源码 Java 21 `246 tests, 0 failures`，最新改动待镜像 |
| AI Sommelier | 商品识别、酒标识别、推荐、相似酒款 | 旧线上基线 | `UAT_SOMMELIER_*`；租户 Odoo context 待部署验证 |
| 发票 OCR | 预览识别，禁止预览阶段写供应商/采购/收货；图片类型/10 MB 边界、连续换图竞态保护 | 待部署验证 | `UAT_INVOICE_SCAN_MOCK_*`、`UAT_INVOICE_OCR_PREVIEW_*`；本地 typecheck/ESLint/node check 通过 |
| 账户与设置 | 公司、门店、用户、角色、税务、支付设置页面；Tax Rates 主动刷新；设置表格可访问名称；现金进出金额前端边界与忙状态 | 待部署验证 | `UAT_SETTINGS_MOBILE_*`、全站矩阵；本轮 typecheck/目标 ESLint 通过 |
| 全站页面 | 134 路由在 390/1440 下 HTTP 200、无页面错误 | 旧线上基线 | `UAT_ALL_STATIC_PAGES_2026-10-15.json`，重试 `268/268 PASS` |
| 条码工具 | 明确未连接打印；提供真实 Odoo 商品和集成状态入口 | 明确未接入/待部署 UI | 当前提交 `dd5253d` |
| 旧版 Utilities 假列表 | 不展示假商品、假客户或假库存；引导到 Odoo 页面 | 明确未接入 | `/utilities/products`、`/utilities/customers` |

## 2026-10-21 当前公网只读复测

- 全站实际扫描 `135` 路由 × `390/1440`，共 `270/270 PASS`；AI features `14/14`、AI reports `14/14`、Sommelier `10/10`、AI UI `2/2`、设置 `28/28`、价格/库存 `8/8`、表格/表单 `14/14` 均通过。
- 所有本轮专项均只读，意外业务写入为 `0`；证据使用 `docs/UAT_*_2026-10-21_CURRENT.json` 文件。
- 以上只证明当前公网运行版本的页面/API行为，尚未核对 Dokploy 运行 SHA；不能把它当作最新代码的 post-deploy 证据。

## 当前已验证

- `npm run typecheck`：通过。
- 目标 ESLint：`OdooProductCataloguePage`、`SellAiPanel`、`ai-entity-actions`、条码页通过。
- 相关 UAT 脚本 `node --check`：通过。
- `pos-api` Java 21 `mvn -B clean verify`：通过，当前批次 243 tests、0 failures。
- 发票 OCR mock/线上脚本、价格建议、盘点脚本 `node --check`：通过；本批次未运行 Next/Docker build。
- 公网只读基线：AI UI `2/2`、价格/库存 `8/8`、表格/表单 `14/14`、全站 `268/268`；意外业务写入 `0`。
- 2026-10-21 当前公网只读复测：全站 `270/270`、AI features `14/14`、AI reports `14/14`、Sommelier `10/10`、设置 `28/28`、价格/库存 `8/8`、表格/表单 `14/14`；意外业务写入 `0`。这组结果是较早运行版本基线。
- 2026-10-22 最新报表复测为 `13 PASS / 1 BLOCKED`，唯一阻断为 AI stock report；独立 Odoo stock RPC 为 `7 PASS / 1 INFO`，不能证明 warehouse 配置是根因。
- 2026-10-23 AI UI 识别结果竞态复测为 `2/2 PASS`；测试脚本等待识别列表首项可见后，390/1440 均得到 48 条识别结果、3 张推荐卡、零页面错误。
- AI natural-language workflow `49/49 PASS`、管理员配置保护 `15/15 PASS`、availability `3/3 PASS`、surface/auth guard `11/11 PASS`；metrics `9 PASS / 2 BLOCKED`，跨店 metrics 需要 platform-operator 凭据才能完成。
- 本轮公网只读复测：AI UI `2/2`、未接入页面诚实边界 `18/18`、表格/表单 `16/16`、POS help/keyboard `2/2`；意外业务写入 `0`。
- Sell 刷新竞态修复后：`npm run typecheck`、`npx eslint src/components/OdooRegisterPage.tsx`、`git diff --check` 通过；未运行 Next/Docker build。

## 尚未验证

- 本地 Next/Docker build：按用户要求未运行；后端 Java 21 Maven 门禁已运行并通过。
- 最新提交中的产品分类重试、价格/名称边界、条码导航、价格建议交互、发票 OCR 图片边界/竞态、Sell AI 指针取消和非法操作提示：等待新镜像。
- Dokploy backend/frontend 构建日志、健康状态和运行容器 SHA：尚未取得。
- 真实 DashScope 质量、真实麦克风、真实酒标照片和真实发票照片：不能用 mock 或页面可达性替代。
- Dokploy #38 的 `AiProviderConfig` 错误未在当前源码复现；当前 Java 21 编译通过，部署前需核对 Dokploy 分支绑定和运行 SHA。
- 本轮 `OdooRegisterPage` 刷新竞态修复尚未进入可核验 Dokploy 镜像；需部署后在 demo 的 Sell 页面验证切换 register、刷新、断网恢复和草稿保留。
- Tax Rates、Payment Methods、Registers & Outlets 的设置页改动尚未进入可核验 Dokploy 镜像；需部署后验证主动刷新、移动/桌面布局和 Odoo 读取失败 Retry。

## 下一次部署后

1. 在 Dokploy 修正 Compose 的仓库/分支绑定，确认目标为 `main`。
2. 部署当前 `main`（`24f9e44` 或其后提交），并回读 frontend/backend 构建日志、健康状态、运行 SHA。
3. 重跑 AI UI、AI features、Sommelier、AI reports、产品/价格、表格/表单和全站矩阵。
4. 只把运行 SHA 与目标提交一致的结果标为 post-deploy；写入类 UAT 继续使用隔离 Odoo 数据库。

## 2026-10-21 增量复测（源码 `435ec47`，公网运行 SHA 未核验）

| 范围 | 结果 | 证据/限制 |
| --- | --- | --- |
| 设置页（390/1440） | `28/28 PASS` | `UAT_SETTINGS_MOBILE_2026-10-21_CURRENT.json`；只读、无写入 |
| 表格/表单语义 | `14/14 PASS` | `UAT_TABLE_A11Y_ONLINE_2026-10-21_CURRENT.json`；拦截非 GET 请求 |
| 未接入能力诚实边界 | `16/16 PASS` | `UAT_ACTIVE_ROUTE_HONESTY_ONLINE_2026-10-21_CURRENT.json`、`UAT_ADMIN_LIST_BATCH_2026-10-21_CURRENT.json` |
| AI 自然语言工作流 | `51 PASS / 8 BLOCKED / 0 FAIL` | `UAT_AI_WORKFLOW_UTTERANCES_ONLINE_2026-10-21_CONTINUATION3.json`；8 项为旧镜像返回 `50210`，不能代表当前源码修复失败 |
| UI 静态类型 | `PASS` | `pos-ui npm run typecheck`；未运行 Next build |

全站只读页面矩阵复核：`135 routes x 390/1440 = 270/270 PASS`，无页面错误或横向溢出。证据：`docs/UAT_ALL_STATIC_PAGES_2026-10-21_CURRENT_RECHECK.json`。该结果验证的是当前公网运行版本，未验证最新源码已部署。

交互与运营安全复核：交互 `14/14 PASS`，运营只读 `3/3 PASS`；覆盖移动导航/焦点、商品搜索编辑、表单/CSV 预览、客户卡片、历史退款单、补货/报表筛选、关班现金门禁和采购状态筛选。证据：`docs/UAT_INTERACTION_2026-10-21_CURRENT.json`、`docs/UAT_OPS_READONLY_2026-10-21_CURRENT.json`。没有创建销售、退款、采购、收货、库存或关班业务数据。

发票 OCR 网关错误体验已改善：前端遇到非 JSON 的 `502/503/504` 时显示可操作的暂时不可用提示，并引导到 Odoo Purchases；401 和后端业务错误仍保留原有处理。`pos-ui` typecheck、目标 ESLint 通过，待下一次部署后用真实网关响应复验。

当前源码已增加 8 个阻断问法的确定性路由；必须在 Dokploy 分支绑定修正后，用 Java 21 构建并核对运行 SHA，再将这些项重新标为线上通过。
