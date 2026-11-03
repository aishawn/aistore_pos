# 事实库维护约定

更新日期：2026-11-03。适用于所有模块、人工开发及 coding agent。

## 单一职责与状态

每个功能维护 README、design、validation、progress 四份文档。模板见[模板入口](templates/README.md)。功能 ID 使用 CAP- 前缀，与现有测试套件 AI-001 等编号分开。

功能状态分别填写“设计中 / 已实现 / 本地验证 / 已部署 / 线上验证”，每阶段附版本或证据。可以同时存在“已实现、旧版本线上验证、本候选未验收”。避免用一个完成百分比掩盖差异。负责人未分配时写“待指定”。

测试结果沿用 PASS / BLOCKED / FAIL / INFO / NOT RUN。环境必须注明本地 fixture、本地真实服务、线上只读、线上真实写入或离线研究；结果不得跨环境覆盖。

## 一次变更怎么收尾

1. 修改行为前，读对应 design 和 progress；新功能复制模板并加入[功能清单](features/README.md)。
2. 行为/接口/数据流变化同步 design；进展和新问题写 progress，包含优先级、负责人、下一步和关闭条件。
3. 有意义的测试使用[session 模板](../TEST_SESSION_TEMPLATE.md)，保留原始证据，并更新[测试结果索引](../TEST_REPORT_INDEX.md)。
4. 在 validation 关联测试套件和证据；有关键结论时加入 evidence.json / evidence.md，维护日期、版本、范围和限制。
5. 设计取舍新增 ADR；问题关闭必须链接修复与验证，并注明关闭的是源码、本地还是线上问题。
6. 运行静态检查；如需汇报，从已登记事实生成有日期的新摘要，检查每个关键数字及适用范围。

没有新增测试时记 NOT RUN，不为了填表重复调用 provider。用户反馈可以进入问题队列，但未经复现不能标为已证实缺陷。

## 证据登记

evidence.json 是关键结论的引用元数据，原 UAT 和稳定测试索引仍是结果来源。每条包含日期、环境、结果、source/runtime SHA、模型/prompt/配置/快照版本、样本、范围、限制、材料路径。缺失元数据用 null 并在限制中解释，不猜测。

可选 jsonChecks 只核对被引用 JSON 的现有字段，防止抄错数字；不能替代业务测试。releaseAccepted 默认 false，只有范围内的完整准入依据齐备才允许变为 true；本期不作此声明。

不得将多轮重试拼成一轮全量 PASS；运行完成不等于质量达标，研究性相对提升不等于自动采购准入。时间统一保留原 UTC 时间戳及门店营业日含义。

## 工具与检查

```text
python scripts/check-project-docs.py
python -m unittest discover -s scripts/tests -p test_project_docs.py
git diff --check
```

检查器验证本库及本期 session 的本地文件/标题链接、目录和登记字段，不联网检查工具站点，不扫描或修改全部历史文档，也不能判断一段自然语言是否真实。PR 模板提供人工证据核对清单；CI 自动运行文档检查。

## 汇报与数据

报告区只保留可分享的脱敏摘要；真实票据、音频、完整快照和认证材料置于访问控制存储。金额注明币种、成本有效覆盖范围和是否模拟。观测到的资金占用不称为已释放现金，正成本字段不自动等于可信采购成本。
