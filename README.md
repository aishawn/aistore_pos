# Orithos POS

项目设计、进展、效果、测试和问题的统一入口：[项目事实库](docs/project/README.md)。先读 [AI 全景](docs/project/features/ai/README.md) 或 [管理层摘要](docs/project/reports/2026-11-03-management-summary.md)；下文包含历史架构描述，当前业务边界以 [Product Boundaries](docs/PRODUCT_BOUNDARIES.md) 和适用版本证据为准。

面向澳洲瓶装酒与精品零售的收银与进销存系统。收银员在同一套界面完成开单、结账、库存、采购和报表；店员还可以用自然语言问数、按酒标推荐在售葡萄酒，以及把供应商税票扫成收货单。

前后端没有共享代码，只通过 HTTP 连接：浏览器访问 Next.js，业务与权限在 Spring Boot 里完成，数据落在 PostgreSQL，会话与缓存落在 Redis。

## 项目背景

后端是独立的 Spring Boot 服务，前端是独立的 Next.js 应用。

零售场景决定了几条贯穿全系统的约束：

- 货架价含 GST。10% GST 的税额是含税价的十一分之一，由 `GstMath` 统一计算。
- 现金找零按澳洲习惯凑到 5 分。1、2 分硬币已退出流通，刷卡等电子支付保持精确金额，规则在 `CashRounding`。
- 营业日按 `Australia/Sydney`（AEST / AEDT）切日。销售同时记下 UTC 时间、本地墙钟时间和营业日，避免夏令时前后跨日。
- 商品带酒类属性：酒精度、容量、产区、年份。侍酒推荐和酒标识别都读这些字段。
- 一家公司可以有多家门店（outlet）和多台收银机（register）。库存、销售、采购都挂在门店上。

在经典 POS 之上，系统加了三条 AI 能力，并且都要求“模型不能越权”：

1. **收银助手**：把口语变成界面动作（搜商品、跳转页面、预填新建表单），或对已知指标查真实报表。
2. **侍酒助手**：按口味、搭配或酒标照片，从本店在售目录里推荐酒，并生成销售话术。
3. **税票扫描**：用视觉模型读供应商发票，匹配已有供应商和商品，确认后生成收货单。

## 总体架构

```text
浏览器
  Next.js 16  (pos-ui, :3000)
  App Router + 收银壳 AppShell
        │  同源 /api/*   （开发与 Docker 由 Next rewrite 转发）
        │  Authorization: Bearer <JWT>
        ▼
Spring Boot 3.3  (pos-api, :8080)
  Spring Security（无状态） + JWT
  业务模块 Controller → Service → MyBatis
  AI Graph（可选，app.ai.enabled=true）
        │                         │
        ▼                         ▼
     PostgreSQL 8                   Redis 7
  业务表 / 报表视图          访问令牌黑名单
  AI 意图配置                刷新令牌白名单
                             报表缓存
```

统一响应信封是 `{ code, message, data }`。`code = 0` 表示成功，业务错误用非 0 业务码（例如未登录 `40100`）。列表接口再包一层 `PageResult`：`items / total / page / size`。

前端 API 客户端在 `pos-ui/src/lib/api.ts`。Docker 和同机部署时 `NEXT_PUBLIC_API_BASE_URL` 留空，浏览器只请求同源 `/api`，由 `pos-ui/next.config.ts` 的 rewrite 转到后端。本地前后端分开跑时，把该变量设为 `http://localhost:8080`。

## 仓库结构

```text
orithopos/
├── pos-ui/          Next.js 收银与后台界面
│   ├── app/         App Router 页面（Next 在根目录已有 app/ 时编译这一份）
│   ├── src/         共享组件、hooks、API 客户端（路径别名 @/）
│   └── public/      销售键图标等静态资源
├── pos-api/         Spring Boot 后端
│   └── src/main/java/com/orithos/
│       ├── common/      响应信封、GST、现金凑整、澳洲时区
│       ├── config/      安全、启动迁移、种子数据
│       ├── security/    JWT、当前用户
│       └── modules/     按业务划分的模块
├── docker-compose.yml   PostgreSQL + Redis + 后端 + 前端
├── .env.example
└── DEPLOYMENT.md
```

`pos-ui/src/app` 是一份并行页面树。Next.js 优先使用项目根下的 `app/`，改页面请改 `pos-ui/app`。组件和请求客户端以 `pos-ui/src` 为准，`@/*` 映射到 `./src/*`。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Next.js 16、React 19、TypeScript、Tailwind CSS 4 |
| 后端 | Java 21、Spring Boot 3.3、Spring Security、MyBatis |
| 数据 | PostgreSQL 8.0（InnoDB / utf8mb4）、Redis 7 |
| 认证 | JWT HS256（jjwt），BCrypt 密码 |
| AI | Spring AI Alibaba Graph 1.1.2.2 + 阿里云百炼 DashScope |
| SQL 防护 | JSqlParser。问数只允许白名单视图上的 `SELECT` |

