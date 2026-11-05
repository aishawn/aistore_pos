# Test Report Index

功能视角入口：[项目事实库](project/README.md)；AI 资料复核与原始证据映射见 [2026-11-03 事实库 session](test-sessions/2026-11-03-project-fact-library.md)。本索引按 session 区分本地候选验证与线上行为，不把本地通过当作部署通过。

Latest broad UI audit: [2026-11-03 page-by-page review](test-sessions/2026-11-03-ui-page-audit.md): 180 page templates catalogued (179 baseline + new cost reconciliation), 274 live page visits across SKR/Demo/platform plus brand signup; desktop/mobile evidence recorded. Shared records dialogs, platform session fallback, account hydration, report errors and recommendation pending states improved. Runtime 51e27c74: remote build and specified live/fixture UI acceptance PASS, including 18 records-dialog viewport checks; legacy 410 routes, alerts 500, AI failures and incomplete report data checks remain explicitly open.

Latest inventory navigation and stock list candidate: [2026-11-04 navigation static checks](test-sessions/2026-11-04-inventory-navigation.md): Node 24 TypeScript check PASS; targeted ESLint 0 errors / 14 existing warnings. Online acceptance and runtime SHA remain NOT RUN pending main deployment.

Latest AI walk-forward coverage validation: [2026-11-05 walk-forward coverage and stability](test-sessions/2026-11-05-forecast-walkforward-coverage.md): related forecast suites 36/36 PASS; real 2,000-SKU native-inventory run serializes BLOCKED with null scores because 0 products have complete labels; commit `70f563e5` is included in SKR/Demo runtime `755c8289`; post-deploy SKR read-only check PASS, business writes 0.

Latest Sales History space optimization: [2026-11-03 table/toolbar](test-sessions/2026-11-03-sales-history-space.md): targeted syntax/ESLint (zero errors), remote build and live browser layout/refresh/pagination PASS; deployed runtime `f2091f31`. Read-only checks, zero business writes.

Latest Sales History layout: [2026-11-03 modal/toolbar](test-sessions/2026-11-03-sales-history-layout.md): targeted TSX syntax, ESLint, remote build and live desktop/mobile browser checks PASS; deployed runtime `8cbd0d49`. Local full typecheck BLOCKED by incomplete dependencies. Real business writes: 0.

Latest Sales History repair: [2026-11-03 daily sales](test-sessions/2026-11-03-sales-history-daily-fix.md): 5 regression cases and targeted ESLint PASS; real SKR/Odoo read-only aggregation reconciled over 1,006 dates. Fix/runtime `7f8ded6a`: Dokploy build and SKR live API/browser acceptance PASS, including date filtering and unified Sell history. Local full typecheck BLOCKED by dependency/disk limits.

Latest inventory report verification: [2026-11-03 inventory report](test-sessions/2026-11-03-inventory-report.md): local unit 7/7, API fixture 8/8, browser fixture 37/37 PASS. Real Odoo/runtime acceptance remains NOT RUN.

Latest Shopfront inventory snapshot repair: [2026-11-03 full inventory snapshot](test-sessions/2026-11-03-shopfront-inventory-snapshot.md): crawler fixture 45 passed / 1 long-wait test deselected; Odoo inventory/supply fixture 15 passed. Online read-only comparison confirms stale crawler inventory timestamps and material Odoo quantity mismatch; crawler push/Dokploy blocked by GitHub HTTPS timeout, and one open POS session plus one open picking gate business writes.

Latest Shopfront sales mirror gap: [2026-11-04 daily sales replay](test-sessions/2026-11-04-shopfront-sales-mirror-gap.md): online read-only found 129 SKR sales for 2026-11-03 and both POS mirrors were short by exactly 129; run 143 had classified all 396 sales in its daily window unchanged. Fix `8b9b04a7` replays the daily window and keeps source-count acknowledgement strict; targeted crawler tests 19/19 PASS. Deployment and online repair verification pending.

Latest Shopfront SQLite lock follow-up: [2026-11-04 inventory request lock](test-sessions/2026-11-04-shopfront-sqlite-inventory-lock.md): crawler POS import test module 20/20 PASS. Online job 40 / run 147 remained at `sales:fetched:396` with a stale heartbeat; deployment and data repair are pending.

Latest Shopfront inventory finalization follow-up: [2026-11-04 complete inventory cleanup gate](test-sessions/2026-11-04-shopfront-inventory-finalization.md): crawler `test_pos_import_results.py` 28/28 PASS, compile and diff checks PASS. Full snapshots now finalize stale cleanup when one listed source row is quarantined, while preserving that row's warning. Online job 61 was cancelled during its pre-existing partial import; candidate deployment and post-deploy quantity reconciliation are pending.

