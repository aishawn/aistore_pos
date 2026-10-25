# Owner Development Context

This file records owner-provided project locations and non-secret access conventions for future POS work. Secret values remain in ignored local environment files and must not be copied into Git, logs or UAT evidence.

## Environments

- POS demo and primary read-only UAT target: `https://demo.orithos.com.au/`
- Demo admin username: `admin`
- Demo admin password variable: `INITIAL_ADMIN_PASSWORD`
- Control panel: `https://app.orithos.com.au/`
- Control panel admin username: `admin`
- Control panel admin password variable: `INITIAL_ADMIN_PASSWORD`
- Dokploy Compose service: `https://dokploy.modkie.com/dashboard/project/6v8D8TDLvzJCQRH93Dx_z/environment/tm97Mlr4oIRKCExPqVucV/services/compose/WvcUddxTnymK_K5RZPPtL`
- Dokploy username/password variables: `DOKPLOY_USER`, `DOKPLOY_PASS`
- A push to GitHub triggers automatic Dokploy deployment. Verify `/api/public/version` and both frontend/backend SHAs before describing a change as deployed.

## Local Projects

- POS: `C:\shawn\1code\1project-new\aistore_pos\v1\orithopos-master`
- Odoo: `C:\shawn\1code\1project-new\aistore_pos\v1\orithos_odoo`
- Shopfront crawler: `C:\shawn\1code\1project-new\aistore_pos\v1\shopfront_crawler`

## Test Data

- POS/Odoo/Shopfront data in these environments is mock/test data and may be expanded, edited or deleted for development.
- Give created test data a clear cleanup path. Keep business-write UAT gated by [the isolated Odoo runbook](ISOLATION_ODOO_UAT_RUNBOOK.md); do not infer that mock or fixture checks validate transaction acceptance.

## Current Iteration: Mobile POS Catalogue

- On 2026-10-26, read-only Demo browsing at 390px found the register product catalogue about 24px high, clipping the product cards. The observed deployed frontend/backend SHA was `c7f5513e2df9be5be2eba0110de8b22ffe2b946d`.
- A local UI fix opens the catalogue at full height on mobile/tablet after selecting a category or searching; a Cart action returns to the register workspace. Desktop layout remains unchanged.
- Local fixture verification passed at 320, 390, 768, 1024 and 1440px. Two fixture products each requested one quote; checkout requests and business writes were zero. Node 24 typecheck, targeted ESLint and `git diff --check` passed.
- Code commit `7c0b58cd006c7eb099705c87bad3564e1dafc105` was pushed to GitHub `main`. Dokploy auto-deployed a source revision whose frontend/backend runtime SHA is `2e1392d7b4048fb930bb36c52f261dd8a5a38ac4`; this runtime includes the POS fix commit.
- Authenticated read-only Demo UAT passed on that runtime at 390px: the catalogue opened as a 794px fixed panel, Cart returned to the register workspace, 13 categories and 50 products loaded, the product page reported a next page, and there was no horizontal overflow or browser page error. Non-read API writes were blocked or absent; no sale was added or finalized. Evidence: [online mobile catalogue UAT](UAT_POS_CATALOG_MOBILE_ONLINE_READONLY_2026-10-26.json).
- Local evidence: [mobile catalogue fixture UAT](UAT_POS_CATALOG_MOBILE_FIXTURE_2026-10-26.json) and [screenshots](screenshots/2026-10-26-catalog-mobile/).
- Odoo isolation attestation is not verified; transaction acceptance remains blocked and Pilot remains NO-GO.
