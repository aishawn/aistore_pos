# AI 指令草稿与确认：设计与实现

更新日期：2026-11-03；代码基线见[基线](../../../baseline.md)。负责人待指定。

## 业务与数据流

管理员自然语言 → 允许的命令与精确目标解析 → 保存草稿及审计 → 服务端预览 → 用户确认 → 执行开关、权限、所有权、版本与期限复检 → 适配器执行 → 回读/审计。未通过门禁不可进入执行。

## 接口与边界

入口：/api/ai/commands 下 parse、preview、confirm、cancel。

模型不能选择 tenant/outlet/SQL/model/API 路径；歧义目标与不支持字段 fail-closed。不把 confirm 接口存在等同于可用执行。草稿、审计是应用数据写入；价格、采购、客户或商品业务写入需要独立授权和对账。

模型、prompt/config 和线上开关未由本次盘点确认。每轮变更记录版本，不将当前源码默认值回填到旧测试。统一配额、降级和数据契约见[AI 架构](../architecture.md)。

## 代码与原设计

- [AiCommandController.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/command/AiCommandController.java)
- [AiCommandService.java](../../../../../pos-api/src/main/java/com/orithos/modules/ai/command/AiCommandService.java)
- [AI_COMMANDS_IMPLEMENTATION.md](../../../../AI_COMMANDS_IMPLEMENTATION.md)

## 异常与兼容

遵守现有响应契约和 Odoo 门店权限；缺数据、源过期、源不可用分别说明。恢复或重试不能跨店兜底、重复提交或把未知改为零。发布前核对具体改动的 source/runtime SHA；本文不授予业务写入权限。
