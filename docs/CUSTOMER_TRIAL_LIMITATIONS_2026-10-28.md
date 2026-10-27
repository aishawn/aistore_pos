# Orithos Controlled Trial Limitations and Rollback

## Trial scope

- Trial traffic uses the shared `aipos_uat` database. It is suitable for owner-authorised mock/UAT transactions only; it is not customer production isolation.
- Demo admin access is restricted to the owner and test operators. Do not give customers administrator, procurement, price-edit, stock-adjustment, or tenant-management permissions.
- Start with a small catalogue and a small number of supervised transactions. Reconcile sales, GST, stock and cash at the end of each day.

## Disabled or unverified capabilities

- Receipt printer, cash drawer, barcode scanner and EFTPOS are not physically verified. The hardware page must continue to show the unavailable/not-tested state when no device is connected.
- Offline-first POS is not accepted. Customers must not be told that sales can be completed while disconnected.
- Bulk price changes, stock adjustments, procurement receiving and tenant administration remain operator-only during the trial.
- AI responses are assistive only. They must not be treated as accounting, tax, inventory or purchasing authority, and provider failure must leave the POS usable.

## Rollback procedure

1. Stop customer access by disabling the affected tenant or removing trial users in the platform admin.
2. Stop further UAT writes and record the last known receipt, register session and Odoo document IDs.
3. Export the current `aipos_uat` Odoo backup and preserve the existing backup hash before any recovery action.
4. Restore the last known good backup to a disposable database first; verify Odoo login, registry load, tenant binding and a read-only POS session.
5. Revert the Dokploy POS Compose service to the last verified runtime SHA using a normal Deploy. Do not use Fresh Volumes.
6. Re-run `/api/public/version`, login, `/api/sell/parked`, Odoo session and the smoke checklist before reopening the trial.

## Current release decision

`NO-GO` for unsupervised customer production use. Controlled UAT remains available because backup/restore has passed and the current Demo runtime has healthy login and parked-sale reads, but database isolation and physical device acceptance are still outstanding.
