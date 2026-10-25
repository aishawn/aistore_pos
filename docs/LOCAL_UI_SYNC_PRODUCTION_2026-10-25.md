# 完整本地 POS 界面生产发布

上一轮只发布配色，漏掉本地未提交的完整布局与组件，因此本地与生产不同。本轮按用户授权发布完整 `pos-ui` 源码与资源快照；文件哈希与冻结时间见 `LOCAL_UI_SYNC_SOURCE_2026-10-24.json`。共享工作区此后新增的其他任务编辑不属于这一冻结快照。

- GitHub production main: `8af3a57803663e77fc6593c603b1c903d6aac655`。
- Dokploy production Compose: `aistorepos` / `WvcUddxTnymK_K5RZPPtL`。
- Deployment: `MbPbmDGrcEpOEAUEIdQJp`，状态 `done`，2026-10-24 16:00:54 UTC 创建。
- app/demo 公开版本接口的 frontend/backend 均精确匹配上述 SHA。
- 正常 Deploy，未重置数据卷；未改变 UAT Compose；品牌站保持已发布的 `f9c2880729b0ebba8deb408b25d33f1722b40a8d`。
- 本次相对上一生产版本无 `pos-api` 改动；未上传本地其他 Java 开发内容。

## 检查结果与限制

本地 TypeScript no-emit 通过；73 个受影响源码文件 ESLint 0 errors、6 warnings。收银 fixture 8 项、AI workspace 28 项通过。没有运行本地生产构建；应用构建由 Dokploy 执行。本次未提取完整 Maven 日志，不把部署状态当作独立全量后端验收。

`UAT_LOCAL_UI_SYNC_PRODUCTION_IDENTITY_2026-10-25.json`：app/demo 实际版本、7 个关键静态资源均通过；仅携带本地预览 cookie 时生产 dashboard 跳转 login，API 返回 401。本地免登录预览未绕过生产认证。

响应式页面检查与截图以 **`UAT_LOCAL_UI_SYNC_*_RESPONSIVE_2026-10-25.json`** 和 `screenshots/2026-10-25-ui-sync/` 为准。收银、Dashboard、Workspace、AI、推荐各在真实 390/768/1440px 检查。浏览器 API 全部拦截为相同 fixture，以比较界面布局；这些不等于真实登录、AI 提供商或 Odoo 交易验收。生产业务写入 0；Pilot NO-GO 状态不变。

早期 `UAT_LOCAL_UI_SYNC_CANDIDATE_2026-10-25.json`、`UAT_LOCAL_UI_SYNC_PRODUCTION_2026-10-25.json` 的宽度参数未真正作用于页面，并且部分截图捕获了加载态，因此不能作为三尺寸验收。已修正为显式 `page.setViewportSize`、实际 innerWidth 断言、等待主要内容就绪，并补齐收银配置 fixture。`UAT_LOCAL_UI_SYNC_REFERENCE_2026-10-24.json` 是动态共享开发目录截图，后两项因其他任务编辑期间缺少 PurchasingWorkspace 模块返回 500；不代表冻结候选或生产故障。上述历史结果保留，不改写成通过。

## 所有商店如何同步

`docker-compose.yml` 的 `orithos-tenant-secure` 通配子域名路由把普通商店域名送到同一前端服务，因此一次生产发布会更新所有使用该服务的商店界面。各店数据、权限、Odoo 配置仍隔离。app 是控制台，显示对应控制台界面；UAT 是独立环境。

本地文件保存不会直接修改线上。完整改动需要经过冻结快照、检查、提交推送 GitHub main、Dokploy 构建、运行版本核验后才算上线。本次 push 已实际触发自动部署，无额外重复部署。后续发布应同时维护精确的 SOURCE_COMMIT，避免只上线局部文件或错误地宣称未提交改动已上线。

发布后的证据提交保存在本地 `codex/sync-local-pos-ui`，计划仅上传该分支，不推动 production main 的源码 SHA。当前截图及证据分支上传多次遇到 GitHub connection reset / empty reply，尚未确认上传成功；完整产品源码 main 已成功上传并完成生产部署。上一轮报告称旧配色证据分支已上传，但当时 push 网络失败，该说法不准确；生产配色源码本身已上线。本次发布及当前线上验收以本报告和新证据为准。
