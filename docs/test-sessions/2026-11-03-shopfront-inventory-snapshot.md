# Test Session: 2026-11-03 Shopfront inventory snapshot

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-03-shopfront-inventory-snapshot` |
| Started / timezone | 2026-11-03 / Asia/Shanghai |
| Operator | Codex |
| Branch | `codex/shopfront-inventory-repair` |
| Source SHA | crawler `4fb02f65`; Odoo `41dab563` |
| Runtime SHA | Not recorded; deployment not confirmed |
| Environment | local fixture |
| Database | not applicable |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `INV-001` | crawler `python -m pytest tests -k "not releases_writer" -q` | PASS (45 passed, 1 deselected) | Local command output | Fixture only; excludes a long-wait test |
| `INV-001` | Odoo `python -m pytest tests/test_inventory_import.py tests/test_supply_import.py -q` | PASS (15 passed) | Local command output | Mocked Odoo models; no runtime DB write |
| `INV-001` | `python -m compileall -q app tests`; `git diff --check` | PASS | Local command output | Static/format checks only |
| `INV-001` | GitHub crawler push / Dokploy / online read-only reconciliation | BLOCKED | GitHub HTTPS connection timed out | No crawler deployment SHA or current online comparison |

## Summary

- Passed: local crawler and Odoo fixture checks.
- Blocked: crawler push and online verification due GitHub network timeout.
- Failed: none in completed local checks.
- Not run: online stock refresh and business inventory write.
- Business impact: source code now separates full stock refresh from incremental product updates; existing live stock remains unverified.

## Follow-up

1. Push crawler commit to main after network recovery; confirm Dokploy runtime SHA.
2. Re-fetch Shopfront source and compare each `(product ID, outlet ID)` against crawler and Odoo.
3. Reconfirm restore-tested backup and current sessions/reservations before any business inventory update.
