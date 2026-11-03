# Test Session: 2026-11-04 Shopfront Sales Mirror Gap

## Session metadata

| Field | Value |
|---|---|
| Session ID | `2026-11-04-shopfront-sales-mirror-gap` |
| Started / timezone | 2026-11-03 18:50 UTC |
| Operator | Codex |
| Branch | `codex/shopfront-heartbeat-fix` |
| Source SHA | `8b9b04a7751573dcf84cbf12c9bd86835fc9e267` |
| Runtime SHA | `5a296eac69bacb956a8e6ebd4401a6212745faba` before deployment |
| Environment | Local fixture plus online read-only checks of SKR source and POS staging mirrors |
| Database | Crawler production database; no direct database credentials used |
| Real business writes | 0 during diagnosis and local tests; online replay not yet run |

## Suites executed

| Suite ID | Test command or workflow | Result | Evidence | Notes/blocker |
|---|---|---|---|---|
| `SHP-001` | `python -m pytest tests/test_pos_import_results.py -q` | PASS: 19 tests | Local output, 2026-11-03 | Fixture only; no live imports |
| `SHP-001` | Read-only Shopfront reconcile, crawler audit, POS mirror coverage | INFO: source had 129 sales on 2026-11-03; each POS mirror had 129 fewer sales overall | Endpoints `/shopfront-reconcile?store=skr&date=2026-11-03`, `/shopfront-audit?store=skr`, `/api/pos/coverage?store=skr` | POS totals are aggregates; individual sale IDs still need post-fix read-back |

## Summary

- Passed: crawler regression suite 19/19.
- Blocked: online repair verification; run `40` was stuck in `sales:fetched:396` and its cancel endpoint returned HTTP 500.
- Failed: prior daily run `143` recorded `sales=396` and `sales_skipped_unchanged=396`; this allowed the POS mirrors to remain incomplete when the crawler already held the sales.
- Not run: deployed code verification and per-sale ID comparison for 2026-11-03.
- Business impact: crawler had 155,665 sales; both primary and mirror POS staging reported 155,536. Shopfront reconciliation for 2026-11-03 returned 129 summary transactions and 129 crawler sales. The total mirror deficit matched that day exactly.

## Fix

Daily syncs now replay the bounded daily source window to POS/Odoo even when the crawler considers those sales unchanged. The query includes rows updated during the run as well as rows whose source business timestamps fall in the daily window. Daily jobs require the full Shopfront source count to be acknowledged; historical sync retains the unchanged-sales optimization. Writes are idempotent staging upserts keyed by external sale ID.

## Follow-up

1. Push `8b9b04a7` to `main` and wait for Dokploy deployment success.
2. Let the interrupted daily job resume with the new code; confirm its phase reaches POS import and the run completes.
3. Confirm primary SKR and demo mirror sale totals increase to at least the crawler total and compare all 129 source IDs for 2026-11-03 against both mirrors.
