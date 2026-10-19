# Orithos POS 当前交接

更新时间：2026-10-19（Asia/Shanghai）
仓库：`aishawn/aistore_pos`
本地仓库：`C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master`
分支：`main`
本轮迭代开始时的 GitHub `main` / 本地 `HEAD` 基线：`94ccc320643ddf2dfb682bf4fca9c4abe1796e5e`（`94ccc32`）

## 当前结论

产品主流程和大量前端稳定性回归已有通过记录；隔离租户 POS/采购能力也有既有业务证据。最近一轮线上只读 Retry、AI 配置面和匿名鉴权回归通过，但生产部署的实际运行 SHA 尚未从 Dokploy 独立核实。AI 对话框、语音入口和 AI 配置权限修复仍在工作区、尚未提交或线上验证。因此当前发布/运营放行结论仍为 **NO-GO**，不能把本地验证或公网行为直接等同于当前生产镜像的验证。

## 2026-10-19 持续迭代补充

- 主商店只读回归：AI availability `3/3`、AI surface `11/11`（含 27 个匿名 API 路由）、Sommelier `10/10`、发票扫描 mock `PASS`。证据：`UAT_AI_AVAILABILITY_2026-10-19_CONTINUATION.json`、`UAT_AI_SURFACE_2026-10-19_ROUTE-MATRIX.json`、`UAT_SOMMELIER_READONLY_2026-10-19_CONTINUATION.json`、`UAT_INVOICE_SCAN_MOCK_2026-10-19_CONTINUATION.json`。Sommelier 推荐/详情价格和库存与 Odoo 目录一致；本轮没有模型、销售、采购、反馈或配置写入。生产 `AI_ENABLED=false`，这些结果不代表模型已启用。
- 公网 AI UI 复测再次发现 dialog 没有包含输入框，UAT 在 dialog 内寻找输入框时超时，证据 `UAT_AI_UI_2026-10-19_CONTINUATION.json`。源码已把 dialog 语义扩到完整面板并声明 modal；本地双视口通过，证据 `UAT_AI_FOCUS_LOCAL_2026-10-19_RELEASE-CANDIDATE.json`。尚未部署。
- 语音入口在 AI 关闭时原先仍可启动麦克风录音。源码已改为 AI 状态未知/关闭时禁用语音按钮，并在启动录音函数增加防护。本地 390px/1440px 均通过，转写请求为 `0`；尚未部署。
- `/api/ai/config` 的 reload 和 intents/slots/slot-values/prompts 写接口原先仅要求登录，缺少管理员检查。源码已增加 `AdminAccess.requireAdmin()` 并添加非管理员返回 `40300` 的控制器单测。未运行 Maven 测试；部署后仍需非管理员线上验证。
- 本地检查：前端 `npm run typecheck`、`SellAiPanel.tsx` 目标 ESLint、AI UAT 脚本 `node --check` 和 `git diff --check` 均通过。本仓库未运行 build。
- 公网脚本证据的 `deployment` 仍是 `unverified-after-deploy`；本轮线上结果用于确认问题和记录当前只读行为，不能作为修复后线上验收。

## 已完成且有证据

### 核心业务能力（既有隔离租户验收）

- 品牌站注册、租户自动登录、Odoo 公司绑定、Outlet/Register 配置、dummy data 初始化和租户删除后的认证拒绝。
- POS 开班、商品搜索、Cash 收款/找零、Card 模拟收款、GST/现金舍入、收据与订单回读、销售扣库存。
- Cash/Card 全额退款、退款订单及库存恢复；Cash in/out；正确现金盘点值关班。
- 隔离公司供应商创建、RFQ、采购确认、部分收货/backorder、最终收货、重复收货保护和库存回读。
- 多租户读取隔离、登出保护，以及平台删除租户后的认证拒绝。

以上结论来自此前保存的隔离租户线上证据；执行新的写入验收时仍须建立一次性租户，禁止对生产 Demo 公司做业务写入。

