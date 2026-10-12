# Orithos AI 报表技术方案

> 面向 `pos-api` 现有 Spring AI Alibaba Graph。  
> 方案：**意图 → 模板 SQL 为主，窄 NL2SQL 为辅，SqlGuard + 只读账号做执行屏障。**  
> 不引入 DataAgent、不引入 agents-flex / LangChain4j / 旧版 `starter-nl2sql`。  
> 编写日期：2026-08-18。

相关文档：

- [意图识别说明](./INTENT_RECOGNITION.md)
- [Graph 使用指南](./GRAPH_USAGE.md)
- [框架选型](./AI_FRAMEWORK_SELECTION.md)

---

## 1. 结论

收银员仍只调用 `POST /api/ai/assistant`。分类命中已知报表指标时，用配置好的 SQL 模板查库；分不进去、但仍是问数时，才让模型对白名单视图生成 `SELECT`。两条路径都经过 SqlGuard，再用只读账号执行。租户/门店来自登录态，不来自模型参数。

POS 问数空间窄（销售额、滞销、客单、库存），模板能覆盖大部分问句，也和后台报表共用同一套聚合，数字不会和 AI 对不上。

---

## 2. 目标与非目标

### 2.1 目标

- 自然语言问销量、滞销、客单价、库存等，返回真实数字和表格，不编造。
- 与 `POST /api/reports` 的指标口径一致。
- SaaS：不能串租户；同一租户下不能串未授权门店。
- 继续使用 SAA 1.1.2.2 Graph + DashScope `qwen-plus`，不新加 Agent 框架。

### 2.2 非目标（本方案不做）

- 自由 NL2SQL 打全库 80 张表。
- DataAgent / Python 沙盒 / 向量库（第一、二期）。
- AI 直接改价、改库存、退款。
- 让模型执行 SQL。

---

## 3. 现状与必须先补的缺口

| 项 | 现状 | 对 AI 报表的影响 |
|----|------|------------------|
| Graph | `START → classify → respond → END` | 无查库节点，报表意图只会回套话 |
| 意图 | `search_product` / `sale_action` / `entity_action` / `qa` 等 | 没有报表意图 |
| `GenerateResponseNode` | 非 `qa`/`unknown` 不调模型，并引导用户去界面看数 | 必须为报表意图改走查询 |
| `POST /api/reports` | Mock 数据 | AI 若先接 NL2SQL 只能编数 |
| `AuthUser` | 仅 `id / username / admin` | 无法强制 `outlet_id` |
| 业务表 | 有 `outlet_id`，无 `vendor_id` | SaaS 串租户挡不住 |
| `sale` | 无 `outlet_id`，经 `register_id` → `register.outlet_id` | 视图必须 JOIN 收银机 |
| `sale_item` | 无门店列；含 `cost` | 成本列要按权限裁剪 |

---

## 4. 总体架构

```text
收银员 → POST /api/ai/assistant  (JWT)
              │
              ▼
         ClassifyQueryNode
              │
    ┌─────────┼──────────────────────┐
    │         │                      │
 开单/查品   已知报表指标            未知但仍像问数
 导航/CRUD   report_sales 等         report_adhoc
    │         │                      │
    ▼         ▼                      ▼
 现有 respond  填槽 + 模板 SQL        窄 NL2SQL（只对 ai_rpt_*）
              │                      │
              └──────────┬───────────┘
                         ▼
                    SqlGuard
                         ▼
              只读账号执行（orithos_ai_ro）
                         ▼
              ReportRespond → answer / table
                         ▼
                        END
```

| 层 | 谁生成 SQL | 租户/门店怎么进 SQL |
|----|------------|---------------------|
| A 模板（主） | 开发者写死，槽位只填时间/品类等 | 代码从 `TenantContext` 绑定 |
| B 窄 NL2SQL（辅） | 模型只生成 SELECT | SqlGuard 改写 + 只读账号 |

