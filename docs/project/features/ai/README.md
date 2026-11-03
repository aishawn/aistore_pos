# AI 能力全景

更新日期：2026-11-03。基线：主分支快照 d2020745；负责人：AI/产品 owner 待指定。能力、模型质量、经营收益三层分别判断，不以“AI 已完成”概括。

## 功能清单

| ID / 功能 | 实现类型 | 当前判断 |
|---|---|---|
| [CAP-AI-ASSISTANT / 门店助手、语音与历史](assistant/README.md) | 确定性路由 + 大模型分类/回答 + ASR | 已实现（本库主分支基线）；历史线上验证见 E-RO / E-WF-DEMO / E-WF-SKR；当前基线未重新线上验收。 |
| [CAP-AI-OCR / 发票 OCR 与预览](invoice-ocr/README.md) | 多模态模型 + 结构化解析 + 人工复核 | 已实现（本库基线）；E-OCR 为旧版本合成票据线上预览验证；真实供应商准确率和当前版本复验 NOT RUN。 |
| [CAP-AI-SOMMELIER / 侍酒推荐与酒标识别](sommelier/README.md) | 目录过滤/评分 + 大模型话术 + 视觉识别 | 已实现（本库基线）；E-SOM 为 dc3d4d8e 的历史目录只读检查，本基线模型与图片效果未验收。 |
| [CAP-AI-PRICING / 价格建议](pricing/README.md) | 业务规则计算；模型解释为辅助 | 已实现（主分支基线）；现有历史设计和测试报告可追溯；当前版本价格写入、生效及经营收益 NOT RUN。 |
| [CAP-AI-FORECAST / 销量预测与补货](forecasting/README.md) | 统计时序预测 + 规则决策 + 数据质量门禁 | 已实现（主分支基线）；E-RO / E-URGENT 有旧 runtime 线上只读验证；E-FC730 为研究回测，生产模型质量与自动采购准入未通过。 |
| [CAP-AI-DEAD-STOCK / 滞销与库存资金占用](dead-stock/README.md) | 确定性数据分析，不依赖 LLM 计算金额 | 已实现（主分支基线）；E-DEAD 为 71213472 历史线上只读记录；本基线未重新对账，也未证明释放现金。 |
| [CAP-AI-COMMANDS / AI 指令草稿与确认](commands/README.md) | 模型解析 + 受控命令状态机 | 已实现（主分支源码）；实现说明记录 execution 默认关闭；本期未核验有效运行开关，生产执行 NOT RUN。 |

“已实现”只指本库代码基线可找到实现；旧版本线上记录不代表本基线通过。语音归入 assistant，酒标归入 sommelier；滞销金额是确定性分析，不能包装为模型预测收益。

## 验证与效果

- E-RO：两店历史报表检查各 23/23；固定 runtime 与样本范围见[证据登记](../../evidence.md)。
- E-WF：390 条整轮 Demo 379 PASS/11 BLOCKED，SKR 382 PASS/8 BLOCKED；后续定向重试不能拼成整轮 PASS。
- E-OCR：合成票据关键字段存在，不证明真实票据准确率；反光案例仍需归档复验。
- E-FC730：730 天研究中间歇需求相对改善，但绝对 WAPE 门失败；缺货/交期/成本证据不足。
- E-RO / E-LEAD：快照仅 2/3 天，交期覆盖 0%；建议保持人工审核。未实测经营收益。
- E-DEAD：存在有效子集资金占用分析；无效成本/库存与标签冲突未解决，不称为已节省。

## 设计、测试和迭代入口

[整体架构](architecture.md)说明 Graph、Gateway、Odoo、预测服务与写入边界；每个目录中的 design / validation / progress 分别维护实现、效果与问题。统一测试定义见[测试目录](../../../TEST_CATALOG.md)，本期复核记录见[session](../../../test-sessions/2026-11-03-project-fact-library.md)。

## 优化优先级

P0：数据范围、可信采购成本、供应商交期、OCR 不确定性和命令写入边界。P1：固定版本全量问法、真实语音/图片、逐 SKU 对账和冷/热延迟。P2：采纳率、工时、经营对照和管理层成果。

第一轮以固定输入建立可重复基线；一次只改模型、prompt 或规则中的一个主要因素，比较质量、P95、实际费用和安全指标。模型/prompt/config 版本未记录时先补观测，再宣称效果提升。
