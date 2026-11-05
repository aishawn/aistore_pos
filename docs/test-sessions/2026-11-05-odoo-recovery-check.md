# Odoo recovery check (2026-11-05)

## Read-only evidence

- `https://odoo.orithos.com.au/web/database/selector` returned HTTP 200 with a normal Odoo HTML page (42,711 bytes) in approximately 5 seconds. The previous direct-upstream timeout is no longer reproducible at this check.
- `GET https://skr.orithos.com.au/api/odoo/session` returned HTTP 200 with `{"user":null,"autoRecoverConfigured":true}`.
- `POST https://skr.orithos.com.au/api/odoo/session` with an empty JSON body returned HTTP 401. No password or account data was submitted.
- Unauthenticated `GET /api/odoo/inventory-history` and `GET /api/odoo/replenishment` returned HTTP 401, as expected without a POS/Odoo session.

No RFQ, purchase order, inventory, sales, or other business write was issued. The Odoo upstream appears reachable again, but authenticated AI and native inventory checks remain outstanding because this shell has no usable POS/Odoo credentials or login cookie.

## Next check

Use the existing authenticated browser session or the configured runtime credentials to rerun both stores at the fixed deployment SHA. Capture AI answer data dates/ranges/sources, direct report reconciliation, inventory `latestBusinessDate`/`observedDays`/coverage, and `writeRequests=[]` evidence.
