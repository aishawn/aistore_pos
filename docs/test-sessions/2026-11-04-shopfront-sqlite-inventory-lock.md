# Test Session: 2026-11-04 Shopfront SQLite Inventory Lock

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-04-shopfront-sqlite-inventory-lock` |
| Started / timezone | 2026-11-04 Asia/Shanghai |
| Operator | Codex |
| Branch | `codex/shopfront-heartbeat-fix` |
| Source SHA | `0893da472031e49a78fc73c6c7eff98452735817` base plus candidate diff |
| Runtime SHA | `0893da472031e49a78fc73c6c7eff98452735817` before candidate fix |
| Environment | Local SQLite fixture; online read-only status/log inspection |
| Database | Local in-memory SQLite fixture; production crawler database read-only through service APIs |
| Real business writes | 0 |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `SHP-001` | `python -m pytest tests/test_pos_import_results.py::test_inventory_fetch_releases_sqlite_write_transaction -q` | PASS: 1 test | Local pytest output, 2026-11-04 | Fixture confirms no active SQLAlchemy transaction at the start of `fetch_inventory` |
| `SHP-001` | `python -m pytest tests/test_pos_import_results.py -q` | PASS: 20 tests | Local pytest output, 2026-11-04 | Full targeted POS import result suite |
| `SHP-001` | Read-only job status, POS coverage, and Dokploy crawler logs | FAIL: job 40 remains active with repeated SQLite contention warnings | Live endpoints and Dokploy logs, 2026-11-04 | Candidate fix is not yet deployed; the run remains owned by the running service |

## Summary

- Passed: targeted transaction-boundary regression test and its full module, 20/20.
- Blocked: online validation and data repair; at 2026-11-03 19:30 UTC job 40 / run 147 was still `running`, phase `sales:fetched:396`, attempt 6, with last heartbeat `2026-11-03T19:10:41Z`. The heartbeat was over 20 minutes old, beyond the configured 15-minute stale threshold. Recent crawler logs reported SQLite contention.
- Failed: the active online sync has not completed or acknowledged its POS mirror batches.
- Not run: full crawler test suite, deployment of the candidate fix, post-deployment source/crawler/POS reconciliation.
- Business impact: source and crawler coverage are 155,665 sales / 305,052 lines; both POS staging mirrors report 155,536 / 304,770, a deficit of 129 sales / 282 lines. Inventory has 10,846 source/crawler rows; this session did not change inventory or POS/Odoo business records.

## Fix

The candidate commits the product snapshot and run progress before awaiting the complete Shopfront inventory pagination request. This releases SQLite's writer before network I/O and exposes the `inventory_fetch` phase in persisted run counts.

## Follow-up

1. Push the candidate to `main` and let Dokploy deploy it.
2. Observe the resumed daily job until it completes with full source-count acknowledgement and no SQLite contention warnings.
3. Run the idempotent sales replay only after the active store job completes; verify both mirrors reach crawler coverage and compare the 129 source sale IDs.
4. Complete the resumable direct Shopfront sales capture and reconcile the full source window with crawler IDs before declaring all sales complete.
5. Reconcile inventory source, crawler, POS, and Odoo quantities by stable product/outlet identity; keep unresolved quantity and identity mismatches as a manual list.
