# Spring AI Alibaba Graph 使用指南

本文档专门说明 **Graph 怎么用**：如何定义状态、编写节点、组装工作流、编译并执行。  
项目集成与 API 配置见 [SPRING_AI_ALIBABA_GRAPH.md](./SPRING_AI_ALIBABA_GRAPH.md)。

---

## 1. Graph 是什么

Graph 是一种**有状态的工作流编排**方式。把 AI 应用拆成多个步骤，每步是一个**节点**，步骤之间用**边**连接，所有节点共享一份**状态（State）**。

```
         ┌──────────┐     ┌──────────┐     ┌──────────┐
START ──▶│  节点 A   │ ──▶│  节点 B   │ ──▶│  节点 C   │ ──▶ END
         └──────────┘     └──────────┘     └──────────┘
              │                │                │
              └────────────────┴────────────────┘
                          共享 State
```

与「一次 Prompt 问到底」相比，Graph 适合：

- 多步骤任务（先分类、再检索、再生成）
- 条件分支（不同意图走不同路径）
- 人工审核（执行到某节点暂停，等人确认后继续）
- 长会话恢复（状态持久化）

---

## 2. 五个核心对象

| 对象 | 作用 | 类比 |
|------|------|------|
| `StateGraph` | 定义节点和边 | 流程图草稿 |
| `CompiledGraph` | 编译后的可执行图 | 可运行的流程引擎 |
| `OverAllState` | 运行时共享数据 | 全局上下文 / 黑板 |
| `NodeAction` | 单个节点的业务逻辑 | 一个处理函数 |
| `KeyStrategy` | 状态字段如何合并 | 写入规则（覆盖 / 追加） |

在本项目中，对应关系如下：

```
PosAssistantGraphConfig   → 定义 StateGraph，编译为 CompiledGraph
ClassifyQueryNode         → NodeAction 实现
GenerateResponseNode      → NodeAction 实现
PosAssistantGraphService  → 调用 CompiledGraph 执行
```

---

## 3. 使用 Graph 的标准步骤

### 第一步：设计状态（State）

先想清楚：**哪些数据需要在节点之间传递？**

原则：

- 状态里存**原始数据**（问题文本、分类结果、查询参数）
- 不要存 Prompt 模板（在节点内按需拼接）
- 每个状态键都要配置 `KeyStrategy`

```java
@Bean
KeyStrategyFactory posAssistantKeyStrategyFactory() {
    return () -> {
        HashMap<String, KeyStrategy> strategies = new HashMap<>();
        strategies.put("question", new ReplaceStrategy());       // 覆盖写入
        strategies.put("intent", new ReplaceStrategy());
        strategies.put("intent_summary", new ReplaceStrategy());
        strategies.put("answer", new ReplaceStrategy());
        // strategies.put("messages", new AppendStrategy());     // 追加写入（对话历史常用）
        return strategies;
    };
}
```

常用策略：

| 策略 | 行为 | 适用场景 |
|------|------|----------|
| `ReplaceStrategy` | 新值覆盖旧值 | 分类结果、最终答案 |
| `AppendStrategy` | 新值追加到列表 | 消息历史、日志 |

---

### 第二步：实现节点（NodeAction）

每个节点做一件事：读状态 → 执行业务 → 写回状态。

```java
public class ClassifyQueryNode implements NodeAction {

    private final ChatClient chatClient;

    public ClassifyQueryNode(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        // 1. 从状态读取
        String question = state.value("question", String.class)
                .orElseThrow(() -> new IllegalStateException("question is required"));

        // 2. 执行业务（调用 LLM、查数据库、调 API 等）
        String raw = chatClient.prompt().user("分类这个问题: " + question).call().content();

        // 3. 返回要写入状态的键值对
        return Map.of(
                "intent", parseIntent(raw),
                "intent_summary", parseSummary(raw)
        );
    }
}
```

节点可以是：

- **LLM 节点**：分类、摘要、生成文本
- **数据节点**：查数据库、调 REST API
- **逻辑节点**：校验、格式化、聚合
- **路由节点**：决定下一步走哪条边（配合条件边使用）

---

### 第三步：组装 StateGraph

用 `addNode` 注册节点，用 `addEdge` / `addConditionalEdges` 连接流程。