### 页面、交互和稳定性

- 全站静态页面基线：131 路由 × 390/1440 视口，262/262 PASS（历史回归证据）。
- 已有综合交互、管理列表、订单、设置、平台恢复、报表/Overview/补货竞态、关班读取保护等专项通过记录；详见 `HANDOFF_2026-10-18.md` 与 `CAPABILITY_STATUS.md`。
- 2026-10-19 Product Detail Retry 在线只读故障注入 1/1 PASS；Gift Cards Retry 和搜索竞态 2/2 PASS。失败 GET 后 Retry 期间按钮锁定、错误提示保留，恢复后成功；390px 无横向溢出、无页面错误、没有业务写请求。证据：`UAT_PRODUCT_VIEW_RETRY_AFTER_B3C9EBA.json`、`UAT_GIFTCARDS_OUTLET_RETRY_AFTER_B3C9EBA.json`。
- Auth replay 在线回归 2/2 PASS：GET 401 仅刷新并重试一次，DELETE 没有自动重放且测试请求被浏览器拦截。证据：`UAT_AUTH_REPLAY_AFTER_B3C9EBA.json`。
- AI availability 3/3 PASS、AI surface 11/11 PASS：验证生产 AI 关闭状态、配置读取和登出后的匿名 API 401；另有 27 个配置/语音/酒标/Sommelier 路由匿名矩阵。证据：`UAT_AI_AVAILABILITY_2026-10-19_CONTINUATION.json`、`UAT_AI_SURFACE_2026-10-19_ROUTE-MATRIX.json`。
- AI 对话框和语音禁用修复在本地 fixture 环境完成 390px/1440px 检查：modal 语义、dialog 范围、Tab 焦点循环、Escape 焦点返回、AI 关闭时语音按钮禁用均通过；转写请求为 `0`，AI 请求由 fixture 拦截。证据：`UAT_AI_FOCUS_LOCAL_2026-10-19_RELEASE-CANDIDATE.json`。
- 最新全站静态矩阵：131 路由 × 390/1440 视口，262/262 PASS，无路由失败、横向溢出或页面错误。证据：`UAT_ALL_STATIC_PAGES_AFTER_94CCC32.json`。矩阵 `sourceCommit=94ccc32` 表示测试源码基线，不证明 Dokploy 正在运行该 SHA。

## 未完成或未覆盖

- **生产部署身份未核验**：Dokploy frontend/backend 实际运行 SHA、构建日志、容器健康状态和部署时间未独立保存。历史上用户确认过 `7544d03` 已部署，但这不证明当前 `94ccc32` 已运行；webhook 200、301 和公网观察行为都不能替代运行 SHA 证据。
- **AI 对话框与语音入口修复未上线验收**：`SellAiPanel.tsx` 当前未提交。公网复现了输入框不在 dialog 语义范围的问题；本地对话框、焦点循环、Escape 恢复和禁用语音通过，线上尚未验证。
- **AI 配置管理员保护未测试/上线**：`AiConfigController` 与控制器单测当前未提交；单测未运行，非管理员线上拒绝尚无证据。
- **AI 生产功能未验收**：当前生产 `AI_ENABLED=false`。真实 DashScope 对话、云端语音转写、酒标图像识别、真实发票 OCR 尚未验证；现有通过项只证明关闭策略、UI 状态和匿名鉴权。
- **实体设备未验证**：实体刷卡终端、打印机、钱箱没有接入现场设备验收。Card 是 Odoo 模拟支付方式。
- **产品能力缺口**：分单/多支付方式收款和离线 POS 尚未实现或未验收；不计入当前基础 POS 通过范围。
- **运营验收未完成**：真实邮件（邀请/密码重置）、正式现金差异审批、正式财务对账和采购财务流程未完成验收。
- **采购回归需重绑定当前版本**：隔离租户完整收货已有旧版本证据；尚未在已核实的当前生产版本上回归。
- **构建证据不足**：本地没有运行 build；生产构建结果需以 Dokploy 完整构建日志为准。
- **平台店铺状态转换改动待验证**：工作区对状态按钮和 API 增加允许转换矩阵，并新增 `suspended → expired` 拒绝单测；前端 typecheck/目标 ESLint 已通过，但后端测试未运行，当前环境仅有 JDK 8，项目要求 Java 21。该改动未提交，不能算已部署或已验收。

