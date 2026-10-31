# AI 预测与原生库存回测验收

该流程只读取快照和 Odoo 数据，不创建销售、库存、采购或其他业务写入。

## 数据门禁

先确认快照目录至少包含 28 个不同的 UTC 观测日，并且历史报告满足：

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
