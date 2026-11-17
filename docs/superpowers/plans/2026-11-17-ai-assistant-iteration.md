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
- `scripts/ai-eval/pilot-ai-report-readonly-uat.mjs`
- `scripts/ai-eval/pilot-ai-metrics-uat.mjs`
- Existing Playwright package/browser configuration

- [x] Verify the repository Playwright version and matching headless shell; restore the module path only inside the temporary runtime worktree.
- [ ] Replace the stale `pilot-ai-report-readonly-uat.mjs` before reuse; it still calls retired `/api/odoo/session` and returned HTTP 410.
- [x] Run Demo metrics UAT at desktop and mobile widths (9/9 PASS).
- [x] Capture aggregate and stock-value latency samples. The metrics UI reported a 24-hour aggregate p95 of 3,950 ms; see Task 1 for stock-value samples and comparison limits.
- [x] Keep the full 400+ workflow catalog out of the release gate; batch selected utterances and summarize by stable IDs.
- [x] Confirm local browser artifacts and temporary dependencies do not dirty the maintained `main` checkout.

### Task 4: Select and ship the next bounded AI improvement

**Candidate backlog:**
- Regressions from critical workflow UAT, prioritizing `deterministicRoute`, `writeRequests`, and native report parity.
- High-frequency phrases that still fall through to `llmFallback`; add bilingual router tests and workflow cases together.
- Replenishment `partial` / data-gap card status and copy, with backend/UI tests updated together.
- `product_count` deterministic fast path only if measured traffic justifies it.
- Sell draft notice and UserMenu visual acceptance if the deployed UI still has a visible issue.

- [ ] Choose the highest-severity item supported by current UAT or metrics evidence.
- [ ] Write a failing focused test before implementation, then run the narrowest relevant checks.
- [ ] Create a task-scoped commit and deploy through `main`.
- [ ] Repeat runtime SHA and Demo/SKR acceptance; retain reports and measured latency.

## Exit Criteria

- Every critical selected workflow passes in Demo and SKR on the same deployed SHA.
- Read-only report checks pass and capability seed/configuration agrees in both stores.
- No unresolved critical UAT failure remains; any known slower path has measured latency and an explicit follow-up decision.
- Every released backend change is pushed through `main` and has post-deploy runtime SHA evidence.
