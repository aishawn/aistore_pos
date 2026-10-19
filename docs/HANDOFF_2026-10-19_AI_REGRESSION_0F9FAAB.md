# AI 线上回归交接补充

时间：2026-10-19（Asia/Shanghai）  
目标：`https://demo.orithos.com.au/`  
代码基线：`0f9faab`

## 本轮已验证

- AI 功能矩阵：`14 PASS / 0 FAIL / 0 BLOCKED`。
- AI metrics：`9/9 PASS`，管理员 `200`，匿名 `401`，390/1440 UI 和可访问性通过，页面错误为 `0`。
- Assistant path：`assistant:entity_action`，`19` requests、`19` allowed、P50 `3348ms`、P95 `6998ms`、estimated tokens `259`。
- 能力位门禁：chat 可用；voice 正确禁用并显示不可用原因；无页面错误。
- AI surface：`11/11 PASS`，包含 config、assistant lookup、输入校验和匿名路由保护。
- 所有本轮脚本均为只读验证，业务或配置写入为 `0`。

详细证据：`docs/UAT_AI_REGRESSION_ONLINE_0F9FAAB.json`。

## 部署状态

本轮调用 Dokploy compose webhook 后，最终响应为：

```text
HTTP 301
{"message":"Branch Not Match"}
```

因此本轮**没有部署成功**，线上验证结果不能证明 `0f9faab` 已运行。需要在 Dokploy 控制台核对该 compose 的 Git 分支配置和 webhook 触发方式，再重新部署；确认控制台显示构建完成、容器健康且运行 SHA 匹配后，重新执行上述 AI 回归。

## 交接风险

- 当前 AI 回归证明的是线上现有版本的行为，不是 `0f9faab` 的部署证明。
- 不要把 webhook `301` 或 `Branch Not Match` 记录为部署成功。
- 继续使用一次性隔离租户，AI 回归脚本保持只读。

## 等待后的复验

在 push 后等待约 4 分钟，第二轮线上回归仍通过：AI 功能 `14/14 PASS`、AI metrics `9/9 PASS`、能力位 `PASS`、AI UI `2/2 PASS`，无业务或配置写入。证据：`docs/UAT_AI_REGRESSION_ONLINE_39BD36C.json`。

这轮复验仍没有 Dokploy 控制台的运行 SHA、构建日志或容器状态，因此只能确认线上行为正常，不能确认 `39bd36c` 已运行。

## `5650d1b` 异步状态修复后的复验

提交 `5650d1b` 为用户、AI 报表、商品库存和供应链页面补充了 `aria-busy` / `role=status` 异步状态语义。本地 TypeScript、目标 ESLint、脚本语法和 diff 检查通过；ESLint 仅保留 SupplyChainPage 原有的 2 个 effect warning。

等待约 4 分钟后线上复验结果：AI 功能 `14/14 PASS`、AI metrics `9/9 PASS`、AI UI `2/2 PASS`，业务或配置写入 `0`。证据：`docs/UAT_AI_REGRESSION_ONLINE_5650D1B.json`。

公网行为正常，但仍缺 Dokploy 控制台实际运行 SHA、构建日志和容器健康证据；因此 `5650d1b` 是否已被容器运行仍未独立证明。
