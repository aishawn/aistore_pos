# AI 库存预测研发模式

## 结论

开发预研阶段不需要等待未来 28 天的实时库存。历史快照中的后续日期可以作为“相对于历史预测起点的未来”，用于严格的 walk-forward 回测；当前日期之后则没有真实库存观测，只能使用前向模拟。

两种模式的语义不同，不能混为一谈：

| 模式 | 输入 | 未来库存观测 | 用途 |
| --- | --- | --- | --- |
| `HISTORICAL_WALK_FORWARD` | 历史销量和历史库存序列 | 只用于评分，不进入输入 | 验证预测质量、缺货预警召回、库存 MAE |
| `READ_ONLY_FORWARD_SIMULATION` | 截至 `asOfDate` 的销量、当前库存、在途和约束 | 不需要 | 预研演示、当前经营决策、没有未来标签时的线上形态 |

## 历史回测

调用 `POST /v1/backtest/inventory`。例如将 2026-08-31 作为起点：

- 2026-08-31 及之前的数据是模型可见输入；
- 2026-09-01 起的 7/14/28 天库存是历史 holdout 标签；
- holdout 的真实库存只在模拟完成后用于计算 MAE、stockout recall 和 service level；
- 未来收货不会自动注入模拟余额，除非在起点时已经是已知在途。

因此，历史数据完全可以用来验证“未来库存”，但它验证的是历史时点的未来，不是把今天之后的未知库存伪装成真实值。

## 当前日期前向模拟

调用 `POST /v1/forecast/inventory/simulate`。请求只包含截至最后一个 `dates` 日期的数据：

```json
{
  "vendorId": 1,
  "outletId": 10,
  "horizonDays": 14,
  "sourceVersion": "skr-snapshot-2026-11-01",
  "items": [
    {
      "productId": 123,
      "dates": ["2026-10-05", "2026-10-06"],
      "units": [3, 5],
      "onHand": 24,
      "onOrder": 12,
      "leadTimeDays": 3,
      "safetyStockDays": 2
    }
  ]
}
```

服务先预测未来销量，再用库存余额公式推演未来库存。响应状态是 `READ_ONLY_FORWARD_SIMULATION`，并明确 `futureObservationsUsedAsInput=false`。返回的 `projection` 是计划模型结果，不是 Odoo 实际库存观测；页面必须使用“预计库存”或“模拟库存”标签。

## 研发阶段建议

1. 用 SKR 固定快照运行多个历史 origin，比较 7/14/28 天 WAPE、库存 MAE 和缺货召回。
2. 用最近一次已知库存运行前向模拟，作为经营界面和补货建议演示。
3. 每天生成新的只读快照后，旧快照不覆盖，绑定 `sourceVersion`，这样可以重现模型结果。
4. 当新的真实库存日快照到达后，把这段时间转为新的历史 holdout，更新回测；不要在实时预测请求中等待它。
5. 在库存来源仍是 Odoo `qty_available(to_date)` 重建值时，结果标为研究用途。只有获得独立盘点或可靠库存事件流水后，才考虑生产自动补货。

## 边界

- 预测模型只能使用起点以前的数据。
- 未来销售和库存都不能作为实时预测输入。
- 在途采购只有在起点时已确认才可进入模拟。
- 缺失库存、供应商或在途数据不能填零，应返回低置信度或 `INCOMPLETE_DATA`。
- 该接口只读，不会写入 Odoo，也不会改变 `AI_COMMANDS_EXECUTION_ENABLED`。
