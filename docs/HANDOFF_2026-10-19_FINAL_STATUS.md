# Orithos POS 当前交接状态

更新时间：2026-10-19（Asia/Shanghai）  
仓库：[aishawn/aistore_pos](https://github.com/aishawn/aistore_pos)  
工作目录：`C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master`  
线上站点：[https://demo.orithos.com.au](https://demo.orithos.com.au)  
当前仓库 `main`/`origin/main`：`eacc7a1` (`feat: show AI response diagnostics`)

## 一句话结论

当前整体状态：**NO-GO**。核心 POS、租户隔离、采购收货、退款、现金管理和大量前端回归已有线上证据；但部署运行身份、真实生产 AI、实体硬件、正式财务/邮件流程以及当前版本的部分写入验收仍未闭环，不能据此宣称生产全量通过。

## 已完成

### 租户、注册和隔离

- 品牌站注册、自动登录、Odoo 独立公司绑定。
- Outlet/Register 配置、数量校验和 dummy data 初始化。
- 租户级商品、库存和 Odoo `res.company` 隔离。
- host、company 参数、API 参数越权读取被拒绝；登出后受保护 API 未授权。
- Web 删除租户后登录和受保护 API 被拒绝。

### POS、库存、退款和现金

- 开班、商品搜索/分类、购物车数量修改、删除、Park/Resume/Discard。
- Cash 收款、找零、GST、现金舍入和收据/订单回读。
- Card 收款已验证为 **Odoo payment method 模拟支付**，不是实体刷卡机。
- 销售扣减库存；Card/Cash 全额退款创建独立退款单并恢复库存；重复全额退款被阻止。
- Cash in、Cash out、正确现金盘点值关班及 session 状态回读。

### 采购和供应商

- 隔离公司供应商校验和创建。
- 草稿 RFQ、确认、部分收货/backorder、全部收货、重复/超量收货保护。
- 采购入库库存和采购状态回读。

### 前端稳定性和 AI 相关改进

- 全站静态页面、移动/桌面布局、Retry、加载/错误态、弹窗焦点和请求竞态已有多批回归证据。
- 价格建议支持 SKU 深链到 Bulk Price Edit；Bulk 保存失败会回滚输入、显示单元格错误，并允许重试。
- 价格建议保持 `writeEnabled=false`，不会自动写入 Odoo 价格。
- Invoice OCR 上传遵循 AI/视觉能力开关；OCR 是 preview-only，不创建供应商、采购单、收货单或库存。
- 销售助手显示本次 `intent`、响应耗时和成功/失败状态，不显示或持久化问题、JWT、API key、provider 原始错误或 token 内容。
- 临时非管理员账号访问 AI 配置写接口全部被拒绝，配置计数未变化：`15/15 PASS`。
- Odoo Stocktake 页面已完成管理员只读、库位 fallback、数量/行数前置校验和关闭开关保护；生产写入仍关闭。

## 已有线上证据

- AI 全功能只读矩阵：`14 PASS / 0 FAIL / 1 INFO`，见 `docs/UAT_AI_FEATURES_VERIFY_2026-10-19_POST-EACC7A1.json`。
- AI 诊断提示：`PASS`，见 `docs/UAT_AI_DIAGNOSTICS_ONLINE_2026-10-19_POST-EACC7A1.json`。
- AI UI：390/1440 视口均通过，页面错误为 0，见 `docs/UAT_AI_UI_2026-10-19_POST-EACC7A1.json`。
- AI 管理员保护：13 个配置写接口均返回业务码 `40300`，计数 `[13,12,119,3]` 未变化，见 `docs/UAT_AI_ADMIN_GUARD_2026-10-19_POST-3AFEF08.json`。
- Stocktake 管理员只读：单 warehouse fallback、非 GET 盘点请求为 0，见 `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19_LATEST.json`。
- 价格建议/Bulk 失败保存保护：见 `docs/UAT_BULK_PRICE_EDIT_SAVE_GUARD_ONLINE_2026-10-19_POST-7A87DD7.json`。

以上 AI、Stocktake 和页面证据主要是只读、fixture 或 mock；证据文件中的 `deployment=unverified-after-deploy` 不能替代 Dokploy 控制台的运行版本证明。

## 未完成、未覆盖或不能宣称通过

| 项目 | 当前状态 |
|---|---|
| Dokploy 运行身份 | 未独立核验 frontend/backend 容器 SHA、构建日志、健康状态和部署时间。 |
| `7544d03` 部署声明 | 用户确认已部署，但当前仓库为 `eacc7a1`，尚未证明线上容器就是 `7544d03`。 |
| 真实生产 AI | 未完成真实生产放行；真实 NLQ、语音转写、酒标识别和发票字段 OCR 仍需按真实输入验收。 |
| Invoice OCR 字段提取 | 当前探针没有真实发票字段，仅证明 provider 可达并返回 `50212` INFO。 |
| 当前版本采购/收货 | 历史隔离租户证据存在，尚未绑定 Dokploy 当前已核实镜像重跑。 |
| Stocktake 写入 | 只读和 UI 保护通过；隔离 Odoo 中的确认、库存回读、取消不改库存、重复确认幂等尚未验收。生产 `ODOO_STOCKTAKE_WRITE_ENABLED=false`。 |
| 实体支付和设备 | 实体刷卡机、打印机、钱箱、终端断网和硬件对账未接入。 |
| 分单/多支付和离线 POS | 未实现或未验收，不计入基础 POS 通过门槛。 |
| SMTP 和运营流程 | 邀请/密码重置真实邮件、正式现金差异审批、财务对账和采购财务流程未完成。 |
| AI 成本/质量看板 | 当前只有单次前端诊断，不包含持久化 token 成本、延迟分布或成功率指标。 |
| 本地完整构建 | 未运行 `npm run build` 或 Maven build；本机 Node/Java 版本不满足全部项目声明，构建以 Dokploy/Java 21 CI 为准。 |

## 当前问题和风险

1. **版本证据断链**：`7544d03`、历史 UAT deployment 字段和当前 `eacc7a1` 不一致。公网行为通过不等于容器运行了指定 SHA。
2. **AI 状态需区分环境**：部分回归显示 AI enabled，另一批生产状态回归显示 `AI_ENABLED=false`。必须在 Dokploy 核对环境变量和实际运行容器后再判断生产能力。
3. **历史证据混用风险**：`docs/` 中同时存在旧版本、`unverified-after-deploy`、mock 和当前版本证据，阅读时必须看 `generatedAt`、`sourceCommit`、`deployment`、是否写入生产数据。
4. **生产写入风险**：后续销售、退款、采购、收货、现金、关班和 Stocktake 写入只能使用一次性隔离租户；禁止写入 Demo 公司 `aipos`。
5. **工作区风险**：存在大量用户已有 UAT JSON、截图和 `pos-ui/tsconfig.json` 改动。禁止 `git add -A`、reset、clean 或覆盖无关改动。

## 接手后的优先顺序

1. 从 Dokploy 控制台保存 frontend/backend 实际 SHA、构建日志、健康状态和部署时间，并核对 `7544d03` 是否真实运行。
2. 核对 `AI_ENABLED`、DashScope region/base URL、视觉/语音能力开关；保持生产 AI 未完成验收前不宣称可用。
3. 新建一次性隔离租户，重跑基础链路：

   `signup → bootstrap login → Odoo binding → outlet/register → dummy catalog → open session → cash/card sale → refund → close register → platform delete`

4. 在同一隔离租户补做当前版本采购/部分收货/全部收货和 Stocktake 写入验收，记录库存前后值、订单、session、receipt、stock move 和权限结果。
5. 使用真实可解码发票图片完成 preview-only OCR 字段验收；确认不会创建供应商、采购单或收货单。
6. 每次部署后等待 Dokploy 完成，检查 commit/chunk 和健康状态，再只重跑受影响用例及基础冒烟。
7. 只有部署证据、生产能力和运营流程补齐后，才可把整体结论从 **NO-GO** 改为分阶段 GO。

## 交接时应保留的证据

- 每个场景一个 JSON，包含时间、租户标识、`sourceCommit`、deployment、HTTP 状态、session/order/receipt、库存前后值和写请求计数。
- 不得写入密码、JWT、cookie、API key、供应商原始错误或 token 内容。
- 生产 Demo 的只读证据和隔离租户的写入证据分开保存，并明确 `read-only`、`fixture`、`mock` 或 `real isolated tenant`。

## 2026-10-19 本轮 AI 迭代补充

- `ac4c307` 修复销售助手语音能力位：聊天能力和 `transcriptionAvailable` 分开判断；聊天可用但转写不可用时，语音按钮禁用并显示明确提示，不会启动麦克风或发送转写请求。
- 本地能力位 fixture：390/1440 两个视口均通过，聊天可用、语音禁用、转写请求 `0`、业务写请求 `0`。证据：`docs/UAT_AI_CAPABILITY_GATES_LOCAL_2026-10-19.json`。
- `9341a67` 部署触发后，线上完整 AI 回归通过：AI 功能 `14/14`、AI UI `2/2`、AI surface `11/11`、Sommelier `10/10`。证据：`docs/UAT_AI_FEATURES_VERIFY_2026-10-19_POST-9341A67.json`、`docs/UAT_AI_UI_2026-10-19_POST-9341A67.json`、`docs/UAT_AI_SURFACE_2026-10-19_POST-9341A67.json`、`docs/UAT_SOMMELIER_READONLY_2026-10-19_POST-9341A67.json`。
- 线上能力位故障注入通过：把真实配置的 `transcriptionAvailable` 临时改为 false 后，线上前端仍保持聊天可用、语音禁用、提示准确、页面错误 `0`、写请求 `0`。证据：`docs/UAT_AI_CAPABILITY_GATES_ONLINE_2026-10-19_POST-9341A67.json`。
- `b91c03e` 仅增强 AI UI 回归脚本，使其分别检查 `assistantAvailable` 和 `transcriptionAvailable`；该提交不改变应用运行代码。能力位感知回归证据：`docs/UAT_AI_UI_2026-10-19_POST-9341A67_CAPABILITY-AWARE.json`。
- 本轮仍未完成真实发票字段 OCR、持久化 AI 成本/成功率看板、实体硬件、分单支付、离线 POS 和正式财务/邮件流程；整体结论继续为 **NO-GO**。

