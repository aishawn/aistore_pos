# 库存同步进度

更新日期：2026-11-04。负责人：库存模块 owner 待指定。

## POS 导航与库存列表可用性（2026-11-04）

- 候选源码：Products More 增加受库存查看权限控制的 Stock list 入口；Dashboard 汇总跳库存报表、负库存说明跳异常筛选；Purchases 说明打开订单后确认或收货。
- Stock list 隐藏后端未提供的箱数、成本、利润及价目表数量字段，显示 Odoo 商品单位；商品名/零售价仅对 `stock.products.edit` 用户可编辑。采购收货仍在 Purchases。
- 本地验证与部署状态待本次收尾补记；线上 runtime SHA 未核验。

## 当前阶段

- 源码：已实现每日完整 Shopfront 库存分页、失败不覆盖、POS 全量镜像推送、Odoo 分批导入后 finalizer，以及 unmatched 失败处理。
- 本地：crawler 45 个相关测试通过（1 个长等待测试单独排除）；Odoo 库存/供应测试 15 个通过。
- GitHub：Odoo `main` 已推送至 `41dab563`。crawler `4fb02f65` 尚未确认推送；GitHub HTTPS 连接超时。
- 线上只读：crawler 镜像 10,846 条库存合计 `-256,906`，最晚库存时间停在 `2026-11-02 15:31:49`；Odoo company 5 / location 48 为 10,968 quant、合计 `-1,334,367`。唯一 source ref 映射的 10,573 个商品中 1,631 个数量不一致，绝对差约 `1,009,603` 件。
- 安全门槛：当前有 1 个开启的 POS session 和 1 个触及 location 48 的未完成调拨，故没有执行库存写入。Dokploy runtime SHA 未确认；现存负库存仍未修复。
- 2026-11-04 crawler fixture follow-up：发现同步在商品快照写入后、请求完整库存分页前仍可能持有 SQLite 写事务。候选修复在库存请求前提交商品批次和 run 进度；新回归用例确认请求期间 SQLAlchemy session 没有活动事务。crawler POS import 测试模块 20/20 PASS。线上只读复核：job 40 / run 147 仍为 running、phase `sales:fetched:396`、attempts 6，最后心跳 `2026-11-03T19:10:41Z`，超过 15 分钟 stale threshold；候选修复尚未推送/部署，库存线上状态不变。

## 问题与关闭条件

- `INV-SKR-001`（P0）：Shopfront 库存变化不伴随产品资料更新时间，增量 catalog 使 crawler 镜像滞后。关闭条件：完整分页部署运行成功，并通过来源到 crawler 的逐键和汇总对账。
- `INV-SKR-002`（P0）：Odoo 当前库存与 crawler 镜像存在显著差异。关闭条件：完整 Shopfront 快照部署后完成 source identity、outlet、reservations 和 open operations 审核；业务写入后逐商品验证数量，未匹配/预留冲突形成明确人工清单。
- `INV-SKR-003`（P1）：来源分页快照非原子；多 outlet 到单一 Odoo stock location 的映射需业务确认。关闭条件：记录来源 outlet ID 与 Odoo mapping 的对应关系。
- `INV-SKR-004`（P1）：完整库存分页请求前的商品快照写事务会与 SQLite heartbeat/status 写入竞争。候选修复：SHP-001 session `2026-11-04-shopfront-sqlite-inventory-lock`。关闭条件：候选 SHA 部署后，daily sync 完成完整库存分页和 POS mirror acknowledgement，job heartbeat 持续更新且无 SQLite contention，最后对账 source/crawler/POS 库存键与数量。

下一步：网络恢复后将 crawler 快进推送到 main 并确认 Dokploy SHA；实时读取 Shopfront 完整快照。待 POS session 与调拨结束后重新确认备份和预留量，再按 source ID 执行库存修复。当前没有执行线上业务写入。

毛利同步集成候选：合并远端8b6eabb3后修复无job_id手动同步读取未初始化job的问题，既有历史任务事件顺序回归覆盖；整轮crawler测试48 passed、27 warnings。未触发库存回写，不改变原线上FAIL/写入BLOCKED状态。
