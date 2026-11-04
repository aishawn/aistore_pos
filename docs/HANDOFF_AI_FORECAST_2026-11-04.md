# AI 销售预测与补货交接（2026-11-04）

## 当前目标续验（2026-11-04）

### 12:16 UTC 只读快照 freshness 复核

- 通过 SKR 项目凭据重新认证并读取 `/api/odoo/replenishment?coverageDays=21&validateSales=true`；登录、Odoo session 和补货 GET 均为 HTTP 200，`writeRequests=[]`。SKR 当前线上前后端为 `4162b68b126f9b7e0c832ac8992234a74a09ee46`，构建时间 `2026-11-04T10:53:49Z`。
- 最新库存状态仍为 `lastSuccessAt=2026-11-03T15:30:13+00:00`、`latestBusinessDate=2026-11-04`、`firstBusinessDate=2026-11-01`、`observedDays=4`、`gapDays=0`、`invalidSnapshots=0`；商品覆盖 `13035/13035`、仓库 `1/1`。供应商交期覆盖仍为 `0/13035`，质量为 `ODOO_SUPPLIERINFO_UNAVAILABLE`，状态 `REVIEW`。
- Dokploy Compose 页面只读确认 `inventory-snapshots-1` 容器处于 running（容器 ID 前缀 `714b1ddf16e6`，约运行 3 小时）；日志正文控件未能稳定展开，因此没有把容器运行状态当成新的采集成功证据，也没有重启、手动触发或修改环境变量。
- 结论：相对上一份证据没有新增原生库存业务日，`ai_forecast_walkforward_eval.py` 仍不能运行可信的 stockout/fill-rate 评估；继续等待自然采集并在下一轮只读检查比较同一 freshness 字段。

### 分群评测器优化与复跑（2026-11-04）

- `scripts/ai_forecast_segmented_eval.py` 原先在每个折/模型中为 2,000 个 SKU 重建 Pydantic 训练请求和响应，重复验证完整日期序列；改为直接调用预测引擎相同的显式模型归一化和区间计算。18 组（7/20/120 日序列 × 六模型）输出与 forecast engine 逐点完全一致。
- 使用 `.worktrees/ai-main-review/.local/ai-eval/skr-sales-snapshot-365d.json`（SHA-256 `1db83438ef97c0d131ee38994b222b8cd7538fdb9381a375a21a4710061f9729`）及 [店主确认闭店日](AI_SKR_CONFIRMED_CLOSED_DATES_2026-11-04.json) 完整复跑 7/14/28 天，约 21 分 43 秒完成。新版日历 SHA-256 `1f2962afc6d6e04152e24f672fd9488090e5d4badac4593a715fe982ce94f70d`；评测器 SHA-256 `a05b6e9494dbb98141e2704d8850aa58f97ad3d2b084a6fba376b5921b53dd02`。
- 与 [已提交分群报告](UAT_AI_FORECAST_SEGMENTED_2000SKU_2026-11-04.md) 对比，指标、配置、分群、时间折和门槛逐字段一致，差异 0。详情产物留在忽略目录 `.local/ai-eval/skr-segmented-open-days-365d-current.json`；线上/业务写入为 0。该销售-only评估不满足 `ai_forecast_walkforward_eval.py` 的库存感知要求；因没有足量原生库存标签，stockout-aware/fill-rate 评估仍阻塞。

### 0a4dc523 主线运行时复验（2026-11-04 09:24 UTC）

- `origin/main` 已推进到 `0a4dc523e3afee18013871a0701020405b487db9`（销售导入 effective write mode 审计修复）；SKR 和 Demo `/api/public/version` 前后端均报告该 SHA，构建时间 `2026-11-04T08:46:14Z`。这是此前 443 网络失败后观察到的主线更新；本地交接文档提交已重放到该 `origin/main` 之上。
- 针对新运行时重跑 SKR 只读 AI 检查：昨日 AUD 6.49 和 2026-10-16 AUD 7,738.14 均匹配直接 API，日期/as-of/门店/来源齐全；30 天滞销商品 50/50 匹配。周问答仍回复毛销售 AUD 28,234.20，直接 API 净收入 AUD 27,857.38，退款差额 AUD 376.82；经营问答“要买什么”仍只导航。页面错误 0、业务写请求 0。
- 补货 GET 返回 2,263 商品且目录覆盖完整。原生库存仍 `latestBusinessDate=2026-11-04`、4 个连续日、商品覆盖 13,035/13,035、仓库 1/1、交期覆盖 0%，`status=REVIEW`、`purchaseMode=DRAFT_RFQ`；采集最近成功时间未变。预测与采购保持人工审核。
- 脱敏本轮摘要：[UAT JSON](UAT_AI_READONLY_AFTER_0A4DC523_2026-11-04.json)，详细测试会话：[SKR AI 运行时复验](test-sessions/2026-11-04-skr-ai-after-0a4dc523.md)。

