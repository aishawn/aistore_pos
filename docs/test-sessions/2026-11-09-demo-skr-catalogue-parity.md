# Test Session: 2026-11-09 Demo/SKR Orithos catalogue parity

| Field | Value |
|---|---|
| Session ID | `2026-11-09-demo-skr-catalogue-parity` |
| Source SHA | `a38704d1` (outlet-scoped uniqueness) + crawler `6ac47dd` (chunked imports) |
| Environment | Live shared Orithos PG |

## Result

| Outlet | Products | Inventory | Barcodes | Unit prices |
|---|---|---|---|---|
| Demo `1` (vendor 1) | **10801** | **10681** | **13251** | **10865** |
| SKR `87` (vendor 55) | **10801** | **10681** | **13251** | **10865** |

## How Demo was filled

1. Confirmed global name/barcode uniqueness blocked a second catalogue copy (import would move SKR rows).
2. Deployed outlet-scoped uniqueness migrator + outlet-scoped Shopfront product resolve.
3. Restored crawler `POS_API_BASE_URL=http://backend:8080` (public Demo/SKR hosts caused Cloudflare 524 on 10k-row imports).
4. SQL-cloned SKR outlet 87 → Demo outlet 1 (products, then barcodes/prices/inventory).
5. Seeded missing `product_price` rows from `shopfront_product` shadow prices for both outlets.
6. Remapped crawler store `skr` back to POS outlet `87`.

## Still open for SKR cutover

- `APP_NATIVE_POS_ENABLED_VENDOR_IDS` remains `1` only (vendor `55` not allowlisted).
- `GET /api/products` was still retired under Odoo-only mode; open product **reads** so Demo/SKR UI can use the Orithos catalogue (follow-up commit).
- Ongoing dual-outlet sync still needs a durable strategy (second store key or outlet-aware mapping); current mapping row targets one outlet.
- Xero CSV / backup rehearsal / Odoo retire not run.
