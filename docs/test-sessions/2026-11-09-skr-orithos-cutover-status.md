# Test Session: 2026-11-09 SKR Orithos cutover status

| Field | Value |
|---|---|
| Session ID | `2026-11-09-skr-orithos-cutover-status` |
| Environment | Live Orithos PG `postgres` + crawler `skr:orithos` |
| Catalogue | **Demo outlet 1 and SKR outlet 87 both 10801 products / 10681 inventory / 13251 barcodes / 10865 unit prices** |
| Native write gate | `APP_NATIVE_POS_ENABLED_VENDOR_IDS=1` only — SKR `55` **not** allowlisted |
| POS SHA | `03ef24c6` (product GET reads opened under Odoo-only mode) |
| Crawler SHA | `6ac47dd` (chunked Orithos imports) |

## Parity

| Source | Count |
|---|---|
| Orithos Demo outlet products | 10801 |
| Orithos SKR outlet products | 10801 |
| Inventory both outlets | 10681 |
| Shopfront shadow products (skr) | 11030 |
| Prior active inventory reference | ~10849 |

Gap vs historical ~10849 active SKUs is residual source/status filtering, not a Demo/SKR split.

## Blockers cleared this session

1. `SHOPFRONT_BUSINESS_WRITE_ENABLED` enabled on POS.
2. Inventory replace compact audit deployed earlier (`58a2959c`).
3. Global product name/barcode uniqueness scoped to outlet so Demo can hold a parallel catalogue.
4. Crawler `POS_API_BASE_URL` restored to `http://backend:8080` (public hosts caused Cloudflare 524).
5. Demo catalogue filled by SQL clone from SKR + price seed from `shopfront_product`.
6. Crawler mapping remapped to SKR outlet `87`.

## Remaining before authorizing SKR writes

1. Owner authorization to set `APP_NATIVE_POS_ENABLED_VENDOR_IDS=1,55`.
2. Durable dual-outlet sync (second store key or outlet-aware mapping) so daily Shopfront jobs refresh Demo and SKR without manual clone.
3. Xero CSV, backup/restore rehearsal, Odoo retire.
4. Confirm Demo/SKR UI product pages after `03ef24c6` deploy (GET `/api/products` now allowed).

## Authorization stance

Catalogue parity is good enough for **owner-authorized** NativePosGate allowlist of vendor `55`. Do not treat current state as Odoo-retired.
