# AI 预测与原生库存回测验收

该流程只读取快照和 Odoo 数据，不创建销售、库存、采购或其他业务写入。

## 开发预研：用历史库存回放，不等待未来日期

开发阶段不需要等 28 个未来采集日。SKR 可通过 Odoo 的 `qty_available`
`to_date` 上下文只读重建历史业务日库存，再与同一日期的销量对齐：

```powershell
python scripts/ai-eval/fetch-skr-historical-inventory.py `
  --sales-snapshot .local/ai-eval/skr-sales-snapshot.json `
  --output .local/ai-eval/skr-historical-inventory.json `
  --days 90 --company-id 5

python scripts/ai_forecast_eval.py `
  .local/ai-eval/skr-sales-snapshot.json `
  .local/ai-eval/skr-historical-forecast-report.json `
  .local/ai-eval/skr-historical-inventory.json
```

这条路径用于开发研究、模型比较和错误分析，不是原生历史盘点记录。它根据 Odoo 的库存移动和当前可见配置按日期重建数量；如果库存移动、公司/仓库范围或商品主数据不完整，结果可能与当时实际可售库存不一致。评测器会按历史库存覆盖范围对齐日期，逐商品排除与持续销售明显矛盾的重建库存，并统计因库存被判为缺货而无法评测的窗口。报告状态可能是 `PARTIAL`：这表示评测执行成功，但部分商品没有足够的未删失窗口，不应读作模型通过。所有告警、日期和排除数会写入报告。不得把这类研究结果当作生产准确性验收或自动采购依据。

## 生产验收：原生每日快照

只有评估真实库存风险、缺货损失和生产补货效果时，才需要原生每日库存观察。必须从上线后的连续日快照验证；未来观察不能反过来作为过去预测时可见的特征。严格滚动回测应在每个预测起点只使用当时及之前的数据，之后日期只作为标签。

## 数据门禁

先确认快照目录至少包含 28 个不同的业务日，并且历史报告满足：

```powershell
python scripts/ai-eval/build-inventory-history.py `
  --input .local/ai-eval/inventory-snapshots `
  --output .local/ai-eval/inventory-history.json `
  --require-days 28
```

必须满足：

- `backtestReadiness=READY_FOR_NATIVE_STOCKOUT_BACKTEST`
- `continuityStatus=CONTIGUOUS`
- 每个被评估商品的原生库存日期覆盖完整
- 快照 `writeRequests=[]`
- 快照质量为 `NATIVE_ODOO_CURRENT_QUANTITIES`

任何缺失日期、重复商品 ID、缺少库存字段或历史不足都应保持 `BLOCKED`，不能把缺失日期当作“没有缺货”。

## 模型回测

使用带原生库存历史的只读评估：

```powershell
python scripts/ai_forecast_eval.py `
  .local/skr-forecast-snapshot-live.json `
  .local/ai-eval/forecast-report.json `
  .local/ai-eval/inventory-history.json
```

评估会按商品滚动比较 Seasonal Naive、Moving Average、Exponential Smoothing、Croston SBA、TSB 和两阶段发生率模型。新商品或少于 14 天历史的商品走类别、品牌、价格带相似商品冷启动路径。

## 放行指标

报告必须同时查看以下指标，不能只看平均 WAPE：

- 加权 WAPE 与 Bias
- 缺货单位代理和服务水平
- P80/P90 预测区间覆盖率
- 缺货损失、持有成本、过期风险（已配置成本时）
- 建议补货后的预计缺货天数
- 原生库存数据质量和评估被截断天数

成本配置不完整时，报告必须标记 `COST_CONFIG_REQUIRED`，不能把单位代理当成真实澳元成本。

## 线上验证

部署后只做 Demo/SKR 只读检查：登录、Odoo session、7/14/21 天补货读取、风险和原因字段、`writeRequests=[]`，并记录 `/api/public/version` 的前后端 SHA。采购草稿创建和任何自动确认仍须保持关闭，直到连续 4–8 周真实快照和人工复核通过。
