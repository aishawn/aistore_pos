# 滞销与库存资金占用：设计与实现

更新日期：2026-11-03；代码基线见[基线](../../../baseline.md)。负责人待指定。

## 业务与数据流

公司与仓库范围 → 当前库存和有效单位成本 → 分别读取 30/60/90 天销售 → 无销售候选及有效金额 → 显示范围、排除数量和人工处理提示。不同窗口通常重叠，不能相加。

## 接口与边界

入口：/api/odoo/dead-stock 与库存价值/滞销助手问法。

无销售不等于报废或应降价：季节、新品、停业、目录状态需核对。负库存、无效/不可信成本不能作为可释放资金；只读分析不自动停售、报损、清仓或采购抑制。原始金额可能随后续历史库存修复变化，必须绑定快照。

模型、prompt/config 和线上开关未由本次盘点确认。每轮变更记录版本，不将当前源码默认值回填到旧测试。统一配额、降级和数据契约见[AI 架构](../architecture.md)。

## 代码与原设计

- [route.ts](../../../../../pos-ui/app/api/odoo/dead-stock/route.ts)
- [dead-stock-data.ts](../../../../../pos-ui/src/lib/dead-stock-data.ts)
- [build-dead-stock-cash-report.py](../../../../../scripts/ai-eval/build-dead-stock-cash-report.py)
- [AI_DEAD_STOCK_CASH_OCCUPANCY_UAT_2026-11-03.md](../../../../AI_DEAD_STOCK_CASH_OCCUPANCY_UAT_2026-11-03.md)

## 异常与兼容

遵守现有响应契约和 Odoo 门店权限；缺数据、源过期、源不可用分别说明。恢复或重试不能跨店兜底、重复提交或把未知改为零。发布前核对具体改动的 source/runtime SHA；本文不授予业务写入权限。