### 最新线上只读复验（2026-11-04 08:11 UTC）

- SKR 前后端仍运行 `91e1ed2b5322fd2eae40aa2613bd23dbd69d4eed`。昨天销售 AUD 6.49、2026-10-16 销售 AUD 7,738.14 与只读 API 一致；30 天滞销前 50 个商品与直接 API 50/50 匹配，来源、范围和 `dataAsOf` 字段齐全。
- “last week”回答 AUD 28,234.20，等于直接 API `grossSales`；净销售 `revenue` 为 AUD 27,857.38，退款 AUD 376.82。按净销售口径验收仍失败；“What do we need to buy?”仍只导航到补货页，没有给出采购建议。
- 补货 GET 返回 2,263 商品、完整目录覆盖。库存历史状态为 `SUCCESS`：`lastSuccessAt=2026-11-03T15:30:13Z`，业务日 `2026-11-01` 至 `2026-11-04` 共 4 天、`gapDays=0`、无无效快照，商品覆盖 13,035/13,035、仓库覆盖 1/1。与上一份交接相比最新业务日和观测天数未增长；交期覆盖仍为 0%，状态 `REVIEW`、采购流程 `DRAFT_RFQ`。
- 本轮页面错误 0、业务写请求 0；没有触发库存 worker、RFQ 或采购单。脱敏摘要：[UAT JSON](UAT_AI_READONLY_RERUN_2026-11-04_0811Z.json)，运行记录：[测试会话](test-sessions/2026-11-04-skr-ai-rerun.md)。

### 原生库存事件时间抽查与后续 freshness 检查

- 对已保存的 SKR 只读 `stock.move` 导出逐行核对：303,830 条移动的事件 `date` 与 `writeDate` 均有值，company 均为 5，时间覆盖仅 `2026-10-26` 至 `2026-11-02`；303,225 条是内部库位发往 customer 的 POS 出库，603 条为内部移动，1 条为库存调整。`date` 可作这些移动的事件时间，但该窄时间窗和缺少对应完整逐日库存基线，不能据此重建 365 天可售库存或计算 fill rate。
- Odoo 盘点抽样（`aipos_uat`、company 5）显示 2 条 `stock.move` 库存调整，`date/createDate/writeDate` 一致；10,968 个 `stock.quant` 行仅 1 行带 `lastCountDate`，盘点数量字段无有效集合行；旧 `stock.inventory` / `stock.inventory.line` 模型不可用。这些零散事件不足以形成全店历史盘点标签。
- 08:31 UTC 再次以 SKR 项目凭据认证读取补货接口：后端仍为 `91e1ed2b`；库存最近成功时间仍为 `2026-11-03T15:30:13Z`，`latestBusinessDate=2026-11-04`、`observedDays=4`、`gapDays=0`，没有较 08:11 UTC 检查新增。未调用 worker；仓库的销售回放 job 40 不作为库存快照采集证据。
- 本地 GitHub `origin/main` 仍只到 `91e1ed2b`；本轮远端查询失败（GitHub 443 connection reset），提交 `8f6066e8` 尚未推送，也未触发 Dokploy。