```java
import static com.alibaba.cloud.ai.graph.StateGraph.START;
import static com.alibaba.cloud.ai.graph.StateGraph.END;
import static com.alibaba.cloud.ai.graph.action.AsyncNodeAction.node_async;

@Bean
StateGraph posAssistantStateGraph(
        KeyStrategyFactory posAssistantKeyStrategyFactory,
        ChatClient posAssistantChatClient) throws GraphStateException {

    // 节点建议用 node_async 包装（异步执行）
    var classify = node_async(new ClassifyQueryNode(posAssistantChatClient));
    var respond  = node_async(new GenerateResponseNode(posAssistantChatClient));

    return new StateGraph("pos-assistant", posAssistantKeyStrategyFactory)
            .addNode("classify", classify)
            .addNode("respond", respond)
            .addEdge(START, "classify")      // 入口
            .addEdge("classify", "respond")    // 固定边
            .addEdge("respond", END);          // 出口
}
```

当前 POS 助手流程：

```
START → classify → respond → END
```

#### 条件边（分支路由）

当不同情况要走不同节点时，使用 `addConditionalEdges`：

```java
workflow.addConditionalEdges(
        "classify",
        edge_async(state -> state.value("intent", String.class).orElse("general")),
        Map.of(
                "product",   "product_handler",
                "customer",  "customer_handler",
                "inventory", "inventory_handler",
                "general",   "respond"
        )
);
workflow.addEdge("product_handler", "respond");
workflow.addEdge("customer_handler", "respond");
workflow.addEdge("inventory_handler", "respond");
```

含义：`classify` 节点执行完后，读取状态中的 `intent`，按映射表决定下一个节点。

---

### 第四步：编译为 CompiledGraph

```java
@Bean
CompiledGraph posAssistantGraph(StateGraph posAssistantStateGraph) throws GraphStateException {
    return posAssistantStateGraph.compile();
}
```

`compile()` 会校验图结构（是否有入口、边是否合法等）。编译失败会抛 `GraphStateException`。

#### 带持久化与人工审核的编译（进阶）

```java
import com.alibaba.cloud.ai.graph.CompileConfig;
import com.alibaba.cloud.ai.graph.checkpoint.config.SaverConfig;
import com.alibaba.cloud.ai.graph.checkpoint.savers.MemorySaver;

var memory = new MemorySaver();
var compileConfig = CompileConfig.builder()
        .saverConfig(SaverConfig.builder().register(memory).build())
        .interruptBefore("human_review")   // 到此节点前暂停，等待人工输入
        .build();

return workflow.compile(compileConfig);
```

---

### 第五步：执行 Graph

#### 方式一：同步流式执行（本项目用法）

```java
RunnableConfig config = RunnableConfig.builder()
        .threadId("conversation-001")   // 会话 ID，用于状态隔离
        .build();

Map<String, Object> initialState = Map.of("question", "如何做库存盘点？");

// stream 会依次经过每个节点
Flux<NodeOutput> stream = compiledGraph.stream(initialState, config);
stream.blockLast();

// 读取最终状态
StateSnapshot snapshot = compiledGraph.getState(config);
Map<String, Object> data = snapshot.state().data();
String answer = (String) data.get("answer");
```

#### 方式二：监听每个节点的输出

```java
compiledGraph.stream(initialState, config)
        .doOnNext(output -> log.info("节点 {} 完成", output))
        .doOnError(e -> log.error("执行失败", e))
        .blockLast();
```

#### 方式三：人工审核后继续（interruptBefore）

```java
// 第一次执行，会在 human_review 前暂停
compiledGraph.stream(initialState, config).blockLast();

// 人工补充状态
var updatedConfig = compiledGraph.updateState(config, Map.of(
        "approved", true,
        "edited_response", "修改后的回复内容"
), null);

// 从暂停处继续
compiledGraph.stream(null, updatedConfig).blockLast();
```

---

## 4. 在本项目里怎么用

### 4.1 启用 Graph

```env
AI_ENABLED=true
AI_DASHSCOPE_API_KEY=你的百炼API密钥
```

### 4.2 通过 HTTP 调用

```bash
curl -s http://localhost:8080/api/ai/assistant \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"question":"如何查看客户账单？"}'
```

背后执行链路：

```
Controller → PosAssistantGraphService.ask()
           → CompiledGraph.stream(initialState)
           → classify 节点 → respond 节点
           → getState() 读取 answer
```

### 4.3 在代码里直接调用

