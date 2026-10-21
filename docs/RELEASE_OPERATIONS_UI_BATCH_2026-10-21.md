# Orithos 盘点、采购收货与补货 UI 批次

本批解决盘点搜索可误用旧商品、采购/收货请求中 Escape 关闭弹窗、收货成功反馈被详情刷新清除，以及补货覆盖天数改变后仍可用旧建议创建草稿的问题。前端基线为 `1897d8b2f65946ddedef63f1dbe7437548851ca5`，后端保持该基线文件树；工作区的后端候选不在此批。

| 功能 | 修改后的行为 | 验证 |
| --- | --- | --- |
| 盘点搜索 | 改词即撤销旧请求、隐藏旧商品与旧错误；等待期间不能扫码加入旧商品，快速改回原词仍完成搜索 | 三视口39/39；原计数边界20/20、五视口布局5/5 |
| 采购确认/收货 | 请求期间 Escape、关闭入口和数量编辑受保护；失败保留输入，同负载重试 | 三视口34/34，含确认失败/成功、收货失败/成功 |
| 收货反馈 | 成功信息保留到详情刷新后；刷新失败时同时显示已收货与读取错误，重试详情不再提交收货 | 1024px故障注入覆盖，包含在34项内 |
| 供应商恢复 | 供应商错误和提交错误分开；可原地Retry suppliers，保留人工修改数量；失败不沿用旧供应商列表 | 四视口供应商专项40/40；最终计划综合矩阵60/60 |
| 补货计划 | 初始Odoo读取失败可重试；切换覆盖天数/刷新中及失败后禁止从旧计划创建RFQ；说明与当前数据天数一致 | 四视口综合60/60；新增4类保护在修复前16项失败 |

证据文件：

- `UAT_STOCKTAKE_SEARCH_RACE_LOCAL_2026-10-21_FULL.json`
- `UAT_STOCKTAKE_COUNT_BOUNDARIES_LOCAL_2026-10-21_SEARCH_REGRESSION.json`
- `UAT_ODOO_STOCKTAKE_LOCAL_2026-10-21_SEARCH_REGRESSION.json`
- `UAT_PURCHASE_BUSY_LOCAL_2026-10-21_RELEASE.json`
- `UAT_REPLENISHMENT_PLAN_RECOVERY_LOCAL_2026-10-21_RELEASE.json`

截图位于同日 `stocktake-search-full`、`stocktake-search-regression`、`purchase-busy-release` 和 `replenishment-plan-release` 目录。所有本地业务API由Playwright拦截，提交仅到fixture；它们证明UI状态、负载和恢复行为，不能证明真实Odoo采购、收货或库存调整成功。

静态检查使用Node24：TypeScript、三个前端文件的定向ESLint、相关脚本语法及diff格式。未运行本地Next/Maven/Docker build。候选源文件与证据的Git blob见同名JSON清单；只有对应检查成功后才完成提交。

前一已推送批次的真实Demo只读续验：库存定价8/8、盘点12/12、目录与助手44/44。分别见 `UAT_UI_BATCH_DEMO_RUNTIME_RECHECK_2026-10-21_1897D8B.json`、`UAT_STOCKTAKE_DEMO_RUNTIME_BASELINE_2026-10-21_1897D8B.json`、`UAT_DIRECTORIES_ASSISTANT_DEMO_2026-10-21_1897D8B_CORRECTED.json`。这些是本批发布前运行行为基线，运行SHA未核验，不能作为本批修复已上线的证据。

当前交接与父工作区 `docs/功能说明.html` 同步记录此进展；HTML位于嵌套应用Git仓库之外。整体试点仍NO-GO：后端同候选SHA远程Java21门禁、运行版本身份、真实隔离Odoo业务闭环和现场设备验收仍待完成。后续合批部署后先做真实Demo只读检查，采购确认/收货及库存写入在批准的隔离环境验收。