AI 默认关闭。未配置 `AI_ENABLED` 和百炼 API Key 时，收银、进销存、固定报表仍可独立运行；助手、语音转写、酒标识别和税票扫描会返回 503。

## 后端设计

包结构按业务模块切开，每个模块通常是：实体、MyBatis Mapper、Service、Controller。简单 CRUD 用注解 SQL；商品筛选等动态条件用 `resources/mapper/*.xml`。

启动时一组 `CommandLineRunner` 负责存量库演进，而不是要求每次手工跑迁移脚本：

| 迁移器 | 作用 |
|---|---|
| `OutletTenantSchemaMigrator` | 给旧库补上 `outlet_id`，作为门店隔离列 |
| `AustraliaComplianceSchemaMigrator` | 营业日、本地销售时间、酒精度 / 容量 / 产区 / 年份 |
| `AiReportSchemaMigrator` | AI 报表只读视图、快照、配额相关表 |
| `AiSommelierSchemaMigrator` | 葡萄酒档案与反馈 |
| `SupplyChainSchemaMigrator` | 补货计划 |
| `ProductRevisionSchemaMigrator` | 商品变更履历 |
| `DataInitializer` | 无用户时创建管理员 `admin` / `123456` |

`schema.sql` 是全量建库脚本，Docker 首次初始化 PostgreSQL 时执行。已有库靠上面的迁移器补列，`SQL_INIT_MODE` 默认 `never`，避免重复灌入建表脚本。

### 模块地图

| 域 | 包 | 职责 |
|---|---|---|
| 身份 | `auth` `user` | 登录、刷新、注销；用户、角色、权限 |
| 收银 | `sell` `sale` | 销售键盘搜索、挂单、结账、作废、库存扣减 |
| 商品 | `product` `classification` | 商品、品牌 / 品类 / 系列 / 标签、条码、价格、库存、修订 |
| 客商 | `customer` `supplier` | 客户与分组、供应商、对账单、导入 |
| 价格 | `pricing` `promotion` `cappedpricing` `bulkprice` | 价格表、价格集、促销、限价、批量改价 |
| 资金 | `payment` `tax` `giftcard` `customerpayment` | 支付方式、税率、礼品卡、客户收款 |
| 采购 | `order` `supplychain` `buyingperiod` `backorder` | 采购 / 收货 / 调拨 / 退货 / 贷项、补货计划、缺货 |
| 盘点 | `stocktake` `stocklist` `externalstocktake` | 盘点、库存列表、外部盘点 |
| 门店 | `register` | 门店、收银机、班次关账 |
| 报表 | `report` | 日销、周销、月销等固定口径 |
| 配置 | `config` `salekeys` `ticket` | 公司设置、小票、对账单、销售键、货架签 |
| 设备与集成 | `host` `kitchenscreen` `customerdisplay` `pushdevice` `webhook` `integration` | 主机同步、厨显、客显、推送、Webhook |
| AI | `ai` | 助手 Graph、问数、侍酒、税票、语音、意图配置 |

固定报表走手写 SQL，和 AI 问数共用同一套聚合口径，避免两套数字。

## 前端设计

界面是一个全屏收银壳，不是多套独立站点。

- `AppShell` 包住已登录页面：顶栏、侧栏、当前门店。
- 首页 `/` 是 **Odoo 收银台**（`OdooRegisterPage`）：搜索/扫码、购物车、挂单、结账。
- 侧栏只暴露 Odoo 业务入口（Register / Stock / Customers / Reporting / AI / Setup）。Classic PostgreSQL 路由默认隐藏；调试时设 `NEXT_PUBLIC_SHOW_CLASSIC_POS=true`。
- `/m` 是手机会话。`ui-mode.ts` 把手机限制在高频收银与库存面，避免小屏打开整棵设置树。
- Classic JWT 存在 Cookie `sf_token`（历史命名）。401 或会话失效业务码会清会话并回到 `/login`。
- Odoo 员工会话经 **Settings → Integrations** 登录后写入 HttpOnly Cookie；浏览器不接触 Odoo 会话令牌。

### Odoo 为唯一业务事实源

试点与产品路线以 **Odoo** 为商品、销售、库存、采购的唯一可写源。Spring/PostgreSQL Classic 栈保留作行为规格与 AI Graph 参考，**不再与 Odoo 双写**。