Latest Shopfront daily completeness/report refresh candidate: [2026-11-05 sync revision refresh](test-sessions/2026-11-05-shopfront-sync-refresh.md): reporting/cache and period tests 19/19, crawler schedule tests 3/3, Python compile and diff checks PASS. Full UI typecheck BLOCKED by incomplete local dependencies. Not deployed; formal company mapping and backup recovery are unverified; no Odoo writes.

Latest Shopfront page refresh follow-up: [2026-11-05 page refresh](test-sessions/2026-11-05-shopfront-page-refresh.md): UI typecheck PASS, existing unit suites 157/157, targeted ESLint 0 errors / 16 warnings, diff check PASS. Candidate refreshes products/inventory, sales, purchases, reports, and a new immutable cost audit on sync stamp advance; live two-store verification is pending deployment and credentials.

Latest Shopfront page refresh deployment follow-up: [2026-11-05 page refresh deployment](test-sessions/2026-11-05-shopfront-page-refresh-deploy.md): filled the remaining stock-list and Inventory-dialog stamp refresh gaps. Auto-deploy is enabled, but the only running job is for pre-candidate SHA `1511804b`; the pushed candidate has no deployment record and both public runtime SHAs remain stale. Online acceptance is BLOCKED pending a normal Deploy after the old job terminates.

Latest report reconciliation: [2026-11-05 sales report reconciliation](test-sessions/2026-11-05-report-reconciliation.md): focused reconciliation helper tests 3/3 PASS and scoped report TypeScript PASS; full project typecheck remains blocked by a separate Shopfront source page error; no Odoo reads/writes or deployment checks.


This index is the cross-session view. The detailed report for each session lives under `docs/test-sessions/`; raw machine-readable evidence remains in `docs/UAT_*.json`.

Latest targeted follow-up: [2026-11-02 replenishment timeout / safe snapshot probes](test-sessions/2026-11-02-assistant-replenishment-timeout.md), source `860c1d2e`: local static checks and 33 targeted tests PASS. Live SKR/runtime acceptance and the exact vendor 141/142 snapshot failures remain BLOCKED; this does not replace prior UI fixture evidence.

## How to maintain

1. Copy [TEST_SESSION_TEMPLATE.md](TEST_SESSION_TEMPLATE.md) for every meaningful test session.
2. Use a stable suite ID from [TEST_CATALOG.md](TEST_CATALOG.md).
3. Record source SHA and runtime SHA separately.
4. Record real business writes explicitly, including `0`.
5. Add one row below for each completed session.
6. Update only the latest result for a suite in the summary table; keep historical session reports unchanged.

## Latest suite status

