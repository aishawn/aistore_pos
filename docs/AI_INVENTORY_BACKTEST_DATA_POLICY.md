# AI 库存预测与回测数据口径

## 结论

未来日期没有真实库存观测，这是正常的。预测服务不应要求未来库存作为输入。

系统使用两条严格分开的路径：

1. **运营投影**：读取今天/当前时刻的真实 `onHand`、已确认在途 `onOrder` 和未来需求预测，计算未来库存轨迹。接口是 `POST /v1/forecast/inventory`。
2. **历史回测**：在历史某个截点只读取该截点之前的数据，模拟未来库存；历史截点之后的真实库存只用于评分。接口是 `POST /v1/backtest/inventory`。

回测响应中的 `futureObservationsUsedAsInput` 必须始终为 `false`。这不是缺数据，而是防止 look-ahead bias 的必要约束。

## SKR 数据如何使用

SKR 的历史库存快照、日销量和收货记录可以用于：

- 在每个历史日期建立一个 forecast origin；
- 使用 origin 当天已知库存和之前的销量训练/选择模型；
- 只把在 origin 时已经确认的在途数量纳入模拟；
- 用 origin 之后的真实库存、销量和缺货标记做事后评分；
- 比较缺货率、服务水平、库存 MAE 和建议采购量，而不是要求模型“预测已知库存”。

未来实际收货不应默认注入模拟库存。除非数据明确表示这笔订单在 origin 时已经确认且交期已知，否则它只能作为回测解释字段。这样不会因为事后知道收货而高估预测效果。

## 请求示例

```json
{
  "vendorId": 1,
  "outletId": 10,
  "horizonDays": 7,
  "minHistoryDays": 28,
  "originStepDays": 7,
  "series": [{
    "productId": 123,
    "dates": ["2026-01-01", "2026-01-02"],
    "units": [4, 5],
    "onHand": [30, 26],
    "receipts": [0, 0],
    "stockoutFlags": [false, false],
    "leadTimeDays": 3,
    "safetyStockDays": 2
  }]
}
```

实际请求需要至少 `minHistoryDays + horizonDays` 天。真实历史 `onHand` 可以完整放在快照中，但服务在每个 origin 内部只读取 origin 之前的值来产生预测；之后的值仅用于评分。

## 预研阶段推荐流程

```text
SKR 只读同步
→ 固定快照 SHA
→ 生成历史 origin
→ /v1/backtest/inventory
→ 比较基线模型与候选模型
→ 人工审阅断货和异常样本
→ 再接入补货建议
```

如果某商品没有足够历史、连续缺货或库存快照质量不完整，结果应为 `BLOCKED` 或低置信度，不能用零库存替代未知库存。

## 结果解释

- `inventoryMae`：模拟库存与历史实际库存的平均绝对误差。收货、报损和盘点差异会影响该值，因此它不是纯需求预测误差。
- `serviceLevel`：模拟没有低于实际缺货状态的保守服务指标，用于比较策略，不代表已经执行采购。
- `stockoutRecall`：模拟提前进入零库存的历史缺货日占比；没有历史缺货时为 `null`。
- `observedStockoutDays`：仅用于评分的历史事实。

该回测不会写入 Odoo，也不会创建采购单。它可以在开发环境和 SKR 脱敏快照上重复运行，并绑定 source snapshot SHA、runtime SHA 和模型版本。
