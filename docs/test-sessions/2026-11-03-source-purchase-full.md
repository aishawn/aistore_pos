# Test Session: Shopfront 采购全分页来源读取

日期：2026-11-03 UTC。PUR-001 线上只读，结果 INFO。源业务写入 0、token refresh 写入 0，无模型调用。source/runtime SHA 未取得；实际请求与脚本哈希见 [UAT](../UAT_SHOPFRONT_PURCHASE_FULL_2026-11-03.json)。本候选代码未部署，不宣称财务修复成功。

14:30:40 至 14:42:39 UTC，一次独立分页读取 ORDER 连接 48 页，结束 hasNextPage=false；2358 笔订单、32925 行。源端请求 first 100 实际每页最多返回 50，依据 pageInfo 持续读到终页，不依赖页长判断完成。跨页订单 ID 无重复，所有订单的已取行数与 lineCount 相同。读取期间未验证原子时点一致性，不将遍历结束当作独立外部总数认证。

状态：RECEIVED 2308、SENT 3、CANCELLED 47。订单日期 2023-03-08 至 2026-11-02；2035 笔有发票号，其中已收货并有发票号 1987。所有返回行均有 receivedQuantity/caseQuantity/baseCost，箱规均大于零。所有返回订单附件合计为 0：说明本 API/token 未返回发票附件，不证明外部供应商或其他系统不存在原件。

生成私有逐单缺证清单，所有 costVerified=false。当前采购明细 schema 未提供可认证采购税额，enteredAs 的说明明确仅影响显示，不能判定存储成本含税。旧 products 接口虽已弃用，本轮全部 lineCount 吻合；后续替换 productConnection 仍须独立验收。

算术诊断仅为假设：2308 笔已收货单中，baseCost×receivedQuantity÷caseQuantity 合计与 totalCost 相等 1689 笔；含费用的候选式最多匹配 1811 笔，仍有 497 笔不吻合。费用字段均有值；没有将空值填零提升为成本认证，没有依据拟合结果改写采购或销售成本。加减 rebate 的当前样本结果相同，不能据此确认返利符号。不同计价方法不能用最近收货价混算。

原始采购、逐单 review 与算术诊断保存在 crawler 私有持久卷 `/data/margin-evidence-20261103/`，文件 purchase-full-source.json、purchase-full-review.json、purchase-full-result.json、purchase-full-arithmetic.json、purchase-full-fee-arithmetic.json。摘要通过压缩编码导出并解码成功，未将凭证、原始明细或附件 URL 放入 Git。

相关采购元数据查询本地供给链/core 测试 20 passed、4 warnings；这不是本次全量财务修复的 PASS。下一步核对税额/费用单位定义、历史计价及外部税票来源，保留未核实成本标记。
