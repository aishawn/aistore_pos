# 工具选型与演进

## 首期采用

Markdown + Git 维护事实，Mermaid 表达架构；复用现有 UAT、scripts/ai-eval 和测试索引。Python 标准库检查本库，无额外依赖、账户或服务部署。先运行维护流程，再决定是否引入平台。

| 工具 | 解决的问题 | 引入时机 / 限制 |
|---|---|---|
| [MkDocs](https://www.mkdocs.org/) / [VitePress](https://vitepress.dev/) | 文档浏览、搜索、导航 | 二期择一；Markdown 仍是源，内部访问与权限另配 |
| [adr-tools](https://github.com/npryce/adr-tools) | 架构决策记录 | 本期使用 ADR 格式，无需安装 |
| [Promptfoo](https://github.com/promptfoo/promptfoo) | 固定数据集比较 prompt、模型、断言 | 现有评测缺少比较能力时接入；不能替代 Odoo 对账 |
| [Langfuse](https://github.com/langfuse/langfuse) | 调用追踪、延迟、用量、版本与反馈 | 持续线上观测时试点；核对版本许可、托管地域、脱敏和保留期，不默认上传问答 |
| [Marp](https://marp.app/) | Markdown 演示稿输出 | 用于下一期 PDF/PPT；当前交付内容提纲，PPTX 可编辑性按格式另验收 |

链接为选型参考，本轮未联网核验各工具最新版本、许可或商业功能。上述工具不统一代管业务事实、架构决策、测试证据及发布准入，需要本库流程衔接。

## 后续顺序

先补齐各业务模块，再观察维护成本；需要非技术人员自助检索时上线内部文档网站。需要持续 AI 调优时接入脱敏调用观测和固定评测。避免同时维护 Wiki 与仓库两套可编辑事实源。
