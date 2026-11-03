# 关键结论证据登记

复核日期：2026-11-03。来源元数据以[evidence.json](evidence.json)及链接原文件为准；版本缺失写 null。这里是引用层，稳定套件及 session 结果仍归[测试索引](../TEST_REPORT_INDEX.md)维护。结果均保留适用范围，所有 releaseAccepted=false。

| ID | 类型 / 结果 | 范围与结论 | 原始材料 |
|---|---|---|---|
| E-SOURCE-TAX | online-write / PASS（demo 回滚子集） | 来源毛利只读及 demo 单笔税引擎/回滚；提交业务写入 0，不代表全历史财务修复 | [材料](../UAT_SOURCE_TAX_MAPPING_2026-11-03.json) |
| E-RO | online-readonly / PASS | Demo/SKR 各 23 项；目录 12987/12999；报表各 23/23；交期 0%；快照 2/3 天 | [材料](../../docs/UAT_AI_READONLY_VALIDATION_2026-11-03.json) |
| E-WF-DEMO | online-readonly / BLOCKED | 390 条完整问法；379 PASS / 11 BLOCKED / 0 FAIL | [材料](../../docs/UAT_AI_WORKFLOW_FULL_EXACT_SHA_2026-11-03_DEMO.json) |
| E-WF-SKR | online-readonly / BLOCKED | 390 条完整问法；382 PASS / 8 BLOCKED / 0 FAIL | [材料](../../docs/UAT_AI_WORKFLOW_FULL_EXACT_SHA_2026-11-03_SKR.json) |
| E-RETRY-DEMO | online-readonly / BLOCKED | 11 条定向重试；11 项检查 PASS；整份报告 BLOCKED | [材料](../../docs/UAT_AI_WORKFLOW_EXACT_SHA_RETRY_2026-11-03_DEMO.json) |
| E-RETRY-SKR | online-readonly / BLOCKED | 8 条定向重试；8 项检查 PASS；整份报告 BLOCKED | [材料](../../docs/UAT_AI_WORKFLOW_EXACT_SHA_RETRY_2026-11-03_SKR.json) |
| E-ASR | online-readonly / PASS | 合成中英文音频；4 项含登录/配置；4/4 PASS | [材料](../../docs/UAT_AI_TRANSCRIPTION_ONLINE_2026-10-23_GOAL-RECHECK.json) |
| E-HISTORY | online-readonly / INFO | 3 类只读助手探针与历史/用量元数据；另有维护修复；确定性销售报表 round-trip PASS；fallback 50210；旧会话 0 消息 | [材料](../../docs/UAT_AI_CHAT_HISTORY_DEFAULTS_REPAIR_ONLINE_2026-11-03.json) |
| E-HISTORY-FINDING | historical-design / INFO | 列表→详情历史契约问题；id=null / HTTP 400，显式 MyBatis Results 修复 | [材料](../../docs/AI_HISTORY_THREAD_ID_FIX_2026-11-02.md) |
| E-OCR | online-readonly / PASS | 1 张合成澳洲税票；1 行明细；字段存在、HTTP 200、业务写入 0 | [材料](../../docs/UAT_AI_VALID_INVOICE_OCR_ONLINE_SKR_PASS_2026-10-29.json) |
| E-SOM | online-readonly / PASS | 10 项目录与契约检查；10 项检查 PASS | [材料](../../docs/UAT_SOMMELIER_RUNTIME-dc3d4d8e.json) |
| E-FOUNDATION | historical-design / INFO | 基础层设计与约束；Gateway、价格/补货规则的历史设计说明 | [材料](../../docs/AI_PRODUCTION_FOUNDATION.md) |
| E-SUPPLIER | online-readonly / INFO | 公司 5，可采购库存商品 13000；交期 0%；基本成本售价条件 1352，覆盖 10.4% | [材料](../../docs/UAT_AI_SUPPLIER_COST_AUDIT_2026-11-03.md) |
| E-LEAD | online-readonly / INFO | supplierinfo / purchase / picking 来源复核；supplierinfo 0 行；无可用供应商关联收货交期 | [材料](../../docs/AI_LEAD_TIME_SOURCE_RECHECK_2026-11-03.md) |
| E-FC730 | offline-research / BLOCKED | 730 天、500 高销量商品；7/14/28 天；全部绝对 WAPE 门失败；部分分群相对门通过 | [材料](../../docs/UAT_AI_730D_SEGMENTED_BACKTEST_2026-11-03.json) |
| E-FC365 | offline-research / BLOCKED | 365 天、500 高销量商品；7/14/28 天；研究模式缺 stockout 标签 | [材料](../../docs/UAT_AI_365D_SEGMENTED_BACKTEST_2026-11-03.json) |
| E-URGENT | online-readonly / PASS | Demo/SKR 风险筛选页面；筛选存在、API 200、历史计数 1203/1110 | [材料](../../docs/UAT_AI_URGENT_RISK_DEPLOYMENT_2026-11-03.md) |
| E-DEAD | online-readonly / PASS | Demo/SKR 全目录；历史时点；HTTP 200；无效成本/库存 8360/8262；业务写入 0 | [材料](../../docs/AI_DEAD_STOCK_CASH_OCCUPANCY_UAT_2026-11-03.md) |
| E-COST-CONFLICT | online-readonly / INFO | 成本覆盖审计：公司 5/137；正成本覆盖和金额有记录，但门店标签与其他资料冲突 | [材料](../../docs/UAT_AI_COST_COVERAGE_READONLY_2026-11-03.md) |
| E-COMMANDS | historical-design / INFO | 命令实现说明；草稿/权限/过期/确认设计；执行关闭 | [材料](../../docs/AI_COMMANDS_IMPLEMENTATION.md) |

