# AI Assistant Iteration Plan

> **For agentic workers:** Use inline execution with focused checkpoints. Each release slice requires its own tests, exact-SHA backend gate, deployment identity check, and online acceptance.

**Goal:** Improve AI question answering through measured, repeatable iterations until critical Demo and SKR workflows pass and no unresolved high-frequency correctness or latency issue remains.

**Architecture:** Keep deterministic fast paths and native Orithos reports authoritative for POS data. Use UAT and metrics evidence to select bounded follow-up changes; preserve read-only behavior for reports and never write to Shopfront.

**Tech Stack:** Java 21 / Spring Boot (`pos-api`), PostgreSQL read-only report views, Node.js UAT scripts, Playwright, GitHub Actions, Dokploy Compose.

**Spec:** Approved iteration objective and stock-value SQL design in the current task conversation.

## Global Constraints

- Maintain and deploy `main`; do not include unrelated Shopfront WIP.
- Before pushing any `pos-api/` change, the exact candidate SHA must pass `.github/workflows/backend-java21-candidate-verify.yml` with `mvn -B clean verify` on Java 21.
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
- [ ] Run the exact-candidate Java 21 workflow for the final candidate SHA.
- [ ] Push the verified candidate to `main` and confirm Dokploy source/deployed SHA.
- [ ] Compare Demo and SKR stock-value totals, valued/excluded counts, and response rows after deployment.
- [ ] Record runtime SHA and before/after latency samples; do not claim a latency improvement without comparable measurements.

**Pre-deploy baseline (2026-11-17, runtime `1c4f322c`):** Demo and SKR each passed the selected 12-case critical workflow set (sales periods, AOV, stock value, and write guards); the selected-set reports are marked `BLOCKED` only because the full 414-case catalog was intentionally not run. The selected reports contain 24 PASS, 0 FAIL, 0 blocked cases. Orithos report read-only UI/API UAT passed 8/8 on each store. SKR `verify-skr-ai-readonly.mjs` passed 7/7 after setting `SKR_SOURCE_COMMIT`; it calls the forecast risks POST, which refreshed `ai_forecast_snapshot` twice during these checks and made no purchase, price, or inventory business writes. Demo metrics UAT passed 9/9 at 390px and 1440px; aggregate 24-hour p95 was 4,205 ms. `assistant:report_stock_value` had 18 allowed samples, p50 2,050 ms and p95 4,718 ms. This is the pre-candidate baseline, not evidence that the candidate is deployed or faster.

### Task 2: Re-run critical online AI acceptance

**Files/scripts:**
- `scripts/ai-eval/verify-skr-ai-readonly.mjs`
- `scripts/ai-eval/summarize-uat-reports.mjs`
- Existing `PILOT_UTTERANCE_IDS` workflow cases and `.local/ai-eval/` reports

- [ ] Confirm Demo and SKR runtime SHAs match the deployed candidate.
- [ ] Run 10–15 critical cases covering sales periods, AOV, stock value, and write guards in both stores.
- [ ] Require deterministic routing where expected, empty `writeRequests`, and agreement with `native-overview` where applicable.
- [x] Run Orithos report read-only verification for both stores; SKR report/assistant verification passes 7/7 with the forecast snapshot side effect recorded above.
- [x] Compare `/api/ai/config/intents` against the SQL intent seed contract for both stores, and separately record `/api/ai/config/client` capability flags.
- [x] Summarize the selected Demo/SKR workflow reports: 24 PASS, 0 FAIL, 0 failed cases; full catalog was not run.
- [ ] Treat forecast snapshot calls as database writes; omit them from a zero-write acceptance run unless explicitly scoped.

### Task 3: Restore the local report UAT and metrics toolchain

**Files/scripts:**
- `scripts/ai-eval/pilot-ai-report-readonly-uat.mjs`
- `scripts/ai-eval/pilot-ai-metrics-uat.mjs`
- Existing Playwright package/browser configuration

- [x] Verify the repository Playwright version and matching headless shell; restore the module path only inside the temporary runtime worktree.
- [x] Run report-readonly UAT for both stores and Demo metrics UAT at desktop and mobile widths.
- [x] Capture aggregate and stock-value p50/p95 and identify stock value as a slow report path.
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
- [ ] Create a task-scoped commit, pass the applicable exact-SHA gate, and deploy through `main`.
- [ ] Repeat runtime SHA and Demo/SKR acceptance; retain reports and measured latency.

## Exit Criteria

- Every critical selected workflow passes in Demo and SKR on the same deployed SHA.
- Read-only report checks pass and capability seed/configuration agrees in both stores.
- No unresolved critical UAT failure remains; any known slower path has measured latency and an explicit follow-up decision.
- Every released backend change has exact-SHA Java 21 workflow evidence and post-deploy SHA evidence.
