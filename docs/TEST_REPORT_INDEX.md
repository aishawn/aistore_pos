# Test Report Index

This index is the cross-session view. The detailed report for each session lives under `docs/test-sessions/`; raw machine-readable evidence remains in `docs/UAT_*.json`.

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
| `UI-002` |  | NOT RUN |  |  |  |  |
| `POS-001` |  | NOT RUN |  |  |  |  |
| `POS-002` |  | NOT RUN |  |  |  |  |
| `POS-003` |  | NOT RUN |  |  |  |  |
| `INV-001` |  | NOT RUN |  |  |  |  |
| `PUR-001` |  | NOT RUN |  |  |  |  |
| `PRC-001` |  | NOT RUN |  |  |  |  |
| `CUS-001` |  | NOT RUN |  |  |  |  |
| `TEN-001` |  | NOT RUN |  |  |  |  |
| `RPT-001` |  | NOT RUN |  |  |  |  |
| `AI-001` |  | NOT RUN |  |  |  |  |
| `AI-002` |  | NOT RUN |  |  |  |  |
| `AI-003` |  | NOT RUN |  |  |  |  |
| `OPS-001` |  | NOT RUN |  |  |  |  |
| `R2-001` |  | NOT RUN |  |  |  |  |

## Session history

| Session ID | Date | Scope | Result summary | Report |
|---|---|---|---|---|

## Classification rule

The index is a navigation and summary layer, not a replacement for evidence. A fixture `PASS` must not overwrite an online `BLOCKED` or `FAIL`; the environment belongs in the row and the detailed report.