- 已完成 365 天、2,000 SKU 的六模型营业日掩码分群回测。销售快照 SHA-256 为 `1db83438ef97c0d131ee38994b222b8cd7538fdb9381a375a21a4710061f9729`，店主确认闭店日表 SHA-256 为 `b756a4869b923542bfc265688eb58966328bc05ac787af005a23321a89e90d20`。机器可读结果见 `docs/UAT_FORECAST_ROLLING_BACKTEST_2026-11-04.json`，216 行逐分群/模型 CSV 见 `docs/UAT_AI_FORECAST_SEGMENTED_OPEN_DAYS_ALL_MODELS_2026-11-04.csv`。
- 在当前主线代码上使用同一 365 天原始快照和闭店表重新运行 `scripts/ai_forecast_segmented_eval.py`；与既有分群 JSON 忽略生成时间后递归逐字段完全一致，规范化 JSON SHA-256 均为 `27876f2ea5ed52039429d5e26b26bdce598db4a00b6cbb8392e7f05e56e41743`，2,000 SKU、7/14/28 天、35/17/8 folds、写请求 0。可复现性确认不改变原有发布门禁结论。
- 两个落入窗口的闭店日（2025-12-25、2026-04-03）均从训练暴露、分群频率、MASE 差分及 holdout 评分排除，未移动日期索引。冠军 WAPE 仍为 103.6%–172.1%，新品代理 Bias 为 -83.6% 至 -88.0%；预测结构违规 0、预测窗口覆盖 100%、写请求 0。结论仍是不准入。生产 forecast engine 仍不识别门店营业日历；stockout/fill rate/成本没有可信标签。
- 预测接口返回完整商品目录覆盖和 100% 快照商品覆盖，但原生库存只有 4 个连续观测日、交期覆盖 0%，状态 `REVIEW` / `DRAFT_RFQ`。Dokploy 的 `inventory-snapshots` 日志面板曾显示 `No logs found`；08:11 UTC 的认证只读补货接口随后确认 `lastAttemptStatus=SUCCESS` 和成功时间，但 `latestBusinessDate` / `observedDays` 未增长，不能据此宣称库存历史已扩充到可回测长度。

## Main 部署后 AI 只读复验（2026-11-04 06:50 UTC）

- 主线提交 `91e1ed2b5322fd2eae40aa2613bd23dbd69d4eed` 已在 SKR 与 Demo 的 `/api/public/version` 核对：两店前端和后端均运行该 SHA，构建时间为 `2026-11-04T06:36:50Z`。本提交包含营业日离线评测工具与文档，不含 `pos-api` 退款修复。
- SKR 昨日销售回答 AUD 6.49 与直接 dashboard API 一致；2026-10-16 精确日期回答 AUD 7,738.14 与 `sales-daily` API 一致。两者均包含日期、`dataAsOf`、门店范围和来源字段。
- 2026-10-26 至 2026-11-01 周销售回答/表格仍为 AUD 25,990.14；同范围净销售 API 为 AUD 25,613.32，差额 AUD 376.82，与退款总额相同。周范围、as-of、门店和来源字段齐全，因此属于退款符号/口径错误；此项仍 `FAIL`。
- 30 天滞销问答返回 50 个商品，逐行与 Odoo 直接 API 比较 50/50 匹配，范围为 2026-10-06 至 2026-11-04。`What do we need to buy?` 仍只导航到补货页，不构成采购建议验收。
- 预测 GET 返回 2,263 个商品；原生库存历史覆盖 13,035/13,035 商品，但只有 4 个连续观测日（最新业务日 2026-11-04），供应商交期覆盖 0/13,035，状态 `REVIEW`，采购仍为 `DRAFT_RFQ`。未触发 worker、未创建 RFQ 或采购单，写请求为 0。
- 结构化证据：[在线只读摘要](docs/UAT_AI_READONLY_AFTER_91E1ED2B_2026-11-04.json)，详细运行保留在忽略目录 `.local/ai-eval/online-ai-after-91e1ed2b.json`；测试会话见 `docs/test-sessions/2026-11-04-skr-ai-after-main.md`。

## 前一轮线上只读复验（2026-11-04 05:13 UTC；运行时 8aeb80dd）

