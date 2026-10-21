# Orithos 前端发布批次：2026-10-21

目录/助手补验：四视口 **44/44 PASS**，三类目录深链、真实空结果及清空、顶部AI五条快捷问句、Tab焦点和Escape恢复通过。证据 `UAT_DIRECTORIES_ASSISTANT_DEMO_2026-10-21_1897D8B_CORRECTED.json`；无模型提交或业务写入。精确运行SHA未核验。

03:57 UTC续验：Demo四页双视口已为 **8/8 PASS**，手机新卡片、宽搜索和顶部AI已实际观察到；证据 `UAT_UI_BATCH_DEMO_RUNTIME_RECHECK_2026-10-21_1897D8B.json`。这更新下段03:47 UTC的4/8观察，旧报告保留。盘点只读12/12，库存位置为唯一仓库回退且写入关闭。两套检查无业务写入；精确checkout/runtime SHA仍未核验。后续本地盘点搜索竞态修复不在此提交内，待下一合批发布。

最新进展：本批已推送main，SHA `1897d8b2f65946ddedef63f1dbe7437548851ca5`。用户报告Dokploy成功，checkout/runtime SHA和完整日志未取得。随后Demo只读矩阵 **4/8 PASS**：桌面四项通过，手机四项仍呈现旧布局（窄卡片、裁切表格、浮动AI且无新顶部入口）。证据 `UAT_UI_BATCH_DEMO_RUNTIME_BASELINE_2026-10-21_1897D8B.json`；业务写入和页面JS错误均0。本批线上生效状态未确认；下文为发布准备时的验证记录。

本批修复窄屏库存/定价表格、盘点录入保护和目录搜索深链，并将密集操作页的 AI 入口移至顶部，减少按钮遮挡。候选包含 16 个前端文件；完整源文件 Git blob 与测试证据见 `RELEASE_UI_BATCH_2026-10-21.json`。当前状态为本地验证通过，Dokploy 构建和运行身份尚未验证。

| 功能 | 本批行为 | 本地证据 |
| --- | --- | --- |
| Stock List / Capped Pricing / Bulk Price Edit | 1280px 以下使用字段卡片，搜索和数量档输入可用，密集页顶部 AI 单入口 | 五视口 `15/15`；`UAT_UI_RELEASE_STOCK_PRICING_2026-10-21.json` |
| Price Suggestions | 手机内容全宽，搜索/筛选/空状态/CSV/深链与 AI 入口可用 | `30/30`；`UAT_UI_RELEASE_PRICE_SUGGESTIONS_2026-10-21.json` |
| 商品/客户/供应商目录 | 搜索深链预填，320px 商品字段与工具栏可读，供应商只读查询不进入编辑页 | 深链 `15/15`、空状态恢复 `15/15`；`UAT_UI_RELEASE_DIRECTORIES_2026-10-21.json` |
| 盘点 | 卡片布局、40 项上限覆盖扫码、清空确认、取消/失败保留数量及重试 | 五视口 `5/5`、边界 `20/20`；`UAT_ODOO_STOCKTAKE_LOCAL_2026-10-21_FIVE-VIEWPORTS.json`、`UAT_STOCKTAKE_COUNT_BOUNDARIES_LOCAL_2026-10-21_AFTER.json` |
| 价格保存 | 失败后安全重试，批量改价错误提示贴近输入框 | 库存/封顶价 `8/8`；批量改价390/1024/1440px 各 `8/8`；`UAT_UI_RELEASE_BULK_SAVE_*_2026-10-21.json` |
| Vendor Connections | 平板卡片布局中编辑/删除操作可见 | 五视口 `5/5`；`UAT_VENDOR_CONNECTIONS_RESPONSIVE_LOCAL_2026-10-21_FULL-MATRIX.json` |
| AI 助手 | 更完整的快捷问句、能力门禁、键盘焦点、窄屏禁用文案、合成语音取消与失败恢复 | 能力 `10/10`、焦点 `5/5`、合成语音两项 PASS；清单列出对应证据 |

实际使用的客户/供应商入口位于 `pos-ui/app`，本批在此添加 Suspense；重复的 `src/app` 副本未纳入候选。静态检查使用 Node 24.19.0：TypeScript、16 个前端文件 ESLint、12 个发布脚本语法通过。本地未运行 Next/Maven/Docker build。

所有本地 UAT 的 API 由 Playwright fixture 拦截。它们证明交互、布局和请求负载；真实模型质量、真实 Odoo 写入、生产构建和 Demo 运行效果仍需分别验收。现有后端工作区修改不属于本批发布；后端文件树沿用候选基线，不能把本批静态检查视为后端 Java 21 验证。

部署验收需要 Dokploy 的 checkout SHA、完整构建日志、容器健康和 runtime SHA。当前未认证请求到部署页返回 HTTP 307 到首页，本会话无法核对 Source/Git；历史 webhook 曾返回 Branch Not Match，绑定核实前不重复触发。候选推送后仍保持“部署未验证”。

部署完成后先在 Demo 进行只读验收：四个库存定价页面的390/1440px布局、三类目录搜索、盘点页面与顶部AI、助手快捷问句和模态焦点。真实价格保存与库存调整在批准的隔离 Odoo 环境执行。
