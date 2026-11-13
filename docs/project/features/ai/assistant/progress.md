# 门店助手、语音与历史：进展与问题

更新日期：2026-11-13。负责人待分配，优先级 P0 为发布/数据安全阻断，P1 为功能质量，P2 为效果增强。

2026-11-13 双店线上对账发现并复现一个 UI 缺陷：销售 API 返回一行有效聚合结果（available），但没有日期列；UI 将其误报为“没有返回销售行”。本地候选区分无行与聚合行缺少逐日日期。两店 7 日英文销售/毛利/笔数和昨日中文营业额/毛利/笔数均与各自同期间 native overview 对账一致，四类请求都 deterministic 且 `writeRequests=[]`。候选未部署；历史浏览器回归受本机没有后端配置阻断。详见[continuation session](../../../../test-sessions/2026-11-13-ai-assistant-bilingual-reconciliation.md)。

2026-11-13 本地 UI 继续回归：API 消息级来源元数据优先于卡片缓存字段；无可信 `dataAsOf` 时中英文明确显示“数据时间未提供 / Data timestamp unavailable”，不伪造当前时间。当前 POS UI 全量单测 204/204、typecheck PASS、助手 helper 定向 ESLint PASS；工作树脏且基线 `39eb296e` 落后 `origin/main` 3 个提交，未做线上验收或发布。完整功能验收仍开放。

本轮持续验收（2026-11-13 当前工作树）：本地后端 `mvn -B clean verify` 675/675、POS UI 单测 199/199、`npm run typecheck` 和 `npm run build` 通过。AI 候选改动仍未提交；线上运行 SHA 与候选不一致。完整话术目录、历史/清空、多轮、真实语音、取消/重试、安全与跨门店隔离，以及 SKR/Demo 权威报表对账仍未完成，不以本地绿测宣称全功能验收通过。

## 已完成

问法路由、业务日期槽位、Odoo 只读报表、结构化 CTA、上下文与历史、语音能力门禁均有源码。导航不是提交业务操作；多轮会话不等于所有快捷预览都持久化。

验证范围：源码能力已实现；线上只读复验见 2026-11-13 readiness follow-up。当前两店 frontend/backend runtime 为 `da91a4a4`；SKR 英文昨日销售问答已与同日权威报表对账，其他流程仍按下表保持开放。

2026-11-04 候选 `8f9c9171` 增加已识别销售/库存问答的数据来源、查询路由区分，以及销售请求区间和实际返回日期说明；本地 Node 24 类型检查、UI 单测、定向 ESLint 与只读脚本语法检查通过。线上运行版本仍为 `fcdccefa`，两店验收尚未执行。

## 问题与下一步

| 问题 ID | 优先级 | 问题 | 状态 | 负责人 | 关闭条件 / 下一步 |
|---|---|---|---|---|---|
| AI-A01 | P1 | 整轮与重试不能合并准入 | OPEN | AI/QA owner 待指定 | 在一个固定 runtime、干净测试源码和固定目录下重跑全量，完整通过并保留原阻断记录。 |
| AI-A02 | P1 | 真实语音效果未验收 | OPEN | 前端/QA owner 待指定 | 在 HTTPS 真麦克风、门店噪声、双语/口音集上记录 WER、实体命中、取消与失败恢复。 |
| AI-A03 | P1 | 历史修复仅局部线上证实 | OPEN | 后端 owner 待指定 | 保留确定性销售报表成功和 fallback 50210；对修复后同版本 greeting、导航、查数及旧空会话分别回归。 |
| AI-A04 | P1 | 销售/库存答案缺少可见数据来源和实际返回日期 | PARTIALLY VERIFIED | 前端/QA owner 待指定 | 2026-11-13 的 SKR 昨日销售 API 回答含来源、期间、时区、状态和 dataAsOf；与同日 overview 对账通过。仍需两店 UI 可见元数据、7 日行日期和最新销售日验收。 |
| AI-A05 | P1 | 客单价空期间会把缺失平均值显示成 AUD 0 | FIXED IN CANDIDATE | AI/QA owner 待指定 | 零交易应返回无记录；正交易但平均值或销售额缺失应拒绝补零。远程 Java 21 全套及部署后只读对账通过后关闭候选验收。 |
| AI-A06 | P0 | `ReportQueryService` 增加多个构造器后 Spring 未能选择 JDBC 注入构造器，导致 POS 后端启动失败 | CLOSED | Backend owner 待指定 | `@Autowired` 与 Spring 容器回归 1/1 已随 `695eee7d` 部署；Dokploy 后续 `da91a4a4` 为 Done，两店 frontend/backend SHA 一致，健康代理已从 502 恢复为受认证的 401 响应。 |

