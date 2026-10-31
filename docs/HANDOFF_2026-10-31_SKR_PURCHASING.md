# SKR supplier and purchasing display repair — 2026-10-31

The SKR web supplier and purchasing pages read Odoo `res.partner` / `purchase.order`, while the 109 real suppliers and 2,355 real purchase orders are in the Shopfront crawler and POS staging mirror. The Odoo company bound to SKR (vendor 55, company 5) contains the Codex UAT supplier 397 and order 19/P00019. This explains the screenshots; the mirror counts did not mean the web directories had been connected.

The repaired directories select the verified SKR Shopfront source before mounting the native Odoo components. They display source counts, search, statuses, pagination and order lines as read-only Shopfront records. They do not convert archived orders into operational Odoo purchase orders or receiving actions. Other stores retain their native Odoo directories.

`GET /api/shopfront/purchasing` requires the current application's supplier/purchase permission and a backend-verified SKR tenant binding with its configured archive prefix. Neither the store nor destination can be supplied by the caller. Source failure is an error, never an Odoo/test-data fallback. Complete source pages are normalized, counted and deduplicated before a one-minute cache is published.

No SKR business data was changed. Odoo test records are excluded from these SKR web directories by selecting the real source; they were not deleted, archived or cancelled because the owner explicitly requires SKR to be read-only.

Validation before deployment:

- TypeScript `tsc --noEmit`: PASS; targeted ESLint: 0 errors, one existing-pattern effect-state warning in the new directory component.
- `node scripts/verify-shopfront-purchasing.mjs --live-source`: 11 checks PASS, including authentication/tenant rejection, failure behavior, source pagination and actual 109 / 2,355 count reconciliation. Latest source order date observed: 2026-10-29. This runs the real route with fixture auth/transport adaptation to the real crawler; it is not online tenant acceptance.
- Desktop/mobile browser fixture covers counts, source labels, exclusion of Codex rows and write controls, pagination, search, status filters, details and viewport overflow. Online acceptance must be recorded separately after matched runtime deployment.

No local application build or Maven build was run. This change does not touch `pos-api/`, crawler code, database configuration or business writes. Preserve running history job 70; do not start another sync to repair a display-source mismatch.
