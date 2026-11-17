# AI Assistant Iteration Plan

> **For agentic workers:** Use inline execution with focused checkpoints. Each release slice requires relevant checks, a main deployment, deployment identity confirmation, and online acceptance. The Java 21 candidate workflow is optional, not a pre-push gate.

**Goal:** Improve AI question answering through measured, repeatable iterations until critical Demo and SKR workflows pass and no unresolved high-frequency correctness or latency issue remains.

**Architecture:** Keep deterministic fast paths and native Orithos reports authoritative for POS data. Use UAT and metrics evidence to select bounded follow-up changes; preserve read-only behavior for reports and never write to Shopfront.

**Tech Stack:** Java 21 / Spring Boot (`pos-api`), PostgreSQL read-only report views, Node.js UAT scripts, Playwright, GitHub Actions, Dokploy Compose.

**Spec:** Approved iteration objective and stock-value SQL design in the current task conversation.

## Global Constraints

- Maintain and deploy `main`; do not include unrelated Shopfront WIP.
- The `.github/workflows/backend-java21-candidate-verify.yml` workflow is available for optional backend verification; it is not required before pushing to `main`.
- Shopfront is a read-only source; do not use Register or create source transactions.
- Use Orithos APIs and read-only report workflows for POS acceptance; report any data gaps honestly.
- Check deployed/source SHA independently from local test results.
- Do not claim deployment or online acceptance without runtime evidence for both Demo and SKR.

---

### Task 1: Publish the stock-value query optimization

**Files:**
- Modify: `pos-api/src/main/java/com/orithos/modules/ai/report/ReportTemplateRegistry.java`
- Test: `pos-api/src/test/java/com/orithos/modules/ai/report/ReportTemplateRegistryTest.java`
- Workflow: `.github/workflows/backend-java21-candidate-verify.yml`

- [x] Split the full-store aggregate from the positive-cost top-eight product query.
- [x] Preserve a summary row when there are no valued products and preserve the excluded-product count.
- [x] Run the focused registry and response tests; expected result: 30 passing tests.
- [x] Push the candidate to `main` and confirm Demo and SKR deployed SHA `6f339fbddb6998896665eb123f6aff906770bb6b`.
- [x] Compare Demo and SKR stock-value responses: both correctly report unavailable value because no on-hand products have verifiable positive costs; 3,071 Demo and 3,050 SKR products are not valued, with no product rows. Numeric total/row parity remains untestable until verified costs are available.
- [x] Record runtime latency samples. Pre-deploy Demo baseline: 18 requests, p50 2,050 ms, p95 4,718 ms. Post-deploy exploratory sample: 8 requests across both stores and both languages, p50 2,429 ms, p95 2,731 ms; the sample is not directly comparable, so no latency improvement is claimed.

**Pre-deploy baseline (2026-11-17, runtime `1c4f322c`):** Demo and SKR each passed the selected 12-case critical workflow set (sales periods, AOV, stock value, and write guards); the selected-set reports are marked `BLOCKED` only because the full 414-case catalog was intentionally not run. The selected reports contain 24 PASS, 0 FAIL, 0 blocked cases. Orithos report read-only UI/API UAT passed 8/8 on each store. SKR `verify-skr-ai-readonly.mjs` passed 7/7 after setting `SKR_SOURCE_COMMIT`; it calls the forecast risks POST, which refreshed `ai_forecast_snapshot` twice during these checks and made no purchase, price, or inventory business writes. Demo metrics UAT passed 9/9 at 390px and 1440px; aggregate 24-hour p95 was 4,205 ms. `assistant:report_stock_value` had 18 allowed samples, p50 2,050 ms and p95 4,718 ms. This is the pre-candidate baseline, not evidence that the candidate is deployed or faster.

### Task 2: Re-run critical online AI acceptance

**Files/scripts:**
- `scripts/ai-eval/verify-skr-ai-readonly.mjs`
- `scripts/ai-eval/summarize-uat-reports.mjs`
- Existing `PILOT_UTTERANCE_IDS` workflow cases and `.local/ai-eval/` reports

