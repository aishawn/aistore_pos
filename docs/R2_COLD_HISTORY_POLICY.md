# R2 cold history policy

**Decided:** 2026-10-16 (multi-store capability plan Phase 1)

| Data | System of record | Notes |
|---|---|---|
| Current catalogue, on-hand, new POS sales, purchases | **Odoo** | Hot business facts |
| Shopfront sqlite / CSV archive, bulk historical receipts | **Cloudflare R2** | Cold; read-only in Orithos unless explicitly imported for TEST |
| Product large images / exports | **R2 or CDN** (preferred at scale) | Odoo filestore only for small POS tiles if needed |

## Rules

1. **Production tenants:** do not run full historical `pos.order` replay from R2.
2. **Demo / TEST:** `scripts/import-r2-sales-receipts.py --apply` may import Completed receipts into a TEST company/DB only; always re-apply R2 quants afterward.
3. **Orithos History:** R2 archive views are labeled archive and are not refundable as Odoo orders.
4. **Multi-store:** each vendor eventually uses its own R2 prefix (`shopfront/{subdomain}/` or equivalent); the app server mirrors only active prefixes, not all 200 stores.
