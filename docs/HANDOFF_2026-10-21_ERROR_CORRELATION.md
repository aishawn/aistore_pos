# Handoff: Odoo Error Correlation

## Scope

Frontend-only reliability update for Price Suggestions and Reporting Dashboard. No `pos-api` files are included. Business data remains read-only.

## Changes

- Generate a UUID before each Odoo page request and send it as `X-Correlation-ID`.
- Display the response correlation ID when present, otherwise retain and display the outgoing UUID. This also gives a useful ID when a proxy returns an error without response headers.
- Ignore stale responses before updating the displayed ID so an older request cannot replace the current error's ID.
- Local UAT covers gateway responses with and without correlation headers, retry ID regeneration, and the displayed ID.

## Verification

- Node 24.19.0 TypeScript check: passed.
- Targeted ESLint for both components: passed.
- Local 390px Playwright fixture: 13/13 passed; no page errors, no horizontal overflow, and no business writes. Evidence: `UAT_ODOO_ERROR_CORRELATION_LOCAL_2026-10-24_CURRENT.json` and `screenshots/2026-10-24-odoo-error-correlation-current/`.
- Dokploy reports the deployment as Done for source SHA `e7dc67ddcc7c61e5f3b225be84457e142ef914a7`; Demo `builtAt=2026-10-21T13:35:45.867Z`. The public version endpoint still has empty frontend/backend commit fields, so runtime commit identity from the app itself remains unavailable.
- Post-deploy Demo 390px read-only UAT: `11/11 PASS`. Price Suggestions returned HTTP 502, but the request sent a UUID, the error state displayed it, and Retry sent a new UUID which was displayed. Reporting Dashboard returned HTTP 200. No horizontal overflow or business writes. Evidence: `UAT_ODOO_ERROR_CORRELATION_ONLINE_AFTER_E7DC67D.json`.
- Broader post-deploy checks: `138 routes x 390/1440 = 272/276 PASS`; four failures are `/platform/audit` and `/platform/failures` returning 404 at both widths because those working-tree pages were not in the deployed candidate. Core interactions `14/14 PASS`, settings `26 PASS`, table/accessibility `14/14 PASS`, and `unexpectedWrites=0`. Evidence files are `UAT_ALL_STATIC_PAGES_POST_E7DC67D.json`, `UAT_INTERACTION_POST_E7DC67D.json`, `UAT_SETTINGS_MOBILE_POST_E7DC67D.json`, and `UAT_TABLE_A11Y_ONLINE_POST_E7DC67D.json`.
- No production build was run locally. Java sources were not changed.

## Next

Investigate the Price Suggestions HTTP 502 in Cloudflare/origin logs. Validate the `/platform/audit` and `/platform/failures` working-tree pages with isolated fixtures, then pass the Java 21 pre-push gate for their backend dependencies before including them in a deployment. Keep the missing runtime commit fields documented until the app exposes them.
