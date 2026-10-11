# Spring AI Alibaba Graph 集成说明

本文档说明 Orithos POS 后端（`pos-api`）中 **Spring AI Alibaba Graph** 的集成方式、配置方法与使用示例。

## 概述

[Spring AI Alibaba Graph](https://github.com/alibaba/spring-ai-alibaba/tree/main/spring-ai-alibaba-graph-core) 是阿里巴巴开源的 Graph 工作流引擎，用于编排多步骤、有状态的 AI 应用。与单次问答不同，Graph 将流程拆分为多个**节点（Node）**，通过**边（Edge）**连接，并在**共享状态（State）**中传递数据。

本项目已集成 Graph，并实现了一个 POS 场景下的智能助手工作流：

```
START → classify（意图分类）→ respond（生成回答）→ END
```

- **classify**：使用大模型将用户问题分类为 `product` / `customer` / `inventory` / `sales` / `general`
- **respond**：结合分类结果与问题内容，生成面向 POS 业务场景的回答

## 技术栈与版本

| 组件 | 版本 |
|------|------|
| Spring Boot | 3.3.5 |
| Java | 21 |
| spring-ai-bom | 1.1.2 |
| spring-ai-alibaba-bom | 1.1.2.2 |
| 模型提供商 | 阿里云百炼 DashScope |

## Maven 依赖

在 `pos-api/pom.xml` 中已添加：

```xml
<!-- BOM 管理 -->
<dependency>
  <groupId>org.springframework.ai</groupId>
  <artifactId>spring-ai-bom</artifactId>
  <version>1.1.2</version>
  <type>pom</type>
  <scope>import</scope>
</dependency>
<dependency>
  <groupId>com.alibaba.cloud.ai</groupId>
  <artifactId>spring-ai-alibaba-bom</artifactId>
  <version>1.1.2.2</version>
  <type>pom</type>
  <scope>import</scope>
</dependency>

<!-- 运行时依赖 -->
<dependency>
  <groupId>com.alibaba.cloud.ai</groupId>
  <artifactId>spring-ai-alibaba-graph-core</artifactId>
</dependency>
<dependency>
  <groupId>com.alibaba.cloud.ai</groupId>
  <artifactId>spring-ai-alibaba-starter-dashscope</artifactId>
</dependency>
```

## 代码结构

```
pos-api/src/main/java/com/orithos/modules/ai/
├── AiAssistantController.java      # REST 接口
├── AiProperties.java               # 配置属性（app.ai.*）
├── PosAssistantGraphService.java   # Graph 执行服务
├── config/
│   └── PosAssistantGraphConfig.java  # StateGraph / CompiledGraph 定义
├── dto/
│   ├── AssistantRequest.java
│   └── AssistantResponse.java
└── node/
    ├── ClassifyQueryNode.java      # 分类节点
    └── GenerateResponseNode.java   # 回答节点
```

### 核心概念

| 概念 | 说明 |
|------|------|
| `StateGraph` | 工作流定义，包含节点与边 |
| `CompiledGraph` | 编译后的可执行图 |
| `OverAllState` | 节点间共享的状态 |
| `KeyStrategy` | 状态字段的合并策略（本项目使用 `ReplaceStrategy` 覆盖写入） |
| `NodeAction` | 节点逻辑，接收状态并返回状态更新 |

### 状态字段

Graph 运行时维护以下状态键：

| 键 | 写入节点 | 说明 |
|----|----------|------|
| `question` | 调用方传入 | 用户问题 |
| `intent` | classify | 意图分类结果 |
| `intent_summary` | classify | 意图摘要 |
| `answer` | respond | 最终回答 |

## 配置说明

### 环境变量

复制 `pos-api/.env.example` 为 `pos-api/.env`，按需添加：

```env
# 启用 AI 助手（默认 false，不影响 POS 主功能）
AI_ENABLED=true

# 阿里云百炼 API Key（在百炼控制台获取）
AI_DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxx

# 可选，默认 qwen-plus
AI_DASHSCOPE_MODEL=qwen-plus
```

### application.yml

相关配置位于 `pos-api/src/main/resources/application.yml`：

```yaml
spring:
  ai:
    dashscope:
      api-key: ${AI_DASHSCOPE_API_KEY:}
      chat:
        options:
          model: ${AI_DASHSCOPE_MODEL:qwen-plus}

app:
  ai:
    enabled: ${AI_ENABLED:false}
    graph-name: pos-assistant
```

### 按需加载设计

为避免未配置 API Key 时应用无法启动：

1. 主应用 `OrithosApplication` **排除**了 DashScope 全部自动配置
2. 仅当 `app.ai.enabled=true` 时，`PosAssistantGraphConfig` 通过 `@ImportAutoConfiguration` 加载 Chat 相关配置

因此：

- **未启用 AI**：POS 后端正常启动，AI 接口返回 503 提示
- **启用 AI**：需同时设置 `AI_ENABLED=true` 和有效的 `AI_DASHSCOPE_API_KEY`

## API 使用

### 接口

```
POST /api/ai/assistant
```

需要 JWT 认证（与现有 POS API 一致）。

### 请求体

```json
{
  "question": "如何给客户做库存盘点？",
  "threadId": "optional-conversation-id"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `question` | 是 | 用户问题，最长 4000 字符 |
| `threadId` | 否 | 会话 ID，用于多轮对话追踪；不传则自动生成 |

### 响应体

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "threadId": "a1b2c3d4-...",
    "intent": "inventory",
    "intentSummary": "用户询问库存盘点操作流程",
    "answer": "在 Orithos POS 中，您可以通过..."
  }
}
```

### 调用示例

```bash
# 1. 登录
curl -s http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"123456"}'

# 2. 调用 AI 助手（替换 <accessToken>）
curl -s http://localhost:8080/api/ai/assistant \
  -H "Authorization: Bearer <accessToken>" \
  -H 'Content-Type: application/json' \
  -d '{"question":"如何查看某个客户的账单明细？"}'
```

### 错误情况

| 场景 | code | 说明 |
|------|------|------|
| AI 未启用 | 50301 | 需设置 `AI_ENABLED=true` 和 API Key |
| 未登录 | 40100 | 需携带有效 JWT |
| 参数校验失败 | 400xx | `question` 为空或超长 |

## 本地开发

```bash
cd pos-api

# 配置环境变量（或使用 .env 文件）
cp .env.example .env
# 编辑 .env，取消 AI 相关注释并填入 API Key

# 编译
mvn compile -DskipTests

# 启动
mvn spring-boot:run
```

## 扩展指南

当前实现为最小可用工作流，后续可按需扩展：

### 1. 增加条件路由

在 `classify` 节点后添加 `addConditionalEdges`，根据 `intent` 路由到不同处理节点（如商品查询、库存说明等）。

### 2. 接入 Tool / MCP

在节点中调用 Spring AI Tool 或 MCP，让助手能查询真实商品、库存、客户数据，而非仅给出操作指引。

### 3. 人工审核（Human-in-the-loop）

使用 `CompileConfig.interruptBefore("节点名")` 与 `MemorySaver`，在敏感操作前暂停，等待人工确认后继续执行。

### 4. 持久化会话

当前使用内存状态；生产环境可替换为 Redis / 数据库 Checkpointer，支持长时会话恢复。

### 5. 新增节点示例

```java
// 1. 实现 NodeAction
public class MyCustomNode implements NodeAction {
    @Override
    public Map<String, Object> apply(OverAllState state) {
        // 读取 state，执行业务逻辑，返回更新
        return Map.of("some_key", "some_value");
    }
}

// 2. 在 PosAssistantGraphConfig 中注册
var myNode = node_async(new MyCustomNode());
workflow.addNode("my_node", myNode);
workflow.addEdge("classify", "my_node");
workflow.addEdge("my_node", "respond");
```

## 参考链接

- [Spring AI Alibaba 官方文档](https://java2ai.com/docs/overview)
- [Graph 快速开始](https://java2ai.com/docs/frameworks/graph-core/quick-start)
- [DashScope 模型配置](https://java2ai.com/docs/dev/models/dashScope/)
- [GitHub：spring-ai-alibaba](https://github.com/alibaba/spring-ai-alibaba)
