# Test Session: Shopfront 退款与来源证据补抓

日期：2026-11-03 UTC。执行人 Codex，负责人待指定。RPT-001 来源复现子集；Shopfront/SKR 只读，业务写入 0，token refresh 写入 0。

| 范围 | 版本 | 结果 |
|---|---|---|
| 来源 API 单日真实读取 | 查询 SHA256 见原始证据；POS runtime `1e02bba2` | PASS：2026-11-02 Adelaide，134 笔中 133 笔完成；未税 3270.26、成本 2440.08、毛利 830.18、毛利率 25.385749%，与来源报表一致 |
| 来源退款候选重读 | 来源字节 SHA256 见原始证据 | INFO：388 笔、592 个退款行；234 笔含 linkedSale，412 行数量/成本候选相符；全部仍待确认原销售行 |
| 本地同步回归 | 本 session 随附的 Git 候选；尚未部署 | PASS：19 项定向测试，涵盖重复商品、同版本补证、窗口跳过和 GraphQL outlets 声明 |
| 全历史成本/税额修复 | 未执行 | BLOCKED：未核实采购成本、原行关联和税额过账影响尚未解决 |

命令：`python -m pytest tests/test_financial_mapping.py tests/test_core.py -q --disable-warnings`，19 passed。未执行本地应用构建。

新增来源字段：linkedSale.id、totalRounding、caseQuantity、行 metaData。源 updatedAt 不变时，窗口和逐单去重均允许补证；未触发历史重同步或 Odoo 财务写回。

388 笔候选取自镜像负数量行，不代表独立遍历全 Shopfront；412 行候选吻合不等于原行关联已认证，6 行退款成本与原行比例成本不同。所有来源成本仍未独立验证。采购 enteredAs 仅为显示口径，不能据此推定采购成本含税/未税。

材料：[原始证据摘要](../UAT_SHOPFRONT_REFUND_SOURCE_EVIDENCE_2026-11-03.json)、[专题与剩余事项](../SHOPFRONT_MARGIN_RECONCILIATION_2026-11-03.md)。source commit 在测试时尚未生成，以本 session 的 Git 提交定位；查询哈希为线上真实请求身份，不能替代候选部署验证。

扩大回归：`python -m pytest tests -q --disable-warnings` 最终单轮 45 passed、25 warnings。初轮暴露三个已有历史测试模拟签名落后，以及“已落盘目录”样本缺库存；更新这些 fixture 后整轮通过。此结果仅属本地测试，不改变线上财务修复状态。
