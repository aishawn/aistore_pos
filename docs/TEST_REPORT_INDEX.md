# Test Report Index

Latest Sales History layout: [2026-11-03 modal/toolbar](test-sessions/2026-11-03-sales-history-layout.md): targeted TSX syntax and ESLint PASS; remote build and live layout checks pending.

Latest Sales History repair: [2026-11-03 daily sales](test-sessions/2026-11-03-sales-history-daily-fix.md): 5 regression cases and targeted ESLint PASS; real SKR/Odoo read-only aggregation reconciled over 1,006 dates. Fix/runtime `7f8ded6a`: Dokploy build and SKR live API/browser acceptance PASS, including date filtering and unified Sell history. Local full typecheck BLOCKED by dependency/disk limits.

Latest inventory report verification: [2026-11-03 inventory report](test-sessions/2026-11-03-inventory-report.md): local unit 7/7, API fixture 8/8, browser fixture 37/37 PASS. Real Odoo/runtime acceptance remains NOT RUN.

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
| `INV-001` |  | NOT RUN |  |  |  |  |
| `PUR-001` |  | NOT RUN |  |  |  |  |
| `PRC-001` |  | NOT RUN |  |  |  |  |
| `CUS-001` |  | NOT RUN |  |  |  |  |
| `TEN-001` |  | NOT RUN |  |  |  |  |
| `RPT-001` |  | NOT RUN |  |  |  |  |
| `AI-001` | 2026-11-01-assistant-operations-recovery (local fixture subset) | PASS (subset only) | `73ee86e7` | Local only; live unverified | [Session](test-sessions/2026-11-01-assistant-operations-recovery.md) | Verify deployed read-only flow |
| `AI-002` |  | NOT RUN |  |  |  |  |
| `AI-003` |  | NOT RUN |  |  |  |  |
| `OPS-001` |  | NOT RUN |  |  |  |  |
| `R2-001` |  | NOT RUN |  |  |  |  |

## Session history

| Session ID | Date | Scope | Result summary | Report |
|---|---|---|---|---|
| 2026-11-01-assistant-operations-recovery | 2026-11-01 | Local fixture subset | 24 unit tests and 1440/390px UI passed; live checks not run | [Report](test-sessions/2026-11-01-assistant-operations-recovery.md) |

## Classification rule

The index is a navigation and summary layer, not a replacement for evidence. A fixture `PASS` must not overwrite an online `BLOCKED` or `FAIL`; the environment belongs in the row and the detailed report.
