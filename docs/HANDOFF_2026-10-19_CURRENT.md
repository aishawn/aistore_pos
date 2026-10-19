# Orithos POS 当前交接

更新时间：2026-10-19（Asia/Shanghai）
仓库：`aishawn/aistore_pos`
本地仓库：`C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master`
分支：`main`
当前 GitHub `main` / 本地 `HEAD`：`958c3e7`（记录 `3afef08` 部署回归）；盘点数量边界保护为 `0a337c7`，页面内 Retry 为 `14a052a`，来源提示部署为 `3cd5be0`，location fallback 为 `5afab93`，AI 修复为 `56cd7c1`。

## 本次交接摘要

### 已完成并有证据

- 品牌站注册、租户自动登录、Odoo 公司绑定、Outlet/Register 配置、dummy data 初始化，以及删除租户后的认证拒绝。
- 基础 POS：开班、商品搜索、数量修改、Cash 收款/找零、Card 模拟收款、GST/现金舍入、收据和订单回读、销售扣库存。
- 退款与现金：Cash/Card 全额退款、退款订单、库存恢复、Cash in/out、正确现金盘点值关班。
- 采购：隔离公司供应商、RFQ、采购确认、部分收货/backorder、最终收货、重复收货保护和库存回读；该项需要在当前已核实部署版本重新回归。
- 多租户读取隔离、登出保护、平台删除租户后的认证拒绝。
- 全站静态页面历史矩阵 `131 路由 x 390/1440 = 262/262 PASS`，以及多个 Retry、Auth replay、列表、订单、报表和移动端回归。
- AI 关闭策略和鉴权：availability `3/3 PASS`、surface `11/11 PASS`，27 个受保护 AI/config/voice/label/Sommelier 路由匿名访问均为 `401`；AI UI `2/2 PASS`；Sommelier `10/10 PASS`；发票扫描 mock 通过且没有供应商/采购写入。
- 普通店员 AI 配置写保护：临时空权限角色和店员线上测试 `13/13 PASS`，所有 reload/create/update/delete 均返回业务码 `40300`，AI 配置数量 `[13,12,119,3]` 前后一致；测试用户和角色已清理。
- Odoo stocktake 页面/API 的租户、company、库位隔离，叶子库位和库存类型校验，数量/行数边界，提交前重读，应用后库存回读，admin-only 和默认关闭写开关；线上只读回归通过，当前无盘点写入。

### 未完成或只完成部分验证

- Odoo stocktake 的真实隔离公司写入尚未验收：取消不改库存、确认只应用一次、quant reference、库存前后值、跨租户拒绝和普通用户拒绝仍需在一次性隔离租户中完成。生产保持 `ODOO_STOCKTAKE_WRITE_ENABLED=false`。
- stocktake 数量边界（`1000001`）目前有本地 fixture 证据，但没有有效的线上真实登录交互证据；之前一次尝试被登录壳重定向，不能计为通过。
- AI 配置写接口的权限行为已完成线上验证；当前 API 使用统一业务信封，HTTP 状态为 `200`、业务码为 `40300`，监控若只看 HTTP 状态需同时检查响应码字段。本地 Maven 测试仍未执行。
- 真实 DashScope 对话、云端语音转写、酒标图像识别、真实发票 OCR 尚未验收；生产 `AI_ENABLED=false`，当前 AI 结果不代表模型已启用。
- 实体刷卡终端、打印机、钱箱、SMTP 邀请/重置邮件、正式现金差异审批、财务对账未验收。
- 分单/多支付方式收款和离线 POS 尚未实现或验收，不计入当前基础 POS 通过门槛。
- 平台店铺状态转换、租户生命周期相关工作区改动尚未提交、未运行后端测试、未部署、未线上验收。

### 当前问题和风险