- SKR 前后端运行时均为 GitHub `main` 的 `8aeb80dd6d34014c04732344150fdcf09231f0f9`，页面错误 0。昨天销售问答 AUD 6.49 与 dashboard API 一致；2026-10-16 精确日期问答 AUD 7,738.14 与 `sales-daily` API 一致。日期、`dataAsOf`、门店范围和来源信息均可追溯。
- 周销售问答仍失败：2026-10-26 至 2026-11-01 的回答和表格均为 AUD 25,990.14；同范围 `sales-daily.netSales` 合计 AUD 25,613.32，差额 AUD 376.82，等于该范围退款额。问答与自身表格一致，但销售口径仍把退款计入，不能验收通过。当前 `main` 的 `OdooReportQueryService` 没有 `is_refund=false` 过滤。
- 实际经营问答“Which products have had no sales for 30 days?”命中 `report_dead_stock`，返回 50 个商品；逐一与同会话 `/api/odoo/dead-stock` 的正库存、30 天零销量集合核对，50/50 命中。`dataAsOf`、范围、来源均存在，`writeRequests=[]`。另一个“What do we need to buy?”仍只导航到补货页，不是建议数据本身的验收。
- 预测 GET 返回 2,263 商品、预测接口状态 `AVAILABLE`。原生库存历史覆盖 13,035/13,035 商品、1/1 仓库，最新业务日 `2026-11-04`，连续观测日 4、缺口 0；交期覆盖 0/13,035、库存历史状态 `REVIEW`，采购仍 `DRAFT_RFQ`。已有 `SKR inventory snapshot review` 每日监测处于 ACTIVE，按 05:30 本地时间检查次日快照；本轮没有手动触发 worker。
- 本次仅登录/注销、AI 问答和只读 API；未创建 RFQ、采购单或修改商品/库存/销售。完整响应保存在忽略目录 `.local/ai-eval/skr-readonly-rerun-2026-11-04-operational.json`；摘要见 `docs/UAT_AI_READONLY_RERUN_2026-11-04_CURRENT.md`。
- 此前本地退款修复候选 `d74daba4` 尚未合入当前主线。`pos-api` 改动必须在精确 SHA 上先通过远端 Java 21 `mvn -B clean verify`；当前工作流没有手动触发入口，不能以本次已部署的文档/脚本提交代替退款候选 SHA 的预推构建。采购仍保持只读/人工审核。

## 交期样本续核（2026-11-04）

- 复核忽略目录中的最新审核抽样：62 个订单、1,379 条订单行，62/62 仍为空白 reviewer decision，均为 `NEEDS_EVIDENCE`；没有业务确认或主数据写入。
- 店主反馈这些候选是 Shopfront 同步数据，但本人无法确认 `orderDate` / `receivedAt` 的采购批准和实到语义，也无法确认 GST、采购单位、运费及费用口径。crawler 的 GraphQL 查询确实读取 Shopfront 的 `orderDate`、`createdAt`、`sentAt`、`receivedAt` 和采购行数量/箱规/成本字段，并保留原始 payload 与单独的 `synced_at`；这证明来源链，不证明业务含义。审核 CSV 的 62 个样本日期/成本候选字段存在，但业务证据与 reviewer decision 仍全空。
- 正确按 Adelaide 收货日期计算后，2 个负差样本为 −29 天和 −1 天（均为订购量 0、收货量正数）；另有 10 个超过 30 天样本，以及 5 家主要供应商各 10 个常规样本。较早候选文档中的 8 个负差使用了旧日期口径，应以本轮有时区的审核 CSV 为准，不能回写采购交期。
- 样本成本的 GST、箱/瓶换算和运费/返利口径仍待业务确认；须取得供应商发票/送货凭证或书面字段定义，不能仅凭“来自 Shopfront 同步”接受为事实。逐条 CSV 在忽略目录 `.local/ai-eval/leadtime-review-order-samples-2026-11-04.csv` 与 `.local/ai-eval/leadtime-review-samples-2026-11-04.csv`；修订说明见 `docs/AI_LEADTIME_MANUAL_REVIEW_RERUN_2026-11-04.md`。
- SKU 销量分群重评通过 `ai_forecast_segmented_eval.py` 完成。`ai_forecast_walkforward_eval.py` 需要时间可信、覆盖完整的原生库存历史作为 `--inventory-history` 输入；本地目前没有对齐 365 天销售序列的库存标签文件，线上也只有 4 个连续原生日。stockout-aware 评估未运行，不能以 `qty_available(to_date)` 回建值替代。

## 本轮续测结果（2026-11-04）

