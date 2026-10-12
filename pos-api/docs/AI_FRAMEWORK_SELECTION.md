# AI 智能体框架选型：Spring AI Alibaba vs AgentScope-Java

> 面向 Orithos POS（`pos-api`）的框架选型分析与落地建议。
> 数据采集时间：**2026-08-03**，来源为 GitHub API、两侧仓库 README / release notes / 源码，以及官方公告。
> 结论具有时效性，建议每半年复核一次活跃度与版本状态。

---

## 一、结论摘要

**继续使用 Spring AI Alibaba，不引入 AgentScope-Java；但现在就抽出防腐层，为将来并列引入留位。**

| 判断 | 理由 |
|------|------|
| 选 Spring AI Alibaba | 项目已集成 1.1.2.2，且用法正落在其甜点区（Graph 工作流）；与 Spring Boot 3.3.5 + MyBatis 同步风格一致 |
| 不引入 AgentScope-Java | 其差异化能力（沙箱、长任务、自主规划）当前场景用不上；仓库无 LICENSE 文件存在合规风险 |
| 后期 SaaS 化不改变结论 | SaaS 对 AI 层的三项硬要求（租户级 Tool 作用域、跨副本会话、按租户配额）SAA 均可覆盖 |
| 但要做架构准备 | 抽自有接口隔离框架类型，租户 ID 从第一天贯穿到 Tool 层 |
| 真正的优先级 | 把 37 个业务模块的 API 接成 Tool；SaaS 化的主要工程量在数据库层，与 AI 框架无关 |

---

## 二、核心区别：控制权在谁手里

这是理解两个框架的唯一关键。

### Spring AI Alibaba — Workflow 优先，你画流程图让模型填空

本项目的代码就是这个范式最纯粹的样子：

```java
// pos-api/src/main/java/com/orithos/modules/ai/config/PosAssistantGraphConfig.java
.addEdge(START, CLASSIFY)
.addEdge(CLASSIFY, RESPOND)
.addEdge(RESPOND, END)
```

执行路径在**编译期**就确定：必然先分类、再回答、然后结束。模型在每个节点内只被调用一次，负责"填空"——把问题归到五类意图之一，或把意图变成一段文案。它**无权决定下一步去哪**。要加分支，需开发者自己写 `addConditionalEdges`。

### AgentScope-Java — Agentic 优先，你给目标和工具箱让模型自己决定

没有边、没有图，只有一个 ReAct 循环。给它一个目标和一组工具，它自己决定这一轮调哪个工具、要不要再来一轮、何时算完成：

```java
HarnessAgent agent = HarnessAgent.builder()
        .name("assistant")
        .sysPrompt("You are a helpful AI assistant.")
        .model("dashscope:qwen-plus")
        .build();
agent.call(new UserMessage("..."), ctx);
```

执行路径在**运行时**由模型决定，同一个问题两次执行的轨迹可能不同。

### 放到本项目业务场景对比

用户问："上个月哪些商品滞销，给个补货建议"

| | Spring AI Alibaba | AgentScope-Java |
|---|---|---|
| 做法 | 预先画图：解析时间范围 → 查库存 → 查销量 → 算滞销 → 生成建议 | 给 `queryStock` / `querySales` / `querySupplier` 三个工具 + 一个目标 |
| 优点 | 每步可预测、可单测、可回放，出问题能定位到具体节点 | 灵活，信息不足时自己再补一轮 |
| 缺点 | 用户多问一句"供应商联系方式呢"，图里没这条路就跑不出来，需改图发版 | 事前无法预知调几次工具、烧多少 token、走什么路径 |

### 第二层区别：状态的形态

- **SAA**：状态是开发者显式声明的结构化 Map。本项目即 `question` / `intent` / `intent_summary` / `answer` 四个 key 配 `ReplaceStrategy`，状态里有什么完全由你定义。
- **AgentScope**：状态是模型自己积累的对话历史 + `MEMORY.md` + workspace 文件，半结构化，靠上下文压缩控制体积。

