# AI 配置管理员权限线上验证

## 验证基线

- 目标版本：`3afef08`
- 目标：`https://demo.orithos.com.au`
- 脚本：`scripts/pilot-ai-admin-guard-uat.mjs`
- 证据：`docs/UAT_AI_ADMIN_GUARD_2026-10-19_POST-3AFEF08.json`

## 结果

- 状态：`PASS`
- 检查数：15
- 临时非管理员用户对 AI 配置 reload、intent、slot、slot-value、prompt 的创建/更新/删除全部返回统一授权错误（业务 code `40300`）。
- 管理员重新登录后，各配置记录数量保持不变。
- 临时角色和用户已由脚本清理。
- 未执行销售、采购、库存、现金、Odoo 或平台店铺状态写入。

## 当前能力清单更新

AI 配置管理员保护现在已有控制器单测和线上普通店员回归证据；生产 AI 仍保持关闭，真实模型调用仍未验收。

