# Shopfront 同步验证

更新日期：2026-11-04。代码候选基线：GitHub `main` 的 `f73c3417`；线上运行 SHA 尚未复核。

## 2026-11-05 每日同步与缓存失效候选

- 环境：本地 Windows；候选基线 `c2d2f617`，未部署。`python -m pytest tests/test_schedule.py -q`：3 passed；Node 24 下报表缓存/日期边界测试 19/19；`python -m compileall -q shopfront_crawler/app` 与 `git diff --check` 通过。
- UI 完整 typecheck：NOT RUN 成功。`npm ci --ignore-scripts` 未完成；直接执行 TypeScript 时 Next 类型声明缺失。报表完整单测未完整通过，当前只引用定向 19/19 结果。
- 线上只读核查：Shopfront 只有 `skr -> company 55/outlet 87` 映射；Odoo 查询可见 company 5、137；报表目标只发现 demo company 137；`aipos_uat`；备份主密钥未配置。业务写入 0，未执行数据补齐、刷新或部署。
- 限制：尚无 SKR 与 demo 双目标映射证明，也没有可验证恢复的备份。不能宣称双站报表刷新或历史数据完整。

## 2026-11-04 库存收尾门槛回归

- 代码候选基线：GitHub `main` `dfda8a93`，crawler working-tree patch；crawler 线上 SHA 未确认。POS public version endpoint 返回 frontend/backend `dfda8a93`。
- 环境：本地 crawler SQLite fixture；测试目标只模拟 POS/Odoo API，不连接线上 Odoo。
- `python -m pytest -q -c pyproject.toml tests/test_pos_import_results.py`：PASS，28 项。新增用例验证一条库存因预留量而未匹配时仍发送完整 source-ID finalizer，并保留该行核对告警。
- `python -m py_compile app/main.py tests/test_pos_import_results.py` 与 `git diff --check`：PASS。
- 线上只读：crawler 与 POS 各 11,029 商品、10,851 库存、155,665 销售和 305,052 销售行。Shopfront 库存为 5,372 个负数、净量 `-257,488`。既有 Odoo 负库存基线 `-1,334,367` 尚未在该次部分同步后复查。
- 当时已有 daily job 61 于 Odoo inventory `3000/10851` 后被标记取消；本次没有发起线上同步。该自动任务部分写入范围的逐 SKU 实际变化未读回。
- 结论限于本地 fixture 和只读差异；未部署本修复，未确认旧 Odoo 镜像已清理，也未证明 Shopfront 源库存准确或实盘正确。

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

## 2026-11-04 回执核验回归

- 环境：本地 SQLite fixture；源代码基线 `007064cc` 加候选工作区差异；线上运行 SHA 未核实。
- `python -m pytest -q tests/test_pos_import_results.py`：PASS，27 tests。包含 `sales_reconcile` 在全局业务写入开关为 true 时仍不要求正式订单回执的回归用例。
- `git diff --check`：PASS。正式业务写入：0。
- 线上 `/api/sync/status?store=skr` 请求不可用，Odoo 模块只读探测返回 403；run 173 实际 job type、部署 SHA、正式 POS 当前值及 11 月 3 日回补均未验证。
- 结论仅限代码 fixture；不代表线上部署或 129 笔正式销售已恢复。

## 验收要求

部署后仅启动销售专用镜像修复任务；等待 terminal status；确认 job 与 run 错误为空且 imported sales 等于 crawler 来源数；重新读取 POS coverage 与 Odoo status；对已标记来源完整的 Sale 验证 line/payment 子记录与来源完全一致；确认库存数量及正式业务账本不变。若存在来源不完整 Sale，单独输出数量与原因，不能删除其现存行或宣布全量一致。