- Dokploy 当前运行镜像的 frontend/backend SHA、构建日志、健康状态和部署时间没有从控制台独立回读。用户提供的 `7544d03` 只能作为“用户称已部署”的信息，不能替代可审计部署证据。
- 对 `14a052a`、`0a337c7` 的简化/标准 webhook 请求均返回 HTTP `301` / `Branch Not Match`；更早完整 GitHub payload 对 `5afab93` 等提交曾返回 `200`。需要先修正 Dokploy 分支/触发配置，再确认运行 SHA。
- 线上只读 UAT 中记录的 deployment SHA 不能自动证明容器实际运行该 SHA；必须以 Dokploy 构建日志或容器标签回读为准。
- 本地只做了 typecheck、目标 ESLint、脚本语法和 fixture UAT，没有运行 build；当前 Node `22.22.2`，而 `pos-ui/package.json` 声明 Node `>=24`，构建结论应以受支持 Node 或 Dokploy 日志为准。
- 工作区存在大量未提交的历史 UAT、截图、平台租户代码和配置改动。接手时不得 `git add -A`、清理或重置；只提交明确属于当前修复的文件。

### 建议的接手顺序

1. 在 Dokploy 控制台读取 frontend/backend 当前 SHA、构建日志、健康状态和部署时间，核对 `65a1e57`、`5afab93`、用户所称 `7544d03` 的关系；修复 `Branch Not Match` 后再做新部署。
2. 使用一次性隔离租户完成 stocktake 写入验收，记录库存前后值、quant reference、取消/重复提交/跨租户/非管理员结果，结束后删除租户并验证认证拒绝。
3. 在当前已核实部署版本重新执行采购收货和核心冒烟：`signup -> login -> outlet/register -> dummy catalog -> open session -> cash/card sale -> refund -> close register -> delete tenant`。
4. 将生产 AI、硬件、邮件、正式财务、分单支付、离线 POS 单独列入产品验收计划，不从 mock 或只读测试推断已完成。

### 放行结论

当前整体仍为 **NO-GO**。基础 POS、退款、现金管理和已有采购链路有历史线上证据，AI 关闭策略/鉴权和 stocktake 只读行为有近期线上证据；但部署身份未核实，stocktake 真实写入、普通用户权限、当前版本采购回归及生产运营能力仍缺证据。

## 2026-10-19 当前部署后回归

- 完整 GitHub push payload（含 `X-GitHub-Event: push`）触发 Dokploy 返回 HTTP `200` / `Compose deployed successfully`，目标提交为 `5392598c37c4560105f3c405c3f4d7e47f8b439c`。
- 等待超过 2 分钟后，主店公网回归通过：AI availability `3/3`、AI surface `11/11`、AI UI `2/2`、Sommelier `10/10`、Odoo stocktake 只读 `PASS`。证据：`docs/UAT_AI_AVAILABILITY_2026-10-19_POST-5392598.json`、`docs/UAT_AI_SURFACE_2026-10-19_POST-5392598.json`、`docs/UAT_AI_UI_2026-10-19_POST-5392598.json`、`docs/UAT_SOMMELIER_READONLY_2026-10-19_POST-5392598.json`、`docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19_POST-5392598.json`。
- 本轮仍验证生产 `AI_ENABLED=false`、匿名受保护 AI 路由为 `401`、Sommelier 价格/库存与 Odoo 目录一致；stocktake `locationSource=single-warehouse-fallback`、`writeEnabled=false`、非 GET 请求为 0。
- 这些是部署触发后的公网行为证据；Dokploy 控制台 frontend/backend 容器实际 SHA、构建日志和健康状态仍未独立回读，因此不能把脚本中的 deployment 字段当作容器取证。整体放行仍为 **NO-GO**。

## 2026-10-19 AI 管理员保护回归

- `3afef08` 的部署 webhook 返回 HTTP `200`；等待部署窗口后，使用临时非管理员店员测试 AI 配置全部 13 个写接口。
- 结果 `15/15 PASS`：13 个 reload/create/update/delete 请求均返回 HTTP `200` + 业务码 `40300`，配置计数 `[13,12,119,3]` 未变化；临时角色和账号已删除。证据：`docs/UAT_AI_ADMIN_GUARD_2026-10-19_POST-3AFEF08.json`。
- 这证明权限拒绝和无写入成立，但不代表 HTTP 状态码为 403；当前项目统一使用业务码表达该类错误，后续监控和客户端必须检查 `code` 字段。

