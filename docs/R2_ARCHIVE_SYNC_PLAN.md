# R2 Shopfront 归档同步到 Orithos 的实施计划

更新时间：2026-10-16

## 当前决定（2026-10-16）

- **Demo 全量历史导入已完成（`aipos` TEST）：** [`UAT_R2_SALES_ODOO_IMPORT_FULL.json`](UAT_R2_SALES_ODOO_IMPORT_FULL.json) `imported=141083` / `rejected=2119` / `errors=0`；[`UAT_R2_SALES_ODOO_IMPORT_STOCK_RESET.json`](UAT_R2_SALES_ODOO_IMPORT_STOCK_RESET.json) reconcile 3844 quants。汇总 [`UAT_R2_SALES_IMPORT_COMPLETE_2026-10-16.json`](UAT_R2_SALES_IMPORT_COMPLETE_2026-10-16.json)。Reject 别名 backlog：[`UAT_R2_SALES_REJECT_ALIAS_BACKLOG_2026-10-16.json`](UAT_R2_SALES_REJECT_ALIAS_BACKLOG_2026-10-16.json)。
- **冷历史策略：** 生产租户不以 R2 全量历史灌入 Odoo；规则见 [R2_COLD_HISTORY_POLICY.md](R2_COLD_HISTORY_POLICY.md)。隔离库写交易 UAT 见 [ISOLATION_ODOO_UAT_RUNBOOK.md](ISOLATION_ODOO_UAT_RUNBOOK.md)。
- **多店 R2 前缀：** 主前缀仍用 `R2_PREFIX`；额外活跃店用 `R2_PREFIXES`（逗号分隔），镜像到 `/data/tenants/{slug}/`。见 [SCALE_OPS_RUNBOOK.md](SCALE_OPS_RUNBOOK.md)、[ATTACHMENT_STORAGE_POLICY.md](ATTACHMENT_STORAGE_POLICY.md)。
- 行项目按商品名映射 `R2-{source_id}`；无日期小票用 `--fallback-date`。班次仍 `orithos_store1/00004`；关班另迭代。
- R2 文件归档仍只供管理员开发验证；暂不每日同步。SQLite SHA-256 `2fc62e86…6625116`；4,716 商品在 `R2 TEST DATA`。Odoo 仍只有 `aipos`，正式业务前需迁库或生产初始化。

## 历史决定（2026-10-14，已被上方 demo 销售导入决定部分覆盖）

- R2 只供当前管理员开发和功能验证；暂不每日同步，正式上线也不依赖 R2。管理页保持手动同步状态，本轮没有触发同步。
- 去重后的 4,716 个商品源 ID 已导入当前 `aipos` 的 `R2 TEST DATA` 分类。1,089 个正库存商品合计 46,575.33；1,060 个负库存值归零并标 MOCK；32 条历史版本重复行按最新记录处理。旧 DEMO 已停用，**当时**历史收据/客户未导入（2026-10-15 起收据改为正式 `pos.order` 导入）。
- 4,572 条售价来自 R2；144 条缺价按成本倍数/中位成本回退并标 `MOCK_COST_FALLBACK`。DashScope 调用因 TLS 失败未完成。113 条缺失/非标准税率映射 MOCK 10%。这些数据仅供当前开发，不是正式价目表/税务配置。
- 用户允许 MOCK 测试数据，但 Odoo 仍只有 `aipos`，未建独立 staging。公司已配置为 TEST 模拟门店；正式业务启用前需迁到独立测试库或完成生产初始化。

## 历史检查（2026-10-14 20:05，上海时间；每日同步决定已由顶部当前决定取代）

- 生产 R2 已成功配置并完成首轮自动同步：`configured=true`、`state=success`、`reason=initial`；2026-10-14 22:33:56 `Australia/Adelaide` 完成，快照含 6 个文件，SQLite `quick_check=ok`。SQLite 对象大小 250,114,048 字节；manifest、4 份 CSV 报表和数据库均记录了 SHA-256。下次计划为 2026-10-15 03:30 `Australia/Adelaide`。见 [R2 生产 UAT](UAT_R2_ARCHIVE_2026-10-14.json)。
- 首轮成功证明线上某套 R2 凭据可用，但不能核实其是否已轮换聊天中曾公开的旧 key；请确认旧 key 已撤销。当前工作区根 `.env` 仍未发现 R2 变量（仅核对变量名/是否非空），而 Dokploy 线上状态已 configured；确认本地配置文件路径为 `orithopos-master/.env`。
- 代码已补 worker 镜像 `tzdata` 并取消时区缺失时静默 fallback UTC；同步失败状态 UI/API 显示安全的 `nextAttemptAt`。这些改动已推送，Dokploy 精确部署 SHA 仍未核实；本地未 build。
- 本轮首次匿名状态请求曾短暂返回 502，立即复测后恢复为预期 401；需要观察这是否与 Dokploy 自动部署窗口有关。
- **仍未把归档内容变成 POS 业务数据/页面**：当前状态卡只列文件名/大小/hash。我们还没有读取 manifest 的实际校验结构，也没有核对数据库 schema/CSV 字段，因此不能映射为商品、库存或销售数据。下一步先安全提取 schema/manifest 元数据并评审只读展示的数据口径，再做 POS 报表页面；不直接写 Odoo。

### 历史每日拉取验收（当前已改为按需手动同步）

