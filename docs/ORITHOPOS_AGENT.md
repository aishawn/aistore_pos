# OrithoposAgent

店主或店长在 Telegram 里和 Hermes Agent 说话。Hermes 调用 Orithopos 的 HTTP 接口取真实经营数据，再回复到同一条对话。到了约定时间，Hermes 的 cron 再调这些接口，把日报、库存和补货一类信息推到这个人的 Telegram。用户对每条推送表态：有用或没用、喜欢或不喜欢，也可以直接说以后想怎么收。短习惯写入该 profile 的 `USER.md`，取数步骤留在能力 Skill。当前对话里的下一句按刚说过的话执行；下一次新会话和次日早报读取已经落盘的习惯。长期使用中，后台复盘和每周巩固继续改写这份习惯。

编写日期：2026-10-11。

相关文档：

- [项目总览](../README.md)
- [AI 报表技术方案](../pos-api/docs/AI_REPORT_TECHNICAL_PLAN.md)
- [框架选型](../pos-api/docs/AI_FRAMEWORK_SELECTION.md)

运行时是 [Hermes Agent](https://github.com/NousResearch/hermes-agent)（[文档](https://hermes-agent.nousresearch.com/docs)）。对照其现行机制：Messaging Gateway 的 Telegram 通道、profile 隔离、`USER.md` 记忆、`SKILL.md`、`skill_manage`、cron（可挂 Skill，并投递到 home channel）。部署钉住一次发布版本，不跟随 `main`。

---

## 1. 结论

Orithopos 继续做收银、库存和报表的事实来源。Hermes 做渠道、日程和用户习惯。两边的分工固定为：

| 职责 | 归属 |
|---|---|
| 销售额、库存、客单、滞销、酒款目录 | Orithopos 接口返回的数字 |
| 谁可以看哪家店、能不能看毛利 | Orithopos 登录态与 `perm:*` |
| Telegram 收发、定时推送 | Hermes Gateway 与该 profile 的 cron |
| 这个人喜欢看什么、什么时候推、用什么语气 | 该 profile 的 `USER.md` |
| 怎么调用 Orithopos、失败时怎么说 | 能力 Skill `orithopos`，不随点赞改写 |

模型可以组织语言，不能编造金额、数量或库存。接口失败时直接说明失败，留待下一次查询。

一位店主或店长对应一份 Hermes profile（`~/.hermes/profiles/<orithoposUserId>/`）。记忆、Skill、令牌、会话和 cron 都在这份目录里。不要让两个人共用一个 Hermes home，否则习惯会写进同一份 `USER.md`。

---

## 2. 目标与范围

### 2.1 目标

- 用户只打开 Telegram，就能问昨天卖了多少、哪些酒库存低、这瓶酒怎么卖。
- 按营业日（`Australia/Sydney`）定时把报表推到本人对话，格式跟着这个人的习惯走。
- 用户对推送和回答给出好恶后，习惯写入 `USER.md`。同一条对话里的下一句按原话执行；下一次新会话和之后的早报按落盘后的习惯执行。
- 每次明确改口都追加到反馈日志，用户说「改回去」时按日志里的上一条写回 `USER.md`。

### 2.2 本期不做

- 不在 Telegram 里改价、改库存、退款、作废销售、直接下采购单。
- 不让 Hermes 连 MySQL，也不让它生成 SQL。查数一律走已经过门店隔离的 HTTP 接口。
- 不把访问令牌、刷新令牌写进 `SKILL.md`、`USER.md` 或 `MEMORY.md`。这些文件会进入模型上下文。
- 不把收银员的界面动作（打开页面、预填表单）搬到 Telegram。那部分仍留在 `POST /api/ai/assistant` 的店内界面。
- 不开放 Hermes 自带的终端、任意文件写入和代码执行。取数只经过第 10 节的 Orithopos 工具。

有副作用的店内操作继续在 POS 里由人确认。Agent 只读。

---

## 3. 总体架构

```text
店主 / 店长
    │  文字、语音、对某条推送的回复
    ▼
Telegram
    │  Bot API（长轮询或 Webhook）
    ▼
Hermes Gateway                         一份 profile = 一个人
    ├─ 会话：该用户的 Telegram DM
    ├─ SOUL.md                         只读、不编数、不改业务数据
    ├─ memories/USER.md                口径、时段、好恶（每次会话注入）
    ├─ skills/orithopos/SKILL.md       怎么调工具、怎么读信封
    ├─ .env                            Orithopos 刷新令牌、Bot token
    ├─ Orithopos 工具（MCP）            只暴露只读接口，令牌由进程注入
    └─ cron                            独立会话取数，投递到 /sethome 的对话
            │
            │  Authorization: Bearer <该用户的访问令牌>
            ▼
Orithopos  pos-api
    登录态 → TenantContext（userId、outletId、权限）
    /api/reports/*          固定口径报表
    /api/ai/assistant       自然语言问数（模板 SQL / 窄 NL2SQL + SqlGuard）
    /api/ai/sommelier/*     在售酒推荐与话术
    /api/products、库存、补货计划只读接口
            │
            ▼
         MySQL（业务表与 ai_rpt_* 视图）
```

一次交互和一次推送走同一条取数路径，差别只在谁发起：

| | 交互 | 定时推送 |
|---|---|---|
| 触发 | 用户在 Telegram 发言 | 该 profile 的 cron 到点 |
| 会话 | 该 DM 的当前会话 | cron 的新会话，不带闲聊记录 |
| 投递 | 回复到当前消息 | 投递到 `/sethome` 指定的 Telegram 对话 |
| 习惯从哪来 | 会话开始时的 `USER.md` 快照，加上本会话里已经说过的话 | 任务启动时重新读取 `USER.md`，并挂上 `orithopos` Skill |
| 数字来源 | Orithopos HTTP | Orithopos HTTP |

`USER.md` 在会话开始时注入系统提示，会话中途写盘不会改写这份已经注入的快照。当前对话仍遵守用户刚说的话，因为原话在会话记录里。cron 每次都是新会话，所以次日早报读到的是已经落盘的习惯。

运行 Hermes 的主机时区设为 `Australia/Sydney`，使 cron 的钟点与营业日一致。

---

## 4. 身份绑定

Telegram 账号和 Orithopos 用户是两套身份。没有绑定之前，Agent 只做引导，不查任何经营数据。Gateway 保持默认拒绝：只把该店主的 Telegram 用户 ID 放进允许名单。群聊不查数。

每人一份 profile。绑定信息放在该 profile 的 `MEMORY.md`（环境事实，不是喜好）：

```text
orithoposUserId
orithoposUsername
outletId              来自登录成功时的用户信息，之后以 /api/auth/me 为准
displayName
telegramUserId
pairedAt
```

令牌放在该 profile 的 `.env`：

```text
ORITHOPOS_REFRESH_TOKEN     只放 .env
ORITHOPOS_BASE_URL
TELEGRAM_BOT_TOKEN          该 profile 专用；两份 profile 不共用同一个 Bot token
```

访问令牌由 Orithopos 工具进程在内存里缓存。约 2 小时过期后用刷新令牌换新。模型看不到这两枚令牌。

配对方式：

1. 用户在 POS 已登录的设置里生成一次性配对码（建议 10 分钟有效、单次使用）。
2. 管理员已经为该用户建好 profile、拉起 Gateway，并把用户的 Telegram ID 写入允许名单。
3. 用户在 Telegram 发送 `/pair <配对码>`。
4. Hermes 用配对码向 Orithopos 交换该用户的访问令牌和刷新令牌，写入 `.env` 与 `MEMORY.md`。
5. 用户在这个私聊里发送 `/sethome`，之后的 cron 都投递到这里。
6. 回复已绑定的姓名、用户名和当前门店，请用户确认。

配对码交换接口是 Orithopos 需要新增的唯一写入口，它只签发令牌，不改业务数据。在该接口落地之前，由管理员把已有刷新令牌写入该 profile 的 `.env` 完成试点。密码不要出现在 Telegram 对话里。

之后每次调接口：

1. Orithopos 工具从本 profile 的 `.env` 读取刷新令牌。
2. `POST /api/auth/refresh` 取得访问令牌。访问令牌约 2 小时，刷新令牌约 14 天。
3. 请求带 `Authorization: Bearer <access>`。
4. 收到 `40100` 时刷新一次再试。刷新失败则告诉用户重新配对，不要换另一个 profile 的令牌顶上。

门店以令牌里的 `outletId` 为准。用户在话里报出另一个门店编号时，Agent 不把它写进查询条件。现有日报接口使用登录用户的当前门店；要看别的店，先在 Orithopos 里切换该用户的门店，或等以后的授权门店参数落地后再放开。毛利、成本只在令牌含 `perm:ai.report.cost`（或管理员）时才向接口索取。`USER.md` 里写了「想看毛利」也不能越权。

解绑是 `/unpair`：调用 `POST /api/auth/logout` 作废刷新令牌，删掉 `.env` 里的刷新令牌。`USER.md` 保留，便于同一人再次配对时恢复。同时暂停该 profile 的 cron。

---

## 5. 交互问数

用户在 Telegram 里提问后，Hermes 在该 profile 上跑一轮：

```text
收到消息
  → 确认发送者在允许名单里，且本 profile 已绑定
  → 系统提示里已有会话开始时的 USER.md
  → 问数时加载能力 Skill orithopos
  → 按 USER.md 和本会话里的原话决定口径
  → 调用 Orithopos 工具
  → 只用响应里的数字组织回复
  → 发回 Telegram
```

问题落在哪类接口：

| 用户在说什么 | 调用 |
|---|---|
| 今天 / 昨天 / 本周 / 上周 / 本月 / 上月卖了多少 | `GET /api/reports/daily-sales` 等固定报表 |
| 自由问句：滞销、客单、某品类销量、某段时间对比 | `POST /api/ai/assistant`，`question` 用用户原话，`threadId` 用 `tg:<telegramUserId>` |
| 某商品库存、价格、销量履历 | `GET /api/products`、`GET /api/products/{id}/inventory`、`GET /api/products/{id}/sales` |
| 这瓶酒配什么、怎么介绍 | `POST /api/ai/sommelier/recommend`、`/pitch`、`/ask` |
| 补货建议看一眼 | `GET /api/supply-chain/plan`（只展示，不调用接受、拒绝或生成采购草稿的写接口） |

`POST /api/ai/assistant` 返回的 `answer` 和 `table` 是回复素材。其中的 `ui` 动作（打开搜索、跳转页面）在 Telegram 里没有落点，忽略即可。若响应带 `reportId`，回复里说明店内可在报表快照页打开同一份结果，Telegram 侧只展示表格摘要。

统一响应信封是 `{ code, message, data }`。`code = 0` 才读 `data`。非 0 时把 `message` 告诉用户。问数被拒绝（无 `perm:ai.report.query`、配额用尽、SQL 防护拒绝）时原样转述，不改口重试出另一套数字。

回复习惯：

- 金额是含 GST 的货架价口径，货币为澳元。
- 写明营业日或接口返回的日期范围。
- 表格在 Telegram 里用短列表，行数多时只给前几行并说明总数。
- `USER.md` 要求简短时，先给结论，明细等用户追问再展开。

---

## 6. 定时推送

推送由该 profile 的 cron 触发。任务用 `cronjob` 创建，挂上 `orithopos` Skill，在新会话里执行，再投递到 `/sethome` 的对话。`deliver` 设为 `telegram`。

默认日程（可被用户改掉），时区 `Australia/Sydney`：

| 任务 | 默认时刻 | 内容 |
|---|---|---|
| 早报 | 营业日 08:30 | 昨日销售额、与上周同日对比、低库存条数 |
| 店务提示 | 营业日 18:00 | 当日销售节奏、补货计划里待处理的行数 |

早报对应的数据是「已经切日之后的昨日」。营业日按悉尼时间切，不使用 UTC 的日历日。

每条推送带稳定标识，方便后面的反馈对上原消息：

```text
pushId        例如 morning-2026-10-10
kind          morning | close | 用户自定义
period        营业日起止
outletId
```

消息末尾请用户表态，例如：

```text
昨日营业额 $12,480（含 GST），比上周同日 +6%。低库存 3 个 SKU。

直接回复：有用 / 没用 / 以后少发这类 / 以后多发这类，或说想改的地方。
```

用户把某类推送关掉、改时间或改内容时，Agent 做两件事：用 memory 工具改 `USER.md` 里的日程说明，并用 `cronjob` 改对应任务的钟点或暂停它。`USER.md` 是用户能看见的习惯；cron 是它的执行面。

安静时段写在 `USER.md` 里。任务提示要求：当前时间落在安静时段时不发送。cron 跑在独立会话里，不占用用户正在进行的问答。

推送失败（令牌失效、接口 5xx）时发一条短失败说明，不补猜数字。连续失败则暂停该任务，直到重新配对成功。cron 遇到需要命令审批的操作时保持拒绝（`approvals.cron_mode: deny`）。

---

## 7. 反馈

反馈是习惯的输入，不是另一套报表。

### 7.1 什么算反馈

- 回复某条推送或某条回答，并表达好恶、频率、时段、详略、指标取舍。例：「别再推滞销」「早上只要销售额」「英文短一点」「毛利留到我追问时再说」。
- 对同一类问题反复主动追问。这是弱信号，先记候选，不立刻改写 `USER.md`。

新的经营问题（「那红酒呢」）按第 5 节作答，同时可以记一条「用户关心红酒」的弱信号。

### 7.2 记到哪里

Hermes 把习惯分成两处，本方案沿用这个分工：

| 存储 | 路径 | 放什么 | 何时进入上下文 |
|---|---|---|---|
| 用户习惯 | `memories/USER.md` | 语言、详略、指标、对比、订阅、安静时段、早报钟点 | 每次会话开始时注入，上限约 1,375 字符 |
| 环境事实 | `memories/MEMORY.md` | 已绑定的用户、门店显示名、API 基址 | 每次会话开始时注入 |
| 取数步骤 | `skills/orithopos/SKILL.md` | 工具名、信封、营业日、失败时怎么说 | 问数或 cron 挂载该 Skill 时加载 |
| 反馈原文 | `feedback/orithopos-feedback.jsonl` | 只追加的审计 | 巩固任务读取，不注入日常会话 |

偏好写进 `USER.md`，这样每次问答和每次早报都会带上，不必等模型判断要不要加载某个 Skill。`USER.md` 写满时，memory 工具会报错；Agent 在同一轮里合并重复条款后再写。过长的操作步骤留在能力 Skill，不占用这 1,375 字符。

每次明确反馈追加一行：

```json
{
  "at": "2026-10-11T08:41:00+11:00",
  "telegramUserId": "10001",
  "pushId": "morning-2026-10-10",
  "target": "morning",
  "signal": "explicit",
  "polarity": "less",
  "utterance": "早上不要滞销，只要销售额和低库存"
}
```

`signal` 为 `explicit`（明确指令）或 `implicit`（反复追问）。`polarity` 为 `up`、`down`、`more`、`less`，或自由文本无法归类时的 `note`。

侍酒场景若对应到具体商品，额外调用 `POST /api/ai/sommelier/feedback`，让店内推荐模型留下反应。这和 `USER.md` 是两条记录：前者服务店内推荐，后者服务这个人在 Telegram 里想怎么被说话。

### 7.3 当次就落盘

明确反馈在回复用户之前写入 `USER.md`：

1. 解析出要改的条款（指标、对比基准、时段、语言、详略、安静小时、订阅开关）。
2. 调用 memory 工具，替换 `USER.md` 里对应的条目。
3. 若钟点或开关变了，同时用 `cronjob` 修改或暂停任务。
4. 用一句话确认，例如：「以后早报只含昨日销售额和低库存，不再附滞销。」

同一条消息里既有反馈又有新问题：先写 `USER.md`，再回答那个问题。回答依据是会话里的原话；`USER.md` 的新内容从下一次新会话和之后的 cron 开始注入。

用户说「改回去」时，按反馈日志里的上一条明确指令重写 `USER.md`，并把 cron 调回那一条里的日程。

`memory.write_approval` 对本方案保持关闭，明确反馈才能当轮落盘。`skills.write_approval` 保持打开：后台复盘若要新建或修改 Skill，先在 Telegram 里等用户批准。能力 Skill 的文件权限设为进程只读，`skill_manage` 改不到它。

### 7.4 长期巩固

Hermes 在回合之后会做后台复盘，把反复出现的纠正收成记忆。本方案用它处理弱信号，并加一条每周 cron（默认周一 07:00，悉尼时间）阅读反馈日志，整理 `USER.md`：

- 连续出现的明确指令合并成稳定条款，去掉互相重复的句子。
- 与稳定条款矛盾的新明确指令以时间最新的一条为准，旧条款删掉。
- 弱信号要在 14 天内至少出现 3 次，才提升为稳定条款；否则留在「观察到的兴趣」里，不改变推送。
- 条款超过 `USER.md` 的字符上限时，把过期兴趣留在日志里，文件里只留仍在生效的条款。

巩固任务不发明新偏好。它只折叠已经发生的反馈。跑完后若有实质改写，向用户发一条很短的确认，附上「这些是我现在记住的习惯」，用户可以当条回复纠正。Skill 侧的自动改写仍走批准，不能绕过第 7.3 节的开关。

---

## 8. 习惯与能力 Skill

习惯和接口说明必须分开。点赞若能改写接口说明，模型会逐渐偏离真实路径。

### 8.1 能力 Skill `orithopos`（随产品发版）

放在该 profile 的 `skills/orithopos/SKILL.md`，文件对 Hermes 进程只读。内容是工具名、信封、令牌刷新由工具完成、营业日、含税口径，以及「只读、失败就不编数」。用户反馈不修改这份文件。产品升级时由发布流程替换。

`description` 写清触发条件：用户在问销售、库存、客单、滞销、补货或葡萄酒推荐，或 cron 挂上了该 Skill。

`SOUL.md` 写明常驻约束：数字只来自工具响应；不调用终端；不修改 `skills/orithopos`；好恶只通过 memory 工具写入 `USER.md`。

### 8.2 习惯在 `USER.md`（每人一份，随反馈改）

配对成功时写入初始条款。之后只经第 7 节改写。

```text
语言：简体中文
详略：先结论，默认不超过 8 行
对比：昨日销售额对上周同日
关心的指标：销售额、低库存
不推送：滞销清单、毛利（除非用户当次追问且账号有成本权限）
早报：营业日 08:30，悉尼时间，内容仅销售额与低库存
店务提示：关闭
安静时段：22:00–07:30
观察到的兴趣：反复问过巴罗萨红酒（尚未成为稳定条款）
```

这份文件只属于当前 profile。另一位店主的 profile 读不到它。

能力 Skill 决定「能问什么、怎么问才合法」。`USER.md` 决定「这个人想先看到什么、什么时候送到、用多长的话」。两者冲突时，能力 Skill 和 `SOUL.md` 的安全条款（只读、不编数、不越权）保持有效；表达和订阅以 `USER.md` 为准。

---

## 9. 习惯如何进入下一次对话

- 用户刚说完「早报改成只要销售额」，确认发出之后，他在同一条对话里接着问「今天怎么样」。回答按这句原话来，不再附上他刚拒绝的滞销段。此时 `USER.md` 已经落盘，但本会话的系统提示仍是开始时的快照。
- 用户发送 `/new`，或次日 08:30 的 cron 启动新会话时，系统提示重新装入 `USER.md`。早报内容与对话里的承诺一致。
- 用户换一种说法问到习惯里标成「不推送」的主题时仍然作答，因为这是当次请求。习惯约束的是默认推送和默认展开，不是禁问。

建议在每个营业日开始时用 `/new` 切开 Telegram 长会话。否则一条对话会跨很多天，记忆快照不刷新，上下文也越来越长。cron 本身已经是新会话，不依赖这次 `/new`。

弱信号不改变默认推送。Agent 可以在回答末尾轻量跟上一次相关建议（「你这周问了三次巴罗萨，要不要把产区销量放进早报？」），用户同意后才升成明确反馈并写入 `USER.md`。

---

## 10. Orithopos 侧接口

### 10.1 现在就能用

| 用途 | 方法与路径 |
|---|---|
| 登录身份 | `GET /api/auth/me` |
| 刷新令牌 | `POST /api/auth/refresh` |
| 解绑作废 | `POST /api/auth/logout` |
| 日 / 周 / 上周 / 本月 / 上月销售 | `GET /api/reports/daily-sales`、`/weekly-sales`、`/last-week-sales`、`/this-month-sales`、`/last-month-sales` |
| 自然语言问数 | `POST /api/ai/assistant` |
| 问数快照（需要时核对） | `GET /api/ai/reports/{id}` |
| 商品与库存、销售履历 | `GET /api/products`、`/api/products/{id}`、`/inventory`、`/sales` |
| 侍酒 | `POST /api/ai/sommelier/recommend`、`/pitch`、`/similar`、`/ask`，`GET /identify`、`/wines/{id}` |
| 侍酒反馈 | `POST /api/ai/sommelier/feedback` |
| 补货计划只读 | `GET /api/supply-chain/plan` |

这些接口已经要求登录。问数沿用现有门店隔离和 SqlGuard。Hermes 不连接数据库，也不生成 SQL。

工具以 MCP 形式接在 profile 上。工具名与上表一一对应，令牌从 `.env` 注入，不作为模型参数。采购决策、改价、库存调整、结账、作废不在工具清单里。

### 10.2 需要补的接口

| 接口 | 作用 |
|---|---|
| `POST /api/agent/pair` | 用一次性配对码换访问令牌和刷新令牌。配对码在已登录的 POS 里签发 |
| `POST /api/agent/pairing-codes` | 当前登录用户签发配对码 |

日报若总是要「昨日 + 上周同日 + 低库存条数」，Agent 可以在一期里自己调现有接口拼出来。等推送稳定后，再考虑一个只读的 `GET /api/agent/digest?kind=morning`，把早报口径收进 Orithopos，避免 Gateway 和店内报表各算一遍。该接口仍然只返回聚合结果，不接受调用方传入的 SQL 或任意门店编号。

---

## 11. 安全

- 一个 profile、一个 Bot token、一个 Telegram 允许用户、一个 Orithopos 用户。群聊不查数。
- 工具调用使用该 profile 绑定用户自己的令牌，因此权限、门店和问数配额与他在店内登录时相同。
- profile 关闭终端、任意文件写入和代码执行。`approvals.cron_mode` 与无人值守模式保持拒绝。
- `skills.write_approval` 打开。能力 Skill 文件只读。
- `USER.md`、`MEMORY.md` 和反馈日志可以含指标偏好和绑定关系，不含令牌、密码、银行卡或顾客隐私明细。推送里的顾客信息保持接口原本的聚合粒度。Hermes 的密钥脱敏保持开启。
- Gateway 与 `pos-api` 之间走 TLS。生产环境的 `CORS` 与此无关，Agent 是服务器到服务器调用。
- 反馈日志在本 profile 目录内。巩固任务只读这份日志。

再增加一位店主时，新建一份 profile 和一枚 Bot token，不往现有 profile 的允许名单里加人。Profile 分开的是记忆和令牌；它还不等于操作系统级隔离。网关进程不要和收银主机上的业务文件放在同一个可写目录里。

---

## 12. 分期

### 第一期：问得动、推得出

- 钉住 Hermes 的一次发布版本，建一份试点 profile。
- 装上只读的能力 Skill，接上 Orithopos MCP，关掉终端。
- 一个试点用户完成绑定（配对码接口未就绪时，由管理员写入刷新令牌），并在私聊里 `/sethome`。
- Telegram 问答接通固定报表和 `POST /api/ai/assistant`。
- 一条早报 cron，挂上 `orithopos` Skill，投递到该私聊。
- 反馈先写入 jsonl，并手工可见。

### 第二期：习惯闭环

- 配对码接口。
- 明确语句在回复前写入 `USER.md`，并同步 cron。
- 早报任务在新会话里读取 `USER.md` 再取数。
- `/unpair`，以及按反馈日志回退上一条习惯。

### 第三期：长期习惯

- 每周巩固 cron，后台复盘只负责弱信号。
- 弱信号升级前先征得同意。
- 每位店主各持一份 profile。
- 视重复查询的成本，再加 `GET /api/agent/digest`。

---

## 13. 验收

- 未绑定或未在允许名单中的 Telegram 用户询问销售额时，不产生任何 Orithopos 业务请求。
- 绑定用户问「昨天卖了多少」，回复中的金额与同一账号调用 `GET /api/reports/daily-sales` 一致，并写明营业日。
- 接口返回非 0 时，Telegram 中出现错误说明，回复里没有估算数字。
- 早报在设定的悉尼时间送达 `/sethome` 的对话，内容字段全部来自当次接口响应。
- 用户对早报回复「以后不要滞销，只要销售额」。同一条对话里的下一句不再默认包含滞销；`USER.md` 在回复前已经改掉。下一次 `/new` 和次日早报注入的是这份新习惯。
- 用户 A 的 `USER.md` 不会出现在用户 B 的 profile、问答或推送中。
- 无成本权限的用户，即使 `USER.md` 里写了毛利，推送和问答也不出现成本或毛利。
- 要求模型修改 `skills/orithopos/SKILL.md` 或执行终端命令时，写入和命令都不发生。
