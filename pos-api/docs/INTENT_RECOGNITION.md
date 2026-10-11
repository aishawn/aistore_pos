# 意图识别说明

本文档说明 Orithos POS 智能助手中**意图识别（Intent Recognition）**的实现方式、扩展方法与测试方法。

相关文档：

- [Graph 使用指南](./GRAPH_USAGE.md)
- [Spring AI Alibaba Graph 集成说明](./SPRING_AI_ALIBABA_GRAPH.md)

---

## 1. 什么是意图识别

意图识别指：根据用户的自然语言问题，判断其**真实目的**，并归类到预定义的意图标签中。

例如：

| 用户问题 | 识别意图 |
|----------|----------|
| 「某个 SKU 库存还有多少？」 | `inventory` |
| 「如何查看客户账单明细？」 | `customer` |
| 「怎么修改商品价格？」 | `product` |
| 「收银机怎么关账？」 | `sales` |

识别结果会写入 Graph 共享状态，供后续节点（如生成回答、查询数据、条件路由）使用。

---

## 2. 在本项目中的位置

意图识别是 Graph 工作流的**第一个业务节点**：

```
START → classify（意图识别）→ respond（生成回答）→ END
```

| 组件 | 文件 |
|------|------|
| 分类节点 | `modules/ai/node/ClassifyQueryNode.java` |
| Graph 配置 | `modules/ai/config/PosAssistantGraphConfig.java` |
| 下游消费 | `modules/ai/node/GenerateResponseNode.java` |

Graph 状态中相关字段：

| 状态键 | 写入节点 | 说明 |
|--------|----------|------|
| `question` | 调用方传入 | 用户原始问题 |
| `intent` | classify | 意图标签 |
| `intent_summary` | classify | 意图一句话摘要 |
| `answer` | respond | 最终回答 |

---

## 3. 当前实现：LLM + Prompt 分类

### 3.1 流程

```
读取 question
    ↓
构造分类 Prompt（定义意图类别 + 要求 JSON 输出）
    ↓
调用 ChatClient（DashScope 大模型）
    ↓
解析 JSON → intent + intent_summary
    ↓
写入 Graph 状态
```

### 3.2 核心代码

`ClassifyQueryNode` 实现 `NodeAction` 接口：

```java
@Override
public Map<String, Object> apply(OverAllState state) {
    String question = state.value("question", String.class)
            .orElseThrow(() -> new IllegalStateException("question is required"));

    String prompt = """
            You are a classifier for an Orithos POS (point-of-sale) system.
            Classify the user question into exactly one intent:
            - product: product catalog, pricing, barcodes, categories
            - customer: customer accounts, statements, groups, contact info
            - inventory: stock levels, stocktake, transfers, receiving
            - sales: sales history, registers, payments, gift cards
            - general: anything else about using the POS system

            User question: %s

            Reply with JSON only: {"intent":"...", "summary":"one-line summary"}
            """.formatted(question);

    String raw = chatClient.prompt().user(prompt).call().content();
    String intent = parseIntent(raw);
    String summary = parseSummary(raw);

    return Map.of(
            "intent", intent,
            "intent_summary", summary
    );
}
```

### 3.3 支持的意图类别

| intent | 中文含义 | 典型问题 |
|--------|----------|----------|
| `product` | 商品相关 | 改价、条码、分类、品牌 |
| `customer` | 客户相关 | 账单、分组、联系方式 |
| `inventory` | 库存相关 | 库存查询、盘点、调拨、收货 |
| `sales` | 销售相关 | 销售记录、收银、支付、礼品卡 |
| `general` | 通用/其他 | 无法归入以上类别的问题 |

### 3.4 结果解析与兜底

模型返回文本后，用正则提取 JSON 字段：

```java
// 提取 intent，失败则兜底为 general
private static String parseIntent(String raw) {
    Matcher matcher = INTENT_PATTERN.matcher(raw);
    if (matcher.find()) {
        return matcher.group(1).toLowerCase();
    }
    return "general";
}
```

**兜底策略**：解析失败时，`intent` 默认为 `general`，避免流程中断。

---

## 4. 下游如何使用识别结果

`GenerateResponseNode` 读取 `intent` 和 `intent_summary`，将其一并传给回答 Prompt：

