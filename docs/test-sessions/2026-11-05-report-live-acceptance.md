# Reporting live acceptance follow-up

Date: 2026-11-05
Suite: `RPT-001`
Environment: authenticated read-only HTTP checks on SKR/Demo; local typecheck and unit suite; no business writes
Report implementation commit: `71a715a7e970a0abaf0d8c2c7f18a3a2fcb4fa62`
Runtime SHA: SKR and Demo frontend/backend `756a42e9958f5fc232f6b4a800ab07723e7838b8`, built 2026-11-05 13:35 UTC

## Results

| Check | Result | Evidence / limitation |
|---|---|---|
| Runtime identity | PASS (code deployment) | Both store public version endpoints returned frontend/backend `756a42e9958f5fc232f6b4a800ab07723e7838b8`; runtime contains the report implementation commit. |
| SKR POS login | PASS | Login succeeded using the configured SKR account. Credentials were not logged. |
| SKR page route access | PARTIAL | On runtime `756a42e9`, `/reports/dashboard`, `/reports/sales`, `/reports/purchase`, `/reports/closures`, `/reports/inventory`, and `/products?view=inventory` returned HTTP 200. `/reports` returned 404; a redirect to `/reports/dashboard` is added locally and awaits deployment. No rendered browser interactions were run. |
| Demo POS login | INFO | Earlier login succeeded; the later page sweep could not establish a session. No page/data result is claimed for Demo. |
| Odoo session | BLOCKED | SKR `GET /api/odoo/session` returned HTTP 200 but `user: null`, despite `autoRecoverConfigured: true`. Manual Odoo session connect returned 502 for SKR and Demo. |
| Live reporting APIs | BLOCKED | After POS login, Overview, sales grouping, purchase grouping, closures, and inventory metadata requests returned 401 because an `orithos_odoo_session` could not be established. No Odoo report data was returned. |
| Direct Odoo connectivity | BLOCKED | `https://odoo.orithos.com.au/` and `/web/login?db=aipos_uat` timed out from this environment. This does not distinguish Odoo availability from network-path restrictions. |
| Local full frontend unit suite | PASS | `npm run test:unit`: 175/175 with Node 24.22.1; run before the redirect-only route addition. |
| Local TypeScript | PASS | Full `npm run typecheck`, Node 24.22.1, exit 0 with the `/reports` redirect route present. |
| Redirect route ESLint | NOT RUN | One-file ESLint produced no diagnostics but was interrupted after more than five minutes. |
| CSV, print, drill-down and same-range reconciliation | NOT RUN | Report APIs did not return data; do not infer parity from page HTTP status or local fixtures. |
| Business writes | 0 | No sales, receiving, purchase, stock, register, or other business mutation was attempted. |

## Follow-up

1. Deploy the `/reports` redirect from `main`; verify `/reports` redirects to `/reports/dashboard` on both stores.
2. Restore Odoo network/session access; require `/api/odoo/session` to return a user and set `orithos_odoo_session`.
3. Re-run one matching business date per store across Overview, sales day/product/category groups, source details, purchase groups, closures, CSV, and print.
4. Confirm refund/GST definitions, store-local date boundaries, DST, source sync gaps, and inventory warehouse scope with read-only Odoo records.