2026-11-13 候选复用 Orithos `nativeOverview` 计算客单价，拆分销售额/退款额与对应笔数，并增加零交易和权威指标缺失的 fail-closed 处理。验证见[session](../../../../test-sessions/2026-11-13-ai-assistant-aov-integrity.md)；Java 21 远程构建、SKR/Demo 部署与在线对账仍未完成。

2026-11-13 本地工作树继续补齐报表元数据与补货观测：助手复用权威 overview 取得数据时间，按 vendor/outlet/期间缓存 10 秒；补货权限在缓存读取前检查，并对拒绝、数据缺口和服务失败分类记录耗时。UI 用 API 期间与请求范围分开显示，历史详情恢复来源、期间、时区、状态和数据时间；中英文高频昨日销售问法有参数化路由用例。候选 `b62930bc` 已在两店前端运行，但后端因 Spring 构造器选择故障启动失败；源码已增加显式注入和容器启动回归，修复候选后端 660/660 通过。新修复部署与 SKR/Demo 报表对账、线上只读问答、语音与历史/清空/取消流程仍未完成；详细范围见[session](../../../../test-sessions/2026-11-13-ai-assistant-readiness-followup.md)。

2026-11-13 后续部署复核：Dokploy `695eee7d` 与随后 `da91a4a4` 均为 Done；SKR/Demo 的前后端 runtime 均为 `da91a4a4bea832be67abc1a225fe0e63f0384bb6`。SKR 2026-11-12 英文问法及覆盖的中文“昨天销售额如何？”均 deterministic，与 native overview 销售额 AUD 5,173.94、毛利 AUD 1,985.28 一致，`writeRequests=[]`；中文请求耗时 531 ms。未覆盖的“昨天销售额是多少？”在线探测不确定；费用上限、Demo 数值对账、历史清空、语音、取消/重试、安全注入及跨门店隔离仍待验收。详见[session](../../../../test-sessions/2026-11-13-ai-assistant-readiness-followup.md)。

2026-11-13 持续验收补充：当前部署 `173dacfe1db75504187fac8f5a5ba24e21ea8c64` 的 SKR 与 Demo 均将“昨天销售额是多少？”路由到 deterministic `report_sales`；销售 AUD 5,173.94、毛利 AUD 1,985.28、185 笔均与各自 2026-11-12 `native-overview` 一致，`writeRequests=[]`。两店 UI 同样把有效但无日期列的聚合行误报为“没有返回销售行”；本地候选文案修复已由 UI 单测覆盖，尚未部署。Java 助手/路由/补货定向 62/62、UI 单测 205/205、typecheck 与三项验收脚本语法检查通过。真实浏览器历史 fixture 已在本机 Chrome 的 1440/1024/768/390 视口通过，覆盖历史恢复、来源元数据、续问、新建/清空和失效会话；只使用拦截 API fixture。在线费用仍不可见，完整语音、取消/重试、安全隔离和其余问答目录仍未完成。

2026-11-13 元数据缺失边界续验：发现 `dataAsOf: null` 会因空值合并运算符回退到卡片缓存旧时间。现改为 API/消息字段存在时即优先，包括显式 `null`；只有旧会话完全缺少该字段时兼容回退，并增加对应单测。UI 单测 207/207、typecheck 通过；历史 fixture 扩展为 API 来源/时间与旧卡片值冲突、无日期销售聚合行，在 1440/1024/768/390px 全部通过，无页面错误。修复仍未部署，线上两店旧文案问题待回归。

## 验证闭环

历史问题链：E-HISTORY-FINDING 记录列表 id=null → 详情 /threads/null HTTP 400；显式 mapper 映射修复后仍需上线证据。E-HISTORY 的 0d3d0bc3 记录数字 ID 和 session/timestamp 存在、报表产生 2 条消息（局部关闭）；旧会话 0 消息及 greeting/navigation 的 50210 未关闭。这是“发现→修复→测试→局部关闭”的样例，不能写成历史功能全面修复。

## 迭代策略

先修数据与安全，再改功能正确性，最后按固定对照比较体验、延迟、成本和经营结果。每次更新本页及[测试索引](../../../../TEST_REPORT_INDEX.md)；需要架构取舍时新增 ADR。禁止为了改变状态文字而重写历史证据。