- 已部署 crawler 诊断提交 `3c924c28`。在原失败 run 161 的唯一一次受控重试中，run 165（2026-11-03 单日）完成 `sales=129`、`sales_imported=129`，primary 与 mirror 各 1 批均返回 `STAGED`。
- 回放诊断：本地销售总数 155,665；日期窗口命中 `created=113`、`updated=113`，但 `synced_at` 命中 129，条件并集 129，`synced_at` 空值 0。结论是缺少的 16 条是历史业务日期不在窗口，而不是销售源行缺失；持久化同步标记已使重放完整通过。
- 线上只读 AI 回归运行时前后端均为 `3c924c28`。销售精确日期问答与 API 金额匹配；周汇总问答本轮仍有金额不匹配。补货只读探针 Demo/SKR 均 `PASS`，`nonGetOdooCalls=[]`、`writeRequests=[]`。
- 当前预测门禁仍保持 `REVIEW`：SKR 原生库存仅 4 个观测日、供应商交期覆盖 0%；Demo 原生库存 3 个观测日、供应商交期覆盖 0%。未启用自动采购，未提交 RFQ。
- 本轮只读库存 move 采集完成 303,830 条；`date` 与 `writeDate` 缺失均为 0，companyId 均为 5，写请求为 0。但事件实际覆盖仅 2026-10-26 至 2026-11-02，其中 303,225 条为出库到 customer、603 条为内部移动、1 条为 inventory 调整，没有足够的收货/盘点事件覆盖 365 天。因此事件时间可信不等于库存状态可重建，仍不得用它计算 stockout 或 fill rate。
- 自动后续任务结果：客户同步已完成；供应链同步因 Shopfront 限流为 `partial`，Odoo 客户同步此前出现 `401 Unauthorized`，这些是独立的数据管道问题，不能作为模型准确率证据。

## 结论摘要

截至 2026-11-04，已完成 SKR 365 天营业日掩码版和 730 天只读销售滚动回测、分群比较、部分历史库存质量研究，以及补货功能的线上只读验证。日历修正没有改变发布结论：所有可用冠军分群仍未达到 WAPE 门槛；库存研究标签也不是原生盘点事实。当前证据支持继续提供带质量说明的预测与人工审核补货建议，不支持全店切换模型或自动采购。

**决策：** 保持 `AI_FORECAST_ENABLED` 的自动采购门禁关闭；不提升 TSB、Croston SBA 或指数平滑为全店默认模型；采购建议必须人工确认。安全违规为 0 仅代表已测预测输出满足有限的非负、区间顺序等结构约束，不代表经营收益或库存服务水平已经验证。

## 已完成

- 只读扩展 SKR 销售样本至 365 天、2,000 个商品序列；另对销量较高的 500 个商品建立 365 天 `qty_available(to_date)` 研究库存标签。
- 完成 365 天分群 walk-forward 回测，并依据店主确认的门店闭店日做营业日掩码复评。训练起点前数据用于分群与选模，较晚 folds 做 holdout；比较 7、14、28 天 horizon。营业日版 champion WAPE 为 1.036–1.721，新品代理 Bias 约 -0.84 至 -0.88，不足以支撑生产补货。旧日历日结果保留作历史记录，当前报告已改用营业日版本。
- 扩展至 730 天和第二个季节窗口。TSB 在间歇销量及周内模式代理分群有相对优势，但 WAPE 仍约 1.1–1.6，近期开卖商品代理严重低估；绝对 WAPE 门槛所有分群均未通过。
- 对重建库存做一致性筛查。365 天 500 商品中有 107 个矛盾商品被标记，不应拿来验收缺货或服务水平。`qty_available(to_date)` 是基于历史库存移动重建，不等于原生逐日盘点快照。
- 更早的 180 天库存回测使用 500 商品中的 415 个可评估序列，85 个因库存与销量矛盾排除；选中策略 7 天 horizon-total WAPE 为 0.617，未通过 0.30 探索门槛。
- 模型评测和 Odoo 数据获取均为只读，报告中的 `writeRequests=[]`；当前线上补货/滞销库存接口验证也保持只读并要求人工审核。
- 此前完成的 AI 问答/在线报表只读回归与线上数据入口可继续用于人工分析；本交接不把这些结果误当成预测准确率或补货收益验证。
- 历史线上回归（运行时 `767c018...`，已被本节当前复验 supersede）：当时精确日期金额对账通过，但周问答失败且缺少部分 provenance。当前状态见文首“当前目标续验”。历史证据保留于 `.local/ai-eval/online-ai-readonly-current.json`。
- 本次线上补货快照已增长到 4 个连续原生库存日，数量字段和商品覆盖完整，但交期覆盖仍为 0%，状态仍 `REVIEW`，不能进行 stockout/fill-rate 或成本准入。

## 销售数据与闭店日期口径

已同步覆盖的数据规模（用户确认）：商品 11,024、库存 10,846、销售 155,536、销售行 304,770、支付 187,436、供应商 109、采购订单 2,355、客户 20。

