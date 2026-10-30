# Orithos POS AI 功能测试报告

## 结论

当前 AI 功能适合继续试点和只读验证，尚不满足预测驱动补货的生产发布门槛。问答和路由能力在历史 SKR 线上只读评测中表现良好；预测基线在含缺货数据时质量门禁失败；当前版本尚未完成与最新源码 SHA 绑定的线上重跑。

## 证据汇总

| 能力 | 证据 | 结果 | 解释 |
|---|---|---:|---|
| Assistant 代表性问法 | `AI_EVAL_SKR_2026-10-28.md` | 12/12 PASS | SKR 只读，覆盖销售、库存、推荐、补货、安全边界 |
| Assistant 完整目录 | 同上 | 最高 387/387 PASS | 后续一次 385 PASS、2 BLOCKED，原因为 HTTP 502 |
| Assistant 固定本地样本 | `AI_EVAL_LOCAL_0C91B1B2.json` | 13 PASS / 0 FAIL / 0 BLOCKED | 结构化断言、双语、上下文和安全边界 |
| Java AI/权限/命令/补货测试 | Maven Surefire | 481 tests / 0 failures / 0 errors | 当前源码自动化回归，含 2 个预测快照持久化测试 |
| Python 预测基线 | `reports/ai-forecast-eval.json` | 执行 PASS，质量 FAIL | 含缺货商品平均 WAPE 52.94% |
| 业务写入保护 | 全部只读评测 | 0 writes | Assistant 评测不调用确认或业务写接口 |
| 预测结果审计 | 当前源码 | 已实现 | 每次成功预测保存 `ai_forecast_snapshot`，绑定租户、门店、模型和 source version |

## 预测结果

固定 demo 快照只有 28 天，因此：

- 7 天滚动回测可以执行；
- 14 天和 28 天被正确标记为 `BLOCKED`；
- 稳定序列 WAPE 为 0%；
- 含 3 个缺货评测日的序列 WAPE 为 52.94%；
- P80/P90 覆盖率约 92.86%；
- 质量门禁为 `FAIL`。

该结果说明缺货观测会造成需求低估，不能把当前基线直接用于自动补货。当前代码已将 `stockout_flag` 和 `CENSORED_DEMAND` 从 Java 同步链路传入 Python，并记录训练期与评测期缺货天数。

## 版本和范围限制

SKR Assistant 历史报告使用的 runtime SHA（例如 `77904468`、`822495ea`、`fe73a877`）与当前源码提交 `72b0158a` 不一致，因此属于真实数据诊断证据，不是当前候选版本的部署验收。线上报告还记录过短暂 502 和 provider 429，这些必须归类为 `BLOCKED`，不能当作模型失败或通过。

当前没有完成：

1. 用最新源码 SHA 在 SKR 上重跑完整 300+ 问法；
2. 获取至少 8-12 周脱敏按日销售、库存和缺货快照；
3. 在真实 SKR 快照完成 7/14/28 天滚动回测；
4. 价格弹性、促销增量毛利和天气/节假日特征验证；
5. 真实 provider 故障、成本和 P95 延迟的完整线上评测。

预测快照写入失败时，接口仍返回只读预测并记录告警；这避免审计存储短暂故障导致业务侧得到伪造的零需求结果。快照持久化本身仍应在部署环境做一次数据库集成验证。

## 发布判断

建议保持：

```env
AI_FORECAST_ENABLED=false
AI_COMMANDS_EXECUTION_ENABLED=false
AI_PURCHASE_DRAFT_ENABLED=false
AI_PURCHASE_CONFIRM_ENABLED=false
```

可以继续开放只读 Assistant、导航、推荐和补货预览；预测和采购建议需要在 SKR 固定快照质量门禁通过、最新 runtime SHA 重跑通过、并完成至少四周人工评审后再进入生产候选。
