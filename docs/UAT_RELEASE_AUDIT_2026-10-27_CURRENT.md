# Orithos Trial Release Audit: 2026-10-27

## Current runtime

- Target: `https://demo.orithos.com.au`
- Latest observed runtime: `e995801498e7838458f2d3382e84fd7c34f2e1a0`
- Frontend and backend runtime commits matched at observation time.
- Deployment/debug/UAT database names are `aipos_uat` for `ODOO_DATABASE`, `ODOO_DATABASE_UAT`, and `ISOLATION_ODOO_DATABASE`.

## Passed online checks

- Sales, GST, idempotent retry, refund, and stock restoration.
- Stocktake adjustment, readback, restore, and duplicate submission idempotency.
- Cash in/out, amount cap, CSRF, close gate, close and reopen.
- Purchase confirmation, partial receipt, over-receive rejection, duplicate receipt idempotency, and remaining receipt.
- The same procurement and cross-tenant supplier flows were re-run on runtime `0aa729ea`; temporary tenants were deleted and deleted-auth checks passed.
- Stocktake adjustment, duplicate retry, and restore were re-run on runtime `0aa729ea`; Demo product quantity returned to its original value of 24.
- Runtime `8462bf97` deployed with the frontend backend proxy timeout raised from 30 seconds to a configurable 60 seconds, capped between 5 and 120 seconds.
- The auto-deploy branch subsequently advanced to `e9958014` (`fix(shopfront): backfill inventory outlet keys`, following `a7f19246`); current frontend/backend runtime identity matches `e9958014`.
- On runtime `8462bf97`, AI availability passed 3/3, structured card contract passed 30/30, and the full 387-question workflow matrix returned 387/387 PASS with 0 failures. The matrix report is marked blocked only because the audit worktree contains unrelated local changes and therefore cannot prove source/runtime identity from its local commit.
- Customer group CRUD and cleanup; supplier validation, duplicate ABN rejection, CRUD and tenant isolation.
- Demo, SKR, control plane, brand signup, and Odoo entry points.
- Demo (`admin`) and SKR (`shawn`) both authenticated with HTTP 200; `/settings/roles` and `/settings/users` redirected to the supported Odoo integrations entry on both stores.
- Demo `/settings/hardware` at 390px showed Receipt printer and Cash drawer `Not verified`, Barcode scanner `Not tested`, and no browser JavaScript errors. This documents the unavailable state; it is not physical device acceptance.
- Current runtime `e9958014` release gate recheck: deployment SHA verified, login HTTP 200, and authenticated `GET /api/sell/parked` HTTP 200; database separation remains false because all three variables intentionally equal `aipos_uat`.
- Current runtime `e9958014` AI availability passed 3/3 and structured card contract passed 30/30. The 387-question matrix remains proven on the unchanged frontend runtime `8462bf97`; the current auto-deployed commits are shopfront-only and a frozen release window is still required for exact-SHA full-matrix evidence.
- AI availability 3/3 and AI utterance matrix 387/387. The utterance report is marked blocked only when source/runtime identity cannot be proven from the dirty audit worktree.
- 154-route responsive matrix reached 308/309 page checks; the only recorded failure was runtime SHA changing during an active auto-deploy window.

## Blocking findings

1. All deployment, debugging, and trial data intentionally share `aipos_uat`; this does not satisfy a production database isolation gate.
2. Dokploy POS backup configuration remains an old MySQL backup for database `orithos` to `Orithos R2 Backup`, not a PostgreSQL `aipos_uat` backup.
3. Odoo database-manager backup for `aipos_uat` now succeeds: HTTP 200, ZIP 82,730,587 bytes, containing `dump.sql`, `manifest.json`, and filestore. The local integrity artifact is outside Git at `C:\\temp\\orithos-audit\\aipos_uat_20261028.zip`; SHA-256 is `FC12BF521A915E3A5D6422505B391ECA72EDF6C7397DCA3F242B51D3280BB448`.
4. A second database-only custom dump also succeeded: 84,525,300 bytes, SHA-256 `8A62C6BD0FCA6DF2489E4E7DB9B2C5521156A347362AD56970E0963BFAFBEC77`. Restore to disposable database `aipos_uat_restore_20261028d` was attempted with this smaller dump; the request exceeded 90 seconds and `/web/database/list` was polled for three minutes without the disposable database appearing. Restore-after-backup and post-restore login remain unproven.
5. Direct PostgreSQL sessions to the supplied endpoint were attempted with `psycopg` using `sslmode=disable`, `require`, and `prefer`; all timed out after TCP connectivity succeeded. Dokploy PostgreSQL Compose backup attempts returned HTTP 400 and were removed.
5. Physical printer, cash drawer, scanner, EFTPOS, and offline POS acceptance remain unverified.
6. GitHub `main` continues to auto-deploy concurrent commits, so long-running route matrices cannot prove a frozen release SHA until a release window is established.
7. The previous exact-SHA AI matrix on `0aa729ea` returned 373/387 PASS and 14 transient HTTP 502 responses. After deploying `8462bf97`, the full matrix returned 387/387 PASS with 0 failures; keep latency and error monitoring enabled during the trial.
8. Odoo-only role checks confirm supported routes redirect to the Odoo integration entry; legacy `/api/users` is intentionally retired with HTTP 410. Customer role administration must be documented and verified through Odoo before trial access is expanded.

## Release decision

The demo is suitable for unrestricted UAT transactions against `aipos_uat`. Formal customer production release remains conditional until a PostgreSQL/Odoo backup and restore drill, a frozen release SHA, and the required physical device checks are completed.