1. 保持 Compose `shopfront-archive` 卷不变，不选择 Fresh Volume；为当前快照（两份保留）和 staging 留够磁盘空间（单快照限制 2 GiB）。
2. 等 2026-10-15 03:30 Adelaide 计划周期结束，确认下一次成功时间、新快照 ID、文件哈希和 SQLite `quick_check=ok`；之后再确认第三个周期或至少重启后快照仍在，才能称日常任务稳定。
3. 核对上游 02:30 的时区/结束时间；当前已设 Adelaide 03:30，但两者关系尚未由上游运行时证据证实。



## 目标

每天从 Cloudflare R2 私有存储拉取 Shopfront 的 SQLite 快照、稳定报表和 manifest，使 Orithos 能查看同步状态，并在明确数据语义后为后续分析提供受控数据源。

## 已知上游

- 数据桶：`generate-image`
- SQLite 固定对象键：`shopfront/shopfront.sqlite3`（用户报告约 250 MB）
- 报表对象位于 `shopfront/`，并由 `shopfront/manifest.json` 描述
- 上传方每日约 02:30 更新；首份归档已上传，并校验过大小及 SHA-256
- 对象是私有的；`r2.dev` HTTP 域名曾返回 403。下载必须通过 S3 兼容 API 和凭据完成，不开放公开 URL
- R2 凭据只放 Dokploy secret/environment，不写仓库、日志、交接文档或前端变量。已在聊天中明文共享的密钥建议轮换后再用于长期任务

## Orithos 边界

Odoo 是 Orithos 当前商品、库存、客户、采购、销售和 POS 班次的唯一业务事实源。Shopfront SQLite 是独立来源，尚未核对表结构、字段语义、门店范围、时区和数据授权范围。因此首阶段只做**隔离的私有归档镜像**，绝不写入 Odoo 或 Orithos 交易表，也不把该快照呈现成当前库存/价格。

如需商品或库存进入 Odoo，必须先完成字段映射、主键/条码冲突检查、价格/GST/包装单位核对、门店与库存位置映射，并通过预览/人工确认导入；不能把整库覆盖到现有业务库。

## 已实现能力与生产实测边界

- 已增加独立 Python worker，凭据只注入 worker；缺少凭据时 worker idle，后端不接触 R2 密钥。
- worker 默认在 Australia/Adelaide 每日 03:30 拉取（需确认上传任务时区）；缺少当前快照时启动即执行首轮下载。
- 拉取 `shopfront/` 下稳定对象，排除临时对象；下载前后核对 ETag/长度、计算 SHA-256，并运行 SQLite `PRAGMA quick_check`。快照全部验证后原子切换 `CURRENT`，保留最近两份；失败保留旧快照。
- 归档与 MySQL/Odoo 分离，使用独立 Docker 持久卷；后端只读查看状态，管理员可触发手动同步。
- 设置集成页已增加同步状态卡片、最近成功/下次计划、SQLite 完整性、对象大小/哈希及手动触发。尚未提供 SQLite 任意查询/下载，之后应先盘点 schema，再实现有限的只读业务视图。
- 已核对 Cloudflare R2 的 boto3 S3 接入方式；worker 使用服务端 S3 API，不用曾返回 403 的公开 HTTP 域名。

## 当前状态与待办

- R2 worker、管理员状态/触发 API、集成页和独立 `shopfront-archive` 持久卷已在应用架构中。生产最近一次只读 UAT 实测 configured=true / success，首轮同步 6 个对象且 DB quick_check=ok。UAT 记录源代码 SHA；Dokploy 精确部署 SHA 尚未核实。
- 当前根目录 `.env` 没有 R2 配置键（只检查键名和是否非空）；线上运行凭据已可用。凭据不得进入 Git、前端、UAT、日志或聊天。旧 key 是否轮换仍待用户确认。
- worker 镜像已提交 `tzdata` 安装和时区配置 fail-fast；controller/UI 已提交安全返回并显示 `nextAttemptAt`。需通过 Dokploy 日志/部署详情确认这些提交对应的新镜像已完成部署。
- 首轮成功快照时间、6 个文件名/大小/SHA-256、Adelaide 时区、03:30 下次计划和 SQLite `quick_check` 见 UAT。还需等下一计划周期，验证定时触发产生新快照；另外检查普通容器重启/部署后命名卷中的 CURRENT 和快照仍在。
- worker 没有解析 manifest 的内部 checksum 结构；目前通过 S3 ETag/大小、独立 SHA-256 和 SQLite quick_check 验证。首次成功后需审阅 manifest 实际字段，再补上 manifest checksum 对照（若其中提供）。
- 归档不向 POS 业务页面提供 CSV/SQLite 查询，未把 Shopfront 销售/库存更新到 POS 或 Odoo。需要后续只读 schema/字段盘点、权限和门店时区映射，再决定报告页；任何业务导入另行评审。
- 上传方声称约 02:30，时区和任务完成时间未核实；当前调度是 03:30 Australia/Adelaide。需确认是否留有充分缓冲。

## 验收标准

- 连续两个计划周期成功下载固定对象键；下载大小和 SHA-256 被记录，manifest 文件同步且哈希可核对。若 manifest 提供对象 checksum，须与该 checksum 一致。
- 进程中断/校验失败时，旧快照仍可读且状态明确失败；并发运行不会覆盖有效文件。
- 重启/普通 Dokploy 部署后，归档和状态仍保留；没有使用 Fresh Volumes。
- 未登录用户无法读取状态或数据；R2 凭据不出现在浏览器 bundle、响应、日志或 Git 历史。
- 与 Odoo 的商品/库存/交易无写入；任何后续导入独立评审并先做可审阅预览和回滚验证。