已接入的 Odoo 收银能力包括：价目表/客户价解析（经 Odoo 计价）、GST、现金凑整、瓶/箱包装系数、挂单（终端本地）、销售历史全单退款、关班（关闭 POS session）。跨币种价表与赊销仍拒绝或未做。能力三态见 [`docs/CAPABILITY_STATUS.md`](docs/CAPABILITY_STATUS.md)。

Dokploy / 部署需配置 `ODOO_BASE_URL`（HTTPS）与 `ODOO_DATABASE`。员工账号需要公司、POS 配置、商品与销售权限。

AI：补货建议（规则可解释 + 人工审批草稿 RFQ）为试点优先；侍酒/发票 OCR/通用助手在 `AI_ENABLED` 时可用，但不挡收银主路径。问数快照在 `/reports/ai/[id]`。

## 领域模型

核心关系：

```text
vendor（公司）
  └── outlet（门店，同时是数据隔离键）
        └── register（收银机）
              └── sale（销售）
                    ├── sale_item
                    └── sale_payment

product
  ├── product_price / product_cost / product_inventory（按门店）
  ├── product_barcode / product_supplier
  └── 分类：brand、category、family、tag

customer ── customer_group ── price_list
supplier ── purchase_order（含收货、调拨、退货、贷项）
```

表设计约定写在 `pos-api/src/main/resources/db/schema.sql` 文件头：

- 主键 `BIGINT AUTO_INCREMENT`。
- 金额用 `DECIMAL`。成本与中间价 `DECIMAL(14,4)`，打印总额 `DECIMAL(14,2)`。
- 枚举用 `VARCHAR`，合法值写在列注释里，由应用层校验。
- 结构不稳定的载荷用 PostgreSQL JSON。
- 软删除用 `deleted_at`。
- 表之间是逻辑外键，由应用 JOIN，不建 PostgreSQL `FOREIGN KEY`。这样迁移和导入更直接，完整性由 Service 事务保证。

`outlet_id` 出现在用户、商品库存、销售、采购等业务行上。当前实现里它既是门店，也是 SaaS 租户隔离列；`vendor` 仍表示公司主体，AI 问数的 `TenantContext.vendorId` 预留给以后的多公司部署，缺省为 `1`。

## 收银主流程

1. 收银员登录。JWT 带上用户、是否管理员、角色与 `perm:*` 权限，以及当前门店和可报表门店。
2. 销售键盘或搜索把商品放进购物车。挂单写入状态为 parked 的 `sale`，可稍后取回；超时由 `ParkedSaleCleanupJob` 清理。
3. `POST /api/sales/checkout` 在一个事务里完成：计价、GST、支付分摊、现金凑整、写销售与明细、按门店扣库存。
4. 作废销售走 `PUT /api/sales/{id}/void`，把库存加回。
5. 关班写入 `register_closure` 及各支付方式的实收。

采购侧对称：采购单、收货、门店调拨、退货、贷项都在 `order` 模块。税票扫描是收货的一条入口：`POST /api/orders/receives/scan` 只识别和匹配，`POST /api/orders/receives/from-scan` 在人工确认后才落单。

补货计划在 `supplychain`：按销量、库存和采购参数生成建议行，店员逐行接受或拒绝，不由模型直接下单。

## 安全与门店隔离

- 除登录、刷新和健康检查外，所有 `/api/**` 都要登录。
- 访问令牌约 2 小时，刷新令牌约 14 天。注销把访问令牌的 JTI 放进 Redis 黑名单，直到过期；刷新令牌按用户放进白名单，轮换后旧令牌失效。
- CORS 来源由 `CORS_ALLOWED_ORIGINS` 控制。Docker 示例用 `*` 方便联调，生产应写成前端正式域名。
- 权限是角色上的 `perm:*`。AI 问数额外要求 `perm:ai.report.query`；毛利视图还要求 `perm:ai.report.cost`。管理员角色可直接问数。
- AI 路径上的门店列表只从 `TenantContextFactory`（登录态）写入 Graph 状态。用户原文里的门店编号不会成为 SQL 条件。

## AI 设计

框架选型结论是继续用 Spring AI Alibaba Graph，不引入自主规划型 Agent。执行路径在编译期确定，模型只在节点内填空：分类、抽槽、生成文案，或在窄范围内起草一条 `SELECT`。这样每次问句的工具调用次数、费用和失败点都可以复现。选型记录见 `pos-api/docs/AI_FRAMEWORK_SELECTION.md`。

DashScope 的自动配置默认排除。只有 `app.ai.enabled=true` 时，`PosAssistantGraphConfig` 才导入对话模型并编译图。

### 收银助手

入口是 `POST /api/ai/assistant`。图在 `PosAssistantGraphConfig`：

