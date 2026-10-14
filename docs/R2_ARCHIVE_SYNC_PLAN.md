# R2 Shopfront 归档同步到 Orithos 的实施计划

更新时间：2026-10-14

## 最新检查（2026-10-14 20:02，上海时间）

- 重新检查当前仓库根目录 `.env`（只查看变量名和是否非空，没有读取值）：没有配置 `R2_ENDPOINT`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` 等 R2 变量；`v1/.env` 不存在。请确认你配置的是 `orithopos-master/.env`，但生产仍必须在 Dokploy Compose Environment 独立配置。仓库 `.env.example` 已列出全部必要变量。
- 已发现并修正 worker 镜像的时区可靠性：Alpine worker 镜像显式安装 `tzdata`；若配置时区不可用，worker 现在会明确失败，不再静默退回 UTC。此前静默回退可能导致日程按错误时区执行。
- 已补齐同步失败的运维反馈：管理员状态 API 允许安全返回 `nextAttemptAt`（仅时间字段），状态卡会显示自动重试时间；无自动重试时提示检查 worker 配置，不暴露 R2 凭据。
- 源码改动尚未部署；本轮没有本地 build。推送后需在 Dokploy 确认 worker 镜像重建和服务正常，再做线上验收。
- 现有功能仍只是私有归档镜像。仓库中未发现 Shopfront `manifest.json` 样本，且尚无成功下载的 SQLite；因此还不能核对真实 manifest 校验字段或数据库 schema，也不能把归档数据展示成 POS 商品/库存/销售数据。

### 启用每日拉取的必要配置与验收

1. 轮换聊天里暴露过的旧 key；仅把新 key 放进 `orithopos-master/.env` 的本地私密配置和 Dokploy Compose Environment。必须设置 `R2_ENDPOINT`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`；其余使用 `R2_PREFIX=shopfront/`、`R2_DATABASE_KEY=shopfront/shopfront.sqlite3`、`R2_MANIFEST_KEY=shopfront/manifest.json` 默认值即可。
2. 确认 `R2_SYNC_TIMEZONE`、`R2_SYNC_HOUR`、`R2_SYNC_MINUTE` 与上传任务时区和完成时间相符。当前默认每日 03:30 Australia/Adelaide；上游“02:30”时区尚未确认。
3. Dokploy 保留现有 `shopfront-archive` 持久卷，禁止 Fresh Volume/重置卷。单个快照上限 2 GiB、保留至少两份，下载 staging 会额外占用空间；主机磁盘应预留足够容量。
4. 部署后等 `/api/r2-archive/status` 显示 configured，再手动触发首轮同步。核实 manifest、文件数量/大小/SHA-256、SQLite `quick_check=ok`、状态时区为 Adelaide；检查失败时旧快照保留。
5. 验证容器重启/普通部署后快照仍在，再观察连续两个计划周期成功。完成前不要称为每日同步已启用。
6. 若要让老板在 POS 页面使用 Shopfront 数据，先只读盘点 SQLite schema、门店/时区、商品/库存/销售字段和权限；再设计独立只读报表或经过人工审阅的 Odoo 导入映射。当前没有这层数据读取/业务映射，不能通过配置 key 自动实现。


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

## 已实现并部署（实际 R2 下载待配置验证）

- 已增加独立 Python worker，凭据只注入 worker；缺少凭据时 worker idle，后端不接触 R2 密钥。
- worker 默认在 Australia/Adelaide 每日 03:30 拉取（需确认上传任务时区）；缺少当前快照时启动即执行首轮下载。
- 拉取 `shopfront/` 下稳定对象，排除临时对象；下载前后核对 ETag/长度、计算 SHA-256，并运行 SQLite `PRAGMA quick_check`。快照全部验证后原子切换 `CURRENT`，保留最近两份；失败保留旧快照。
- 归档与 MySQL/Odoo 分离，使用独立 Docker 持久卷；后端只读查看状态，管理员可触发手动同步。
- 设置集成页已增加同步状态卡片、最近成功/下次计划、SQLite 完整性、对象大小/哈希及手动触发。尚未提供 SQLite 任意查询/下载，之后应先盘点 schema，再实现有限的只读业务视图。
- 已核对 Cloudflare R2 的 boto3 S3 接入方式；worker 使用服务端 S3 API，不用曾返回 403 的公开 HTTP 域名。

## 当前状态与待办

- R2 worker、后端管理员状态/触发 API、集成页卡片已部署；最新生产部署 `05dffdb`。本轮未做本地 build。
- 最新生产 UAT 6/6：匿名 GET `/api/r2-archive/status` 为 401；管理员 API 返回 `configured=false, state=not_configured`，未暴露密钥字段；390px 和 1440px 页面无横向溢出；未触发同步。证据：[UAT_R2_ARCHIVE_2026-10-14.json](UAT_R2_ARCHIVE_2026-10-14.json)。
- 用户提到的上游 `r2_sync.py`、`run-daily.ps1` 和 Shopfront 工作目录位于另一台机器/路径，本工作区不可用；当前项目只能消费 R2 对象，不能复用上游本地文件。
- 仍需在 Dokploy 配置 `R2_ENDPOINT`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`。生产状态当前 `configured=false`；本机 `.env` 也没有这些变量。聊天中共享的密钥建议轮换后再填入 Dokploy；不得写入 Git、应用日志或前端变量。
- 默认目标为私有只读归档镜像；商品/库存/销售绝不自动导入 Odoo。
- 上游计划为 02:30；代码默认 03:30 Australia/Adelaide，必须确认上传任务时区和结束时间后再最终设定。
- 尚待首轮 R2 成功同步、连续两个计划周期、快照/状态重启持久性、非管理员拒绝和上游 schema/报表字段盘点。当前 UAT 已验证匿名用户拒绝。

## 验收标准

- 连续两个计划周期成功下载固定对象键；下载大小和 SHA-256 被记录，manifest 文件同步且哈希可核对。若 manifest 提供对象 checksum，须与该 checksum 一致。
- 进程中断/校验失败时，旧快照仍可读且状态明确失败；并发运行不会覆盖有效文件。
- 重启/普通 Dokploy 部署后，归档和状态仍保留；没有使用 Fresh Volumes。
- 未登录用户无法读取状态或数据；R2 凭据不出现在浏览器 bundle、响应、日志或 Git 历史。
- 与 Odoo 的商品/库存/交易无写入；任何后续导入独立评审并先做可审阅预览和回滚验证。