**硬边界：** 串租户靠每租户只读 schema/账号（有 `vendor_id` 之后）；串门店靠 SqlGuard 注入 `outlet_id IN (授权店)`。Prompt 和模型输出都不算权限。

---

## 5. 分步实施

按顺序做。前三步没有完成，不要做 Graph 查库，否则会在错误口径或错误身份上跑 SQL。

---

### 第一步：登录态补上门店（以及预留租户）

**目的：** Graph 和 SqlGuard 能拿到「当前是谁、哪家店」，而不是让问句里的门店 ID 生效。

**要做：**

1. 明确门店来源（三选一，推荐组合 1+2）：
   - 当前开班 `register` 的 `outlet_id`（收银场景）
   - 员工授权门店列表（后台/店长看多店）
   - 请求体显式传入 `outletId`（仅当属于授权列表时才接受）
2. 扩展 `AuthUser` / JWT claims：至少 `outletIds`、`currentOutletId`；预留 `vendorId`（暂无列时可先常量 `1`）。
3. 定义 `TenantContext`（不要让模型传这些字段）：

```text
vendorId
userId
outletIds[]
currentOutletId
authorities   // 含 perm:ai.report.query
```

4. `PosAssistantGraphService.ask(...)` 改为接收 `TenantContext`，写入 Graph 初始 state（`vendor_id` / `outlet_id` 等键）。
5. `threadId` 使用 `vendorId:userId:sessionId`，避免多租户会话串台。

**验收：** 未登录不能问数；单测能证明模板 SQL 的门店来自 context，不来自用户原文里的「outlet_id=99」。

**对应代码：** `JwtService`、`JwtAuthenticationFilter`、`AuthUser`、`AiAssistantController`、`PosAssistantGraphService`。

---

### 第二步：只读账号 + 报表视图

**目的：** AI 查数只碰视图，业务写账号与问数隔离；作废单、成本等在视图层收口。

**要做：**

1. 创建 MySQL 用户 `orithos_ai_ro`，仅 `GRANT SELECT` 给 `ai_rpt_*`（不要 `GRANT` 基表）。
2. `pos-api` 增加第二数据源（或专用 `JdbcTemplate`），专供 AI 报表执行。
3. 先建 4 张视图（名称可微调，口径必须与第三步报表引擎一致）：

| 视图 | 用途 | 要点 |
|------|------|------|
| `ai_rpt_sale_item` | 销量、金额、时间 | `sale` JOIN `register` 得到 `outlet_id`；只保留 `status = 'COMPLETED'`；含 `sold_at`、`qty`、`amount`、`product_id` |
| `ai_rpt_product` | 品名、品类 | 不含进货价 |
| `ai_rpt_inventory` | 库存 | `product_inventory`，含 `outlet_id` |
| `ai_rpt_customer_sale` | 客单 | 按完成订单聚合 |

4. **不要**把 `sale_item.cost` 放进默认视图。需要毛利时另建 `ai_rpt_sale_item_cost`，仅 `perm:ai.report.cost` 可进白名单。
5. 视图注释写清业务含义（同义词交给意图 prompt / 以后的术语表，不要写进 SQL）。

**示例（口径以第三步最终定义为准）：**

```sql
CREATE VIEW ai_rpt_sale_item AS
SELECT
  si.id,
  r.outlet_id,
  s.created_at AS sold_at,
  si.product_id,
  si.quantity   AS qty,
  si.total_price AS amount,
  s.customer_id,
  s.id AS sale_id
FROM sale_item si
JOIN sale s ON s.id = si.sale_id
JOIN register r ON r.id = s.register_id
WHERE s.status = 'COMPLETED';
```

当前 `sale` 没有 `outlet_id`，不能直接在 `sale_item` 上滤门店。

**验收：** 用 `orithos_ai_ro` 能 SELECT 视图；`SELECT * FROM sale` 应被拒绝。

**对应：** 新 migration SQL，例如 `pos-api/src/main/resources/db/migration_ai_report_views.sql`。