```text
START
  → classify          意图分类（白名单意图 + 提示词，来自数据库配置）
       ├─ chat → respond → END
       │         导航、搜品、开单、问答；返回 answer + ui 动作
       └─ report → fill_slots
              ├─ 已知指标 → bind_template_sql   开发者写好的 SQL，只填时间/品类
              └─ report_adhoc → nl2sql          只针对 ai_rpt_* 视图起草 SELECT
                    → sql_guard → sql_exec → report_respond → END
```

已知报表意图：`report_sales`、`report_qty`、`report_aov`、`report_stock`、`report_dead_stock`。分不出具体指标、但仍是问数时走 `report_adhoc`。

`SqlGuard` 用 JSqlParser 做拒绝式校验：必须是单条 `SELECT`，只能扫白名单视图，每个物理扫描都要带无法被 `OR` 绕过的门店谓词，并限制行数。解析失败或有歧义就拒绝。执行账号是只读用户 `orithos_ai_ro`，只授予 `ai_rpt_*` 的 `SELECT`。查询有每小时次数和 token 配额。结果写入报表快照，前端用 `GET /api/ai/reports/{id}` 打开。

意图、槽位、提示词存在库里，由 `IntentConfigService` 加载，管理接口在 `/api/ai/config`。改提示词不需要改图的拓扑。

语音转写是 `POST /api/ai/transcribe`（Qwen-ASR）。前端在 503 时退回浏览器 Web Speech API。

### 侍酒助手

`/api/ai/sommelier` 是独立流程，不进收银助手那张图：

| 接口 | 行为 |
|---|---|
| `POST /recommend` | 按场合、口味、预算从本店在售酒里推荐 |
| `GET /identify`、`POST /identify-image` | 用名称或酒标照片匹配目录 |
| `GET /wines/{id}` | 单品档案 |
| `POST /pitch` | 销售话术 |
| `POST /similar` | 相似在售酒 |
| `POST /ask` | 围绕已识别酒的追问 |
| `POST /feedback` | 记录店员对推荐的反馈 |

推荐候选来自商品与 `product_wine_profile`，库存和价格仍是业务表里的数。视觉模型只负责读酒标，匹配失败时不会发明一瓶不在目录里的酒。

### 税票扫描

`InvoiceVisionService` 读发票影像，`InvoiceScanService` 再在本店供应商和商品里匹配。识别结果先返回给页面核对，保存时才调用与手工收货相同的 `OrderService`。

### AI 不做的事

模型不改价、不改库存、不退款、不直接执行 SQL、不对全库做自由 NL2SQL。有副作用的动作要么变成前端可撤销的 UI 指令，要么停在人工确认之后的普通业务接口上。

## 本地运行

依赖：JDK 21、Maven 3.9+、Node.js 24+。用 Docker 时只需 Docker Compose。

整栈：

```bash
cp .env.example .env
docker compose up -d --build
```

- 前端：<http://localhost:3000>
- 后端：<http://localhost:8080>
- 初始账号：`admin` / `123456`（首次登录后应修改）

只起数据库、后端在 IDE 里调试时：

```bash
docker compose up -d PostgreSQL redis
# pos-api：复制 pos-api/.env.example 为 pos-api/.env
# pos-ui：复制 pos-ui/.env.local.example 为 pos-ui/.env.local
# 前端目录 pos-ui 下：npm install && npm run dev
```

生产部署前至少改掉 `JWT_SECRET`（不少于 32 字节）、数据库口令、Redis 口令、默认管理员密码，并把 `CORS_ALLOWED_ORIGINS` 收成前端域名。AI Key 放在环境变量里，不要写进仓库。

## 延伸阅读

| 文档 | 内容 |
|---|---|
| `pos-api/README.md` | 后端接口清单与本地启动细节 |
| `docs/ORITHOPOS_AGENT.md` | Telegram 经 Hermes Agent 问数、定时推送，并把用户习惯写入 USER.md |
| `pos-api/docs/AI_FRAMEWORK_SELECTION.md` | Graph 与自主 Agent 的选型 |
| `pos-api/docs/AI_REPORT_TECHNICAL_PLAN.md` | 问数：模板 SQL、窄 NL2SQL、SqlGuard |
| `pos-api/docs/INTENT_RECOGNITION.md` | 意图识别 |
| `pos-api/docs/GRAPH_USAGE.md` | Graph 的状态、节点与边 |
| `pos-api/docs/SPRING_AI_ALIBABA_GRAPH.md` | 百炼与 Graph 的集成方式 |
| `docker-compose.yml`、`.env.example` | 整栈启动与生产前要改的环境变量 |
| `pos-ui/docs/research/` | 早期页面对齐与交互研究笔记 |
