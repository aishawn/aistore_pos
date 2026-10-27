# Orithos Trial Release Audit - 2026-10-28

## Runtime

- Target: `https://demo.orithos.com.au`
- Verified frontend/backend SHA: `3a94a8bc8a327093ddd49dcd1fdcbad46979c25a`
- Deployment, debugging and trial database policy: `aipos_uat`
- `ODOO_DATABASE`, `ODOO_DATABASE_UAT` and `ISOLATION_ODOO_DATABASE` intentionally share `aipos_uat`.
- `/api/public/uat-context`: `isolated=false` by design for this shared-UAT phase.

## Passed Evidence

- Java 21 `mvn clean verify`: 441 tests, 0 failures.
- Frontend `npm run typecheck` and `npm run build`: passed.
- Responsive route matrix: 154 routes at 390px and 1440px, no blocked API requests on the final SHA.
- Sales/GST/idempotent retry/refund/stock restoration: passed on final SHA. Latest sale `105675`, refund `105676`, GST `$3.20`, stock restored `24 -> 24`.
- Customer create/update/archive: passed on final SHA; archived records are hidden from the active directory.
- Purchase confirmation, partial/full receipt, over-receive rejection and duplicate receipt idempotency: passed; temporary tenant deleted.
- Cash sale, counted-cash close gate and register closure with zero difference: passed; temporary tenant deleted.
- Odoo session recovery: 6/6 checks passed.
- AI availability: 3/3; multi-store/platform checks: 16/16.
- Demo and SKR login, Odoo binding and product reads: passed.
- Backup/restore: `docs/UAT_BACKUP_RESTORE_AIPOS_UAT_2026-10-28.json` reports `PASS`; restore transaction marker `RESTORE_TX_OK`, registry and user read passed, disposable restore database deleted.

## Release Decision

**GO for owner-authorised shared-UAT trial transactions.** Real sales, refunds, purchasing, receiving, inventory and customer CRUD are enabled for supervised testing against `aipos_uat`.

**NO-GO for independent customer production.** The shared database is not tenant-isolated, and physical printer, cash drawer, barcode scanner and EFTPOS acceptance has not been performed. Offline-first POS is not accepted. Keep administrator, procurement, bulk price and stock adjustment permissions restricted during trial.

## Remaining Risks

- `npm audit --omit=dev` reports transitive production dependency findings, including 2 critical and 15 high; automatic lockfile-only remediation made no changes. Upgrade requires a separate dependency validation cycle.
- Hardware must be tested on the customer device set before claiming support.
- Continue daily reconciliation of sales, GST, stock and cash, and retain rollback backups.
