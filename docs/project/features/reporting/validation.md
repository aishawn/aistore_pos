# 历史毛利验证

更新日期：2026-11-03；负责人：待指定。套件 RPT-001 的定向子集，不宣称整套通过。

- 本地：23 项税额/成本单元测试、类型检查、定向 lint 通过；源码 d85bc0af。
- 线上只读：b7249014 来源毛利 API 与桌面/手机界面通过，2026-11-02 当地日 133 笔完成订单，毛利 830.18，毛利率 25.385749%。
- demo 事务：aipos_uat 公司 137 单笔订单，税额 0.73、含税 7.98、修正未税 7.25；税引擎复算及新事务回滚确认通过，提交业务写入 0。Odoo 源码 SHA 未记录，不以 POS SHA 代替。
- 新鲜 SKR 税快照：162 笔，97 支持建议、81 有差异、65 待查；只读且完整覆盖，不授权执行。

原始汇总：[UAT](../../../UAT_SOURCE_TAX_MAPPING_2026-11-03.json)。[测试 session](../../../test-sessions/2026-11-03-source-margin-tax-mapping.md)与[测试索引](../../../TEST_REPORT_INDEX.md)保存范围。未核实采购成本、退款关联、全量财务修复与剩余库存不在 PASS 声明内。

新增来源复核：直接 Shopfront 全天 134 笔/完成 133 笔，毛利 830.18，与报表相同；388 笔候选退款复取 592 行。19 项 crawler 测试覆盖无 outlet 查询、来源补证不被两层 unchanged 路径跳过、重复补证不增行与签名成本。候选查询哈希和结果见[来源证据](../../../UAT_SHOPFRONT_REFUND_SOURCE_EVIDENCE_2026-11-03.json)，不是原生账已修复。快照候选清单依赖镜像发现，未证明独立全源完整性。

Crawler 全目录回归最终单轮 45/45 通过（25 warnings），包含已有历史任务 mock/库存 fixture 修正；详见[本次 session](../../../test-sessions/2026-11-03-source-refund-evidence.md)。

采购来源只读抽样：首批 50 笔、2794 行，48 笔发票号、45 笔收货日期；数量/箱规/baseCost 无空值，lineCount 均吻合。本批无附件；hasNextPage=true，不能推广至全源，计价与税额仍未认证。[证据](../../../UAT_SHOPFRONT_PURCHASE_SAMPLE_2026-11-03.json)。

采购查询新增 enteredAs/附件描述：`python -m pytest tests/test_supply_chain.py tests/test_core.py -q --disable-warnings` 20 passed、4 warnings；源端抽样已证明字段可读，但不是当前候选已部署证明。


2026-11-04 source-margin window online read-only: 56 Adelaide dates, direct API observed 8,249 orders /8,214 completed /16,302 lines match each daily mirror ID and financial projection hash. Live source margin API on fcdccef reports the same order totals, source cost153954.29, profit54905.00 and26.288033%; 401 auto-recovers to200, writes0. All lines remain accounting-unverified. Line aggregation has 1,909 differing orders (tax1.65, cost3.31, gross0); source pagination boundary 2024-03-21 remains incomplete and later pages may add older orders. [Evidence](../../../UAT_SOURCE_MARGIN_WINDOW_2026-11-04.json). Full source capture remains active at the separately recorded 385-page checkpoint.

库存另项只读对账（14:41 UTC）：10968 个 quant，来源快照加后续完成移动后 7488 数量相等、1769 残差、1711 来源身份待查。此前4958项修复仍全部算术相符；缺少直接调整台账/期初/实盘，不执行新库存修复。[证据](../../../UAT_MARGIN_INVENTORY_MOVEMENTS_2026-11-03.json)。

采购另一次完整分页读取（14:42 UTC）：48页、2358笔/32925行，2308笔已收货，其中1987笔有发票号；接口返回附件0、lineCount差异0。逐单缺证清单全部未认证；税额、费用单位、历史计价及外部发票仍待核实。不是原子时点快照，不执行财务写回。[证据](../../../UAT_SHOPFRONT_PURCHASE_FULL_2026-11-03.json)。

demo整日税额事务演练v3：读取501来源行完整覆盖162单/303行，37单44行税引擎复算及保存通过，125单因税引擎/行身份/来源合计/状态待查；新事务完整回滚核验通过。created_at是char，读取前后三天后严格按raw时间筛选，禁止文本T/空格边界漏读。仍非全历史已修复。[证据](../../../UAT_DEMO_SOURCE_TAX_BATCH_2026-11-03.json)。合并库存同步修复并处理无job_id未初始化变量，48项crawler测试通过，尚待部署。


2026-11-03补记：bc7f4a2d已部署且运行SHA/三份crawler文件哈希核验；来源报表第二次明确点击只读PASS（133单、毛利830.18、25.385749%），首击401独立登记，不称全流程PASS。会话恢复修复仅将两个只读报表POST列入401可重试范围，503等昂贵失败不重跑，财务写入不自动重放。65单税引擎阻断只读诊断发现50单单价/总额差、22单来源零税与当前GST10冲突，原因重叠；不据此认证免税或执行批量修复。见[本次session](../../../test-sessions/2026-11-03-margin-release.md)。


b8de6af4后续已部署，SKR真实按钮一次点击401自动恢复200通过，前后端SHA一致，毛利830.18/25.385749%，业务写入0。[首击恢复证据](../../../UAT_MARGIN_SESSION_RECOVERY_2026-11-03.json)。成本/全历史修复仍未通过。


2026-11-04：税额清单v2补齐实际单价/折扣/税ID前置校验，保留吻合输入，否则只建议来源实付有效单价，不能冒称历史标价/折扣；即使subtotal正确仍检查计税输入。缺失输入旧快照退回review。全历史税额采集器保留窗口与双哈希，执行仍被税定义/精度/税引擎/过账检查阻断。demo162单v4演练64单81行通过、98待查，28行有效单价归一化后重算，完整回滚确认；真实价格精度2阻断15单，来源零税分类阻断21单。33项单测及类型检查通过。[session](../../../test-sessions/2026-11-04-source-tax-pricing.md)。


全历史税额v2新采集完成155142单303839行，97158单差异建议、48740review；48窗口/模型检查与4全域write_date检查通过，仍非原子快照且禁止执行。支持行61924需有效单价调整、140427来源非零税却无行税关联；294来源完成单缺原生匹配。[全量证据](../../../UAT_SOURCE_TAX_HISTORY_V2_2026-11-04.json)。远端新同步时段list导致CronTrigger启动错误已本地复现并修复；独立来源读取受部署重建中断，保留页面待恢复，尚非全源读取完成。


ac961d18 crawler启动修复已在线健康/文件哈希核验；独立来源保留198页后续读，PID38存活，16:41 UTC仅218页4960单，尚未全量完成。离线完整性/镜像投影校验器6项本地测试通过，真实全历史验证NOT RUN；财务写入0。[证据](../../../UAT_SOURCE_SALES_RESUME_2026-11-04.json)。
