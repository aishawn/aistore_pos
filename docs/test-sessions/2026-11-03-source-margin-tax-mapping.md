# Test Session: 来源毛利与税映射

日期：2026-11-03 UTC；执行人 Codex，负责人待指定。数据库 aipos_uat；SKR 只读，公司 137 demo 仅事务测试。模型调用 0；提交业务写入 0。

| 范围 | 版本 | 结果 | 证据 |
|---|---|---|---|
| RPT-001 本地定向单元 | d85bc0af | PASS 23/23；类型与 lint 通过 | [代码](../../pos-ui/src/lib/source-tax-repair.test.ts) |
| RPT-001 来源报表线上只读 | b7249014 前后端 | PASS：133 笔、毛利 830.18、25.385749%；桌面/手机检查 | [UAT](../UAT_SOURCE_TAX_MAPPING_2026-11-03.json) |
| RPT-001 demo 单笔税映射 | Odoo 源码 SHA 未记录；脚本哈希见 UAT | PASS：独立含税配置+金额，税引擎一致；回滚新事务验证 | [UAT](../UAT_SOURCE_TAX_MAPPING_2026-11-03.json) |
| 全历史会计毛利认证 | 未完成 | BLOCKED：采购成本证据、退款原行、税额写回及库存仍待完成 | [专题](../SHOPFRONT_MARGIN_RECONCILIATION_2026-11-03.md) |

命令：Node 24 `--experimental-strip-types --test` 执行 cost-reconciliation/source-tax-repair 单元；TypeScript `tsc --noEmit`；定向 ESLint。未运行本地应用构建或 Maven。部署与本地候选分开记录，不把单笔回滚试验视为全量已修复。