---

### 第三步：后台报表改为真实聚合

**目的：** AI 模板与报表页共用同一套 `GROUP BY`，避免两套口径。

**要做：**

1. 替换 `ReportController.buildReport(...)` 的 Mock，对 `sale` / `sale_item`（或直接对 `ai_rpt_*`）做真实聚合。
2. 抽出 `ReportQueryService`（时间范围、门店、指标），供 HTTP 报表和 Graph 模板节点共用。
3. 先落地 4 个指标：销售额、销量、客单价、库存（滞销可放本步或第四步）。
4. 用固定日期 + 固定门店对一下手工 SQL 与接口返回。

**验收：** `POST /api/reports` 数字与直接查 `ai_rpt_sale_item` 一致。

**对应：** `modules/report/`，不要在 AI 节点里再写一份聚合。

---

### 第四步：报表意图、槽位、权限种子

**目的：** 分类器能把问句打到模板，而不是 `qa` / `unknown`。

**要做：**

1. 在 `seed_ai_intent.sql`（或新 migration）增加意图：

| code | 说明 | 槽位 |
|------|------|------|
| `report_sales` | 销售额 / 流水 | `from`, `to`，可选 `category` |
| `report_qty` | 销量件数 | 同上 |
| `report_aov` | 客单价 | `from`, `to` |
| `report_stock` | 某商品库存 | `query` |
| `report_dead_stock` | 滞销 | `days`（默认 30） |
| `report_adhoc` | 像问数但未命中上面 | 暂不执行，第二期再接 NL2SQL |

2. 更新 `classify_system` prompt：销售额、滞销、库存问数走 `report_*`，不要走 `qa`。
3. 增加权限 `perm:ai.report.query`；可选 `perm:ai.report.cost`。无前者则分类后直接拒绝，不查库。
4. 滞销定义写进业务配置（例如：近 N 天 `qty` 低于阈值且库存 > 0），不要让模型发明公式。

**验收：** 「上个月销售额」「Coca Cola 还有多少库存」分别稳定落到 `report_sales` / `report_stock`。

**对应：** `ai_intent` / `ai_slot` / `ai_prompt`、`ClassifyQueryNode` 白名单。

---

### 第五步：Graph 接上「模板 SQL」主路径

**目的：** 已知报表意图真正查库并回答。

**要做：**

1. `PosAssistantGraphConfig` 改为条件边：

```text
START → classify
           ├─ report_sales | report_qty | report_aov | report_stock | report_dead_stock
           │        → fill_slots（缺时间则默认「今天」或反问）
           │        → bind_template_sql
           │        → sql_guard
           │        → sql_exec
           │        → report_respond
           │        → END
           ├─ report_adhoc → 本期先走 respond：「请说明时间/指标」，或占位节点
           └─ 其它意图 → 现有 respond → END
```

2. 状态键增加：`vendor_id`、`outlet_id`、`sql`、`sql_params`、`sql_error`、`report_rows`、`report_columns`。
3. `bind_template_sql`：按 intent 选模板，槽位只替换日期/商品名等；`vendor_id`/`outlet_id` 用 `PreparedStatement` 占位符，从 `TenantContext` 绑定。
4. `report_respond`：把行数据说成人话；结构化表可放入后续扩展的 `AssistantResponse` 字段（本期可用 JSON 放进 `answer` 或先只作文案）。
5. DataAgent / 外部 NL2SQL **超时不影响**开单类意图。

**模板示例（销售额）：**

```sql
SELECT DATE(sold_at) AS d, SUM(amount) AS sales
FROM ai_rpt_sale_item
WHERE outlet_id = ?
  AND sold_at >= ?
  AND sold_at < ?
GROUP BY DATE(sold_at)
ORDER BY d
LIMIT 366
```

**验收：** 启用 `app.ai.enabled` 后，带 JWT 问「今天销售额」，返回与第三步报表一致的数字。