## 本轮继续：Odoo 盘点 P0

- 新增 `/stock/stocktake` 页面和 `/api/odoo/stocktake` BFF：商品搜索/条码选择、数量填写、差异预览、人工确认；API 限定租户 company 与绑定库位下的内部叶子库位，拒绝追踪商品、包装/寄售库存、待盘记录，并在提交前重读商品和库存、应用后回读核对，成功响应显示 Odoo quant 调整引用。
- 本轮补上 Orithos 服务端角色门槛：对 `/api/auth/me` 做实时管理员核验；普通用户返回 403，身份服务不可用时 fail-closed。由于后端还没有 `stock.adjust` 授权模型，目前是 admin-only。
- `ODOO_STOCKTAKE_WRITE_ENABLED=false` 默认关闭；没有向 Demo 的 `aipos` 写入。线上只读查询已确认租户 company 恰有一个 warehouse，并从 `lot_stock_id` 返回唯一库位；真实隔离 Odoo 写入仍未验收。
- 本地 fixture 浏览器 UAT 390/1440/768 共 3 个视口通过：取消不触发写请求、确认恰好调用一次且 payload 正确、关闭开关时按钮禁用；无横向溢出或页面错误。证据 `docs/UAT_ODOO_STOCKTAKE_LOCAL_ITERATION_2026-10-19.json`，截图 `docs/screenshots/2026-10-19-stocktake/`。所有 API 均被 fixture 拦截，不连接或写入 Odoo。
- 页面/API 已在 `b2b1a05` 推送；单 warehouse location 兜底在 `5afab93` 部署。线上管理员只读回归通过；隔离 Odoo 写入和线上普通用户权限回归仍未做。
- 后续 `5afab93` 增加单 warehouse `lot_stock_id` 只读兜底，`3cd5be0` 增加 `locationSource` 和 UI 来源提示；管理员线上只读 UAT 通过，Demo binding 缺少 location 但成功解析出 1 个库位，未产生任何非 GET 盘点请求。证据 `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json`。
- `14a052a` 将库位读取失败从整页 reload 改为局部 Retry；390px fixture 首次 503 后恢复，线上管理员只读回归也通过。证据 `docs/HANDOFF_2026-10-19_STOCKTAKE_RETRY.md`。线上证据的行为通过不替代 Dokploy 容器 SHA 取证。
- 本地 fixture 首次 503 后点击 Retry 恢复，390/768/1440 三视口及原有确认/取消写保护均通过。
- `0a337c7` 将数量上限（1,000,000）和最多 40 行限制前移到 Review 按钮；超限数量时 Review 保持禁用。本地 390/768/1440 fixture 通过，证据 `docs/UAT_ODOO_STOCKTAKE_LOCAL_2026-10-19_LATEST.json`。
- 最新线上只读回归 `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19_LATEST.json` 通过：管理员登录、Odoo session 恢复、binding/location 读取、390/1440 页面均 PASS；`locationSource=single-warehouse-fallback`、`writeEnabled=false`、非 GET 盘点请求为 0。该证据不覆盖数量写入、库存回读或 Dokploy 容器 SHA。
- 最新 AI 线上只读回归：surface `11/11 PASS`、UI `2/2 PASS`。证据 `docs/UAT_AI_SURFACE_2026-10-19_LATEST.json`、`docs/UAT_AI_UI_2026-10-19_LATEST.json`；生产 AI、语音和酒标识别仍关闭，匿名受保护路由均返回 `401`。

## 当前结论

基础 POS/采购、多个前端回归，以及最近 AI 修复后的公网行为均有通过记录。Odoo 盘点 location fallback 与来源提示已在 `3cd5be0` 部署并通过线上只读 UAT；`14a052a` 的页面内 Retry 已完成本地验证但尚未部署。Dokploy 控制台中的容器实际 SHA、完整构建日志与健康状态仍未独立回读。Odoo 盘点仍缺隔离库存写入和普通用户权限验收，租户/平台后续改动也未完整验收。整体仍为 **NO-GO**。