```java
String intent = state.value("intent", String.class).orElse("general");
String summary = state.value("intent_summary", String.class).orElse("");

String userPrompt = """
        Intent: %s
        Intent summary: %s
        Question: %s
        """.formatted(intent, summary, question);
```

API 响应中也会返回识别结果：

```json
{
  "code": 0,
  "data": {
    "threadId": "...",
    "intent": "inventory",
    "intentSummary": "用户查询商品库存数量",
    "answer": "..."
  }
}
```

---

## 5. 如何新增或修改意图

### 5.1 修改 Prompt 中的类别

编辑 `ClassifyQueryNode.java`，在 Prompt 里增加或调整意图说明：

```
- order: purchase orders, receiving, returns, credits
- supplier: supplier management, supplier products
```

同时更新 `PosAssistantGraphConfig` 中条件路由的映射（若已启用分支）。

### 5.2 注册新的状态字段（如有需要）

在 `PosAssistantGraphConfig` 的 `KeyStrategyFactory` 中注册：

```java
strategies.put("intent", new ReplaceStrategy());
strategies.put("intent_summary", new ReplaceStrategy());
strategies.put("confidence", new ReplaceStrategy());  // 新增：置信度
```

### 5.3 设计意图时的建议

- 意图数量控制在 **5～8 个**，过多会降低准确率
- 每个意图写清楚**边界**和**反例**（什么不属于该意图）
- 在 Prompt 中给出 1～2 个**示例**，提升稳定性
- 意图命名使用**小写英文 + 下划线**，便于代码路由

---

## 6. 按意图条件路由（进阶）

当前所有意图都走固定边 `classify → respond`。若不同意图需要不同处理逻辑，可在 `PosAssistantGraphConfig` 中使用**条件边**：

```java
import static com.alibaba.cloud.ai.graph.action.AsyncEdgeAction.edge_async;

// 新增各意图专属处理节点
var productHandler   = node_async(new ProductHandlerNode());
var customerHandler  = node_async(new CustomerHandlerNode());
var inventoryHandler = node_async(new InventoryHandlerNode());

workflow
    .addNode("product_handler", productHandler)
    .addNode("customer_handler", customerHandler)
    .addNode("inventory_handler", inventoryHandler);

// classify 之后按 intent 分流
workflow.addConditionalEdges(
        "classify",
        edge_async(state -> state.value("intent", String.class).orElse("general")),
        Map.of(
                "product",   "product_handler",
                "customer",  "customer_handler",
                "inventory", "inventory_handler",
                "sales",     "respond",
                "general",   "respond"
        )
);

workflow.addEdge("product_handler", "respond");
workflow.addEdge("customer_handler", "respond");
workflow.addEdge("inventory_handler", "respond");
```

路由后的流程示意：

```
                    ┌─▶ product_handler ────┐
                    ├─▶ customer_handler ───┤
START → classify ───┼─▶ inventory_handler ──┼─▶ respond → END
                    └─▶ respond（sales/general）
```

各 handler 节点可以：

- 调用 POS 业务 Service 查询真实数据
- 组装领域上下文后再交给 `respond` 生成回答

---

## 7. 三种实现方式对比

### 方式一：LLM + Prompt（当前方案）

| 优点 | 缺点 |
|------|------|
| 实现快，语义理解好 | 有 API 延迟和费用 |
| 适合自然语言变体多 | 输出格式可能不稳定 |

**适用**：问题表述多样、类别边界模糊。

### 方式二：LLM + 结构化输出（推荐升级）

用 Spring AI 的 `entity()` 替代正则解析，减少 JSON 格式错误：

```java
public record IntentResult(String intent, String summary) {}

IntentResult result = chatClient.prompt()
        .user(prompt)
        .call()
        .entity(IntentResult.class);

return Map.of(
        "intent", result.intent().toLowerCase(),
        "intent_summary", result.summary()
);
```

| 优点 | 缺点 |
|------|------|
| 解析更可靠 | 仍依赖 LLM |
| 代码更清晰 | 需模型支持结构化输出 |

### 方式三：规则 + LLM 混合

高频固定问法先用关键词匹配，未命中再调 LLM：

