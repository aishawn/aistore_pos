# Odoo Inventory Scope Label Check

- Date: 2026-11-07
- Scope: purchasing tab presence, inventory product-count scope, and positive stock quantity definition.
- Runtime before this wording follow-up: SKR, Demo, and App `/api/public/version` returned frontend/backend SHA `358c0b7527489389e54847b6e7b799d8d61f2986`, built `2026-11-06T17:51:59Z`.
- Screenshot timestamps: `2026-11-06T06:19Z` to `06:22Z`, before the runtime build. That deployed source removes `Receipts · To receive` and redirects `/purchases?state=purchase` to `/purchases`.
- Count scope: Shopfront's 10,849 is an active source-product count; Odoo's 13,292 is a count of `product.product` records in the store company where `available_in_pos = true`. These are not one-to-one scopes; the 2,443 difference does not establish duplicates or missing records. The UI now calls these Odoo POS-enabled variants.
- Quantity scope: the helper sums only positive Odoo `qty_available` values and separately counts negative variants. It reports `Mixed units` rather than adding across multiple UOMs. Thus the screenshot's 50,992 is a positive Odoo quantity for that captured snapshot, not a net quantity or a verified Shopfront quantity.
- Existing Shopfront audit quantity 51,526 came from a stale snapshot; live row-level Shopfront-to-Odoo matching and current quantity parity remain NOT VERIFIED.
- Checks: `node --experimental-strip-types --test src/lib/inventory-report.test.ts` PASS, 7/7; `git diff --check` PASS. Node was `22.22.2`, below the project-declared Node 24 engine. No local build, authenticated row-level comparison, or business writes.