**对应：** `PosAssistantGraphConfig`、新节点包 `modules/ai/report/`。

---

### 第六步：SqlGuard v1（先护模板，失败即拒绝）

**目的：** 即使模板被改坏或以后 NL2SQL 接入，执行前仍有统一闸门。

**本期范围（刻意收窄，降低复杂度）：**

1. 只能是单条 `SELECT` 或 `WITH ... SELECT`。
2. FROM/JOIN 只允许 `ai_rpt_*` 白名单。
3. 禁止多语句、注释绕过、`INTO OUTFILE`、写操作关键字。
4. 必须出现 `outlet_id` 谓词，且值 ⊆ 当前 `TenantContext.outletIds`（单店班次则等于 `currentOutletId`）。
5. 有 `vendor_id` 列后同样校验；没有列之前依赖只读账号 + 视图。
6. 强制 `LIMIT`（默认 ≤ 500）、语句超时（建议 5s）。
7. **解析失败或改写不确定 → 拒绝执行**，返回友好文案。

实现：JSqlParser 做 AST；模板路径以「校验」为主（SQL 已含条件）。不要用字符串末尾拼 `AND`。

**验收：** 手工把 SQL 改成 `SELECT * FROM sale` 或去掉 `outlet_id`，必须被拒；正常模板能通过。

**对应：** `modules/ai/report/SqlGuard.java`，加 20+ 条「改写前/后或通过/拒绝」单测。

---

### 第七步：前端接真实助手结果

**目的：** 收银员能看见数，而不是 Mock。

**要做：**

1. `SellAiPanel` 等改为调用 `/api/ai/assistant`（替换硬编码 `aiReply()`）。
2. 展示 `answer`；若有表格字段则渲染简单表。
3. 无权限、SqlGuard 拒绝、只读超时：展示固定文案，不要空白。
4. 不把 DataAgent UI 嵌进收银台。

**验收：** 收银台问一句，网络面板能看到 assistant 请求，界面数字与后台报表一致。

---

### 第八步：窄 NL2SQL（辅路径）

**前置：** 第一～七步稳定，并积累一批「模板打不准」的真实问句。

**要做：**

1. 启用 `report_adhoc`：用 `ChatClient` + 四张视图的 DDL/注释 + 少样本 SQL，只生成一条 SELECT。
2. Prompt 写明：只许 `ai_rpt_*`，不许猜 `cost`，不许写门店/租户 ID（由 Guard 加）。
3. 生成结果进入**同一套** `sql_guard → sql_exec → report_respond`。
4. 记录问句、生成 SQL、是否放行。能稳定命中的问法回收进第四步模板，缩小自由生成面。

**不做：** 向量库、全库 schema、Python 分析、模型执行。

**验收：** 「上周五啤酒类卖了多少」在无专用意图时能出合理 SELECT 并被 Guard 通过；「帮我 DROP 表」被拒。

---

### 第九步：SqlGuard 加强（服务 NL2SQL）

**目的：** 模板几乎不需要递归改写；自由 SQL 必须给每一层基表扫描加门店条件。

**要做：**

1. 递归处理子查询、`UNION`、`WITH`。
2. 按表配置列：`ai_rpt_sale_item` 有 `outlet_id`；`ai_rpt_product` 可能只有租户列。
3. 删除模型自写的 `outlet_id` / `vendor_id`，再注入 context 中的值（占位符绑定）。
4. 无 `perm:ai.report.cost` 时，命中成本列则拒绝。
5. 漏改任何一层白名单表 → 整句拒绝。

**验收：** 带聚合子查询、`UNION` 的用例集全过；故意漏内层过滤的 SQL 被拒。

---

### 第十步：SaaS 加固

与「全库加 `vendor_id`」可以并行，但问数要跟业务隔离同一套租户模型。

**要做：**

