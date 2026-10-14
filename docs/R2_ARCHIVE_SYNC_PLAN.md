# R2 Shopfront 归档同步到 Orithos 的实施计划

更新时间：2026-10-14

## 最新状态（2026-10-14 20:00，上海时间）

- 当前源码 HEAD 与 `origin/main` 为 `86840b5cd1094547ca1eb1b353574b75582c0170`。生产浏览器 R2 安全状态专项 6/6；匿名访问被拒，管理员响应不含密钥，但生产仍 `configured=false / not_configured`，快照数为 0。未触发同步。
- Dokploy 会话已过期，本轮无法核实该源码 SHA 的部署状态。
- 用户希望每日拉取后同步到 POS 网站。现实现只把 R2 文件镜像进 Orithos 私有持久卷并显示归档状态；没有将 Shopfront 销售/库存数据写入 POS 或 Odoo，也没有可供 POS 使用的业务映射。
- 下一步：轮换已公开的旧 key；店主在 Dokploy Environment 配置新 key 并部署；确认 `configured=true` 后手动首轮同步并审查文件/SQLite 完整性、重启持久性；随后连续观察两个每日周期。之后对数据库做 schema/门店/时区盘点，定义只读 POS 数据页面与权限，单独验收。


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
