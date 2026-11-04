# SKR 2,000 SKU 分群滚动回测

日期：2026-11-04（Australia/Adelaide 数据边界；报告生成时间见 JSON）
环境：SKR 只读销售快照，离线研究；真实业务写入 `0`。当前营业日评估的机器可读结果见 [JSON](UAT_FORECAST_ROLLING_BACKTEST_2026-11-04.json)，逐 validation/holdout 分群的六模型指标见 [全模型 CSV](UAT_AI_FORECAST_SEGMENTED_OPEN_DAYS_ALL_MODELS_2026-11-04.csv)，共 216 行。原日历日口径结果保留在 [旧 CSV](UAT_AI_FORECAST_SEGMENTED_ALL_MODELS_2026-11-04.csv) 作为历史证据。

2026-11-04 追加可复现性核对：使用版本化店主确认闭店日 [JSON](AI_SKR_CONFIRMED_CLOSED_DATES_2026-11-04.json) 重新运行后，全部指标、模型、分群、折配置和门槛与主报告逐字段一致（差异 0）。销售快照 SHA-256 仍为 `1db83438ef97c0d131ee38994b222b8cd7538fdb9381a375a21a4710061f9729`；新版闭店日文件 SHA-256 为 `1f2962afc6d6e04152e24f672fd9488090e5d4badac4593a715fe982ce94f70d`；当前评测器 SHA-256 为 `a05b6e9494dbb98141e2704d8850aa58f97ad3d2b084a6fba376b5921b53dd02`。复跑产物在忽略目录 `.local/ai-eval/skr-segmented-open-days-365d-current.json`，完整运行约 21 分 43 秒，`writeRequests=[]`。本次只优化离线显式模型执行路径；18 组不同历史长度/六模型预测与 forecast engine 逐点一致。此结果仍为销售-only 回测，不提供库存缺货或填充率证据。

## 结论

营业日掩码复评已完成，但没有通过生产发布门禁。它是 365 天、2,000 个商品序列的销售需求研究，不能证明库存 fill rate、缺货成本或自动采购收益。模型预测值安全违规为 `0`，已评分分群的预测窗口覆盖率为 `100%`；冠军 WAPE 约 `103.6%`–`172.1%`，新品代理分群 Bias 约 `-83.6%` 至 `-88.0%`，且没有可信的原生库存/交期/成本标签。掩码处理没有改善结论：当前冠军误差仍远超绝对 WAPE `30%` 探索门槛。

因此保持生产默认策略和人工审核门禁不变，不切换全店模型，不启用自动采购。

## 输入与方法

- 营业日复评使用快照 SHA-256 `1db83438ef97c0d131ee38994b222b8cd7538fdb9381a375a21a4710061f9729`、闭店表 SHA-256 `b756a4869b923542bfc265688eb58966328bc05ac787af005a23321a89e90d20`，数据范围 `2025-11-04` 至 `2026-11-03`，2,000 个 SKU，365 天，六种模型；`writeRequests=[]`。可复现汇总 JSON 保存在本目录。
- 时间范围：2025-11-04 至 2026-11-03，365 天，门店时区 `Australia/Adelaide`。
- 规模：2,000 个商品序列、57,583 张订单、111,709 条销售行；快照 `writeRequests=[]`。
- 方法：expanding-window、按时间前缀训练；7/14/28 天 horizon；validation 选择分群 champion，后续 holdout 评分。
- 比较模型：Seasonal Naive、7 日移动平均、指数平滑（ETS）、Croston SBA、TSB、two-stage occurrence 基线。
- 分群：`INTERMITTENT`、`RECENT_FIRST_SALE_PROXY`、`REGULAR`、`SPARSE_LONG_TAIL`、`WEEKLY_PATTERN_PROXY`；`STABLE_HIGH` 未达到最小 validation 商品数门槛，没有选择冠军。
- `STABLE_HIGH` 在每个 horizon 的 validation SKU 数低于最小分群门槛，未选择 champion；其少量模型分数不作为发布证据。

## 营业日历限制

