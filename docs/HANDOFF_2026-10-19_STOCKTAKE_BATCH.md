# Orithos POS 盘点批次交接

更新时间：2026-10-19（Asia/Shanghai）  
代码提交：`b2b1a05`（`feat: add guarded Odoo stocktake workflow`）  
文档跟进提交：`f09835c`；本次 Dokploy 部署对应代码提交 `b2b1a05`

## 本批次完成

- 新增 `/stock/stocktake`：选择库存位置、按名称/SKU/条码搜索、添加商品、录入实盘数量、预览差异、人工确认应用。
- 新增 `/api/odoo/stocktake`：租户 company/location 隔离、内部叶子库位限制、追踪/包装/寄售/待盘库存阻止、提交前库存竞态检查、应用后回读核对。
- API 每次 GET/POST 都实时调用 Orithos `/api/auth/me`；当前仅管理员可用，普通店员返回 403，身份服务异常 fail-closed。
- 成功响应返回 Odoo quant 调整引用，页面显示引用号。
- 生产环境开关 `ODOO_STOCKTAKE_WRITE_ENABLED=false`，没有向 Demo 的 `aipos` 写入。

## 本地验证

- `pos-ui`: `npm run typecheck`：PASS。
- 盘点页面/API/导航 ESLint：PASS。
- `node --check scripts/pilot-odoo-stocktake-local-uat.mjs`：PASS。
- `git diff --check`：PASS。
- fixture 浏览器 UAT：390、768、1440 三个视口 PASS；取消不产生写请求，确认只提交一次且 payload 正确，写入关闭时按钮禁用，页面无错误和横向溢出。
- 证据：`docs/UAT_ODOO_STOCKTAKE_LOCAL_2026-10-19.json`、`docs/UAT_ODOO_STOCKTAKE_LOCAL_ITERATION_2026-10-19.json`、`docs/screenshots/2026-10-19-stocktake/`。
- 本地 build 未运行，符合项目约束。

## Dokploy 部署与线上只读验证

- 使用完整 GitHub push payload 调用 compose webhook，返回 `HTTP 200 Compose deployed successfully`。
- `https://demo.orithos.com.au/overview`：HTTP 200。
- `https://demo.orithos.com.au/stock/stocktake`：HTTP 200（未登录时由页面层返回登录壳）。
- 未登录 `GET https://demo.orithos.com.au/api/odoo/stocktake`：HTTP 401，证明 API 会话保护生效。
- 远端 Git SHA 已核对为 `b2b1a05`；Dokploy 容器内部运行 SHA、完整构建日志和健康状态仍未从控制台独立回读。
- 没有执行线上库存写入，没有开启 `ODOO_STOCKTAKE_WRITE_ENABLED`。

## 仍需完成

1. 在获批隔离 Odoo 数据库/company 上验证取消不改库存、确认只应用一次、Odoo 数量回读一致、quant 引用有效。
2. 只读核实 Demo 绑定的真实库位树，并确认叶子库位选择符合门店配置。
3. 使用线上管理员账号和普通店员账号分别验证 `/stock/stocktake` 页面与 API 的 200/403 行为。
4. 评估把 `stock.adjust` 纳入角色权限模型；在此之前保持 admin-only。
5. 完成 Dokploy 控制台构建日志、容器健康和实际运行 SHA 取证后，再决定是否把本批次标为可试点。

当前结论：**功能代码已部署，UI/API 只读边界已验证；真实库存写入未验收，不能开启生产盘点写入。**
