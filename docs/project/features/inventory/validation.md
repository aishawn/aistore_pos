# 库存同步验证

更新日期：2026-11-04。源码候选：crawler `4fb02f65`；Odoo `41dab563`。线上 runtime SHA：未记录。

## POS 导航与库存列表候选（2026-11-04）

- 源码候选：本轮 Git commit 待记录；仅修改 `pos-ui` 和本模块文档，未触及 API 或 Odoo 库存数据。
- 本地 Node 24 `tsc --noEmit`：通过；四个改动 TSX 文件定向 ESLint：0 errors、14 warnings（现有 React effect 同步和 `aria-sort` button 警告）。结果仅说明静态源码检查。
- 线上入口、负库存深链、权限差异和 runtime SHA：待 main 部署后只读验收；没有业务数据写入。

## 本地验证

- crawler：`python -m compileall -q app tests` 通过。
- crawler：`python -m pytest tests -k "not releases_writer" -q`，45 passed、1 deselected。结果仅适用于本地 fixture；被排除用例为既有长等待 writer-release 测试。
- Odoo：`python -m pytest tests/test_inventory_import.py tests/test_supply_import.py -q`，15 passed。
- `git diff --check` 通过。

## 线上只读核验

2026-11-03 通过 `shopfront.orithos.com.au` coverage/inventory API 和 Odoo JSON-RPC 查询，均为只读；无业务库存写入。crawler API 镜像：10,846 条库存、10,846 个商品、1 个 outlet，数量合计 `-256,906`，负数 5,372 行、零值 2,420 行；最晚库存记录时间为 `2026-11-02 15:31:49`。来源镜像时间戳落后于 11 月 3 日的同步 coverage，证明 coverage 更新不代表库存刷新。

Odoo `aipos_uat` company 5 / location 48：10,968 条 quant，数量合计 `-1,334,367`，负数 quant 8,265 行，reserved 合计 3 件。仅按唯一 `skr:<source_id>` 模板引用比较 crawler 当前镜像时，10,573 个来源商品可唯一映射，273 个没有唯一映射；其中 1,631 个唯一映射商品的 quant 数量不一致，绝对差合计 `1,009,603` 件。另有 158 个当前库存来源已不存在的 Odoo source refs，其 quant 合计 `-7,602` 件。此项使用 crawler 已存镜像而非本次实时 Shopfront GraphQL 快照，不能代表最新源端逐商品差异。

Odoo 同时有 1 个开启的 POS session 和 1 个触及 location 48 的未完成调拨。为避免与在途业务冲突，没有启动全量库存回写。crawler commit 尚未推送，故 Dokploy runtime SHA 未确认；库存仍未修复完成。

## 后续验收门槛

1. 推送并部署 crawler 与 Odoo 代码，确认实际运行 SHA。
2. 只读检查实时 Shopfront 完整分页总产品/库存行数、各 outlet 数量、数量总和、零值和负值计数；与 crawler 镜像逐键核对。
3. 等待/确认当前 POS session 和未完成调拨已结束；确认最新数据库备份可恢复，并重新读取 Odoo company/location、重复 source ref 与 reserved quant。
4. 业务同步后只读核验每商品来源数量、Odoo on-hand、unmatched 和 reservation conflicts；只有覆盖范围明确且无未处理冲突才可判定通过。

毛利同步集成候选：合并远端8b6eabb3后修复无job_id手动同步读取未初始化job的问题，既有历史任务事件顺序回归覆盖；整轮crawler测试48 passed、27 warnings。未触发库存回写，不改变原线上FAIL/写入BLOCKED状态。
