# AI 生产化交接总结

更新时间：2026-10-30（Asia/Shanghai）  
当前发布提交：`5a7fc9f925c1768fe3049fb270906df52e25b8a9`  
当前验证环境：`https://demo.orithos.com.au/`  
范围边界：只验证和修改 Demo；不对 `skr.orithos.com.au` 执行业务写入。

## 一、当前已完成

### 后端和模型接入

- Java 21 后端完整构建通过。
- `477` 个测试通过，失败数和错误数均为 `0`。
- 已实现 `AiGateway` 和 DashScope provider adapter，统一模型路由、超时、重试、fallback、配额、token/延迟记录和 correlation ID。
- Graph 意图分类、响应生成、命令解析、ASR 和 OCR/视觉服务已接入 Gateway。
- 模型输出仍受结构化解析、输入长度和敏感字段策略约束。

### Odoo 只读数据和决策

- 已建立 Odoo 只读同步：商品、库存、价格、销售、供应商和在途采购快照。
- 快照带 `vendor_id`、`outlet_id`、来源 ID、来源版本、时间戳和数据质量状态。
- 定价和补货规则引擎已接入预览 API。
- 已增加决策快照、审计、反馈和只读回测接口。
- 数据缺失时返回 `DATA_INCOMPLETE`/`INCOMPLETE_DATA`，不会把未知值当成零。

### 受控命令

- `AI_COMMANDS_ENABLED=true` 已在 Demo 生效。
- 支持解析、预览、取消、过期、版本检查、幂等键和审计。
- 前端已有命令预览卡片和确认/取消交互。
- `AI_COMMANDS_EXECUTION_ENABLED=false`，确认请求会返回明确的 `50303`，命令保持 `PREVIEWED`，不产生 Odoo 业务写入。

### Demo 线上验证

- Odoo 快照同步成功：14 个商品、库存、价格和销售记录。
- 定价预览成功，并生成决策快照。
- 补货预览成功；Demo 当前有 13 个商品缺少供应商，系统正确返回数据缺口。
- 价格和补货两组快照回测均返回 `READ_ONLY`。
- 命令解析成功；确认执行被开关阻断。
- 运行过程中没有对 SKR 产生业务写入；历史 SKR 写入脚本已增加域名护栏。

## 二、`AI_COMMANDS_EXECUTION_ENABLED` 是否一直关闭

建议：**生产和普通 Demo 默认一直关闭**。它不是功能开关，而是业务写入门禁。

可以在一次性隔离的 Odoo UAT 环境短期开启，但不建议在共享 Demo、SKR 或所有租户的全局配置中开启。开启前必须满足：

1. 商品、客户和价格写入全部通过 Odoo adapter，Odoo 是唯一事实源；
2. 每个项目都做写入前版本检查、幂等检查和权限检查；
3. 写入后逐项回读 Odoo，回读不一致标记为 `STALE` 或 `FAILED`；
4. 失败时返回逐项结果，不允许部分成功被静默隐藏；
5. 审计记录包含命令、用户、门店、确认方式、Odoo 结果、correlation ID 和运行版本；
6. 在隔离租户完成重复确认、并发修改、超时重试、权限拒绝和回滚测试；
7. 通过人工审批和明确的回滚方案；
8. 先只开放商品名称/条码，再逐步开放客户资料和价格；补货首期仍只生成建议，不生成或确认采购单。

即使通过门禁，也建议用独立环境变量或按租户 feature flag 开启，默认值继续为 `false`：

```text
AI_COMMANDS_ENABLED=true
AI_COMMANDS_EXECUTION_ENABLED=false
```

## 三、下一步优先级

### P0：完成可审计的评测闭环

- 使用 Demo 的脱敏快照绑定现有问法目录，固定 source SHA、runtime SHA、模型、prompt 和配置版本。
- 每次发布运行意图、路由、实体、数值、澄清、安全和 `writeRequests` 断言。
- 结果严格区分 `PASS`、`FAIL`、`BLOCKED`，禁止把数据源或 provider 不可用当成通过。
- 将真实失败问法加入回归集，并设置每日只读回归任务。