### 第三层区别：企业级特性差异是范式的必然结果

两边"企业级能力"的差异不是投入多少的问题，而是**约束风险的手段不同**：

- **SAA** 的工程能力全长在"流程"上：条件边、并行分支、聚合策略、子图嵌套、中断恢复、导出 PlantUML / Mermaid。
  模型走不出你画的拓扑，**边界在设计时锁死**，所以 SAA 不太需要沙箱。
- **AgentScope** 的工程能力全长在"让一个 agent 活得久且不越界"上：沙箱、记忆压缩、技能库、子 agent 派生、权限门禁。
  模型可以自己决定做什么，**边界只能在运行时兜**，所以必须有 `PermissionEngine` 三态门禁和四种沙箱后端。

**推论**：只做查询问答时，那套运行时门禁是白付的成本；一旦让模型执行有副作用的操作，它就从"多余"变成"必需"。

### 一句话类比

- Spring AI Alibaba 像一个**工作流引擎**，把 LLM 当作流程里的一个节点。
- AgentScope-Java 像给 LLM 配了一套**操作系统**（文件系统、进程隔离、权限、记忆）。

官方自己的类比是 LangChain 与 LangGraph 的关系——长期并存、各专注一种范式，不互相替代。

---

## 三、项目基础数据对比

两个项目同属阿里、由同一批 maintainer 维护（release 均由 chickenlj 发布），官方明确定位为**互补而非竞品**。

| 维度 | spring-ai-alibaba | agentscope-java |
|------|-------------------|-----------------|
| 仓库 | `alibaba/spring-ai-alibaba` | `agentscope-ai/agentscope-java` |
| 开源时间 | 2024-09-09 | 2025-09-23 |
| Star | 10,493 | 4,862 |
| Fork | 2,340 | 1,101 |
| 开放 Issue | 168（其中 112 非 enhancement） | 763（其中 313 非 enhancement） |
| 许可证 | Apache-2.0（GitHub 已识别） | **根目录无 LICENSE 文件**，GitHub 识别为无许可证；README 声明 Apache-2.0 |
| 最新稳定版 | 1.1.2.2（2026-03-10） | 2.0.0 GA（2026-07-10） |
| 预览版 | 2.0.0-M1.1（2026-06-25，需 Spring AI 2.0.0-M1 + Spring Boot 4.0.0） | — |
| 近 4 周提交 | 约 31 次 | 约 103 次 |
| 近 52 周提交 | 约 620 次（前置集中，2026-03 后明显下滑） | 约 926 次（持续上升） |
| JDK 要求 | 17+ | 17+ |

**关键观察**：AgentScope-Java 已是团队重点投入方向；Spring AI Alibaba 稳定版自 2026-03 起停更，官方公告称其未来角色是「Spring 生态与 AgentScope 之间的连接器」。

---

## 四、核心维度对比

