# 库存同步进度

更新日期：2026-11-03。负责人：库存模块 owner 待指定。

## 当前阶段

- 源码：已实现每日完整 Shopfront 库存分页、失败不覆盖、POS 全量镜像推送、Odoo 分批导入后 finalizer，以及 unmatched 失败处理。
- 本地：crawler 45 个相关测试通过（1 个长等待测试单独排除）；Odoo 库存/供应测试 15 个通过。
- GitHub：Odoo `main` 已推送至 `41dab563`。crawler `4fb02f65` 尚未确认推送；GitHub HTTPS 连接超时。
- Dokploy/线上数据：未确认部署，尚未运行线上同步；现存负库存不得据本地测试判断已修复。

## 问题与关闭条件

- `INV-SKR-001`（P0）：Shopfront 库存变化不伴随产品资料更新时间，增量 catalog 使 crawler 镜像滞后。关闭条件：完整分页部署运行成功，并通过来源到 crawler 的逐键和汇总对账。
- `INV-SKR-002`（P0）：Odoo 当前库存与来源总量存在显著差异。关闭条件：完成 source identity、outlet、reservations 和 open operations 审核；获准同步后逐商品验证数量，未匹配/预留冲突形成明确人工清单。
- `INV-SKR-003`（P1）：来源分页快照非原子；多 outlet 到单一 Odoo stock location 的映射需业务确认。关闭条件：记录来源 outlet ID 与 Odoo mapping 的对应关系。

下一步：网络恢复后将 crawler 快进推送到 main 并确认 Dokploy SHA；线上只读检查后再重新确认备份、活动单据和预留量。当前没有执行线上业务写入。