- [x] Confirm Demo and SKR runtime SHAs match the deployed candidate.
- [x] Run 10 critical cases covering sales periods, AOV, stock value, and write guards in both stores; all 20 selected cases passed.
- [x] Require deterministic routing where expected, empty `writeRequests`, and agreement with `native-overview` where applicable; yesterday revenue/profit matched in both stores.
- [x] Run the SKR Orithos report/assistant verifier (7/7 PASS) and independently reconcile yesterday sales/profit to native overview in both stores; record the forecast snapshot side effect above.
- [x] Compare `/api/ai/config/intents` against the SQL intent seed contract for both stores, and separately record `/api/ai/config/client` capability flags.
- [x] Summarize the selected Demo/SKR workflow reports: 20 PASS, 0 FAIL, 0 blocked cases; each workflow report is top-level BLOCKED because the full catalog was not run.
- [x] Treat the verifier's forecast risks POST as a database snapshot refresh; this scoped run refreshed only `ai_forecast_snapshot` and made no purchase, price, or inventory business writes.

### Task 3: Restore the local report UAT and metrics toolchain

**Files/scripts:**
- `scripts/pilot-ai-report-readonly-uat.mjs`
- `scripts/pilot-ai-report-readonly-orithos-uat.mjs`
- `scripts/pilot-ai-metrics-uat.mjs`
- Existing Playwright package/browser configuration

- [x] Verify the repository Playwright version and matching headless shell; restore the module path only inside the temporary runtime worktree.
- [x] Replace the stale `scripts/pilot-ai-report-readonly-uat.mjs` with a compatibility entry that delegates to the Orithos-native suite. The prior entry called retired `/api/odoo/session`; the replacement passed 8/8 checks with zero writes in Demo and SKR on runtime/source SHA `00cbe101`.
- [x] Add and pass `node --test scripts/pilot-ai-report-readonly-uat.test.mjs` to prevent retired Odoo/Shopfront API paths from returning to this entry point.
- [x] Run Demo metrics UAT at desktop and mobile widths (9/9 PASS).
- [x] Capture aggregate and stock-value latency samples. The metrics UI reported a 24-hour aggregate p95 of 3,950 ms; see Task 1 for stock-value samples and comparison limits.
- [x] Keep the full 400+ workflow catalog out of the release gate; batch selected utterances and summarize by stable IDs.
- [x] Confirm local browser artifacts and temporary dependencies do not dirty the maintained `main` checkout.

### Task 4: Select and ship the next bounded AI improvement

**Selected issue:** `report_stock_value` remains the slowest common deterministic report (Demo: 22 requests, p50 2,050 ms, p95 4,231 ms; SKR: 19 requests, p50 1,982 ms, p95 4,741 ms). `EXPLAIN (ANALYZE, BUFFERS)` on the live query measured 2,312 ms in Demo and 3,290 ms in SKR. Both plans repeatedly scanned `product_price` through `ai_rpt_product` for each on-hand product (3,071 / 3,050 loops; about 1.4 million shared buffer hits). The report only needs product id/name, so the selected fix is to use a minimal outlet-scoped product-core view.

**Files:**
- Modify: `pos-api/src/main/java/com/orithos/modules/ai/report/ReportTemplateRegistry.java`
- Modify: `pos-api/src/main/java/com/orithos/modules/ai/report/AiReportTenantProvisioner.java`
- Modify: `pos-api/src/main/java/com/orithos/modules/ai/report/AiReportTableCatalog.java`
- Modify: `pos-api/src/main/resources/db/migration_ai_report_views.sql`
- Test: `pos-api/src/test/java/com/orithos/modules/ai/report/ReportTemplateRegistryTest.java`
- Test: `pos-api/src/test/java/com/orithos/modules/ai/report/AiReportTenantSchemaTest.java`
- Test: `pos-api/src/test/java/com/orithos/modules/ai/report/SqlGuardTest.java`

**Interfaces:** `ai_rpt_product_core` exposes only `id`, `outlet_id`, `name`, and `status`, filtered to non-deleted products. Tenant provisioning creates the same view in each outlet schema; the stock-value query retains explicit outlet joins and cost permission checks.