店主已确认 19 个趋势缺日全部闭店。与当前 365 天窗口相交的 `2025-12-25` 和 `2026-04-03`，快照中 2,000 个 SKU 的销量都为 0；没有发现这两天存在真实交易。

本次复评将交集日期 `2025-12-25`、`2026-04-03` 从训练 occurrence/频率、MASE 差分和 P80/P90 覆盖及 WAPE/Bias 评分中排除；时间序列原日期位置不移动，闭店日对应的预测点不用于打分。两个闭店日对 2,000 个 SKU 的销量均为 0。门店日历掩码只用于离线评估；生产 forecast engine 仍未接入营业日历，且评估仍只覆盖一年单店历史。

“SKU 覆盖”与“预测窗口覆盖”分开报告：表中 `holdout SKU/segment SKU` 是进入该分群 holdout 的去重 SKU 数及相应验证分群 SKU 数；`window coverage` 是实际输出的预测窗口数除以期望窗口数。当前结果的 window coverage 均为 `100%`，不是全目录 2,000 SKU 均能进入每个分群。

## Champion holdout 指标

百分比字段均按实际销量加权；Bias 为预测误差/实际销量，负数表示低估；`folds` 是 holdout 折数；`beat` 是相对 two-stage occurrence 基线 WAPE 更好的折占比；`median improvement` 是配对折中位相对改善。

| Horizon | 分群 | Champion | Holdout SKU / segment SKU | Window coverage | WAPE | Bias | MASE | P80 / P90 | Folds | Beat | Median improvement |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7 | INTERMITTENT | ETS | 363 / 476 | 100% | 146.3% | -5.7% | 0.824 | 84.7% / 88.4% | 11 | 100% | 8.9% |
| 7 | RECENT_FIRST_SALE_PROXY | two-stage | 27 / 173 | 100% | 108.6% | -88.0% | 5.460 | 84.3% / 84.8% | 11 | 0% | 0.0% |
| 7 | REGULAR | TSB | 53 / 75 | 100% | 106.7% | 1.8% | 0.796 | 80.7% / 88.0% | 11 | 100% | 6.0% |
| 7 | SPARSE_LONG_TAIL | ETS | 1,614 / 1,638 | 100% | 170.7% | -7.4% | 0.905 | 93.7% / 94.1% | 11 | 100% | 9.8% |
| 7 | WEEKLY_PATTERN_PROXY | ETS | 43 / 67 | 100% | 106.0% | -9.4% | 0.765 | 82.2% / 88.7% | 11 | 100% | 5.2% |
| 14 | INTERMITTENT | ETS | 360 / 467 | 100% | 145.1% | -7.6% | 0.832 | 84.0% / 88.0% | 6 | 100% | 7.7% |
| 14 | RECENT_FIRST_SALE_PROXY | two-stage | 27 / 170 | 100% | 108.6% | -88.0% | 5.294 | 84.5% / 85.0% | 6 | 0% | 0.0% |
| 14 | REGULAR | TSB | 54 / 73 | 100% | 103.8% | -1.6% | 0.799 | 80.5% / 87.8% | 6 | 100% | 4.4% |
| 14 | SPARSE_LONG_TAIL | ETS | 1,610 / 1,626 | 100% | 167.3% | -11.2% | 0.928 | 93.3% / 93.7% | 6 | 100% | 8.8% |
| 14 | WEEKLY_PATTERN_PROXY | TSB | 46 / 67 | 100% | 103.6% | -6.3% | 0.743 | 82.5% / 88.7% | 6 | 100% | 6.8% |
| 28 | INTERMITTENT | ETS | 362 / 452 | 100% | 147.8% | -6.5% | 0.822 | 84.3% / 87.9% | 3 | 100% | 8.7% |
| 28 | RECENT_FIRST_SALE_PROXY | two-stage | 29 / 164 | 100% | 112.1% | -83.6% | 4.096 | 85.2% / 85.9% | 3 | 0% | 0.0% |
| 28 | REGULAR | TSB | 48 / 73 | 100% | 106.4% | -0.9% | 0.815 | 79.9% / 86.1% | 3 | 100% | 2.9% |
| 28 | SPARSE_LONG_TAIL | TSB | 1,600 / 1,610 | 100% | 172.1% | -7.3% | 0.908 | 93.3% / 93.7% | 3 | 100% | 8.3% |
| 28 | WEEKLY_PATTERN_PROXY | TSB | 46 / 66 | 100% | 107.5% | -3.1% | 0.718 | 82.4% / 88.2% | 3 | 100% | 6.3% |

