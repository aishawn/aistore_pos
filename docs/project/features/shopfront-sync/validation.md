# Shopfront 同步验证

更新日期：2026-11-04。代码候选基线：GitHub `main` 的 `f73c3417`；线上运行 SHA 尚未复核。

## 线上只读基线

环境：crawler `https://shopfront.orithos.com.au`、Odoo `https://odoo.orithos.com.au`。只读 coverage 与认证探测；没有触发业务导入。

| 数据 | crawler | POS staging | Odoo 镜像 |
|---|---:|---:|---:|
| 商品 | 11,027 | 11,027 | 未在本轮计数 |
| 库存记录 | 10,849 | 10,849 | 10,849 |
| 销售 | 155,665 | 155,665 | 155,672 |
| 销售行 | 305,052 | 305,339 | 305,103 |

库存来源数量：正数合计 49,993；负数行 5,372；有符号净额 -257,200。库存记录数相等不能替代逐商品数量核对。

## 尚未运行

- sales-reconcile 代码静态检查、job 执行和同步后 coverage 对账：NOT RUN。
- 销售 ID/行键/支付逐笔比较：NOT RUN。
- 正式 Odoo POS 订单、账务和库存未通过该镜像任务验证，也未被本次只读探测修改。

## 验收要求

部署后仅启动销售专用镜像修复任务；等待 terminal status；确认 job 与 run 错误为空且 imported sales 等于 crawler 来源数；重新读取 POS coverage 与 Odoo status；对已标记来源完整的 Sale 验证 line/payment 子记录与来源完全一致；确认库存数量及正式业务账本不变。若存在来源不完整 Sale，单独输出数量与原因，不能删除其现存行或宣布全量一致。
