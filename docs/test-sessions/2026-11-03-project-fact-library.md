# Test Session: 2026-11-03 项目事实库

## Session metadata

| Field | Value |
|---|---|
| Session ID | 2026-11-03-project-fact-library |
| Started / timezone | 2026-11-03 / Asia/Shanghai |
| Operator | Codex；文档/业务负责人待指定 |
| Branch | 独立 detached worktree，基于本地 origin/main |
| Source SHA | 文档整理基线 d2020745f5a2fa1c9f53e9beecdd96debbb164c3；最终文档提交见 Git |
| Runtime SHA | NOT RUN；本期未读取线上版本 |
| Environment | 本地静态文档检查、历史证据复核 |
| Database | not applicable |
| Real business writes | 0 |
| Provider requests | 0 |

## Suites executed

本期仅执行文档检查；下面 AI 套件结果是历史复核，不是新跑的业务测试。Python 3.13.5 标准库执行，未安装额外依赖、未构建应用。

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| DOC-001 | python scripts/check-project-docs.py | PASS：56 份 Markdown，19 条证据登记 | [检查器](../../scripts/check-project-docs.py) | 目录/相对链接/元数据/选定 JSON 字段；不联网验证外部工具 |
| DOC-001 | python -m unittest discover -s scripts/tests -p test_project_docs.py | PASS：12/12 | [检查器回归](../../scripts/tests/test_project_docs.py) | 缺证据、引用漂移、状态矛盾、越界路径和标题；不发业务请求 |
| DOC-001 | git diff --check | PASS | Git 命令输出 | 仅本次范围 |
| AI-001 | 历史整轮与重试复核 | BLOCKED | [E-WF / E-RETRY](../project/evidence.md) | 保留原报告状态，不拼全量通过 |
| AI-002 | 历史 OCR/ASR/推荐复核 | INFO | [登记](../project/evidence.json) | 合成/目录子集；模型质量、真设备未由本期重跑 |
| AI-003 | 边界/指令设计复核 | NOT RUN | [命令说明](../AI_COMMANDS_IMPLEMENTATION.md) | 没有执行或业务写入 |
| AI-004 | 历史预测/补货质量复核 | BLOCKED | [730 天 JSON](../UAT_AI_730D_SEGMENTED_BACKTEST_2026-11-03.json) | 相对研究通过不等于生产绝对质量通过 |

## Summary

完成 AI 七个功能样板、六个业务入口、模板、ADR、管理层摘要、PPT 提纲与关键证据登记。未知模型/prompt/config 不补造；全部 releaseAccepted=false。既有业务测试和发布准入结论不变。

## Follow-up

补真实票据/麦克风/图片数据、固定版本整轮验收、供应商交期与可信成本、库存来源和公司绑定核对。原工作区的未提交变更保持原状。首次 fetch 因网络失败；Git 最终同步情况由交付说明，不假装最新远端或已部署。

收尾 fetch 已成功，整合父版本为 b7249014；保留 d2020745 为资料盘点基线。最终文档提交由 Git 追踪，推送和部署分别确认，本文不声明 CI 或应用部署通过。
