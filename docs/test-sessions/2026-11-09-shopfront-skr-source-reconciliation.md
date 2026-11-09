# Shopfront SKR source-only reconciliation recheck

Date: 2026-11-09 (Australia/Adelaide business context; session run UTC+8)
Environment: Online read-only crawler API + local crawler pytest
Crawler source SHA: `9cd7745634ecc685258f6a36534161c586405c5b`
Crawler runtime fingerprint: `4bc51b093c60019d925ef671d3a79c2e0dca9b170f224a16d5cc093a2bbf82fc` (`https://crawler.orithos.com.au/healthz`)
POS SHA: Not in scope
Database: Crawler PostgreSQL archive (read-only API); no Odoo/Orithos writes
Business data writes: 0

## Scope

Recheck SKR `source_only=true` sync health after job #36 `sales_report_unavailable` and the earlier stalled supply-chain narrative. Confirm deployed crawler fixes (`83181b9`, `9cd7745`) and live sales-report availability for `2026-11-08`.

## Checks

| Check | Result | Notes |
|---|---|---|
| Crawler full pytest | PASS, 229/229 | Local Windows Python; existing SQLAlchemy/FastAPI deprecation warnings |
| `/healthz` | PASS | `status=ok`, fingerprint matches source tree at `9cd7745` |
| `GET /api/sync/status?store=skr` | PASS | 0 active jobs; jobs #36–#47 inspected |
| Job #36 `2026-11-08` daily | INFO | Stays `partial` / `source_reconciliation_incomplete` (historical pre-fix) |
| Job #37 `2026-11-08` daily | PASS | `completed`; not stuck |
| `GET /api/source-reports/sales` cached | PASS | 1 row; transaction count 114 |
| `GET /api/source-reports/sales&refresh=true` | PASS | Fresh upstream fetch; still 114 transactions |
| Supply-chain #41 / #45 | FAIL (explained) | Invalid transaction before DB-release fix; AdminShutdown during deploy |
| Ledger / Odoo / Orithos writes | NOT RUN | Deliberately not triggered |

## Root cause (confirmed)

1. **Sales report gap on job #36:** Reporting API fetch failed/timed out during sync, yielding `sales_report_unavailable` with 0 report rows while GraphQL returned 114 sales. Query alignment (`99e5b51`) and report polling/diagnostics (`9cd7745`) restored live reads; historical job #36 was not retroactively repaired.
2. **Perceived supply-chain stall:** Long Shopfront pagination held an open SQLAlchemy transaction on the job worker connection, so heartbeats stopped updating and persistence could fail with `invalid transaction` (`83181b9` adds `db.commit()` before upstream reads; `9cd7745` adds an isolated heartbeat loop). Post-deploy job #45 failed only because PostgreSQL restarted (`AdminShutdown`), not because Shopfront hung.

## Limits and follow-up

- Extended-data child jobs remain `partial` with Shopfront GraphQL `403 permission_denied` on brands/categories/etc.; scopes unchanged in this session.
- Re-queue `source_only` supply-chain for SKR outside deploy windows if purchase-order archive freshness is required (crawler archive only).
- Optional: rerun `source_only` daily for `2026-11-08` if job #36 must be marked completed in the job table; not required for live report API parity.
- POS staging reconciliation and Orithos ledger mode remain unverified in this session.