```java
@Service
public class MyService {
    private final PosAssistantGraphService graphService;

    public MyService(PosAssistantGraphService graphService) {
        this.graphService = graphService;
    }

    public void demo() {
        var result = graphService.ask("库存不足怎么处理？", null);
        System.out.println(result.intent());
        System.out.println(result.answer());
    }
}
```

---

## 5. 如何新增一个节点

假设要在 `classify` 和 `respond` 之间增加「检索知识库」节点：

**1. 新建节点类**

```java
public class SearchKnowledgeNode implements NodeAction {
    @Override
    public Map<String, Object> apply(OverAllState state) {
        String intent = state.value("intent", String.class).orElse("general");
        String docs = searchDocs(intent);   // 你的检索逻辑
        return Map.of("search_results", docs);
    }

    private String searchDocs(String intent) { /* ... */ return "..."; }
}
```

**2. 注册状态键**

```java
strategies.put("search_results", new ReplaceStrategy());
```

**3. 修改 Graph 连线**

```java
var search = node_async(new SearchKnowledgeNode());

return new StateGraph("pos-assistant", factory)
        .addNode("classify", classify)
        .addNode("search", search)
        .addNode("respond", respond)
        .addEdge(START, "classify")
        .addEdge("classify", "search")    // 新增
        .addEdge("search", "respond")     // 新增
        .addEdge("respond", END);
```

**4. 在 respond 节点中读取新状态**

```java
String docs = state.value("search_results", String.class).orElse("");
```

---

## 6. 常见模式

### 6.1 线性流水线

适合步骤固定、无分支：

```
A → B → C → END
```

### 6.2 分类路由

适合先判断意图再分流：

```
        ┌─▶ handler_a ─┐
START → classify ─┼─▶ handler_b ─┼─▶ respond → END
        └─▶ handler_c ─┘
```

### 6.3 人工介入

适合高风险操作（退款、改价、发信）：

```
draft → human_review（暂停）→ send → END
```

### 6.4 循环重试

节点返回 `next_node` 指向自身，配合条件边实现 LLM 自我修正：

```
agent ──▶ tool ──▶ agent（出错则循环）
          │
          └──▶ END（成功则结束）
```

---

## 7. 编写节点时的建议

1. **一节点一职责**：分类就只做分类，不要在一个节点里又分类又生成又发邮件。
2. **状态存原始值**：便于调试，也便于不同节点复用同一份数据。
3. **Prompt 在节点内组装**：不要把完整 Prompt 写进 State。
4. **明确错误策略**：
   - 可重试错误 → 返回状态让上游重试
   - 需人工处理 → 配合 `interruptBefore`
   - 不可预期错误 → 直接抛出，便于排查
5. **用 `threadId` 隔离会话**：同一用户多轮对话应复用同一个 `threadId`。

---

## 8. 调试技巧

```yaml
logging:
  level:
    com.orithos.modules.ai: DEBUG
    com.alibaba.cloud.ai.graph: DEBUG
```

排查顺序：

1. 图是否能 `compile()` 成功
2. 初始状态是否包含必填键（如 `question`）
3. 每个节点返回的 Map 键是否与 `KeyStrategy` 一致
4. 条件边的返回值是否在 `Map.of(...)` 的目标节点列表中
5. DashScope API Key 是否有效

---

## 9. 快速对照表

| 我想做… | 用什么 API |
|---------|-----------|
| 定义流程 | `new StateGraph(...).addNode().addEdge()` |
| 固定跳转 | `addEdge("a", "b")` |
| 条件跳转 | `addConditionalEdges(...)` |
| 写节点逻辑 | 实现 `NodeAction.apply(OverAllState)` |
| 配置状态合并 | `KeyStrategyFactory` + `ReplaceStrategy` / `AppendStrategy` |
| 编译 | `stateGraph.compile()` |
| 执行 | `compiledGraph.stream(initialState, config)` |
| 读结果 | `compiledGraph.getState(config)` |
| 暂停等人确认 | `CompileConfig.interruptBefore("节点名")` |
| 暂停后继续 | `updateState()` + 再次 `stream(null, config)` |

---

## 10. 参考

- 项目集成说明：[SPRING_AI_ALIBABA_GRAPH.md](./SPRING_AI_ALIBABA_GRAPH.md)
- 官方 Graph 文档：https://java2ai.com/docs/frameworks/graph-core/quick-start
- 源码示例：`pos-api/src/main/java/com/orithos/modules/ai/`
