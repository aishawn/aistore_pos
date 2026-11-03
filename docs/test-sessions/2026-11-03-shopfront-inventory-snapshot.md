# Test Session: 2026-11-03 Shopfront inventory snapshot

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-03-shopfront-inventory-snapshot` |
| Started / timezone | 2026-11-03 / Asia/Shanghai |
| Operator | Codex |
| Branch | `codex/shopfront-inventory-repair` |
| Source SHA | crawler `4fb02f65`; Odoo `41dab563` |
| Runtime SHA | Not recorded; crawler deployment not confirmed |
| Environment | local fixture + online read-only |
| Database | `aipos_uat` read-only |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `INV-001` | crawler `python -m pytest tests -k "not releases_writer" -q` | PASS (45 passed, 1 deselected) | Local command output | Fixture only; excludes a long-wait test |
| `INV-001` | Odoo `python -m pytest tests/test_inventory_import.py tests/test_supply_import.py -q` | PASS (15 passed) | Local command output | Mocked Odoo models; no runtime DB write |
| `INV-001` | `python -m compileall -q app tests`; `git diff --check` | PASS | Local command output | Static/format checks only |
| `INV-001` | SKR crawler API inventory pagination + Odoo `stock.quant`/product source-ref `search_read` | FAIL: live data mismatch confirmed | Aggregate-only output; no product/customer rows retained | Crawler mirror snapshot is stale; Odoo quant totals and per-source mismatches remain |
| `INV-001` | Odoo session/picking safety check | INFO: 1 open POS session, 1 open picking at location 48 | Aggregate-only output | No business inventory writes run |
| `INV-001` | GitHub crawler push / Dokploy | BLOCKED | GitHub HTTPS connection timed out | No crawler deployment SHA |

## Summary

- Passed: local crawler and Odoo fixture checks.
- Blocked: crawler push and Dokploy deployment due GitHub network timeout; live write verification is also gated by open operations.
- Failed: none in completed local checks.
- Not run: online stock refresh and business inventory write.
- Business impact: crawler mirror inventory has not refreshed since 2026-11-02 15:31:49; Odoo company 5 / location 48 remains at -1,334,367 units. Open POS session/picking prevents a safe full snapshot write now.

## Follow-up

1. Push crawler commit to main after network recovery; confirm Dokploy runtime SHA.
2. Re-fetch Shopfront source and compare each `(product ID, outlet ID)` against crawler and Odoo.
3. After the POS session/picking close, reconfirm restore-tested backup and reservations before any business inventory update.