SKR 序列中被询问的 19 个日期，用户已确认**全部闭店**：2024-01-01 至 2024-01-05、2024-01-10、2024-01-14 至 2024-01-17、2024-01-19、2024-01-21、2024-01-24、2024-03-29、2024-12-25、2025-04-18、2025-12-25、2026-04-03。对营业日历覆盖到这些日期的序列，它们应编码为“闭店、非营业日、销量零”，不能标记成同步缺口，也不能把它们当作正常营业日零销量来训练需求率。

当前 365 天评测窗口为 2025-11-04 至 2026-11-03；此前 730 天评测窗口为 2024-11-03 至 2026-11-02。因此上述 2024 年 1 月日期在这些回测窗口之外，不会改变这些回测的数值。它们应在使用覆盖到 2024 年 1 月的更长历史数据时应用，并留存为已确认的店铺营业日历事实。

## 尚未完成 / 仍被门禁阻止

- 2026-11-04 趋势缺日诊断已完成：已核对的 19 个空档均由店主确认是闭店；crawler 源库逐日 reconcile 均为摘要 0、销售 0。详见 `docs/AI_SALES_TREND_GAP_DIAGNOSTIC_2026-11-04.md`。趋势 API 仍未返回显式营业日历状态，长历史展示/训练时必须使用门店日历过滤闭店日。
- SKR crawler job 40 已终态失败（`pos_import`，history chunk `2026-11-01..2026-11-03`）；失败后无 active job，当前源库计数不能宣称为最终历史覆盖。
- 交期人工审核候选已从 Shopfront 采购镜像抽取：2,306 个 `RECEIVED` 订单、31,513 条采购行具备供应商/箱规/基础成本/收货数量，已收订单均有 `receivedAt`；日期差范围为 -29 至 316 天，中位数 1 天。候选见 `docs/AI_LEADTIME_MANUAL_REVIEW_CANDIDATES_2026-11-04.md`，审核表见 `docs/AI_LEADTIME_MANUAL_REVIEW.md`。这些仍是待人工确认的 Shopfront 事件，不能替代 Odoo 供应商交期。
- 历史线上只读回归（运行时 `767c018...`，已被本节当前复验 supersede）：当时周问答仍无法对账。退款根因和当前金额差见文首“当前目标续验”。
- 本地已补 `AssistantFastPathRouter` 对 `sales last week`、`How much did we take last week?` 等只读报表问法的确定性路由，并增加回归断言；尚未部署。由于涉及 `pos-api`，推送前必须完成同一候选 SHA 的 Java 21 远端 `mvn -B clean verify` 门禁。
- 历史 SKR 只读回归（运行时 `767c018...`，已被当前 `6c308958...` 复验 supersede）；结果仅作为历史记录，当前核对见文首证据。
- 续测已同时验证 Demo/SKR 补货只读接口：两店均返回 200、产品覆盖完整、写请求为 0；Demo 原生库存 3 日、SKR 4 日，交期覆盖均为 0%，均保持 `REVIEW`。SKR `last week` 仍返回 50210。逐日趋势扫描发现的 19 个无行日期均已由店主确认闭店。详见 `docs/UAT_AI_READONLY_CONTINUATION_2026-11-04.md`。
- 任务 40 已终态失败（`pos_import`，history chunk `2026-11-01..2026-11-03`，仅载荷记录 113 条销售），失败后无 active job；审计计数仍有 818 条 `INCOMPLETE` 销售，因此当前覆盖不能宣称完整。受控重放 run 165 已证明缺少的 16 条是旧业务日期超出原重放窗口，不能据此宣称全历史同步完成。证据：`docs/UAT_SHOPFRONT_SYNC_FAILURE_2026-11-04.json`。
- provenance 曾在候选 `9896617e` 中实现；当前线上 `6c308958...` 的问答响应已返回这些字段并由本轮只读检查确认。精确日期问答仍需保留结构化字段作为验收标准，不能仅查答案文本。
- 路由类已在本机 Temurin Java 21 独立编译，并用黑盒 runner 验证 `sales last week`、`How much did we take in the last week?`、`sales for the last week`、`What were our sales for the last week?` 和 `sales last 7 days` 均返回 `report_sales`；这只是局部静态/行为检查，不替代完整 Maven 门禁。