| E-SOURCE-REFUND | online-readonly / INFO | Shopfront 单日来源毛利相符；388 笔退款候选重读，原行关联仍待确认 | [材料](../../docs/UAT_SHOPFRONT_REFUND_SOURCE_EVIDENCE_2026-11-03.json) |

| E-PURCHASE-SAMPLE | online-readonly / INFO | 首批 50 笔采购、2794 行，48 发票号、45 收货日期；计价/税额与后续分页未核实 | [材料](../../docs/UAT_SHOPFRONT_PURCHASE_SAMPLE_2026-11-03.json) |

| E-MARGIN-STOCK-MOVES | online-readonly / INFO | 10968 个 quant；7488 算术吻合、1769 差额、1711 来源身份待查；无库存修复 | [材料](../../docs/UAT_MARGIN_INVENTORY_MOVEMENTS_2026-11-03.json) |

| E-PURCHASE-FULL | online-readonly / INFO | 48 页采购连接读完，2358 笔/32925 行；2308 收货、1987 收货单有发票号；接口附件 0 | [材料](../../docs/UAT_SHOPFRONT_PURCHASE_FULL_2026-11-03.json) |

## 证据冲突与缺口

- E-WF 的 runtime 与 source 匹配，但原始 deployment 标签仍未验证；SKR 还标记工作树脏。保留这些差异，不把匹配 SHA 等同于候选全量验收。
- E-RETRY 的各项检查通过，但总状态为 BLOCKED，原因是非完整目录；不能把重试与整轮相加后发布 390/390。
- E-ASR 的文件名日期与 generatedAt UTC 不是一个概念，原时间戳保留；runtime 缺失，不宣称真实语音验收。
- E-SOM 明确 scope 无模型或图片；检查名称含 pitch/ask 也不能扩大其范围。
- E-HISTORY 包含业务只读探针和数据库历史元数据维护；“没有业务写入”不等于“没有数据库写入”。
- E-SUPPLIER 与 E-COST-CONFLICT 的成本口径、公司/门店标签不一致。AI-D01 未关闭前不合并金额，不输出公司 5/137 的确定门店映射汇报。
- 原工作区存在但主分支快照未归档的 OCR 反光资料，本期只列待补证，不创建虚假的证据链接。
- 研究快照部分仅存在原作者本地或受控存储；有摘要/JSON 不等于本机可复现全部原始数据。后续需受控归档、哈希、保留期和访问负责人。

jsonChecks 检查选定 JSON 字段是否与引用一致；它不验证原测试真实性，不联网、不重新发起模型或 Odoo 调用。
