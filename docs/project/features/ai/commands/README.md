# AI 指令草稿与确认

更新日期：2026-11-03。功能 ID：CAP-AI-COMMANDS。负责人：commands 模块 owner 待指定。

## 目标与入口

将明确操作先变为可审阅草稿，让用户在权限和状态约束下确认。

技术类型：模型解析 + 受控命令状态机。用户/接口入口：/api/ai/commands 下 parse、preview、confirm、cancel。

## 当前能力与状态

管理员解析、持久化草稿/审计、所有权与版本检查、十分钟过期、预览/确认/取消接口；支持范围以实现文档为准。商品/客户适配仍需 Odoo SoT 审查。

已实现（主分支源码）；实现说明记录 execution 默认关闭；本期未核验有效运行开关，生产执行 NOT RUN。

## 验证与效果

E-COMMANDS 为设计/实现说明，不是同 SHA 线上执行验收。文档明确 AI_COMMANDS_EXECUTION_ENABLED=false，并指出商品/客户旧适配器必须替换或包装为 Odoo-backed 后才能面向 Odoo 生产门店启用。当前没有可宣称的自动执行成功率。

## 阅读路径

[设计与实现](design.md) · [验证方法与证据](validation.md) · [进展与问题](progress.md) · [AI 全景](../README.md)
