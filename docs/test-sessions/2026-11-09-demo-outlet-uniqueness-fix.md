# Test Session: 2026-11-09 Demo outlet uniqueness unblock

| Field | Value |
|---|---|
| Session ID | `2026-11-09-demo-outlet-uniqueness-fix` |
| Environment | Live shared Orithos PG; crawler `skr:orithos` |
| Problem | Demo outlet `1` stayed at 1 SKU while SKR outlet `87` had ~10801. Global `uq_product_active_name` / `uq_barcode_code` plus barcode/name lookups without outlet scope meant a Demo import would match and **move** SKR rows (`UPDATE ... outlet_id=?`). |
| Secondary | `demo-catalog-oneshot` had set crawler `POS_API_BASE_URL=https://demo.orithos.com.au`, so 10k-row imports died on Cloudflare 502/524. Restored to `http://backend:8080`. |

## Fix shipped in this change set

1. Postgres migrator scopes uniqueness to `(outlet_id, active_name)` / `(outlet_id, code)`.
2. Shopfront business product/barcode resolve is outlet-scoped; wrong-outlet mappings are ignored so Demo creates its own rows.
3. Crawler product/inventory POS import sends bounded chunks; HTTP timeout raised to 300s.
4. Crawler query_scan selection split (uncommitted work) kept for schema roots that require id strategies.

## Follow-up after deploy

1. Map `skr` → Demo outlet `1`, run `/api/pos/import/products` then inventory, count products on outlet 1.
2. Remap `skr` → outlet `87` and re-import products/inventory so `shopfront_product_mapping` points back at SKR rows (one store_key mapping cannot target both outlets at once).
3. Keep `APP_NATIVE_POS_ENABLED_VENDOR_IDS=1` until SKR parity + owner cutover authorize vendor `55`.