| Suite ID | Latest session | Result | Source SHA | Runtime SHA | Evidence | Next action |
|---|---|---|---|---|---|---|
| `SHP-001` (formal sale receipt mode) | 2026-11-04-shopfront-business-write-receipt | PASS: 27 crawler tests; online state BLOCKED | `007064cc` plus candidate diff | Not verified | [Session](test-sessions/2026-11-04-shopfront-business-write-receipt.md) | Deploy exact candidate; read run 173; separately authorize and verify formal sale backfill |
| `UI-001` (inventory navigation static subset) | 2026-11-04-inventory-navigation | PASS: TypeScript; ESLint 0 errors / 14 warnings | Candidate pending commit | Not deployed | [Session](test-sessions/2026-11-04-inventory-navigation.md) | Deploy main; verify route access, permissions and SHA |
| `REL-001` |  | NOT RUN |  |  |  |  |
| `UI-001` |  | NOT RUN |  |  |  |  |
| `UI-002` | 2026-11-01-assistant-operations-recovery (local fixture subset) | PASS (subset only) | `73ee86e7` | Local only; live unverified | [Session](test-sessions/2026-11-01-assistant-operations-recovery.md) | Verify deployed read-only flow |
| `POS-001` |  | NOT RUN |  |  |  |  |
| `POS-002` |  | NOT RUN |  |  |  |  |
| `POS-003` |  | NOT RUN |  |  |  |  |
| `INV-001` | 2026-11-04-shopfront-inventory-finalization | PASS (28 crawler tests); online data mismatch remains | `dfda8a93` + candidate patch | Crawler not verified; POS `dfda8a93` | [Session](test-sessions/2026-11-04-shopfront-inventory-finalization.md) | Deploy, run full snapshot in approved test scope, reconcile unresolved quantities |
| `SHP-001` | 2026-11-04-shopfront-sqlite-inventory-lock | Local targeted PASS (20/20); online BLOCKED (job 40 heartbeat stale) | `0893da47` plus candidate diff | Runtime `0893da47` before fix | [Session](test-sessions/2026-11-04-shopfront-sqlite-inventory-lock.md) | Deploy candidate; finish job and source/mirror reconciliation |
| `PUR-001` | 2026-11-03-source-purchase-full | INFO: source read complete, cost verification pending | Query/script hashes in UAT | Unrecorded | [Session](test-sessions/2026-11-03-source-purchase-full.md) | Tax/invoice/valuation evidence |
| `PRC-001` |  | NOT RUN |  |  |  |  |
| `CUS-001` |  | NOT RUN |  |  |  |  |
| `TEN-001` |  | NOT RUN |  |  |  |  |
| `RPT-001` (source margin / tax subset) | 2026-11-03-source-tax-batch | INFO: 37 demo orders rehearsed; 125 review; rollback verified | Probe hash in UAT; integration candidate in Git | Odoo commit unknown, importer hash recorded | [Session](test-sessions/2026-11-03-source-tax-batch.md) | Explain tax-engine mismatches and ambiguous lines before repair |
| `AI-001` | 2026-11-01-assistant-operations-recovery (local fixture subset) | PASS (subset only) | `73ee86e7` | Local only; live unverified | [Session](test-sessions/2026-11-01-assistant-operations-recovery.md) | Verify deployed read-only flow |
| `AI-001` (answer provenance local subset) | 2026-11-04-ai-answer-provenance | PASS: 153 UI unit tests, typecheck and targeted lint | `8f9c91718445f4eccc1a0ee018b93a10ccb0b541` | Local only; online pending | [Session](test-sessions/2026-11-04-ai-answer-provenance.md), [Evidence](project/evidence.json) | Deploy exact source SHA; read-only verify SKR and Demo |
| `AI-001` (online read-only, historical review) | 2026-11-03-project-fact-library | BLOCKED: Demo 379/390 PASS + 11 BLOCKED; SKR 382/390 PASS + 8 BLOCKED | `a6d5c7b0`; SKR dirty | `a6d5c7b0`, matched in original records | [Demo](UAT_AI_WORKFLOW_FULL_EXACT_SHA_2026-11-03_DEMO.json), [SKR](UAT_AI_WORKFLOW_FULL_EXACT_SHA_2026-11-03_SKR.json) | Fixed-version full rerun; subset retries do not replace this result |
| `AI-001` (SKR online read-only) | 2026-11-04-skr-ai-rerun | PASS: yesterday/exact-date and 50/50 dead-stock reconcile; FAIL: weekly answer matches gross sales, not net revenue; inventory capture SUCCESS but remains 4 days / REVIEW | Probe SHA-256 `1c0a5fb0` | Frontend/backend `91e1ed2b5322fd2eae40aa2613bd23dbd69d4eed` | [Session](test-sessions/2026-11-04-skr-ai-rerun.md), [Evidence](UAT_AI_READONLY_RERUN_2026-11-04_0811Z.json); prior run: [session](test-sessions/2026-11-04-skr-ai-after-main.md) | Correct/define gross vs net sales answer; continue native snapshot accrual and supplier lead-time verification |
| `AI-001` (SKR online read-only on updated main runtime) | 2026-11-04-skr-ai-after-0a4dc523 | PASS: yesterday/exact-date and dead-stock 50/50 reconcile; FAIL: weekly net sales; forecast remains REVIEW | Probe SHA-256 `1c0a5fb0` | SKR and Demo frontend/backend `0a4dc523e3afee18013871a0701020405b487db9` | [Session](test-sessions/2026-11-04-skr-ai-after-0a4dc523.md), [Evidence](UAT_AI_READONLY_AFTER_0A4DC523_2026-11-04.json) | Resolve gross/net answer contract; inventory history/lead time and purchase recommendation remain incomplete |
| `AI-002` (historical provider/contract subsets) | 2026-11-03-project-fact-library | INFO: synthetic OCR/ASR and catalogue subsets only | Per artifact; incomplete | Per artifact; ASR unknown | [Evidence metadata](project/evidence.json) | Real invoice/image/microphone quality and current runtime remain unverified |
| `AI-003` |  | NOT RUN |  |  |  |  |
| `AI-004` (SKR open-day sales backtest) | 2026-11-04-forecast-open-day-backtest | BLOCKED for release: champion WAPE 103.6%-172.1%; safety violations 0; 2,000 SKU, 60 folds, 7/14/28-day horizons | `a680e220` + evaluator SHA-256 `f2f3d8e4` | Offline only; no runtime | [Session](test-sessions/2026-11-04-forecast-open-day-backtest.md), [Report](UAT_AI_FORECAST_SEGMENTED_2000SKU_2026-11-04.md), [JSON](UAT_FORECAST_ROLLING_BACKTEST_2026-11-04.json), [CSV](UAT_AI_FORECAST_SEGMENTED_OPEN_DAYS_ALL_MODELS_2026-11-04.csv) | Keep production model and manual review gates; native stock, lead-time, and cost labels remain unavailable |
| `AI-004` (SKR open-day sales backtest, SKU coverage) | 2026-11-05-forecast-open-day-sku-coverage | BLOCKED for release: champion WAPE 103.6%-172.1%; SKU/window coverage reported; inventory-aware run has no complete 365-day native labels; safety violations 0 | `main` worktree + evaluator SHA-256 `9c7518ba`; event validator `6dc13ddf` | Offline only; no runtime | [Session](test-sessions/2026-11-05-forecast-open-day-sku-coverage.md), [Report](UAT_AI_FORECAST_SEGMENTED_2000SKU_2026-11-05.md), [CSV](UAT_AI_FORECAST_SEGMENTED_OPEN_DAYS_ALL_MODELS_2026-11-05.csv) | Keep production model and manual review gates; collect native inventory and verified lead-time/cost labels |
| `AI-004` (SKR open-day evaluator fast-path rerun) | 2026-11-04-forecast-evaluator-fast-path | PASS: 18/18 explicit forecast parity cases; full 2,000-SKU rerun completed with all metrics identical; release remains BLOCKED by accuracy and native inventory evidence | Evaluator SHA-256 `a05b6e94`; snapshot SHA-256 `1db83438`; calendar SHA-256 `1f2962af` | Offline only; no runtime | [Session](test-sessions/2026-11-04-forecast-evaluator-fast-path.md), [versioned closed-date list](AI_SKR_CONFIRMED_CLOSED_DATES_2026-11-04.json), [report](UAT_AI_FORECAST_SEGMENTED_2000SKU_2026-11-04.md) | No production model/policy change; full inventory-aware evaluation still requires reliable native daily inventory labels |
| `DOC-001` | 2026-11-03-project-fact-library | PASS: 56 Markdown files / 19 evidence entries; 12 checker regressions | Inventory baseline `d2020745`; integrated on `b7249014`; doc commit in Git | Not applicable: static documentation | [Session](test-sessions/2026-11-03-project-fact-library.md) | Maintain with behavior/evidence changes; no new business acceptance claimed |
| `OPS-001` |  | NOT RUN |  |  |  |  |
| `R2-001` |  | NOT RUN |  |  |  |  |