| 维度 | Spring AI Alibaba | AgentScope-Java |
|------|-------------------|-----------------|
| 核心范式 | Graph / Workflow 优先，Agent 是图中的一个节点 | Agentic 优先，ReActAgent 推理内核 + HarnessAgent 工程外壳 |
| 控制权归属 | 开发者预定义 DAG，路径确定可审计 | 模型自主规划步骤，运行时动态决策 |
| 底层技术栈 | 绑定 Spring AI / Spring Boot | Project Reactor 为主，独立于 Spring；另提供 Spring Boot Starter |
| 状态与并发 | Graph Checkpointer 持久化 | Agent 实例完全无状态，可变状态走 Reactor Context |
| 分布式与多租户 | A2A + Nacos 注册发现，多租户需自建 | 一行 `DistributedBackend`，按 `(userId, sessionId)` 自动分区，跨副本会话恢复 |
| 沙箱隔离 | 1.1.2.0 起有 SAA Sandbox 模块，较新 | Local / Docker / Kubernetes / E2B 云沙箱统一抽象，支持快照恢复 |
| 权限与人工介入 | `HumanInTheLoopHook`：approve / edit / reject | `PermissionEngine` 三态（允许 / 需审批 / 拒绝）+ 28 种事件流原生驱动 HITL |
| 会话持久化后端 | graph-core 原生七种 Saver：`redis` / `mysql` / `postgresql` / `mongo` / `jdbc` / `h2` / `file` | `AgentStateStore`：内存 / JSON 文件 / MySQL / Redis / PostgreSQL / OSS / COS |
| 模型容错 | 依托 Spring AI | Credential + ModelRegistry 统一抽象，支持重试与 fallback 模型自动切换 |
| 可观测与平台化 | Admin 平台：提示词管理（基于 Nacos）、追踪、评测、MCP 管理，可视化编排并导出 Java 工程 | Tracing / Evaluation + 阿里云 Agent 资产管理 |
| 生态 | Dify DSL 可迁入；JManus、DataAgent、DeepResearch 等衍生项目 | Skill 市场、Channel（钉钉/飞书/企微）、A2A、MCP、AG-UI 协议 |
| 中文资料 | java2ai.com 文档完善，社区问答量大 | java.agentscope.io 中英双语，起步较晚 |

---

## 五、优缺点

### Spring AI Alibaba

**优势**

- 与 Spring 生态无缝衔接，既有 Spring Boot 项目引一个 starter 即可，改造成本最低
- 流程可控、可审计，DAG 预定义，能导出 PlantUML / Mermaid，适合有合规评审要求的业务流
- 治理组件齐全：Nacos 配置与提示词管理、Higress 网关、可观测、评测形成完整闭环
- 合规清晰：Apache-2.0 已被 GitHub 正确识别，法务与安全扫描阻力小
- 社区体量更大，中文文档与踩坑记录最丰富，招人更容易
- 已内建 AgentScope 桥接（见第六节）

**短板**

- 投入明显放缓，近 4 周仅 31 次提交，2026-03 前后从每月 50+ 跌至个位数区间
- 稳定版停滞，1.1.2.2 发布于 2026-03-10，此后 5 个月只有 2.0.0-M1.1 预览版
- 受上游牵制，核心目标是对齐 Spring AI，上游节奏与破坏性变更会直接传导
- Agentic 能力是"补上的"，自主规划、长任务、技能自演进不如 Agent-first 框架深入
- 分布式多租户偏弱，跨副本恢复与租户级隔离大多需自建

### AgentScope-Java

**优势**

- 面向生产的分布式设计，无状态 Agent + AgentStateStore 分区，滚动发布不丢会话
- 安全边界最完整：三态权限引擎 + 四种沙箱后端 + 工具调用审批
- 长任务能力强：分层记忆、结构化上下文压缩、超大工具结果落盘、Plan Mode、技能自学习闭环
- 前端体验友好：28 种类型化事件 + AG-UI 协议，流式渲染与人工确认开箱可用
- 工程投入领先：近 52 周 926 次提交，是当前团队重点押注方向
- 模型容错：支持重试与 fallback 模型自动切换

**短板**

- **许可证缺失**：仓库根目录无 LICENSE 文件，GitHub 识别为"无许可证"，与 README 声明的 Apache-2.0 不一致，法务审查会卡住
- **Issue 积压严重**：763 个开放 issue（313 个非 enhancement），编号已到 2539，反馈量远超消化速度
- 破坏性变更频繁：1.x → 2.0 是重写级迁移，RC5 还在拆分模型 provider 模块
- 1.x 分支存在未修复缺陷：issue #2539 报告共享 `ReActAgent.Builder` 并发 mutation 导致 A2A 并发请求抛 `ArrayIndexOutOfBoundsException` / `NullPointerException`，1.0.12 与 1.1.0-RC2 均受影响，仅在 2.0 重写中被修掉
- GA 时间太短：2.0.0 于 2026-07-10 才发布，生产验证样本少，中文踩坑资料稀缺
- 偏离 Spring 惯例：Reactor 优先的编程模型对以 MVC 为主的团队有认知门槛

