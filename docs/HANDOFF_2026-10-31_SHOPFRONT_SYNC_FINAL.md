# Shopfront `skr` 同步总结与后续交接

更新时间：2026-10-31 13:46（Asia/Shanghai）  
生产服务：`https://shopfront.orithos.com.au`  
门店：`skr` / `skr.onshopfront.com`

## 1. 本次结论

Shopfront OAuth 授权已经成功，生产端 Token 状态为 `active`。历史同步、供应链同步和本次授权后的增量同步均已完成，当前没有活动任务或同步错误。

本次实际验证的增量任务为 `job_id=72`，范围是 `2026-10-28` 至 `2026-10-30`，执行状态为 `completed`。

## 2. 当前同步数据

| 数据 | 数量 |
| --- | ---: |
| 商品 | 10,892 |
| 销售 | 155,112 |
| 销售明细 | 303,914 |
| 库存记录 | 10,840 |
| 供应商 | 109 |
| 采购订单 | 2,355 |
| 销售明细缺名称 | 0 |

当前销售状态：

| 状态 | 数量 |
| --- | ---: |
| `COMPLETED` | 154,166 |
| `INCOMPLETE` | 816 |
| `CANCELLED` | 120 |
| `PARKED` | 10 |

## 3. 历史同步

历史任务 `id=70` 已完成：

- 起始日期：`2024-01-01`
- 最后营业日：`2026-10-30`
- 游标：`2026-10-31`
- 状态：`completed`
- 错误：无
- 活动任务：无

历史任务按持久化游标和分片执行，重启后可继续，不需要从起始日期重复运行。

## 4. 授权后的增量验证

任务 `id=72` 的执行结果：

- 日期范围：`2026-10-28..2026-10-30`
- 拉取销售：551 条
- 销售处理：551 条
- 未变化销售：551 条，按外部 Sale ID 幂等跳过重复写入
- 商品同步：729 条进入 POS 更新流程
- 商品业务写入：1 条新增、228 条更新
- 错误：0
- POS 导入状态：`completed`

这证明新的 OAuth 授权已经可以正常访问 Shopfront，并且能驱动 crawler 到 POS 的增量链路。

## 5. 正式 POS 导入边界

系统会阻止以下 Sale 进入正式 POS：

- `INCOMPLETE`
- `PARKED`
- 缺少稳定 Shopfront Sale ID
- 缺少商品行
- `COMPLETED` 但缺少支付记录

因此，当前 `816` 条 `INCOMPLETE` 销售已经保存到 crawler，不能声称它们已经进入正式 POS。需要在 Shopfront 侧补齐完整 Sale 或由业务确认处理规则后，再单独重试导入。

`PARKED` 销售也不计入已完成销售汇总，避免把未完成交易写入正式报表。

## 6. POS 商品差异说明

此前对账结果：

- crawler 缺失于 POS：`0`
- POS-only：`126`
- POS-only 全部存在历史销售引用
- 无法解释的 POS-only：`0`

因此没有自动删除 POS-only 商品。它们可能是历史销售、手工维护或旧商品记录。删除前必须确认没有业务用途和历史审计要求。

## 7. 供应链同步

供应链任务 `id=71` 已完成：

- 供应商：109
- 采购订单：2,355
- 错误：0

供应商和采购订单已保存到 crawler，并进入 POS staging 流程。采购数据后续仍应按外部 ID 做幂等更新。

## 8. 每日运行方式

每日任务按门店时区 `Australia/Adelaide` 的 `02:00` 执行，默认补偿最近 3 个营业日。流程包括：

1. 重新拉取最近营业日的销售、取消、退款和修改；
2. upsert 销售汇总、Sale 和 SaleItem；
3. 增量同步商品；
4. 更新当前库存快照；
5. 将可导入数据发送到 POS；
6. 失败任务保留在持久化队列，下一次运行重试。

不要同时启动多个同门店同步任务。worker 会根据任务锁和持久化状态继续执行。

## 9. 运维检查接口

```text
GET /healthz
GET /api/stores
GET /api/sync/status?store=skr
GET /api/sync/runs?store=skr&limit=10
GET /api/sync/coverage?store=skr
GET /shopfront-audit?store=skr
GET /shopfront-reconcile?store=skr&date=YYYY-MM-DD
```

推荐检查顺序：

1. `/healthz` 确认服务存活；
2. `/api/stores` 确认 `token_status=active`；
3. `/api/sync/status` 确认没有长期 `running`；
4. `/shopfront-audit` 检查数量和 `INCOMPLETE`；
5. `/api/sync/runs` 查看最近任务的 `warnings`、POS 导入状态和错误。

## 10. 仍需处理的事项

1. 分析并处理 816 条 `INCOMPLETE` Sale，确认是否能通过完整 Sale 查询补齐。
2. 对关键营业日继续执行 Shopfront 报表与 Sale 明细抽样对账。
3. 观察每日任务的 429、超时、数据库锁和 worker heartbeat。
4. 商品品牌、family、图片字段目前部分或全部为空时，保留源数据，不使用占位值补齐。
5. POS-only 商品暂不删除，先完成业务确认。

## 11. 代码和部署记录

本次已验证的生产修复提交：`00ed9719`。相关测试结果：部署仓库 `34 passed`。本总结只记录运行结果，不包含任何环境变量值、密码、OAuth Token 或 Dokploy 凭据。

## 12. 证据链接

- [健康检查](https://shopfront.orithos.com.au/healthz)
- [门店与 Token 状态](https://shopfront.orithos.com.au/api/stores)
- [同步状态](https://shopfront.orithos.com.au/api/sync/status?store=skr)
- [同步覆盖率](https://shopfront.orithos.com.au/api/sync/coverage?store=skr)
- [Shopfront 审计](https://shopfront.orithos.com.au/shopfront-audit?store=skr)