## 2026-10-19 持续迭代补充

- 主商店只读回归：AI availability `3/3`、AI surface `11/11`（含 27 个匿名 API 路由）、Sommelier `10/10`、发票扫描 mock `PASS`。证据：`UAT_AI_AVAILABILITY_2026-10-19_CONTINUATION.json`、`UAT_AI_SURFACE_2026-10-19_ROUTE-MATRIX.json`、`UAT_SOMMELIER_READONLY_2026-10-19_CONTINUATION.json`、`UAT_INVOICE_SCAN_MOCK_2026-10-19_CONTINUATION.json`。Sommelier 推荐/详情价格和库存与 Odoo 目录一致；本轮没有模型、销售、采购、反馈或配置写入。生产 `AI_ENABLED=false`，这些结果不代表模型已启用。
- 公网 AI UI 的较早复测曾发现 dialog 未包含输入框（`UAT_AI_UI_2026-10-19_CONTINUATION.json`）；该问题随后在 `56cd7c1` 修复，并由后续公网 UI `2/2 PASS` 回归覆盖。
- 语音入口在 AI 关闭时原先仍可启动麦克风录音。`56cd7c1` 已加入 AI 未知/关闭时禁用语音按钮和录音启动保护；本地 fixture 验证 390px/1440px 通过，转写请求为 `0`。
- `/api/ai/config` 的 reload 和 intents/slots/slot-values/prompts 写接口原先仅要求登录。`56cd7c1` 已加入 `AdminAccess.requireAdmin()` 和非管理员 `40300` 控制器单测；单测未在本地 Maven 执行，仍需线上普通员工权限验证。
- 本地检查：前端 `npm run typecheck`、`SellAiPanel.tsx` 目标 ESLint、AI UAT 脚本 `node --check` 和 `git diff --check` 均通过。本仓库未运行 build。
- 公网脚本证据的 `deployment` 仍是 `unverified-after-deploy`；修复后行为已有公网回归记录，但运行镜像 SHA 尚未独立确认。

### `56cd7c1` 推送后线上回归（记录于 `db9219c`）

- GitHub `main` 已推送到 `56cd7c136eb84a89b5e5b028ed89c02f48bc52b5`。
- 用户提供的 Dokploy compose webhook 在本轮仍返回 HTTP `301` / `{"message":"Branch Not Match"}`，因此没有可审计的 Dokploy 部署任务、构建日志或容器运行 SHA。
- 推送后等待部署窗口并复测公网：AI UI `2/2 PASS`（390/1440）、AI availability `3/3 PASS`、AI surface `11/11 PASS`、Sommelier `10/10 PASS`、发票扫描 mock `PASS`。证据：`UAT_AI_UI_2026-10-19_POST-PUSH-CHECK.json`、`UAT_AI_AVAILABILITY_2026-10-19_POST-DEPLOY.json`、`UAT_AI_SURFACE_2026-10-19_POST-DEPLOY.json`、`UAT_SOMMELIER_READONLY_2026-10-19_POST-DEPLOY.json`、`UAT_INVOICE_SCAN_MOCK_2026-10-19_POST-DEPLOY.json`。
- AI dialog/语音禁用源码修复和 AI 配置写接口管理员保护已在 `56cd7c1` 推送。公网 UI `2/2` 验证修复后的界面行为；这不等于验证了生产 AI 模型。
- 这些公网结果证明修复后的行为在当前站点可观察到，但由于 deployment 字段仍为 `unverified-after-deploy`，不能据此确认 Dokploy 使用的镜像就是 `56cd7c1`。后端 AI 配置管理员保护仍缺非管理员线上证据；新增控制器单测由后端构建验证，但本地没有运行 Maven 测试。

### 2026-10-19 后续只读回归

