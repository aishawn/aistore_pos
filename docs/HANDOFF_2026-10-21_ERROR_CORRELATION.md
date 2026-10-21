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
- Live Demo 390px read-only check against the previously deployed runtime: Price Suggestions returned HTTP 502 without sending a correlation ID; Reporting Dashboard returned HTTP 200. No horizontal overflow or business writes. Evidence: `UAT_ODOO_ERROR_CORRELATION_ONLINE_CURRENT.json`.
- Dokploy was reported successful by the owner, but the Demo version endpoint still reports `frontend.commit=null`, `backend=null`, `builtAt=2026-10-21T12:58:05.809Z`. Runtime SHA is unverified; the online check therefore does not prove these workspace changes are deployed.
- No production build was run locally. Java sources were not changed.

## Next

Deploy the isolated frontend candidate through the configured Dokploy path, confirm the build and runtime identity, then rerun the live 390px error and retry checks. Investigate the upstream price-suggestions 502 from Cloudflare/origin logs separately.