---

## 六、能否同时使用

**可以，官方提供桥接模块，但存在版本陷阱。**

### 官方桥接：`spring-ai-alibaba-starter-agentscope`

`AgentScopeAgent` 继承 SAA 的 `BaseAgent`，内部持有 AgentScope 的 `ReActAgent.Builder`，每次执行时现场构建实例：

```java
// spring-boot-starters/spring-ai-alibaba-starter-agentscope/.../AgentScopeAgent.java
ReActAgent reactAgent = reactAgentBuilder.toolExecutionContext(agentScopeCtx).build();
```

提供 `asNode()` 可直接塞进 `StateGraph` 当节点，`flow` 包另有 `AgentScopeRoutingAgent` 支持路由式多智能体。

### 版本陷阱（重要）

该 starter 的 pom 中硬编码：

```xml
<agentscope.version>1.0.9</agentscope.version>
```

依赖的是 `io.agentscope:agentscope-core`，即 **AgentScope 1.x 线**。而 2.0.0 GA 是一次重写：`HarnessAgent` 迁至 `agentscope-harness`、Agent 改为完全无状态、模型 provider 全部拆入 `agentscope-extensions-model-*`。

**结论：走官方 starter 拿不到 2.0 的核心卖点**——DistributedBackend 分布式会话、PermissionEngine 三态权限、Workspace 沙箱、28 种事件流。

### 两种组合方案

| 方案 | 做法 | 适用 | 代价 |
|------|------|------|------|
| **嵌套编排**（官方 starter） | 引入 starter，用 `asNode()` 把 AgentScope Agent 塞进 StateGraph | 只需借用 ReAct 推理能力，不依赖沙箱与分布式 | 锁定 AgentScope 1.0.9；1.x 共享 Builder 并发竞态（#2539）风险仍在 |
| **并列部署 + A2A 互通**（推荐） | 两侧各自独立服务，SAA 做流程编排与 Spring 集成，AgentScope 2.0 独立跑自主智能体，通过 A2A 协议互调 | 需要 2.0 的沙箱隔离、多租户、跨副本会话恢复 | 多一跳网络调用，两套部署与运维 |

### 组合时的两个必查项

1. **状态存储会有两套**：SAA 侧是 Graph Checkpointer，AgentScope 侧是自身 Session（桥接类每轮结束保存 ReActAgent 状态）。必须明确以哪套为准，否则中断恢复语义冲突。
2. **并发构建路径**：桥接每次调用都从共享 Builder 现场 `build()`，与 #2539 描述的竞态同一模式；若启用 `enablePendingToolRecovery` 需重点压测。

> **SaaS 场景提示**：SaaS 天然高并发，不宜走嵌套集成。若要用 AgentScope，应以 2.0 独立部署 + A2A 互通。

---

## 七、本项目适配分析

### 项目现状

| 项目 | 现状 |
|------|------|
| 技术栈 | Spring Boot 3.3.5 · Java 21 · MyBatis + MySQL + Redis + JWT · POI |
| 规模 | 296 个 Java 文件 / 约 11,766 行 · 37 个业务模块 / 56 个 Controller · schema 约 80 张表 |
| 已集成 AI | spring-ai-alibaba 1.1.2.2（graph-core + starter-dashscope），模型 `qwen-plus` |
| AI 实现 | `classify → respond` 两节点线性 Graph，无数据库访问、无 Tool Calling |
| 对外接口 | `POST /api/ai/assistant`（JWT 必需），`stream.blockLast()` 后一次性返回 JSON，非 SSE |
| 前端 AI | 完全 Mock。`SellAiPanel.tsx` 的 `aiReply()` 是硬编码 if-else；`AiAssistant.tsx` 是静态 demo 且未被任何页面 import |
| 部署 | docker-compose 单机，backend / frontend / mysql / redis 各 1 副本，未使用 Kubernetes |
| 租户模型 | 单 vendor + 多 outlet；**业务表仅有 `outlet_id`，全库无 `vendor_id` / `tenant_id` 列** |