- 本地曾用简化和标准 GitHub push payload 请求部署 `14a052a` 与 `0a337c7`，均返回 HTTP `301` / `Branch Not Match`；因此无法从 webhook 单独确认 Dokploy 已切换到这些 SHA。公开页面本轮数量边界专项被重定向到登录壳，未形成有效线上数量证据。此前 `b2b1a05`、`5afab93`、`3cd5be0` 的完整 payload 曾返回 HTTP `200 Compose deployed successfully`。
- 主商店 AI 线上回归再次通过：availability `3/3`、surface `11/11`（包括 27 个匿名路由 `401`）、AI UI `2/2`、Sommelier `10/10`。推荐产品价格/库存与 Odoo 商品目录一致；生产 `AI_ENABLED=false`，没有调用真实模型、语音转写或图像识别服务。发票扫描 mock `PASS`，扫描端点由浏览器 fixture 截获，没有创建供应商或采购。
- `5afab93` 部署等待超过 5 分钟后的 AI 回归：availability `3/3`、surface `11/11`、UI `2/2`、Sommelier `10/10`、invoice mock `PASS`。证据：`docs/UAT_AI_AVAILABILITY_2026-10-19_POST-5AFAB93.json`、`docs/UAT_AI_SURFACE_2026-10-19_POST-5AFAB93.json`、`docs/UAT_AI_UI_2026-10-19_POST-5AFAB93.json`、`docs/UAT_SOMMELIER_READONLY_2026-10-19_POST-5AFAB93.json`、`docs/UAT_INVOICE_SCAN_MOCK_2026-10-19_POST-5AFAB93.json`。这些脚本记录的 deployment SHA 为 `5afab93`；容器 SHA 仍未在 Dokploy 控制台核实。
- `3cd5be0` stocktake source UX 线上只读证据更新为 PASS：`locationSource=single-warehouse-fallback`，管理员可看到写入前需显式绑定的提示；证据 `docs/HANDOFF_2026-10-19_STOCKTAKE_SOURCE_UX.md` 与 `docs/UAT_ODOO_STOCKTAKE_ONLINE_READONLY_2026-10-19.json`。
- 本地 `npm run typecheck` 和 stocktake 页面/API/navigation 目标 ESLint 均退出码 0；未运行 build。当前 Node 为 `22.22.2`，而 `pos-ui/package.json` 声明 Node `>=24`，应在受支持 Node 版本或用 Dokploy 构建日志补足工具链验证。

## 已完成且有证据

### 核心业务能力（既有隔离租户验收）

- 品牌站注册、租户自动登录、Odoo 公司绑定、Outlet/Register 配置、dummy data 初始化和租户删除后的认证拒绝。
- POS 开班、商品搜索、Cash 收款/找零、Card 模拟收款、GST/现金舍入、收据与订单回读、销售扣库存。
- Cash/Card 全额退款、退款订单及库存恢复；Cash in/out；正确现金盘点值关班。
- 隔离公司供应商创建、RFQ、采购确认、部分收货/backorder、最终收货、重复收货保护和库存回读。
- 多租户读取隔离、登出保护，以及平台删除租户后的认证拒绝。

以上结论来自此前保存的隔离租户线上证据；执行新的写入验收时仍须建立一次性租户，禁止对生产 Demo 公司做业务写入。

### 页面、交互和稳定性

