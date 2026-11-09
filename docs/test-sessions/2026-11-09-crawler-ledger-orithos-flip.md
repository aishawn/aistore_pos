# Test Session: 2026-11-09 crawler ledger Orithos flip

| Field | Value |
|---|---|
| Session ID | `2026-11-09-crawler-ledger-orithos-flip` |
| Environment | Dokploy crawler compose `JHfNJMWCJGqpq0_5aovzZ` + live PostgreSQL |
| Crawler fix SHA | `000a369` (compose injects `SHOPFRONT_STORE_LEDGER_MODES` / mirror URLs) |
| Business writes | Mapping update; sync job #52 queued; no Odoo dual-write intended |

## What was done

1. Demo migration diff + partial receive UAT passed on POS `f858bbbf` (later runtime advanced to `9325571a` OpenAPI commit).
2. Dokploy crawler env set `SHOPFRONT_STORE_LEDGER_MODES=skr:orithos`, `POS_IMPORT_ENABLED=true`, later `ODOO_IMPORT_ENABLED=false`, `POS_API_MIRROR_BASE_URL=https://demo.orithos.com.au`.
3. Discovered Dokploy env was **not** reaching the container: `docker-compose.yml` omitted `SHOPFRONT_STORE_LEDGER_MODES` / mirror vars. Fixed and pushed crawler `000a369`.
4. Orithos product distribution after job #52 observation: SKR vendor `55` / outlet `87` has **10801** products; Demo outlet `1` still has **1** seed product. Dual-host Demo fill awaits compose redeploy + product/inventory import with mirror enabled.

## Remaining for SKR cutover

- Redeploy crawler so runtime env shows `SHOPFRONT_STORE_LEDGER_MODES=skr:orithos`.
- Import products/inventory to primary SKR and mirror Demo.
- Confirm Demo outlet product count approaches ~10801 and SKR native allowlist only after owner authorization.
- Xero/backup/Odoo retire remain after authorized cutover.