### SaaS 化后：AgentScope 2.0 的能力是否变成必需

| AgentScope 2.0 能力 | SaaS 后是否需要 | SAA 能否覆盖 |
|---------------------|----------------|--------------|
| Workspace 沙箱（Docker / K8s / E2B） | 取决于是否做 NL2SQL / 动态执行 | SAA Sandbox 模块较新；纯查询场景用只读库账号 + 租户视图更简单 |
| 跨副本会话恢复 | **需要**（多副本部署的前提） | **能覆盖**：graph-core 原生提供 redis / mysql / postgresql / mongo / jdbc / h2 / file 七种 Checkpointer Saver |
| 多租户维度隔离 | **需要** | 部分覆盖：需自行设计 threadId 命名空间（`tenantId:userId:sessionId`），AgentScope 的 AgentStateStore 自动分区更省事 |
| 按租户隔离模型凭证 / 配额 / fallback | **需要** | **当前真实缺口**：项目用全局单 `ChatModel` + 单个 `AI_DASHSCOPE_API_KEY` 环境变量，需改为运行时按租户解析；AgentScope 的 Credential + ModelRegistry 更现成 |
| 分层记忆 / 上下文压缩 / Plan Mode | 仅长任务场景需要 | 收银台秒级问答用不上 |
| PermissionEngine 三态权限门禁 | 若 AI 可改价 / 改库存 / 退款则需要 | SAA 的 `HumanInTheLoopHook` 可覆盖多数场景 |

### SaaS 化的真实工程量在数据库层

`db/schema.sql` 约 80 张表，业务表只有 `outlet_id`，**全库没有任何 `vendor_id` / `tenant_id` 列**（`vendor` 表本身存在，但未下沉为业务表的隔离维度）。

SaaS 化的第一大工程是给这批表加租户维度、给 37 个模块的 Mapper 加租户过滤，**这与选哪个 AI 框架完全无关**。不要让框架选型挤占这件事的优先级。

---

## 八、行动清单

### 现在就做

| 优先级 | 事项 | 说明 |
|--------|------|------|
| P0 | **抽防腐层** | 当前 `AiAssistantController` → `PosAssistantGraphService` → `CompiledGraph`，框架类型已渗透业务层。抽自有接口（形如 `PosAssistant.ask(TenantContext, question, threadId)`），SAA 实现只是其中一个实现类。将来并列引入 AgentScope 只需新增实现，Controller 与业务代码一行不动 |
| P0 | **租户 ID 贯穿到 Tool 层** | 所有 Tool 一律从 ToolContext 读 `tenantId` 并强制拼进 WHERE，**绝不允许模型通过参数传租户 ID**。否则 prompt injection 可直接造成跨租户数据泄露——这是 SaaS AI 最大的安全风险。SAA 1.1.2.0 新增的 `ToolContextHelper` 即用于此 |
| P1 | **接 Tool Calling** | 把 `stocklist` / `stocktake` / `product` / `customer` 等已接真实 DB 的 API 包成 Tool。现有两个节点只调 `ChatClient`，未注入任何 Mapper/Service，`GenerateResponseNode` 的 System Prompt 甚至明确要求不编造实时数据、引导用户自己去界面操作。这是价值增量最大的一步 |
| P1 | **接 Redis Checkpointer** | `threadId` 目前只是空壳，未配置 Checkpointer，多轮上下文记不住，且多副本下路由不到同一实例。项目已有 Redis，直接接 `redis` Saver，key 设计为 `tenantId:userId:sessionId` |
| P2 | **补模型调用参数** | `application.yml` 中只配了 `model: qwen-plus`，无 timeout / retry / temperature / max-tokens。收银台对延迟敏感，需显式设置并加降级兜底 |
| P2 | **落地报表聚合查询** | `ReportController` 的 `POST /api/reports` 目前返回代表性 Mock 数据，注释写明待替换为真实 DSL 解析与 `GROUP BY`。想做"AI 查报表"必须先落地，否则模型只会拿到假数据 |
| P2 | **前端接真实接口** | `SellAiPanel.tsx` / `AiAssistant.tsx` 目前完全 Mock，未调 `/api/ai/assistant` |

