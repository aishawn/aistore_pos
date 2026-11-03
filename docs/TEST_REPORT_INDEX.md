# Test Report Index

功能视角入口：[项目事实库](project/README.md)；AI 资料复核与原始证据映射见 [2026-11-03 事实库 session](test-sessions/2026-11-03-project-fact-library.md)。下方新增条目是历史证据复核，不代表本轮重新调用模型或执行业务测试。

Latest broad UI audit: [2026-11-03 page-by-page review](test-sessions/2026-11-03-ui-page-audit.md): 180 page templates catalogued (179 baseline + new cost reconciliation), 274 live page visits across SKR/Demo/platform plus brand signup; desktop/mobile evidence recorded. Shared records dialogs, platform session fallback, account hydration, report errors and recommendation pending states improved. Runtime 51e27c74: remote build and specified live/fixture UI acceptance PASS, including 18 records-dialog viewport checks; legacy 410 routes, alerts 500, AI failures and incomplete report data checks remain explicitly open.

Latest Sales History space optimization: [2026-11-03 table/toolbar](test-sessions/2026-11-03-sales-history-space.md): targeted syntax/ESLint (zero errors), remote build and live browser layout/refresh/pagination PASS; deployed runtime `f2091f31`. Read-only checks, zero business writes.

Latest Sales History layout: [2026-11-03 modal/toolbar](test-sessions/2026-11-03-sales-history-layout.md): targeted TSX syntax, ESLint, remote build and live desktop/mobile browser checks PASS; deployed runtime `8cbd0d49`. Local full typecheck BLOCKED by incomplete dependencies. Real business writes: 0.

Latest Sales History repair: [2026-11-03 daily sales](test-sessions/2026-11-03-sales-history-daily-fix.md): 5 regression cases and targeted ESLint PASS; real SKR/Odoo read-only aggregation reconciled over 1,006 dates. Fix/runtime `7f8ded6a`: Dokploy build and SKR live API/browser acceptance PASS, including date filtering and unified Sell history. Local full typecheck BLOCKED by dependency/disk limits.

Latest inventory report verification: [2026-11-03 inventory report](test-sessions/2026-11-03-inventory-report.md): local unit 7/7, API fixture 8/8, browser fixture 37/37 PASS. Real Odoo/runtime acceptance remains NOT RUN.

Latest Shopfront inventory snapshot repair: [2026-11-03 full inventory snapshot](test-sessions/2026-11-03-shopfront-inventory-snapshot.md): crawler fixture 45 passed / 1 long-wait test deselected; Odoo inventory/supply fixture 15 passed. Online read-only comparison confirms stale crawler inventory timestamps and material Odoo quantity mismatch; crawler push/Dokploy blocked by GitHub HTTPS timeout, and one open POS session plus one open picking gate business writes.

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
| `REL-001` |  | NOT RUN |  |  |  |  |
| `UI-001` |  | NOT RUN |  |  |  |  |
| `UI-002` | 2026-11-01-assistant-operations-recovery (local fixture subset) | PASS (subset only) | `73ee86e7` | Local only; live unverified | [Session](test-sessions/2026-11-01-assistant-operations-recovery.md) | Verify deployed read-only flow |
| `POS-001` |  | NOT RUN |  |  |  |  |
| `POS-002` |  | NOT RUN |  |  |  |  |
| `POS-003` |  | NOT RUN |  |  |  |  |
| `INV-001` | 2026-11-03-shopfront-inventory-snapshot | Local fixture PASS; online FAIL (data mismatch); write BLOCKED | `4fb02f65`; Odoo `41dab563` | Runtime SHA not recorded | [Session](test-sessions/2026-11-03-shopfront-inventory-snapshot.md) | Wait for open operations to close; refresh source and reconcile |
| `PUR-001` | 2026-11-03-source-purchase-full | INFO: source read complete, cost verification pending | Query/script hashes in UAT | Unrecorded | [Session](test-sessions/2026-11-03-source-purchase-full.md) | Tax/invoice/valuation evidence |
| `PRC-001` |  | NOT RUN |  |  |  |  |
| `CUS-001` |  | NOT RUN |  |  |  |  |
| `TEN-001` |  | NOT RUN |  |  |  |  |
| `RPT-001` (source margin / tax subset) | 2026-11-03-source-tax-batch | INFO: 37 demo orders rehearsed; 125 review; rollback verified | Probe hash in UAT; integration candidate in Git | Odoo commit unknown, importer hash recorded | [Session](test-sessions/2026-11-03-source-tax-batch.md) | Explain tax-engine mismatches and ambiguous lines before repair |
| `AI-001` | 2026-11-01-assistant-operations-recovery (local fixture subset) | PASS (subset only) | `73ee86e7` | Local only; live unverified | [Session](test-sessions/2026-11-01-assistant-operations-recovery.md) | Verify deployed read-only flow |
| `AI-001` (online read-only, historical review) | 2026-11-03-project-fact-library | BLOCKED: Demo 379/390 PASS + 11 BLOCKED; SKR 382/390 PASS + 8 BLOCKED | `a6d5c7b0`; SKR dirty | `a6d5c7b0`, matched in original records | [Demo](UAT_AI_WORKFLOW_FULL_EXACT_SHA_2026-11-03_DEMO.json), [SKR](UAT_AI_WORKFLOW_FULL_EXACT_SHA_2026-11-03_SKR.json) | Fixed-version full rerun; subset retries do not replace this result |
| `AI-002` (historical provider/contract subsets) | 2026-11-03-project-fact-library | INFO: synthetic OCR/ASR and catalogue subsets only | Per artifact; incomplete | Per artifact; ASR unknown | [Evidence metadata](project/evidence.json) | Real invoice/image/microphone quality and current runtime remain unverified |
| `AI-003` |  | NOT RUN |  |  |  |  |
| `AI-004` (offline research, historical review) | 2026-11-03-project-fact-library | BLOCKED: all absolute WAPE gates failed; relative segment gains only | Not recorded by research summary | Not applicable: offline research | [730-day report](UAT_AI_730D_SEGMENTED_BACKTEST_2026-11-03.md), [JSON](UAT_AI_730D_SEGMENTED_BACKTEST_2026-11-03.json) | Native inventory and supplier/cost labels before production decision acceptance |
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

| 2026-11-03-margin-release | 2026-11-03 | SKR source report / demo diagnosis / local session retry | bc7 source retryPASS/first-click401; b8de first-click auto-recoveryPASS; local2PASS | [Report](test-sessions/2026-11-03-margin-release.md) |

| 2026-11-04-source-tax-pricing | 2026-11-04 | Local planner v2 / demo rollback / readonly history captures | 33 units PASS;64 demo orders rehearsed,98 review; full captures running | [Report](test-sessions/2026-11-04-source-tax-pricing.md) |

## Classification rule

The index is a navigation and summary layer, not a replacement for evidence. A fixture `PASS` must not overwrite an online `BLOCKED` or `FAIL`; the environment belongs in the row and the detailed report.
