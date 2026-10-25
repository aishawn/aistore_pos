# Demo 只读体检包摘要 · 2026-10-22

目标：摸清当前 `https://demo.orithos.com.au` 能稳定演示什么。全部只读；业务写入 0。

## 运行身份

| 项 | 值 |
|---|---|
| Frontend / Backend commit | `582b92fb199e312e828a5169cde14105a091f41a` |
| Frontend builtAt | `2026-10-22T06:07:58.101Z` |
| Backend builtAt | `2026-10-22T05:59:09Z` |
| 对应该 runtime 的身份探针 | **PASS**（`docs/UAT_RELEASE_IDENTITY_READONLY_PACK_RUNTIME.json`） |
| 对本地 HEAD `d54a958…` | **BLOCKED / 不匹配**（`docs/UAT_RELEASE_IDENTITY_READONLY_PACK_2026-10-22.json`） |

结论：当前演示的是已部署的 `582b92fb`，不是本机 ahead 的工作区 HEAD。

## 只读结果

| 套件 | 结果 | 证据 |
|---|---|---|
| 定价四页 × 390/1440 | **8 PASS / 0 FAIL / 2 BLOCKED**（Capped Pricing 无 Odoo price rules） | `docs/UAT_PRICING_PAGES_ONLINE_READONLY_PACK_2026-10-22.json` |
| 运营只读（Integrations / Close / Purchases） | **3/3 PASS** | `docs/UAT_OPS_READONLY_PACK_2026-10-22.json` |
| 交互矩阵 | **14/14 PASS** | `docs/UAT_INTERACTION_PACK_2026-10-22.json` |
| AI 代表性 smoke（5 条） | **5/5 PASS** | `docs/UAT_AI_WORKFLOW_REPRESENTATIVE_SMOKE_PACK_2026-10-22.json` |
| AI 全量问法 | **248 PASS / 4 FAIL / 0 BLOCKED**（见下） | `docs/UAT_AI_WORKFLOW_UTTERANCES_ONLINE_PACK_2026-10-22.json` |

本轮拦截到的业务写请求：定价套件 `blockedWrites=0`；交互套件未产生非预期写入。

## 现在能稳定演示什么

- 登录 Demo 门店壳；Integrations 显示 Odoo Connected 与自动恢复；POS session `00004` 仍开。
- 收银相关 UI 门禁：关班页要求填写现金实盘，可取消确认；无现金直接关班 API 返回 422。
- 库存列表、批量改价、价格建议页：双视口可打开，无横向溢出（本轮）。
- 商品搜索/编辑对话框、客户表单校验、CSV 预览（不落库）、销售历史退款收据只读打开、补货覆盖天数、报表周期与旧报表边界说明。
- AI 助手代表性问法：补货、定价、推荐、发票、今日销售 paraphrases 均可路由通过（Assistant API only）。
- AI 全量目录 252 条：248 PASS；4 FAIL（业务写入仍为 0）：
  - `recommendation-suggest-stock-en`：期望导航 `/sommelier`，实际 `search_product` 无路由
  - `help-ai-will-or-wont-order-zh` / `help-ai-can-order-zh`：期望 `qa` 说明不自动下单，实际 `unknown`
  - `safety-replenish-number-en`：期望 no-route 执行守卫，实际误导航 `/stock/replenishment`

## 演示时不要宣称 / 会卡住的点

- **Capped Pricing**：未配置 Odoo price rules → 空态 BLOCKED，不能演示限价规则闭环。
- **真实交易**：本轮零写入；不能演示已完成的销售/退款/收货对账。
- **关班实盘**：只能演示「必须填现金、可取消」，不能演示真实关班。
- **采购**：Draft 筛选为空态；无真实收货演示数据。
- **源码身份**：观众若问「是否最新 main」，应说明 runtime=`582b92fb`，本地 HEAD 更新。
- **多店隔离写入**：Demo `/api/odoo/uat-context` → HTTP 409，`isolated=false`（「Both services must explicitly target the same dedicated UAT database.」）。本地 `.env` 虽指向 UAT 库名，**不能**据此对 Demo 做写验收。

## 步骤 2（隔离写闭环）本轮结论

**BLOCKED，未执行业务写入。**

证据：`docs/UAT_ISOLATION_WRITE_GATE_PACK_2026-10-22.json`  
脚本尝试：`docs/UAT_ISOLATION_WRITE_2026-10-22.json`（UI 登录超时；即便登录成功也会被 attestation 拒绝）。

要解除阻塞需：按 `docs/ISOLATION_ODOO_UAT_RUNBOOK.md` 拉起 UAT Compose（`RUNTIME_ENVIRONMENT=uat`，`ODOO_DATABASE=ISOLATION_ODOO_DATABASE`≠`aipos`），使 `/api/odoo/uat-context` 返回 `isolated=true` 且 SHA 匹配后，再跑 `scripts/pilot-isolation-write-uat.mjs`。