```java
private String ruleBasedIntent(String question) {
    String q = question.toLowerCase();
    if (q.contains("库存") || q.contains("盘点") || q.contains("stocktake")) {
        return "inventory";
    }
    if (q.contains("客户") || q.contains("账单") || q.contains("statement")) {
        return "customer";
    }
    if (q.contains("商品") || q.contains("条码") || q.contains("价格")) {
        return "product";
    }
    if (q.contains("收银") || q.contains("销售") || q.contains("支付")) {
        return "sales";
    }
    return null;  // 规则未命中，交给 LLM
}

@Override
public Map<String, Object> apply(OverAllState state) {
    String question = state.value("question", String.class).orElseThrow();
    String intent = ruleBasedIntent(question);
    if (intent != null) {
        return Map.of("intent", intent, "intent_summary", "规则匹配");
    }
    // 否则走 LLM 分类...
}
```

| 优点 | 缺点 |
|------|------|
| 高频问题零 LLM 成本 | 规则维护成本 |
| 响应更快 | 泛化能力弱 |

**适用**：有明确高频固定问法的 POS 场景。

---

## 8. 测试方法

### 8.1 启用 AI

在 `pos-api/.env` 中配置：

```env
AI_ENABLED=true
AI_DASHSCOPE_API_KEY=你的百炼API密钥
```

### 8.2 调用接口

```bash
# 登录
curl -s http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"123456"}'

# 测试意图识别（查看返回的 intent 和 intentSummary）
curl -s http://localhost:8080/api/ai/assistant \
  -H "Authorization: Bearer <accessToken>" \
  -H 'Content-Type: application/json' \
  -d '{"question":"如何做库存盘点？"}'
```

### 8.3 建议测试用例

| 测试问题 | 期望 intent |
|----------|-------------|
| 「怎么给客户开发票？」 | `customer` |
| 「某个商品条码扫不出来」 | `product` |
| 「门店之间怎么调拨库存？」 | `inventory` |
| 「收银机关账流程是什么？」 | `sales` |
| 「系统怎么登录？」 | `general` |

### 8.4 查看调试日志

```yaml
logging:
  level:
    com.orithos.modules.ai: DEBUG
```

日志中会输出：

```
Classified POS query as intent=inventory summary=用户询问库存盘点流程
```

---

## 9. 常见问题

### Q：识别结果不准确怎么办？

1. 优化 Prompt：补充边界说明和示例
2. 减少意图数量，合并相近类别
3. 对高频问题加规则预匹配
4. 升级为结构化输出（`entity()`）

### Q：模型返回的不是 JSON 怎么办？

当前已有兜底：`parseIntent` 失败时返回 `general`。  
长期建议改用 `entity(IntentResult.class)` 或 JSON Schema 约束。

### Q：意图识别和回答可以合并成一个节点吗？

可以，但不推荐。分离的好处：

- 分类结果可复用（路由、日志、统计）
- 回答节点可专注生成，Prompt 更简洁
- 便于单独测试和优化分类准确率

### Q：如何统计各意图的调用量？

在 `ClassifyQueryNode` 中分类完成后打 metrics 日志，或写入 Redis / 数据库：

```java
log.info("intent_metric intent={}", intent);
// 或 counter.increment("ai.intent." + intent);
```

---

## 10. 快速对照

| 我想… | 改哪里 |
|-------|--------|
| 修改意图类别 | `ClassifyQueryNode` 的 Prompt |
| 修改解析逻辑 | `ClassifyQueryNode.parseIntent()` |
| 按意图走不同分支 | `PosAssistantGraphConfig.addConditionalEdges()` |
| 让回答感知意图 | `GenerateResponseNode`（已读取 `intent`） |
| 加规则预匹配 | `ClassifyQueryNode.apply()` 开头 |
| 升级结构化输出 | 用 `chatClient.call().entity()` 替代正则 |

---

## 11. 参考

- 源码：`pos-api/src/main/java/com/orithos/modules/ai/node/ClassifyQueryNode.java`
- Graph 条件路由：[GRAPH_USAGE.md § 6.2](./GRAPH_USAGE.md)
- 官方文档：https://java2ai.com/docs/frameworks/graph-core/quick-start
