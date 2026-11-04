# 2026-11-05 Shopfront Sync Revision Refresh

## Scope

- Source baseline: `c2d2f617` (`main`); candidate changes uncommitted during this session.
- Environment: local Windows, Node 24 runtime for targeted JavaScript tests, local crawler test environment.
- Changes: Adelaide 06:00/23:00 scheduling window, per-day report sync state, revision invalidation and prewarm queue, visible-page revalidation, and incomplete/unverified status display.

## Results

- `node --experimental-strip-types --test src/lib/report-cache.test.ts src/lib/report-period.test.ts`: 19/19 PASS.
- `python -m pytest tests/test_schedule.py -q` from `shopfront_crawler/`: 4 passed.
- `python -m compileall -q shopfront_crawler/app`: PASS.
- `git diff --check`: PASS.
- UI full typecheck: PASS.
- Targeted ESLint: 0 errors, 8 React Hook warnings.
- Compose YAML parse: PASS. Docker CLI was unavailable, so `docker compose config` was not run.
- Dokploy auto-deploy for `7cff2e25` was triggered, but clone failed with `early EOF / unexpected disconnect` while receiving the repository. Deployment did not complete; live page acceptance: NOT RUN. Business writes: 0.

## Limits

Read-only live inspection found `skr` mapped to company 55/outlet 87, Odoo companies 5 and 137, and only a demo report target for company 137. Backup master secret is not configured. No full Shopfront backfill or Odoo write was started; SKR/demo target mapping and restore readiness require verification before data import. The crawler notification now targets both SKR and demo hosts, while report targets still require explicit verified deployment configuration for each company.
