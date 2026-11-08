# Product Catalogue Read Cache

Date: 2026-11-08
Environment: Local POS UI source checks; Node 24.22.1; source checkout `orithopos-master` on local `main`
Source/runtime SHA: Source commit `111d0e54` (local `main`; two commits ahead of `origin/main`); runtime SHA and authenticated SKR/Demo behavior were not checked
Business data writes: 0

## Changes

- Ordinary product record pages use the existing tenant-scoped Redis cache and request coalescing with a 30-second local and persistent TTL. Identity, host, tenant/company binding, sample-data revision, cost visibility and all request filters are part of the cache scope.
- Explicit catalogue refresh bypasses browser and server cache. Existing report revision invalidation is reused for successful product writes and Shopfront sync revisions. Inventory-report pagination remains excluded.
- Successful product responses expose the generation time, cache status and correlation ID. The catalogue shows the generation time; `Server-Timing` reports total server handler duration.

## Checks

- Node 24 `--experimental-strip-types --test src/lib/report-cache.test.ts src/lib/product-catalogue.test.ts`: 13/13 PASS, including singleflight, session isolation, force refresh replacing browser and server values, tenant revision invalidation and inventory cache exclusion.
- TypeScript `transpileModule` syntax checks for changed TypeScript sources: PASS.
- `git diff --check`: PASS.
- Project documentation checker: FAIL on three existing missing links in reporting/shopfront validation records; no broken links were introduced by this candidate.
- Full `tsc --noEmit`: BLOCKED because this checkout has no complete dependency installation; `next` and its type declarations are missing. `npm ci --ignore-scripts --no-audit --no-fund` was interrupted after stalling during package retrieval.
- `python scripts/check-project-docs.py`: FAIL on three missing links already present in reporting/shopfront validation files; this session did not alter those references.

## Limits

No local application build, live browser run, authenticated SKR/Demo P50/P95 sample, deployment, or runtime SHA verification was performed. Fixture checks do not prove live catalogue parity or production performance. No Odoo business records were written.