完整的六模型 validation/holdout 指标、折稳定性、配对基线改进率与样本覆盖均列在营业日 CSV 中；机器可读原始结果保留模型分群聚合及每个模型的 `foldStability` 字段。

## Champion 逐分群稳定性明细

下表将 JSON 中的 champion holdout 指标直接展开；`SKU 覆盖` 为 holdout SKU / 该分群 validation SKU，`WAPE CV` 为 holdout 各折 WAPE 的变异系数。`P80/P90` 是区间覆盖率，`安全违规` 包含非负和区间顺序检查。

| Horizon | 分群 | Champion | SKU 覆盖 | 窗口覆盖 | WAPE | Bias | MASE | P80/P90 | Folds | WAPE CV | 安全违规 |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 7 | INTERMITTENT | ETS | 363/476 | 100% | 146.3% | -5.7% | 0.824 | 84.7%/88.4% | 11 | 13.4% | 0 |
| 7 | RECENT_FIRST_SALE_PROXY | two-stage | 27/173 | 100% | 108.6% | -88.0% | 5.460 | 84.3%/84.8% | 11 | 2.2% | 0 |
| 7 | REGULAR | TSB | 53/75 | 100% | 106.7% | 1.8% | 0.796 | 80.7%/88.0% | 11 | 19.2% | 0 |
| 7 | SPARSE_LONG_TAIL | ETS | 1614/1638 | 100% | 170.7% | -7.4% | 0.905 | 93.7%/94.1% | 11 | 14.4% | 0 |
| 7 | WEEKLY_PATTERN_PROXY | ETS | 43/67 | 100% | 106.0% | -9.4% | 0.765 | 82.2%/88.7% | 11 | 18.9% | 0 |
| 14 | INTERMITTENT | ETS | 360/467 | 100% | 145.1% | -7.6% | 0.832 | 84.0%/88.0% | 6 | 3.7% | 0 |
| 14 | RECENT_FIRST_SALE_PROXY | two-stage | 27/170 | 100% | 108.6% | -88.0% | 5.294 | 84.5%/85.0% | 6 | 4.5% | 0 |
| 14 | REGULAR | TSB | 54/73 | 100% | 103.8% | -1.6% | 0.799 | 80.5%/87.8% | 6 | 4.9% | 0 |
| 14 | SPARSE_LONG_TAIL | ETS | 1610/1626 | 100% | 167.3% | -11.2% | 0.928 | 93.3%/93.7% | 6 | 6.7% | 0 |
| 14 | WEEKLY_PATTERN_PROXY | TSB | 46/67 | 100% | 103.6% | -6.3% | 0.743 | 82.5%/88.7% | 6 | 9.0% | 0 |
| 28 | INTERMITTENT | ETS | 362/452 | 100% | 147.8% | -6.5% | 0.822 | 84.3%/87.9% | 3 | 2.5% | 0 |
| 28 | RECENT_FIRST_SALE_PROXY | two-stage | 29/164 | 100% | 112.1% | -83.6% | 4.096 | 85.2%/85.9% | 3 | 4.2% | 0 |
| 28 | REGULAR | TSB | 48/73 | 100% | 106.4% | -0.9% | 0.815 | 79.9%/86.1% | 3 | 3.9% | 0 |
| 28 | SPARSE_LONG_TAIL | TSB | 1600/1610 | 100% | 172.1% | -7.3% | 0.908 | 93.3%/93.7% | 3 | 0.8% | 0 |
| 28 | WEEKLY_PATTERN_PROXY | TSB | 46/66 | 100% | 107.5% | -3.1% | 0.718 | 82.4%/88.2% | 3 | 1.6% | 0 |

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