参考：`docs/AI_ASSISTANT_UTTERANCE_CATALOG.md`、`docs/AI_ASSISTANT_TEST_PLAN.md`。

### P0：完善 Demo 数据质量

- 为 Demo 商品补齐供应商、交期、箱规和采购成本，或明确标记这些商品只能人工处理。
- 检查销售历史、库存更新时间和价目表 GST 口径。
- 给快照同步增加数据质量告警、保留策略和最近成功同步状态。

### P1：完成命令执行适配器

- 将商品、客户和价格执行路径统一包在 Odoo-backed adapter 中。
- 禁止命令服务直接绕过 Odoo 事实源写本地业务表。
- 增加 Odoo 回读、逐项结果、重试和补偿测试。
- 先在独立 UAT 数据库完成 10 项验收，再考虑开启执行开关。

### P1：补齐生产平台能力

- AI Gateway 增加租户/门店/用户限流、预算、成本告警和 provider 熔断指标。
- 完成 Redis 持久化、PostgreSQL 备份恢复、对象存储和异步任务监控。
- 用 OpenTelemetry、Prometheus/Grafana 和 Sentry 统一观察 AI、Odoo、数据库耗时和错误。
- 每次部署记录 source SHA、runtime SHA、模型和 prompt 版本。

### P1：定价和补货迭代

- 先用规则和传统统计模型回测，不把价格或采购数量交给 LLM 决定。
- 定价增加历史价格、成本、促销、缺货、季节和人工采纳反馈。
- 补货增加供应商交期、MOQ、箱规、在途、报损、节假日和门店容量。
- 在 1 家 Demo 隔离门店稳定后，再扩展到 2–3 家门店；记录 WAPE/MAE、缺货率、周转、采纳率和回滚率。
- 暂不引入强化学习。

### P2：工程和体验优化

- 当前本机前端构建未完成：项目声明 Node `>=24`，当前环境为 Node `22.22.2`；切换到 Node 24 后补跑 `npm ci && npm run build`。
- 增加命令预览的逐项风险提示、打开业务页面复核和执行结果详情。
- 继续保持报告 ad-hoc NL2SQL 的 fail-closed 行为；只有生成、SQL Guard、执行和结果回填完整后才开放。

## 四、发布和回滚操作

### 只读阶段

```text
AI_ENABLED=true
AI_COMMANDS_ENABLED=true
AI_COMMANDS_EXECUTION_ENABLED=false
```

先部署到 Demo，执行快照同步、问答回归、价格/补货预览和回测，确认业务写入为零。

### 执行 UAT 阶段

只在独立 Odoo UAT 环境设置 `AI_COMMANDS_EXECUTION_ENABLED=true`，完成商品名称、客户电话、价格、重复确认、并发修改、Odoo 失败和回读验证；测试结束立即恢复 `false`。

### 发现异常

1. 立即将 `AI_COMMANDS_EXECUTION_ENABLED=false`；
2. 必要时将 `AI_ENABLED=false` 并重新部署；
3. 保留命令和 Odoo 审计记录；
4. 核对 Odoo 回读和写入计数，再决定是否修复或回滚。

## 五、关键文件

- AI Gateway：`pos-api/src/main/java/com/orithos/modules/ai/gateway/`
- 命令：`pos-api/src/main/java/com/orithos/modules/ai/command/`
- Odoo 快照：`pos-api/src/main/java/com/orithos/modules/ai/snapshot/`
- 定价：`pos-api/src/main/java/com/orithos/modules/ai/pricing/`
- 补货：`pos-api/src/main/java/com/orithos/modules/ai/replenishment/`
- 决策和回测：`pos-api/src/main/java/com/orithos/modules/ai/decision/`
- 前端命令预览：`pos-ui/src/components/ai/AiCommandPreviewCard.tsx`
- 命令开关：`pos-api/src/main/resources/application.yml`

