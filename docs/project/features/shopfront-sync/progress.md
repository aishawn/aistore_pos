# Shopfront 同步进度

更新日期：2026-11-04。负责人：集成 owner 待指定。

## 当前发现

- 线上 crawler health 正常，Shopfront `skr` access token 可用。
- POS Compose 的 `ODOO_API_TOKEN` 与 Odoo `SHOPFRONT_INTEGRATION_TOKEN` 一致；Odoo status API 与只读鉴权探测均返回授权成功。历史 job 58 的 401 属于旧运行结果，不代表当前 token 仍失效。
- 线上来源 coverage：商品 11,027、库存记录 10,849、销售 155,665、销售行 305,052。
- POS staging：商品 11,027、库存记录 10,849、销售 155,665、销售行 305,339。
- Odoo 同步镜像：销售 155,672、销售行 305,103。正式 POS 账本与镜像记录分开核对。
- 完整销售清理仅在 `source_complete` 为真时执行。上次全量任务失败/取消，后续 500 笔 repair 不能证明全历史已对齐。

## 实施候选

`sales-reconcile` 任务只重推 crawler 已保存的销售到 POS staging 与 Odoo 同步镜像；跳过商品和库存；将 Odoo 正式业务写入关闭。新任务部署前不得调用。完成后比较源端、POS staging、Odoo 镜像的销售 ID、行数、支付数和 `source_complete` 覆盖率。

## 问题与关闭条件

- SHP-001（P1）：销售明细在历史重推中没有收敛到来源完整清单。关闭条件：sales-reconcile 完成，完整来源销售行/支付无陈旧子记录，三端差异逐单归因；正式业务销售与库存无变动。
- SHP-002（P1）：供应链和扩展数据曾出现 rate limit、timeout、GraphQL 字段错误。关闭条件：各自 job 完成并逐类 coverage 对账；不以销售修复任务关闭。