- 全站静态页面基线：131 路由 × 390/1440 视口，262/262 PASS（历史回归证据）。
- 已有综合交互、管理列表、订单、设置、平台恢复、报表/Overview/补货竞态、关班读取保护等专项通过记录；详见 `HANDOFF_2026-10-18.md` 与 `CAPABILITY_STATUS.md`。
- 2026-10-19 Product Detail Retry 在线只读故障注入 1/1 PASS；Gift Cards Retry 和搜索竞态 2/2 PASS。失败 GET 后 Retry 期间按钮锁定、错误提示保留，恢复后成功；390px 无横向溢出、无页面错误、没有业务写请求。证据：`UAT_PRODUCT_VIEW_RETRY_AFTER_B3C9EBA.json`、`UAT_GIFTCARDS_OUTLET_RETRY_AFTER_B3C9EBA.json`。
- Auth replay 在线回归 2/2 PASS：GET 401 仅刷新并重试一次，DELETE 没有自动重放且测试请求被浏览器拦截。证据：`UAT_AUTH_REPLAY_AFTER_B3C9EBA.json`。
- AI availability 3/3 PASS、AI surface 11/11 PASS：验证生产 AI 关闭状态、配置读取和登出后的匿名 API 401；另有 27 个配置/语音/酒标/Sommelier 路由匿名矩阵。证据：`UAT_AI_AVAILABILITY_2026-10-19_CONTINUATION.json`、`UAT_AI_SURFACE_2026-10-19_ROUTE-MATRIX.json`。
- AI 对话框和语音禁用修复在本地 fixture 环境完成 390px/1440px 检查：modal 语义、dialog 范围、Tab 焦点循环、Escape 焦点返回、AI 关闭时语音按钮禁用均通过；转写请求为 `0`，AI 请求由 fixture 拦截。证据：`UAT_AI_FOCUS_LOCAL_2026-10-19_RELEASE-CANDIDATE.json`。
- 最新全站静态矩阵：131 路由 × 390/1440 视口，262/262 PASS，无路由失败、横向溢出或页面错误。证据：`UAT_ALL_STATIC_PAGES_AFTER_94CCC32.json`。矩阵 `sourceCommit=94ccc32` 表示测试源码基线，不证明 Dokploy 正在运行该 SHA。

## 未完成或未覆盖

- **Dokploy 容器构建身份待独立核验**：`3cd5be0` 后线上 stocktake 与 AI UAT 通过，但 `14a052a`/`0a337c7` 的部署请求返回 `Branch Not Match`；frontend/backend 容器实际 SHA、完整构建日志、健康状态和部署时间仍需从控制台回读。
- **AI 配置管理员权限仍缺线上验证**：修复已提交于 `56cd7c1`，但未用普通员工账号验证写接口返回拒绝；控制器单测存在，尚无本地 Maven 执行结果或可审计 CI 构建记录。
- **AI 生产功能未验收**：当前生产 `AI_ENABLED=false`。真实 DashScope 对话、云端语音转写、酒标图像识别、真实发票 OCR 尚未验证；现有通过项只证明关闭策略、UI 状态和匿名鉴权。
- **实体设备未验证**：实体刷卡终端、打印机、钱箱没有接入现场设备验收。Card 是 Odoo 模拟支付方式。
- **产品能力缺口**：分单/多支付方式收款和离线 POS 尚未实现或未验收；不计入当前基础 POS 通过范围。
- **运营验收未完成**：真实邮件（邀请/密码重置）、正式现金差异审批、正式财务对账和采购财务流程未完成验收。
- **采购回归需重绑定当前版本**：隔离租户完整收货已有旧版本证据；尚未在已核实的当前生产版本上回归。
- **构建证据不足**：本地没有运行 build；生产构建结果需以 Dokploy 完整构建日志为准。
- **平台店铺状态转换改动待验证**：工作区对状态按钮和 API 增加允许转换矩阵，并新增 `suspended → expired` 拒绝单测；前端 typecheck/目标 ESLint 已通过，但后端测试未运行，当前环境仅有 JDK 8，项目要求 Java 21。该改动未提交，不能算已部署或已验收。
- **Odoo 盘点隔离验收未完成**：`5afab93` 已完成线上管理员只读验证和单 warehouse location 兜底，但本地/线上读取不验证 Odoo 字段权限、库存应用或审计记录。仍需在获批隔离 DB/company 验证取消不改库存、确认只应用一次、数量回读一致、跨租户/非管理员拒绝，再考虑启用环境开关；Demo `aipos` 禁止写入。
- **租户生命周期/平台店铺状态改动未完成验收**：后端租户删除状态转换和前端平台店铺详情等改动未提交；对应后端测试未运行，也没有线上回归证据。

