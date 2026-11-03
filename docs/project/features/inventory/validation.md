# 库存同步验证

更新日期：2026-11-03。源码候选：crawler `4fb02f65`；Odoo `41dab563`。线上 runtime SHA：未记录。

## 本地验证

- crawler：`python -m compileall -q app tests` 通过。
- crawler：`python -m pytest tests -k "not releases_writer" -q`，45 passed、1 deselected。结果仅适用于本地 fixture；被排除用例为既有长等待 writer-release 测试。
- Odoo：`python -m pytest tests/test_inventory_import.py tests/test_supply_import.py -q`，15 passed。
- `git diff --check` 通过。

## 线上验证

未运行。crawler GitHub 推送遇到 GitHub HTTPS 连接超时，故本次尚无 Dokploy build/runtime SHA、线上只读对账或业务库存写入结果。现有库存量仍不能宣称已修复。

## 后续验收门槛

1. 部署 crawler 与 Odoo 代码，确认实际运行 SHA。
2. 只读检查源分页总产品/库存行数、各 outlet 数量、数量总和、零值和负值计数；与 crawler 镜像逐键核对。
3. 确认已有数据库备份可恢复，并重新读取 Odoo company/location、重复 source ref、reserved quant、open POS session 和未完成调拨。
4. 业务同步后只读核验每商品来源数量、Odoo on-hand、unmatched 和 reservation conflicts；只有覆盖范围明确且无未处理冲突才可判定通过。
