# Test Session: 2026-11-09 SKR Orithos cutover status

| Field | Value |
|---|---|
| Session ID | `2026-11-09-skr-orithos-cutover-status` |
| Environment | Live Orithos PG `postgres` + crawler `skr:orithos` |
| Catalogue | SKR vendor `55` / outlet `87`: **10801** products; Shopfront archive ~11030 / inventory ~10852 |
| Demo | vendor `1` / outlet `1`: still **1** seed product (Demo fill blocked) |
| Native write gate | `APP_NATIVE_POS_ENABLED_VENDOR_IDS=1` only — SKR `55` **not** allowlisted |

## Parity vs ~10849

| Source | Count |
|---|---|
| Prior SKR source inventory sessions | ~10849 active |
| Crawler archive products | 11030 |
| Orithos SKR outlet products | 10801 |
| Gap vs 10849 | ~48 short (near-parity; not exact) |

## Blockers before authorizing SKR writes

1. `SHOPFRONT_BUSINESS_WRITE_ENABLED` was `false` on POS — product/inventory business import into Demo did not land; enable + redeploy required.
2. Full inventory replace returned HTTP 500 (`/api/integrations/shopfront/inventory:replace`) under large payloads — compact audit payload fix pending deploy.
3. Shared crawler store key `skr` has one mapping row; Demo and SKR need coordinated primary/mirror hosts **or** separate store keys so both outlets receive catalogue.
4. Xero CSV, backup/restore rehearsal, and Odoo retire are **not** run in this session.

## Authorization stance

SKR Orithos catalogue is close enough to proceed with **owner-authorized** `NativePosGate` allowlist of vendor `55` after business-write + inventory replace fixes are deployed and Demo fill is re-attempted. Do not treat current state as Odoo-retired.
