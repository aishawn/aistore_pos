# Orithos Trial Release Audit - 2026-10-28

## Runtime

- Target: `https://demo.orithos.com.au`
- Verified frontend/backend SHA: `c3ae839f7cd20092127e46e7ee1af63ca60302a5`
- Deployment, debugging and trial database policy: `aipos_uat`
- `ODOO_DATABASE`, `ODOO_DATABASE_UAT` and `ISOLATION_ODOO_DATABASE` intentionally share `aipos_uat`.
- `/api/public/uat-context`: `isolated=false` by design for this shared-UAT phase.

## Passed Evidence

- Java 21 `mvn clean verify`: 441 tests, 0 failures.
- Frontend `npm ci`, `npm run typecheck` and `npm run build`: passed on Next.js 16.4.3. Production dependency audit now reports 2 remaining findings (0 critical, 1 high, 1 moderate).
- Responsive route matrix: 154 routes at 390px and 1440px, no blocked API requests on the final SHA.
- Sales/GST/idempotent retry/refund/stock restoration: passed on final SHA. Latest sale `107660`, refund `107661`, GST `$3.20`, stock restored `24 -> 24`.
- Customer create/update/archive: passed on final SHA; archived records are hidden from the active directory.
- Purchase confirmation, partial/full receipt, over-receive rejection and duplicate receipt idempotency: passed; temporary tenant deleted.
- Cash sale, counted-cash close gate and register closure with zero difference: passed; temporary tenant deleted.
- Odoo session recovery: 6/6 checks passed.
- AI availability: 3/3; multi-store/platform checks: 16/16.
- Demo and SKR login, Odoo binding and product reads: passed.
- Backup/restore: `docs/UAT_BACKUP_RESTORE_AIPOS_UAT_2026-10-28.json` reports `PASS`; restore transaction marker `RESTORE_TX_OK`, registry and user read passed, disposable restore database deleted.
- Post-deploy version check: frontend and backend both report the full candidate SHA; unauthenticated `GET /api/sell/parked` returns 401 rather than 500. Authenticated parked read and the full sale/refund smoke passed after the Next.js security upgrade.

## Release Decision

**GO for owner-authorised shared-UAT trial transactions.** Real sales, refunds, purchasing, receiving, inventory and customer CRUD are enabled for supervised testing against `aipos_uat`.

**NO-GO for independent customer production.** The shared database is not tenant-isolated, and physical printer, cash drawer, barcode scanner and EFTPOS acceptance has not been performed. Offline-first POS is not accepted. Keep administrator, procurement, bulk price and stock adjustment permissions restricted during trial.

## Remaining Risks

- `npm audit --omit=dev` still reports one high and one moderate transitive finding; they are outside the Next.js patch fixed in this release and require a separate dependency cycle.
- Hardware must be tested on the customer device set before claiming support.
- Continue daily reconciliation of sales, GST, stock and cash, and retain rollback backups.
