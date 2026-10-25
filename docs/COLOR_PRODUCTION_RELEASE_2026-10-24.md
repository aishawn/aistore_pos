# 配色生产发布结果（2026-10-24）

本次配色已推送 GitHub main，并通过 Dokploy 正常部署上线。没有运行本地生产构建，没有执行真实业务写入。

| 项目 | GitHub / 已部署源码 | 线上入口 | 部署结果 |
| --- | --- | --- | --- |
| POS | `aishawn/aistore_pos` / `e8f363cac0ae6ebd355845330d1d5158138e9df2` | app.orithos.com.au、demo.orithos.com.au | Dokploy Compose `aistorepos` 完成；两站公开版本接口的 frontend/backend SHA 均匹配 |
| 品牌站 | `aishawn/aistore_orithos` / `f9c2880729b0ebba8deb408b25d33f1722b40a8d` | orithos.com.au | Dokploy `orithos_brand` 完成；部署源码 SHA 和线上 CSS 均已核对 |

品牌站实际使用 Dokploy；旧文档中的 Vercel 部署说明不代表当前线上环境。UAT Compose 未修改，正常发布未清空数据卷。

发布从独立的 GitHub main 检出目录整理，仅合入配色、共享主题、现有组件和本轮证据。没有上传其他任务的未提交 API、AI 行为、Logo 或布局改动。原本已发布的页面布局保留；本地未提交的新 Dashboard 视觉布局、推荐路由和 AI workspace 功能仍保留在共享工作区，不属于本次已上线内容。

发布候选 POS、品牌站 TypeScript 检查均通过，POS 定向 ESLint 通过。品牌站首次在干净目录检查时缺少忽略的 `.source` 文档生成类型；连接已有生成文件后通过。品牌站已知旧 lint 限制见本地配色审计。后端源码无修改；没有把这次部署称为新的业务验收或改变 Pilot NO-GO 状态。

线上只读验证：品牌首页、注册首步、app 登录和 demo 登录四页，在 390 / 768 / 1440px 均 HTTP 200、无横向溢出，均加载 `--brand-orange: #f05a17`、`--brand-action: #c2410c` 与 `--brand-canvas: #f4f7fb`。本轮未登录测试真实收银、库存或提交注册。

证据：`UAT_COLOR_PRODUCTION_2026-10-24.json`、`UAT_COLOR_DEPLOYMENTS_2026-10-24.json`；实际线上截图：`screenshots/2026-10-24-color-production/`。早期 `COLOR_CONSISTENCY_2026-10-24.md` 和对应截图是共享工作区的本地 fixture 记录，不能当作本次生产布局截图。

发布证据另外上传到 `codex/unify-brand-palette` 分支；生产 main 保持实际部署的源码 SHA，避免仅上传验证记录再次触发构建或造成身份混淆。