### 版本管理注意

- **锁定 SAA 1.1.2.2**，短期不要跟进 2.0.0-M1.1 预览版——它要求 Spring Boot 4.0，而本项目在 3.3.5 上，升级会连带牵动整个依赖树。
- SAA 稳定版已 5 个月未更新，社区 issue #4878 反映 `spring-ai-alibaba-graph-core` 内嵌的 MCP 依赖版本过低导致**安全扫描不通过**。若有扫描门禁，需用 `dependencyManagement` 强制抬升传递依赖版本。
- 业务代码不要直接依赖框架内部类，围绕自有领域接口编程——官方已明确 SAA 未来底层将支持 AgentScope，抽象层可能重排。

---

## 九、引入 AgentScope 2.0 的触发信号

出现以下任意一个信号时，再评估以**独立部署 + A2A 互通**的方式引入：

| 信号 | 为什么这时才需要 |
|------|-----------------|
| 要给租户提供自然语言生成并执行自定义报表查询 | `report` 模块的 DSL 解析本就未落地，很可能走 NL2SQL；动态执行查询需要强隔离边界。可先评估 SAA 生态的 [DataAgent](https://github.com/spring-ai-alibaba/dataagent) 项目 |
| 要跑租户级长任务（夜间补货分析、趋势报告自动生成） | 需要 Plan Mode、上下文压缩、异步唤醒与任务恢复，这是 HarnessAgent 的主场 |
| 要让 AI 直接执行有副作用的操作并要求审批留痕 | 改价 / 改库存 / 退款属高危操作，需三态权限门禁 + 沙箱级隔离 |

---

## 十、企业级落地风险清单

| 风险项 | 涉及项目 | 影响 | 建议动作 |
|--------|----------|------|----------|
| 仓库无 LICENSE 文件 | agentscope-java | 开源合规审查、安全扫描可能直接拒入 | 引入前推动上游补 LICENSE，或以 README 声明 + 邮件确认留档 |
| 稳定版停更 5 个月 | spring-ai-alibaba | CVE 与 bug 修复窗口拉长 | 锁定 1.1.2.2 并自建内部补丁分支，评估 2.0 M 版节奏 |
| 破坏性变更节奏快 | agentscope-java | 小版本间需改代码，升级成本高 | 锁定 2.0.x，用 BOM 统一版本，封装防腐层隔离框架 API |
| Issue 消化能力不足 | agentscope-java | 生产故障可能等不到上游修复 | 预留自行 patch 的能力与人力，关键路径做自动化回归 |
| 框架路线可能合流 | 两者 | SAA 未来底层将支持 AgentScope，抽象层可能重排 | 业务代码不要直接依赖框架内部类，围绕自有领域接口编程 |

---

## 十一、参考资料

- Spring AI Alibaba 仓库：<https://github.com/alibaba/spring-ai-alibaba>
- Spring AI Alibaba 文档：<https://java2ai.com>
- AgentScope-Java 仓库：<https://github.com/agentscope-ai/agentscope-java>
- AgentScope-Java 文档：<https://java.agentscope.io/>
- 官方定位说明《一文讲透 Spring AI Alibaba 与 AgentScope 的定位与区别》：<https://java2ai.com/blog/saa-agentscope-announcement>
- 技术选型讨论：<https://github.com/alibaba/spring-ai-alibaba/discussions/4356>

### 项目内相关文档

- [`SPRING_AI_ALIBABA_GRAPH.md`](./SPRING_AI_ALIBABA_GRAPH.md) — Graph 集成方式与配置
- [`GRAPH_USAGE.md`](./GRAPH_USAGE.md) — Graph 编程指南
- [`INTENT_RECOGNITION.md`](./INTENT_RECOGNITION.md) — 意图识别实现说明
