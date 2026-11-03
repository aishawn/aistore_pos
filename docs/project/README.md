# Orithos 项目事实库

更新日期：2026-11-03（Asia/Shanghai）。维护负责人：项目 owner（姓名待指定），各模块负责人见功能清单。

这里汇总可追溯的设计、进展、效果、测试和问题。业务数据仍以 Odoo 为准；测试结论只适用于证据注明的版本、环境和样本。本期整理已有记录，没有重新调用模型、执行业务测试或修改业务数据。

## 从哪里开始

| 读者 / 目的 | 入口 |
|---|---|
| 老板、领导：能力、成果、限制和投入 | [管理层摘要](reports/2026-11-03-management-summary.md) · [PPT 内容提纲](reports/2026-11-03-presentation-outline.md) |
| 产品、研发：整体系统和功能状态 | [项目总览](overview.md) · [全功能清单](features/README.md) |
| AI 研发与测试 | [AI 全景](features/ai/README.md) · [AI 架构](features/ai/architecture.md) |
| 核实一个数字或判断 | [证据清单](evidence.md) · [机器可读证据索引](evidence.json) |
| 继续开发、处理问题 | 各功能 progress.md · [维护约定](maintenance.md) · [模板](templates/README.md) |
| 理解过去为什么这样决定 | [架构决策](decisions/README.md) |
| 查本次盘点版本及工作区差异 | [基线与差异](baseline.md) |

## 信息如何分工

- 本目录保存功能视角的设计与当前摘要；原始 UAT、截图和历史报告保留原位，不复制、移动或重写。
- [测试目录](../TEST_CATALOG.md)定义稳定套件，[测试结果索引](../TEST_REPORT_INDEX.md)维护跨 session 结果；本目录引用它们，不另造套件编号。
- [当前交接](../HANDOFF_2026-10-29_CURRENT.md)、[能力状态](../CAPABILITY_STATUS.md)和[试点准入](../PILOT_RELEASE_READINESS.md)继续承担发布职责。事实库不自行宣布准入。
- 报告是有日期的快照，功能摘要可更新，证据不可改写。发生冲突先核对范围与版本，暂不能消除的冲突写进问题列表。
- 未登记模型、prompt 或配置版本时写“未记录”，不能把代码默认值当成线上有效配置。

## 本期交付范围

AI 七个功能目录完整填写，其中 assistant 同时覆盖语音、查数、导航和历史。其余六个业务模块建立入口和待盘点项。管理层材料是 Markdown 摘要和演示内容提纲，本期没有生成 PPTX，也没有上线文档网站。

运行 `python scripts/check-project-docs.py` 检查目录、相对链接、证据元数据及选定 JSON 断言。工具边界和扩展建议见[工具选型](tools.md)。