## 当前问题与工作区状态

- `main` 与 `origin/main` 当前为 `5bcfb72`；stocktake location fallback 代码部署提交为 `5afab93`，来源提示部署提交为 `3cd5be0`，Retry 修复为 `14a052a`，数量边界保护为 `0a337c7`。
- 完整 push payload 返回 HTTP 200，随后线上只读 UAT 记录 deployment `5afab93`。Dokploy 控制台的 frontend/backend 容器 SHA、构建日志和健康状态仍未回读；不得把旧的 `7544d03` 当作当前版本。
- 工作区仍有大量未提交变更，当前可见包括能力状态/旧交接文档、平台租户生命周期后端代码与测试、平台店铺详情前端、多个 UAT JSON/截图以及 `tsconfig.json`。Odoo stocktake 页面/API 已提交；其本地 UAT 证据和截图目前仍未提交。AI 修复源码和 Odoo stocktake 实现均已提交，不应再按未提交代码处理。接手时检查实际 diff 和归属。
- 不要运行 `git add -A`，不要清理、重置或覆盖这些改动。新增交接文件应单独处理。
- `UAT_AI_UI_2026-10-19_AUTHFIX.json` 是较早的线上焦点失败（1/2）；较新的 `UAT_AI_UI_2026-10-19_POST-PUSH-CHECK.json` 为 `56cd7c1` 后公网行为 `2/2 PASS`，两者应按时间区分。
- 旧线上回归 JSON 的 `deployment=unverified-after-deploy`；本轮 `POST-5AFAB93` UAT 显式记录已接受部署的 SHA `5afab93`。两类证据均不替代 Dokploy 容器 SHA/构建日志。

## 接手顺序

1. 从 Dokploy 控制台回读 frontend/backend 当前容器 SHA、完整构建日志、健康状态和部署时间，将其与已部署提交 `5afab93` 对照。
2. 使用普通员工账号验证 AI 配置写接口的管理员拒绝逻辑；确认生产 AI 仍保持关闭，除非另有预算与生产验收批准。
3. 审阅剩余工作区 diff，特别是租户生命周期和平台店铺状态转换。只提交明确纳入的文件，不要提交整批 UAT/截图或无关工作区改动。
4. Odoo stocktake 需先只读核实绑定库位树，再于获批隔离 Odoo 完成写入验收；后端单测在 Java 21 CI/受控环境运行并记录结果。保持生产 `ODOO_STOCKTAKE_WRITE_ENABLED=false`，直到验收完成。
5. 再运行受影响路由的只读冒烟。若要进行业务写入，使用一次性隔离租户，并在结束后删除租户及验证认证拒绝。
6. 生产 AI、硬件、多支付、离线 POS 和正式财务/邮件流程仍单独跟踪，不得由 UI 或 mock 测试标记为通过。

## 放行矩阵

| 类别 | 状态 |
|---|---|
| 隔离租户基础 POS、退款、现金管理/关班 | 已有线上验收记录 |
| 隔离租户采购确认与收货 | 已有线上验收记录；需当前部署版本回归 |
| Retry、Auth replay、AI surface 最近专项 | 通过只读线上回归；部署 SHA 未核验 |
| AI dialog/语音禁用修复 | 已包含在 `5afab93` 部署批次；post-deploy UI 2/2 PASS；容器 SHA 待控制台回读 |
| AI 配置管理员保护 | `56cd7c1` 已推送；控制器单测已新增；普通员工线上拒绝及可审计测试结果待补 |
| Odoo stocktake | `3cd5be0` 已部署且线上管理员只读通过；`14a052a` Retry 和 `0a337c7` 数量边界本地三视口通过，最新部署 SHA 待核实；服务端 admin-only；隔离 Odoo 写入未验收 |
| Dokploy 当前运行版本及完整构建 | 未核验 |
| 生产 AI、实体硬件、SMTP、正式财务流程 | 未验收 |
| 分单/多支付、离线 POS | 未实现或未验收 |
| 整体放行 | **NO-GO** |