- 原生逐日库存快照尚未积累到 28 个连续业务日，不能严格评估真实 stockout、fill rate、库存成本或采购策略收益；之前记录的状态为 `INSUFFICIENT_HISTORY`。运行下一轮前应重新读取快照 freshness 记录，不能假定计数没有变化。
- 库存历史标签是 Odoo `qty_available(to_date)` 回溯重建，不是当日实际盘点/可售库存事实。
- 退款/更正目前在部分销售回测里被 `max(0, units)` 截断；需要明确 gross demand 与 net demand 口径，并单独校验退款、退货、撤销和报损。
- 供应商交期、MOQ、箱规、真实采购成本、促销/售价、到货延迟、保质期和实际缺货损失尚未逐商品逐日期完整关联。因此填充率、缺货损失、持有成本及澳元节省尚未验证；成本缺失时必须显示 `COST_CONFIG_REQUIRED`。
- 365 天报告中的 WAPE 高于 1 表示绝对误差超过实际销量总量；相对基线改善不等于可用。长尾、低销量、新品和缺货删失需求尤其需要单独处理。
- 线上已验证的只读预测入口不能替代发布版本回归和真实门店采纳效果验证。任何 AI 命令执行、创建/确认采购单仍保持关闭。

## 下一步建议（按顺序）

1. **把门店日历接入生产预测契约。** 当前闭店表只用于离线指标；为销售序列定义闭店、营业零销量、营业有销量、数据缺口，并让预测 API 明确接收营业日历。通过针对闭店连续、周末模式与未知日历的回归后再在主线启用。
2. **继续累计原生库存快照。** 检查 freshness、连续业务日数、覆盖 SKU 数和缺口；达到 `READY_FOR_NATIVE_STOCKOUT_BACKTEST` 门槛后，才报告 stockout/fill-rate。历史重建库存继续作为研究标签，并与原生快照分开。
3. **修复 SKU/供应商标签。** 对库存矛盾追查公司/仓库/地点范围、单位、负库存、初始化和库存移动；补充并由店主确认供应商交期、MOQ、箱规和成本。未确认行保持人工审核，不写回主数据。
4. **改善预测目标与分群。** 新品代理严重低估，应先比较是否售出分类和同类别/品牌/价格带 analog；长尾主要评估补货触发与风险排序。保留多个营业日窗口、严格时间切分和独立 holdout，不能按验证冠军直接自动订货。
5. **将建议留在人工审核队列。** 展示预计耗尽日、建议数量、供应商、成本来源、数据质量、原因和置信度；库存/成本/交期冲突时阻止建议升级。记录店主采纳、修改、到货和售罄结果。
6. **拥有可信标签后再验证经营价值。** 分别测量缺货天数、fill rate、过量库存、滞销现金占用、报损/过期和人工采纳率；没有库存事件、真实提前期和成本前不报告澳元节省。

## 关键证据与代码

- 365 天营业日分群报告：`docs/UAT_AI_FORECAST_SEGMENTED_2000SKU_2026-11-04.md`；本次结构化结果：`docs/UAT_FORECAST_ROLLING_BACKTEST_2026-11-04.json` 和 `docs/UAT_AI_FORECAST_SEGMENTED_OPEN_DAYS_ALL_MODELS_2026-11-04.csv`。
- 730 天分群报告：`docs/UAT_AI_730D_SEGMENTED_BACKTEST_2026-11-03.md` 及同名 JSON。
- 365 天扩展样本报告：`docs/UAT_AI_EXPANDED_DATA_ROLLING_BACKTEST_2026-11-01.md` 及同名 JSON。
- 决策与数据质量研究：`docs/AI_FORECAST_NEXT_STEP_DECISION_2026-11-02.md`。
- 验收流程：`docs/AI_FORECAST_ACCEPTANCE_RUNBOOK.md`。
- 分群评测器：`scripts/ai_forecast_segmented_eval.py`。
- 原始销售和库存数据保存在本地忽略目录 `.local/ai-eval/`，不应提交到 Git 或复制进交接文档。

## 复现与发布边界

复跑前先检查本地 `.local/ai-eval/` 快照和脚本版本，确认日期窗口、公司范围、营业日历、退款处理、商品集合、分群方法及模型参数均记录在产物中。所有历史数据读取继续使用 Odoo JSON-RPC 只读路径。线上功能验证仅在授权商店执行：SKR 只读，Demo 可写权限不代表本任务可以做业务写入；这轮预测验收保持零业务写入。发布到线上前需单独确认目标服务、提交 SHA、部署 SHA、功能开关和回滚方式。
