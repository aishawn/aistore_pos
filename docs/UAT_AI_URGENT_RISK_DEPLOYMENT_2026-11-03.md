# Urgent-risk replenishment deployment verification

## Deployment identity

- Repository: `aishawn/aistore_pos`
- Branch: `main`
- Commit: `08b2dac9546bd912328cb083ec40e890c9d04914`
- Dokploy Compose service: `y4IqIQ8dvwEYL06Hppkjc`
- Dokploy result: `Compose deployed successfully`, status `Done`
- Runtime build time: `2026-11-02T17:58:31Z`

Both public stores report the intended SHA from `/api/public/version` for frontend and backend.

## Online smoke

The authenticated replenishment pages were loaded without business writes:

| Store | Route | Login | Urgent-risk filter | Count | API |
|---|---|---:|---|---:|---:|
| Demo | `/stock/replenishment` | 200 | Present | 1,203 | 200 |
| SKR | `/stock/replenishment` | 200 | Present | 1,110 | 200 |

The filter is backed by the deployed product response and selects `risk=HIGH` or products with positive demand and zero on-hand stock. The existing review gate remains active: Demo shows 12,987 review items and SKR shows 12,999.

No sales, inventory, supplier, purchase, or RFQ data was written during deployment verification.