1. 报表视图与执行账号按租户拆 schema（如 `orithos_v{vendorId}`），视图内写死该租户。
2. 按 `vendorId` 选只读数据源；连接池按租户隔离，禁用会话变量 `@vendor_id`。
3. 配额：每租户每小时问数次数 / token。
4. 审计表：`vendor_id, user_id, outlet_ids, question, sql, allowed, rows, latency_ms, path=template|nl2sql`。
5. 按租户的模型 Key 以后再拆；本期可先全局 Key + 配额。

**验收：** 租户 A 的只读账号 SELECT 不到租户 B 的视图；门店 12 的收银员查不到门店 15。

---

### 第十一步（可选，默认不做）：旁路 DataAgent

仅当第八步准确率长期不够、且运营需要自助维护术语/Q&A 时评估。

约束：

- DataAgent 只返回 SQL，不执行。
- `pos-api` 按 JWT 选择 `agentId`，员工不能指定。
- 8065 不暴露公网；执行与 Guard 仍在 `pos-api`。

---

## 6. 建议的模块划分

```text
modules/ai/
  node/ClassifyQueryNode.java          // 现有，扩展意图
  node/GenerateResponseNode.java       // 非报表意图
  report/
    TenantContext.java
    ReportTemplateRegistry.java        // intent → SQL 模板
    BindTemplateSqlNode.java
    Nl2SqlGenerateNode.java            // 第八步
    SqlGuard.java
    SqlExecNode.java                   // 只用 orithos_ai_ro
    ReportRespondNode.java
    AiReportAuditMapper.java           // 第十步
modules/report/
  ReportQueryService.java              // 与 AI 模板共用
```

入口保持 `AiAssistantController`；前端协议可先不加字段，表格用 `answer` 或后续给 `AssistantResponse` 加 `table`。

---

## 7. 权限一览

| 检查点 | 规则 |
|--------|------|
| HTTP | JWT 必需 |
| 功能 | 无 `perm:ai.report.query` 不调模板/NL2SQL |
| 行（门店） | `outlet_id IN (授权店)`，以 context 为准 |
| 行（租户） | 只读 schema/账号；有列后再 Guard |
| 列 | 默认视图无成本；`perm:ai.report.cost` 才开放成本视图 |
| 执行 | 仅 `orithos_ai_ro`，超时 + LIMIT |

DataAgent 不做权限中心。

---

## 8. 每步完成的标志（汇总）

| 步骤 | 完成标志 |
|------|----------|
| 1 | JWT/Graph 能读到当前门店 |
| 2 | 只读用户只能读 `ai_rpt_*` |
| 3 | 报表接口数字 = 手工 SQL |
| 4 | 分类稳定落到 `report_*` |
| 5 | 助手能回答「今天销售额」且数字对 |
| 6 | 非法 SQL 单测全拒绝 |
| 7 | 收银 UI 走真实 `/assistant` |
| 8 | adhoc 问句可查视图且可拒危险 SQL |
| 9 | 复杂 SELECT 注入门店不漏层 |
| 10 | 跨租户 SELECT 在账号层失败 |

---

## 9. 风险与原则

| 风险 | 原则 |
|------|------|
| 模板与报表口径不一致 | 只维护 `ReportQueryService` 一处 |
| `sale` 无 `outlet_id` | 视图必须经 `register` |
| AST 漏改 | 不确定则拒绝；串租户不依赖改写单独保证 |
| 模型编造库存 | 无查询结果不得在 respond 里造数 |
| 过早上 NL2SQL | 第五～七步未完成不开第八步 |
| 过早上 DataAgent | 默认跳过第十一步 |

---

## 10. 第一步明天就可以开工的清单

1. 定门店上下文：开班 register vs 员工授权店。  
2. 写 `migration_ai_report_views.sql`（四视图 + `orithos_ai_ro`）。  
3. 抽 `ReportQueryService`，先把「按门店+日期的销售额」从 Mock 换成真查询。  
4. 加 `report_sales` 意图种子。  

做完这四件，再改 Graph 条件边（第五步），避免在 Mock 数据和空门店上接 AI。
