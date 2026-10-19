# Orithos POS 交接补充：3f9837e 部署后回归

更新时间：2026-10-19（Asia/Shanghai）  
仓库：`C:\\shawn\\1code\\1project-new\\aistore_pos\\v1\\orithopos-master`  
当前本地 HEAD：`ba66621`（包含本轮 `3f9837e` 及后续 AI 路由矩阵提交）  
`origin/main`：`68d2607`，本地领先 1 个提交。

## 本轮完成

- `3f9837e` 已推送；随后使用完整 GitHub push payload 调用 Dokploy webhook，返回 `HTTP 200 Compose deployed successfully`。
- AI 关闭状态回归：对话输入框和语音输入在 `AI_ENABLED=false` 时禁用，`Open sell` 等业务快捷入口仍可用。
- AI 路由和页面回归：已登录页面的 AI 悬浮入口、侍酒师页面、识标页禁用拍照文案均通过。
- 全站路由矩阵通过：132 路由 × 390/1440，共 `264/264 PASS`；包括 `/utilities/future-costs` 和 `/utilities/future-prices`，无 HTTP 失败、页面错误或横向溢出。
- 本轮没有销售、采购、库存、现金、AI 配置或反馈写入；Demo `aipos` 未执行业务写入。

## 测试证据

| 检查 | 结果 | 证据 |
|---|---:|---|
| TypeScript | PASS | `pos-ui/npm run typecheck` |
| AI 本地 fixture 焦点/禁用状态 | 2/2 PASS | `docs/UAT_AI_FOCUS_LOCAL_2026-10-19_CURRENT.json` |
| AI availability | 3/3 PASS | `docs/UAT_AI_AVAILABILITY_2026-10-19_POST-3F9837E.json` |
| AI surface / 匿名鉴权 | 11/11 PASS | `docs/UAT_AI_SURFACE_2026-10-19_POST-3F9837E.json` |
| AI UI | 2/2 PASS | `docs/UAT_AI_UI_2026-10-19_POST-3F9837E.json` |
| 全站静态页面 | 264/264 PASS | `docs/UAT_ALL_STATIC_PAGES_2026-10-19_POST-3F9837E.json` |
| 脚本语法/差异检查 | PASS | `node --check`、`git diff --check` |

AI 线上证据中的 `sourceCommit` 是 UAT runner 基线；`deployment` 已标为 `unverified-after-deploy`。Webhook 接受不等于 Dokploy 容器已运行该提交，仍需从 Dokploy 控制台读取 frontend/backend SHA、构建日志、健康状态和部署时间。

## 已完成的主要功能范围

- Odoo POS 基础收银：商品/客户读取、开班、Cash/Card 模拟收款、GST/现金舍入、收据、退款和库存回读。
- 库存与采购：供应商、RFQ、采购收货、补货建议、Odoo 盘点页面和只读库位解析；盘点写开关默认关闭。
- 店铺与平台：多租户读取隔离、租户生命周期门禁、店铺状态页面、用户/角色/权限、设置和报表页面。
- 稳定性与交互：共享 Retry 状态、401 只读请求恢复、移动/桌面页面矩阵、AI 悬浮入口、Sommelier 读取与关闭态保护。

## 尚未完成或未验收

- Dokploy 实际运行 SHA、frontend/backend 完整构建日志和容器健康状态未独立回读。
- 用户提供的构建日志曾显示 `/utilities/future-costs` 的 `revalidate` 非法值；代码历史提交 `bef954e` 已移除该冲突导出，但按约束本地未运行 `npm run build`，需以受支持 Node 版本和 Dokploy 构建日志确认。
- Odoo 盘点真实隔离数据库写入仍未验收：取消、重复提交、quant reference、库存前后值、跨租户拒绝和非管理员拒绝待完成。生产保持 `ODOO_STOCKTAKE_WRITE_ENABLED=false`。
- Java 21 Maven 测试未执行；当前机器只有 Java 8。
- DashScope 对话、云端语音、酒标识别、真实发票 OCR、实体刷卡终端、打印机/钱箱、SMTP、正式财务对账、分单支付和离线 POS 未验收或未实现。
- 平台状态真实写入转换和当前版本采购收货需在获批隔离租户重新回归。

## 下一步

1. 在 Dokploy 控制台保存 frontend/backend 当前 SHA、完整构建日志、健康状态和部署时间。
2. 在 Java 21 CI 或受控环境执行 Maven 测试。
3. 使用一次性隔离 Odoo 数据库/公司完成盘点写入验收，结束后删除租户并验证认证阻断。
4. 对当前已核实部署版本重新执行核心 POS 与采购收货只读/隔离写入冒烟。

## 发布结论

当前仍为 **NO-GO**：页面、AI 关闭态和只读稳定性通过，但部署身份、构建证据和关键业务写入验收仍缺失。
