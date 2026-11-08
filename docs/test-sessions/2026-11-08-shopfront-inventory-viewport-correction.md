# Shopfront Inventory Viewport Correction

Date: 2026-11-08

## Scope

- Target: SKR Shopfront, POS/Odoo read path, database `aipos_uat`, company 5.
- Source/runtime before the UI fix: POS `0523aa26f2c242f9961d8ecc4939cc860b8738d1` on SKR and Demo.
- Worktree: POS repository, `main`; changed UI default only.
- Business writes: none. All live requests were read-only, except authentication/session creation.

## Evidence

- Current `aipos_uat` source mirror: 11,032 product records; 10,849 ACTIVE products; 10,852 inventory rows; 50,914 positive units; 5,374 negative inventory rows; latest source inventory snapshot `2026-11-08T02:34:46.280813+08:00`.
- Full active Shopfront comparison against the mapped Odoo stock location: 10,849 compared; 0 quantity mismatches; 0 missing canonical products; 5 ambiguous mappings reported by the independent audit. Source box-cost/case-quantity comparison produced 0 differences where case size was available.
- Authenticated SKR Products API: 10,849 products; 10,849 mapped; 0 unmapped; 4 ambiguous references reported by the route; 9,993 non-zero source costs; 856 real zero costs. First rows were name-sorted gift-card/recharge products with true zero stock.
- Authenticated SKR Inventory API sorted `shopfront_quantity desc`: first five quantities 465, 456, 425, 422, 400; source costs were readable and Odoo quantities matched each source quantity.
- UI now defaults Inventory to `shopfront_quantity desc` if no sort URL parameters are supplied. Explicit URL sort and direction are preserved.
- `npm run typecheck` passed in `pos-ui`.
- Commit `d33d14b427d598c548642e848b78b807bcdb6e53` is deployed on both SKR and Demo; both public version APIs report the exact frontend/backend SHA. Post-deployment authenticated SKR Inventory request using the page's default stock-descending options returned 465, 456, 425, 422, and 400 units with readable source costs and matching Odoo quantities.
- The independent Odoo audit observed 7 mapped products with positive Shopfront cost and zero `standard_price`; source case quantity or cost semantics prevent a proven unit-cost write for these cases. The UI keeps displaying the source value directly.

## Limitations

- The count discrepancy between 5 and 4 ambiguous mappings appears to come from separate mapping/counting paths; exact mapping identities were not changed in this UI-only follow-up.
- This verifies Products and Inventory data/display only. Full Shopfront parity across Sales, Purchases, Suppliers, all source settings, and cost tax basis remains open.
