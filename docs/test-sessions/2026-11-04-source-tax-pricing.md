# 2026-11-04 来源税额与有效单价修复清单

环境：本地真实源码测试；aipos_uat demo company 137 事务写入演练后回滚；SKR全历史只读采集。所有提交业务写入0。营业日范围仍冻结至2026-11-03不含上界；本地已跨11月4日，不将新日期静默加入范围。

## 问题与实现

v1仅建议subtotal，可能遗漏已存金额相平但单价乘数量错误的历史行。v2检查目标price_unit/discount/tax_ids（含允许空税列表、拒绝缺失/非法值），保存原值；若单价×数量×折扣等于来源行gross则保留，反之建议来源gross÷qty的有效单价与零折扣。原basePrice另存，不能将有效单价宣称为历史标价或捏造真实折扣。负数退款保留原数量符号。缺少税关联的非零税行即使已存subtotal正确也仍标需修复。

清单依旧dryRun、executable=false；税定义、Odoo计价精度、实际税引擎、过账影响与实时前置值仍是执行阻断。来源税0不认证GST-free，未改公共商品税。旧快照无目标税输入将退回review，不能复用旧supported数量。

新增scripts/source-tax-repair-history.mjs按90日完整原生范围读取，委托现有只读RPC采集器，保存不可覆盖的快照和清单、两者哈希与续跑索引；中断保留窗口，不把不同scope/version合并。完成扫描也不等于跨窗口时点一致或可执行。

## 验证

33项相关单元测试通过，tsc --noEmit通过，历史采集脚本node --check通过。定向ESLint因既有react-hooks配置插件错误未重跑，不宣称lint通过。没有本地应用build、Maven或provider调用。

Odoo v4独立演练2026-10-20 Adelaide整日162单303行：64单81行税引擎保存后重算通过，其中28行调整有效单价；98单review。first blocker：21历史零税待分类、40行对应不唯一/缺失、21来源行单合计差、15有效单价受两位精度限制、1来源未完成。这些是每单首个阻断，不是全部重叠问题。

例：来源qty2/gross6/tax0.55，native单价6，建议并临时保存单价3后税引擎正确；来源basePrice6保留作来源证据而非视为unit price。实际Product Price精度2，不能强行舍入3份不能整除的行。全162单303行含write_date的前镜像在新事务验证恢复；临时税不存在，商品税关联未变。v3与v4来源/目标前镜像哈希一致；每轮保留独立结果，不相加为一次PASS。

[演练证据](../UAT_DEMO_SOURCE_TAX_PRICING_2026-11-04.json)。私有完整结果在Odoo /var/lib/odoo/margin-recovery-20261103/demo-tax-batch-20261020-v4.json。脚本哈希标识私有探针，Odoo提交SHA未知；不以POS运行SHA冒充。

## 进行中与下一步

SKR税额全历史v2新采集正在运行，索引.local/margin-implementation/tax-history-v2/tax-history-index.json；未完成前不公布全量PASS。另一个直接来源分页任务在crawler持久卷/data/margin-evidence-20261103/sales-full-direct-v1/，只读GraphQL和已保存页面，不执行重同步/导入。最终须检查进程句柄、末游标、分页哈希、来源ID/金额与镜像差异。已启动不等于已完成。
