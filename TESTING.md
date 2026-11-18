# Orithos 全栈持续测试

## 当前落地状态

| 阶段 | 状态 | 备注 |
|---|---|---|
| 离线提交门禁 | 已落地 | POS UI/API、Crawler、Forecast、AI harness 与 AI Gateway/Worker 各自执行；UI JUnit 失败计数也作为门禁判定；CI 上传脱敏 JSON 与 JUnit 工件 |
| OpenAPI 合约入口 | 已落地 | Schemathesis wrapper 仅接受 allowlist host 且只跑 GET；需在本地 Compose 上手动启动 |
| k6 只读冒烟 | 已落地 | 默认 localhost，逐步升压，只读版本端点 |
| Playwright + axe | 待接入 | 需要锁定浏览器依赖和本地登录测试 fixture；未获得 fixture 前不接触 Demo |
| PostgreSQL/Redis Testcontainers | 待接入 | 需要先把现有 API 集成测试与可重置容器数据连起来，不能以空容器连通性冒充业务集成覆盖 |
| Promptfoo 在线比较 | 待接入 | 在线费用预算与可用 provider 配置需由手动批次提供；离线 CI 不加载模型密钥 |
| Demo SHA 验收 | 手动流程 | 继续使用现有只读 UAT 脚本；写操作独立触发并记录清理 |

## 本地提交门禁

| 范围 | 命令 | 运行环境 |
|---|---|---|
| POS UI 单测、类型、Lint | `cd pos-ui; npm ci; npm run test:unit; npm run typecheck; npm run lint` | Node 24 |
| POS API | `cd pos-api; mvn -B clean verify` | Java 21 |
| Crawler | `cd shopfront_crawler; pip install -e ".[test]"; pytest -q` | Python 3.12 |
| Forecast | `cd forecast-service; pip install -r requirements.txt pytest; pytest -q` | Python 3.12 |
| AI 离线样本 | `python scripts/ai-eval/validate_fixtures.py` | 不调用模型 |
| 预测评估工具 | `python -m unittest scripts.tests.test_ai_forecast_eval scripts.tests.test_ai_forecast_segmented_eval scripts.tests.test_ai_forecast_walkforward_eval` | 固定样本 |
| AI Gateway/Worker | 在 `orithos-ai-services` 执行 `python -m unittest discover -s tests -v` 与 `python eval/validate_fixtures.py` | 不调用模型 |

GitHub Actions 默认跟随提交门禁，也可在 Actions 页面手动重跑 `Offline Test Gates` 或 `AI Services Offline Tests`。两仓库分别触发；POS 仓库的 AI 检查不代替独立 AI 服务仓库工作流。

`Offline Test Gates` 为 POS 仓库自动执行以上已有测试和静态检查。每个作业上传脱敏 JSON 运行清单及可用的 JUnit XML。清单包含源码 SHA、环境、范围、时区、模型/prompt 版本、耗时与写入范围；不得放入原始请求、凭据、顾客数据或服务响应。CI 将不含业务历史输入的预测质量回测标记为 `BLOCKED`，将在线模型比较标为 `NOT RUN`。

统一状态：`PASS` 表示本次执行通过；`FAIL` 表示已执行失败；`BLOCKED` 表示缺少必要数据、环境或依赖，不能形成结论；`NOT RUN` 表示本次未执行。fixture 通过只能证明固定样本/离线逻辑，不能代替已部署运行版本验收。

## 集成与浏览器测试

- 本地使用专属 Compose project 和可重置 PostgreSQL/Redis，不连接 Demo 或生产数据库；Java 集成测试补充 Testcontainers 后再纳入提交门禁。
- Playwright Test 使用 `baseURL` 指向本地 Compose 前端；登录凭据只从 CI secrets 注入，禁止保存/上传 storage state。覆盖登录、报表只读、助手问答、库存只读及收银草稿；提交销售/采购等写入只允许隔离数据集。
- 浏览器套件通过 `@axe-core/playwright` 检查登录、报表、助手和库存的关键页面。无凭据或服务不可用时结果为 `BLOCKED`，不得自动跳到 Demo。
- Schemathesis 从 POS API 的 OpenAPI 文档生成边界请求，只指向显式 allowlist host；包装器只放行 GET。安装 `pip install -r scripts/testing/requirements.txt` 后，用 `API_SCHEMA`、`API_BASE_URL` 和 `SCHEMATHESIS_ALLOWED_HOSTS` 指向本地 Compose API 并执行 `python scripts/testing/run_contract_checks.py`。

## AI 与预测质量

- 将已批准且脱敏的问答 JSONL 作为业务正确性基准，事实型问题断言日期、门店、金额/数量、来源及空数据行为。模型在线比较可用 Promptfoo，在手动 dispatch 或预算批次里运行；必须设置最大请求数/预算、超额立即失败，提交门禁不配置 provider key。
- Forecast 使用逐步扩展窗口 walk-forward，报告 7/14/28 天 WAPE、偏差和区间覆盖，按品类与间歇需求分组并对照朴素基线。历史库存、营业日或覆盖范围缺失时写 `BLOCKED`，不填零，也不算通过/失败。

## Demo 验收与性能

部署后先从只读版本端点核对运行 SHA 与候选源码 SHA，再执行只读 UAT。Demo 是已授权隔离测试环境；写测试必须单独手动触发，使用明确标记的数据并记录创建/清理结果，禁止放入每次提交流水线。

k6 只用于本地 Compose 或明确指定的测试环境。`scripts/testing/smoke.k6.js` 默认只访问 localhost，并对只读版本端点逐级升压；外部测试 host 必须显式加入 `K6_ALLOWED_HOSTS`。执行 `k6 run scripts/testing/smoke.k6.js`，先记录 P50/P95 与错误率，不预设性能通过阈值；该只读版本冒烟不代表业务任务成本。禁止对生产压测。CI 工件保存详细结果，仓库仅保留不含业务数据和凭据的摘要。
