# 全功能清单

更新日期：2026-11-03。负责人均待项目 owner 明确分配；“待盘点”表示尚未完成本轮事实整理，不表示功能未实现。

| 功能 ID | 功能 / 入口 | 本期状态与范围 | 负责人 | 证据入口 |
|---|---|---|---|---|
| CAP-AI | [AI 能力](ai/README.md) | 已实现；各子能力验证层级不同，见七个完整样板 | AI/后端 owner 待指定 | [AI 验证总览](ai/README.md#验证与效果) |
| CAP-POS | [收银与退款](checkout/README.md) | 待盘点，已有 Odoo 工作流 | POS owner 待指定 | POS-001/002/003 |
| CAP-INV | [商品、库存与盘点](inventory/README.md) | 待盘点，已有修复与报表记录 | 库存 owner 待指定 | INV-001 |
| CAP-PUR | [采购与收货](purchasing/README.md) | 待盘点，业务写入需独立验收 | 采购 owner 待指定 | PUR-001 |
| CAP-CUS | [客户与价格表](customers/README.md) | 待盘点，已有角色和定价方案 | 客户模块 owner 待指定 | CUS-001 |
| CAP-RPT | [报表与经营看板](reporting/README.md) | 待盘点，日期、税、成本、库存需分别核实 | 报表 owner 待指定 | RPT-001 |
| CAP-PLT | [平台、租户与集成](platform/README.md) | 待盘点，共享试用库不等于生产隔离 | 平台 owner 待指定 | TEN-001 / OPS-001 / R2-001 |

各套件定义见[测试目录](../../TEST_CATALOG.md)，结果见[测试索引](../../TEST_REPORT_INDEX.md)。UI、硬件、离线、供应商及历史归档分别由相关模块入口关联，不遗漏但不在首期伪造完整成熟度。
