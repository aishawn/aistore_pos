# SKR 2,000 SKU 分群滚动回测

日期：2026-11-04（Australia/Adelaide 数据边界；报告生成时间见 JSON）
环境：SKR 只读销售快照，离线研究；真实业务写入 `0`  另见原始结果：`.local/ai-eval/skr-segmented-walkforward-365d-2026-11-04.json`。

## 结论

这次评估已完成，但没有通过生产发布门禁。它是 365 天、2,000 个商品序列的销售需求研究，不能证明库存 fill rate、缺货成本或自动采购收益。模型预测值安全违规为 `0`，每个已评分分群的预测窗口覆盖率为 `100%`；然而多数分群 WAPE 超过 `100%`，新品代理分群 Bias 约 `-84%` 至 `-88%`，且没有可信的原生库存/交期/成本标签。

因此保持生产默认策略和人工审核门禁不变，不切换全店模型，不启用自动采购。

## 输入与方法

- 快照：`skr-sales-snapshot-365d.json`，SHA-256 `4a6df62d8ea2843c6f24373972b40d058ee89596aaa1af15694009506b19ef15`。
- 时间范围：2025-11-04 至 2026-11-03，365 天，门店时区 `Australia/Adelaide`。
- 规模：2,000 个商品序列、57,583 张订单、111,709 条销售行；快照 `writeRequests=[]`。
- 方法：expanding-window、按时间前缀训练；7/14/28 天 horizon；validation 选择分群 champion，后续 holdout 评分。
- 比较模型：Seasonal Naive、7 日移动平均、指数平滑（ETS）、Croston SBA、TSB、two-stage occurrence 基线。
- 分群：`INTERMITTENT`、`RECENT_FIRST_SALE_PROXY`、`REGULAR`、`SPARSE_LONG_TAIL`、`WEEKLY_PATTERN_PROXY`、`STABLE_HIGH`。
- `STABLE_HIGH` 在每个 horizon 的 validation SKU 数低于最小分群门槛，未选择 champion；其少量模型分数不作为发布证据。

“SKU 覆盖”与“预测窗口覆盖”分开报告：表中 `holdout SKU/segment SKU` 是进入该分群 holdout 的去重 SKU 数及相应验证分群 SKU 数；`window coverage` 是实际输出的预测窗口数除以期望窗口数。当前结果的 window coverage 均为 `100%`，不是全目录 2,000 SKU 均能进入每个分群。

## Champion holdout 指标

百分比字段均按实际销量加权；Bias 为预测误差/实际销量，负数表示低估；`folds` 是 holdout 折数；`beat` 是相对 two-stage occurrence 基线 WAPE 更好的折占比；`median improvement` 是配对折中位相对改善。

| Horizon | 分群 | Champion | Holdout SKU / segment SKU | Window coverage | WAPE | Bias | MASE | P80 / P90 | Folds | Beat | Median improvement |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7 | INTERMITTENT | ETS | 362 / 462 | 100% | 146.2% | -5.4% | 0.825 | 84.7% / 88.4% | 11 | 100% | 8.6% |
| 7 | RECENT_FIRST_SALE_PROXY | two-stage | 27 / 169 | 100% | 108.6% | -88.1% | 5.526 | 84.4% / 85.0% | 10 | 0% | 0.0% |
| 7 | REGULAR | TSB | 51 / 75 | 100% | 105.8% | 1.3% | 0.805 | 80.6% / 87.9% | 11 | 100% | 5.4% |
| 7 | SPARSE_LONG_TAIL | ETS | 1,615 / 1,647 | 100% | 170.5% | -7.5% | 0.910 | 93.6% / 94.0% | 11 | 91% | 9.7% |
| 7 | WEEKLY_PATTERN_PROXY | ETS | 43 / 64 | 100% | 105.9% | -9.7% | 0.769 | 82.2% / 88.7% | 11 | 100% | 5.5% |
| 14 | INTERMITTENT | ETS | 361 / 451 | 100% | 145.2% | -7.2% | 0.832 | 84.0% / 88.0% | 6 | 100% | 7.4% |
| 14 | RECENT_FIRST_SALE_PROXY | two-stage | 27 / 166 | 100% | 108.5% | -88.1% | 5.378 | 84.5% / 85.1% | 6 | 0% | 0.0% |
| 14 | REGULAR | TSB | 50 / 73 | 100% | 103.1% | -1.5% | 0.802 | 80.4% / 87.8% | 6 | 100% | 4.6% |
| 14 | SPARSE_LONG_TAIL | ETS | 1,615 / 1,635 | 100% | 167.0% | -11.5% | 0.932 | 93.3% / 93.7% | 6 | 100% | 8.7% |
| 14 | WEEKLY_PATTERN_PROXY | ETS | 45 / 64 | 100% | 103.1% | -12.0% | 0.749 | 81.1% / 88.1% | 6 | 100% | 7.0% |
| 28 | INTERMITTENT | TSB | 362 / 436 | 100% | 146.8% | -4.9% | 0.815 | 84.5% / 87.9% | 3 | 100% | 8.8% |
| 28 | RECENT_FIRST_SALE_PROXY | two-stage | 29 / 160 | 100% | 112.0% | -83.7% | 4.123 | 85.2% / 85.9% | 3 | 0% | 0.0% |
| 28 | REGULAR | Croston SBA | 47 / 71 | 100% | 109.3% | 4.2% | 0.831 | 83.4% / 88.1% | 3 | 100% | 0.4% |
| 28 | SPARSE_LONG_TAIL | TSB | 1,605 / 1,624 | 100% | 171.7% | -7.5% | 0.915 | 93.3% / 93.7% | 3 | 100% | 7.7% |
| 28 | WEEKLY_PATTERN_PROXY | ETS | 44 / 62 | 100% | 106.1% | -12.6% | 0.718 | 80.0% / 87.2% | 3 | 100% | 5.6% |

完整的六模型指标（包括未胜出的 Seasonal Naive、移动平均、ETS、Croston SBA、TSB 和 two-stage occurrence）保留在原始 JSON 的 `holdoutModels` 与 `validationModels` 字段。折间 WAPE 变异系数也保留在各模型的 `foldStability.wapeCoefficientOfVariation`，不能仅看平均 WAPE。

## 门禁判断

- 安全违规：`0`（预测区间均满足非负且 `p50 <= p80 <= p90`；离线写入 `0`）。
- 需求准确率：未通过。当前研究门槛要求绝对 WAPE 不高于 `30%`；所有可选 champion 分群均高于该门槛。
- 偏差：新品代理分群严重低估；14/28 天周模式分群低估超过 `10%`，不满足受控偏差要求。
- 库存/填充率/成本：`BLOCKED`。本快照 `stockoutLabelsAvailable=false`、`nativeInventoryAvailable=false`、`supplierLeadTimeAvailable=false`、`businessCostMetrics=null`。
- 生产决策：保持人工复核、`DRAFT_RFQ`/只读预览边界；不自动确认采购。

## 后续动作

1. 新品使用“是否需要补货”分类或类别/品牌/价格带 analog，并单独评估冷启动，不把当前 two-stage 结果直接用于数量决策。
2. 继续采集每日原生 Odoo 库存快照，累计至少 28 个连续营业日；库存回测只接受有时区事件时间、与业务日一致的原生快照。
3. 为供应商补齐合同交期、采购单位、箱规、MOQ、GST 和供应商关联收货事件；完成业务确认前不回写主数据。
4. 重新执行带原生库存标签的 `ai_forecast_walkforward_eval.py`，再评估 stockout、fill rate 和成本敏感性。