- [x] Capture live metrics and read-only execution plans for both outlets; record the repeated product-price scan as the SQL bottleneck.
- [x] Add failing tests that require `report_stock_value` to join `ai_rpt_product_core` and require per-outlet provisioning to include that view.
- [x] Run `mvn -B "-Dtest=ReportTemplateRegistryTest,AiReportTenantSchemaTest" test` from `pos-api`; both new assertions failed for the missing view contract.
- [x] Add the minimal product-core view to the public migration and outlet provisioning; update the inventory-value template to use it. Register the view in the SQL allowlist and cover binder → guard execution, outlet scoping, and cost permission with tests.
- [x] Re-run the focused Maven tests: `SqlGuardTest`, `ReportTemplateRegistryTest`, and `AiReportTenantSchemaTest` passed 47/47. Existing JSQLParser deprecation and annotation-processing warnings remain.
- [x] After deployment, run read-only `EXPLAIN (ANALYZE, BUFFERS)` on Demo and SKR. Demo: 11.954 ms, 2,366 shared buffer hits; SKR: 9.434 ms, 2,354 shared buffer hits. Neither plan scans `product_price`; both are below the 750 ms target.
- [x] Push the task-scoped change directly to `main` in commit `7f2240f688146f03f297b4b41ecbd0087094dd4f`. During deployment, `main` advanced to descendant `064b367f8b6da51de74730e6dd66f7fd491c4920` with a separate AI commit; the deployed runtime is that current `main` SHA in both stores and includes the stock-value fix.
- [x] Re-run eight selected critical workflow cases per store: 16 PASS, 0 FAIL, 0 blocked cases in the summarizer. Each includes deterministic routing, `llmFallback=false`, and empty `writeRequests`; the workflow report top-level status remains BLOCKED by design because the 400+ catalog was not run.
- [x] SKR report/assistant verifier: 7 PASS, 0 FAIL, 0 blocked, with source/runtime SHA match. Capability seed/config check: PASS for Demo and SKR. The verifier's forecast risks POST refreshed its read-only forecast snapshot; it made no purchase, price, or inventory business writes.
- [x] Preserve honest stock-value result: positive verified costs remain unavailable, so numeric total and product rows are not asserted. The query plan validates the performance change independently of that data gap.

**Other candidates:**
- Add bilingual deterministic routes only for measured phrases that currently use unnecessary LLM fallback.
- Replenishment `partial` / data-gap status and copy, with backend/UI tests updated together.
- `product_count` already has a deterministic fast path; current metrics do not justify more changes there.
- Sell draft notice and UserMenu visual acceptance if the deployed UI still has a visible issue.

### Task 5: Re-check the stock-value latency tail

- [x] Confirm both live stores run the same `main` runtime/source SHA `fac450adb764fc0f02c32e169b11e12ed5b55af6` after the documentation-only `fac450ad` push.
- [x] Run the Chinese and English stock-value workflow cases on Demo and SKR. All four passed with deterministic routing, `llmFallback=false`, and empty `writeRequests`.
- [x] Collect eight sequential stock-value requests per store. Client-observed Demo p50/p95 was 469/782 ms; SKR was 478/1,128 ms. All 16 returned `report_stock_value`, deterministic source, `llmFallback=false`, and empty `writeRequests`.
- [x] On deployed SHA `fac450ad`, rerun eight critical workflows per store (16 PASS, 0 FAIL), native report read-only UAT (8/8 per store), and capability seed/live-config alignment (PASS for both stores).
- [x] Compare rolling metrics windows. The 24-hour stock-value p95 remains Demo 3,535 ms (40 requests) and SKR 4,227 ms (37 requests), while the latest one-hour backend audit reports stock-value p95 143/130 ms and sales-report p95 165/160 ms. The one-hour samples are small (10 stock-value and 3 sales requests per store); the 24-hour tail is not enough to justify a report SQL change without a continuing slow sample.
- [x] Investigate the single 2,461 ms client-observed SKR `sales-last-7-en` request. It had one attempt, passed deterministic routing, and the one-hour server audit p95 for `assistant:report_sales` stayed at 160 ms. This points to an intermittent path/proxy delay outside server-measured assistant processing; no reproducible assistant or SQL bottleneck is established.
- [x] Keep the graph behavior unchanged: report requests use deterministic classify → fill slots → native query → deterministic response; no response-generation model call follows the native report. Server-side assistant latency is recorded before audit insertion and chat-history persistence.

**Latency decision:** No application code change is justified by current evidence. Continue watching the one-hour and 24-hour per-intent metrics; investigate again if server-side `report_stock_value` or `report_sales` p95 remains elevated in fresh windows, or if client-observed slow requests recur with matching server latency.

## Exit Criteria

- Every critical selected workflow passes in Demo and SKR on the same deployed SHA.
- Read-only report checks pass and capability seed/configuration agrees in both stores.
- No unresolved critical UAT failure remains; any known slower path has measured latency and an explicit follow-up decision.
- Every released backend change is pushed through `main` and has post-deploy runtime SHA evidence.