## 当前问题与工作区状态

- 本轮开始时 `main` 与 `origin/main` 对齐于 `94ccc32`；本轮 AI 修复是否推送以上线状态应以后续 GitHub/Dokploy 记录为准。
- 用户于 2026-10-19 确认“已部署”。此确认记录为部署事件，但尚未取得 Dokploy 控制台的 frontend/backend 运行 SHA、构建日志及容器健康状态；因此部署身份仍为未核实，不能据此把公网专项绑定到 `94ccc32`。
- 工作区存在大量未提交变更，包括后台租户生命周期代码/测试、平台店铺详情页、AI 面板、AI 配置权限、多个 UAT JSON/截图、`tsconfig.json` 以及 AI UAT 脚本。它们可能来自用户或测试过程；接手时必须逐项检查来源和 diff。
- 不要运行 `git add -A`，不要清理、重置或覆盖这些改动。新增交接文件应单独处理。
- `UAT_AI_UI_2026-10-19_AUTHFIX.json` 记录的是旧线上焦点失败（1/2），不能用它证明当前未提交修复已通过线上验收。
- 线上 Retry/AI surface JSON 中 `deployment` 为 `unverified-after-deploy`；source commit 只能说明测试针对的源码版本标签，不能证明容器运行该版本。

## 接手顺序

1. 先检查并归属未提交改动，保留用户已有文件；只选择明确获准进入发布的代码、脚本和证据。
2. 从 Dokploy 控制台保存用户确认部署对应的 frontend/backend 运行 SHA、完整构建日志、容器健康状态和部署时间；若运行 SHA 不是 `94ccc32`，记录实际 SHA 并据此重跑受影响 UAT。
3. 在确认部署源码基线后，在线复跑 AI UI（390px/1440px）、AI availability、AI surface、Product Detail Retry、Gift Cards Retry 和 Auth replay；当前 AI UI 线上焦点专项的旧证据为 1/2，不能用本地 fixture 结果替代。
4. AI dialog/语音入口与 AI 配置管理员保护等工作区代码仍未提交。先逐项审阅 diff；本地 fixture 结果不能代替线上回归，Java 单测需 CI/受控 Java 21 环境运行。只提交明确纳入的文件，不要提交整批 UAT/截图或租户生命周期改动。
5. 再运行受影响路由的只读冒烟。若要进行业务写入，使用一次性隔离租户，并在结束后删除租户及验证认证拒绝。
6. 生产 AI、硬件、多支付、离线 POS 和正式财务/邮件流程仍单独跟踪，不得由 UI 或 mock 测试标记为通过。

## 放行矩阵

| 类别 | 状态 |
|---|---|
| 隔离租户基础 POS、退款、现金管理/关班 | 已有线上验收记录 |
| 隔离租户采购确认与收货 | 已有线上验收记录；需当前部署版本回归 |
| Retry、Auth replay、AI surface 最近专项 | 通过只读线上回归；部署 SHA 未核验 |
| AI dialog/语音禁用修复 | 本地 390/1440 PASS；未提交、未线上复测 |
| AI 配置管理员保护 | 源码和单测已补；未运行后端测试、未线上复测 |
| Dokploy 当前运行版本及完整构建 | 未核验 |
| 生产 AI、实体硬件、SMTP、正式财务流程 | 未验收 |
| 分单/多支付、离线 POS | 未实现或未验收 |
| 整体放行 | **NO-GO** |