## Session history

| Session ID | Date | Scope | Result summary | Report |
|---|---|---|---|---|
| 2026-11-03-source-tax-batch | 2026-11-03 | Demo tax transaction rollback / crawler integration | INFO: 37 orders rehearsed,125 review; 48 local tests PASS | [Report](test-sessions/2026-11-03-source-tax-batch.md) |
| 2026-11-03-source-purchase-full | 2026-11-03 | Shopfront readonly 48-page procurement read | INFO: 2358 orders / 32925 lines; cost verification pending | [Report](test-sessions/2026-11-03-source-purchase-full.md) |
| 2026-11-03-margin-inventory-moves | 2026-11-03 | SKR readonly inventory movement arithmetic | INFO: 10968 quant review; no stock repair | [Report](test-sessions/2026-11-03-margin-inventory-moves.md) |
| 2026-11-03-source-refund-evidence | 2026-11-03 | Direct Shopfront readonly and local sync regression | Source day matches; original refund lines and full repair pending | [Report](test-sessions/2026-11-03-source-refund-evidence.md) |
| 2026-11-03-source-margin-tax-mapping | 2026-11-03 | Source report readonly, demo transaction rollback, local units | 23 units; source report PASS; single-order tax/rollback PASS; full repair pending | [Report](test-sessions/2026-11-03-source-margin-tax-mapping.md) |
| 2026-11-01-assistant-operations-recovery | 2026-11-01 | Local fixture subset | 24 unit tests and 1440/390px UI passed; live checks not run | [Report](test-sessions/2026-11-01-assistant-operations-recovery.md) |
| 2026-11-03-project-fact-library | 2026-11-03 | Documentation checks and historical AI evidence review | No new provider/business tests; historical blocked/limited states retained | [Report](test-sessions/2026-11-03-project-fact-library.md) |
| 2026-11-03-shopfront-inventory-snapshot | 2026-11-03 | Full Shopfront inventory refresh and Odoo reconciliation protocol | Local fixture PASS; online mismatch confirmed read-only; business writes 0 | [Report](test-sessions/2026-11-03-shopfront-inventory-snapshot.md) |
| 2026-11-04-ai-answer-provenance | 2026-11-04 | Assistant source and returned-date visibility | Local UI 153/153, typecheck and targeted lint PASS; online pending; writes 0 | [Report](test-sessions/2026-11-04-ai-answer-provenance.md) |
| 2026-11-04-shopfront-sales-mirror-gap | 2026-11-04 | SKR daily sales source/mirror gap and idempotent replay fix | 19 crawler tests PASS; online source verified; deployment and mirror repair pending | [Report](test-sessions/2026-11-04-shopfront-sales-mirror-gap.md) |
| 2026-11-04-shopfront-sqlite-inventory-lock | 2026-11-04 | SQLite writer transaction during full inventory API pagination | Crawler POS import module 20/20 PASS; online job heartbeat stale; no business writes | [Report](test-sessions/2026-11-04-shopfront-sqlite-inventory-lock.md) |
| 2026-11-04-shopfront-business-write-receipt | 2026-11-04 | Effective per-job business-write receipt gate | Local fixture 27/27 PASS; online run status BLOCKED; no business writes | [Report](test-sessions/2026-11-04-shopfront-business-write-receipt.md) |
| 2026-11-04-forecast-open-day-backtest | 2026-11-04 | SKR open-day masked 365-day segmented sales backtest | 2,000 SKUs; 216 model summaries; 4/4 targeted tests; WAPE gate failed; writes 0 | [Report](test-sessions/2026-11-04-forecast-open-day-backtest.md) |
| 2026-11-05-forecast-open-day-sku-coverage | 2026-11-05 | SKR 365-day open-day segmented rerun with SKU coverage denominators | 2,000 SKUs; 216 summaries; full horizon results identical to prior output except new coverage fields; champion WAPE gate failed; writes 0 | [Report](test-sessions/2026-11-05-forecast-open-day-sku-coverage.md) |
| 2026-11-04-forecast-evaluator-fast-path | 2026-11-04 | Optimize explicit model evaluation and reproduce the SKR 365-day segmented backtest | 18/18 engine parity cases; full report metrics identical; no production or business writes | [Report](test-sessions/2026-11-04-forecast-evaluator-fast-path.md) |
| 2026-11-04-skr-ai-after-main | 2026-11-04 | SKR online AI and forecasting read-only acceptance on `91e1ed2b` | Sales day/exact-date PASS; dead-stock 50/50; weekly net sales FAIL by AUD 376.82; 4 inventory days; writes 0 | [Report](test-sessions/2026-11-04-skr-ai-after-main.md) |
| 2026-11-04-skr-ai-rerun | 2026-11-04 | SKR online AI read-only rerun and inventory-history status check | Yesterday/exact-date and dead-stock 50/50 reconcile; weekly gross/net mismatch retained; capture SUCCESS, 4 days, writes 0 | [Report](test-sessions/2026-11-04-skr-ai-rerun.md) |
| 2026-11-04-skr-inventory-events | 2026-11-04 | SKR stock move and physical count event-time evidence review | 303,830 moves span 8 days, mostly POS customer outflow; 2 count adjustments and 1/10,968 quant count date; no valid storewide stockout labels | [Handoff evidence](HANDOFF_AI_FORECAST_2026-11-04.md) |

| 2026-11-03-margin-release | 2026-11-03 | SKR source report / demo diagnosis / local session retry | bc7 source retryPASS/first-click401; b8de first-click auto-recoveryPASS; local2PASS | [Report](test-sessions/2026-11-03-margin-release.md) |

| 2026-11-04-source-tax-pricing | 2026-11-04 | Local planner v2 / demo rollback / readonly history captures | 33 units/51 crawler PASS;64 demo rehearsed98review;155142-order native capture done;56 direct-source days and online margin totals match;385-page source capture remains partial | [Report](test-sessions/2026-11-04-source-tax-pricing.md) |
| 2026-11-05-report-reconciliation | 2026-11-05 | Sales order gross vs grouped line amount behavior | 3/3 helper tests and scoped TypeScript PASS; live Odoo reconciliation NOT RUN | [Report](test-sessions/2026-11-05-report-reconciliation.md) |

## Classification rule

The index is a navigation and summary layer, not a replacement for evidence. A fixture `PASS` must not overwrite an online `BLOCKED` or `FAIL`; the environment belongs in the row and the detailed report.
