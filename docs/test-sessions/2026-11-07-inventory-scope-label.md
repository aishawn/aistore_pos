# Odoo Inventory Scope Label Check

- Date: 2026-11-07
- Scope: purchasing tab presence, inventory product-count scope, and positive stock quantity definition.
- Runtime before this wording follow-up: SKR, Demo, and App `/api/public/version` returned frontend/backend SHA `358c0b7527489389e54847b6e7b799d8d61f2986`, built `2026-11-06T17:51:59Z`.
- After pushing the label clarification to `main`, read-only version checks on SKR, Demo, and App returned frontend/backend SHA `2aead338d7669d2821513c5e57d926500d0e93d2`, confirming automatic deployment.
- Screenshot timestamps: `2026-11-06T06:19Z` to `06:22Z`, before the runtime build. That deployed source removes `Receipts · To receive` and redirects `/purchases?state=purchase` to `/purchases`.
- Count scope: Shopfront's 10,849 is an active source-product count; Odoo's 13,292 is a count of `product.product` records in the store company where `available_in_pos = true`. These are not one-to-one scopes; the 2,443 difference does not establish duplicates or missing records. The UI now calls these Odoo POS-enabled variants.
- Quantity scope: the helper sums only positive Odoo `qty_available` values and separately counts negative variants. It reports `Mixed units` rather than adding across multiple UOMs. Thus the screenshot's 50,992 is a positive Odoo quantity for that captured snapshot, not a net quantity or a verified Shopfront quantity.
- Existing Shopfront audit quantity 51,526 came from a stale snapshot; live row-level Shopfront-to-Odoo matching and current quantity parity remain NOT VERIFIED.
- Checks: `node --experimental-strip-types --test src/lib/inventory-report.test.ts` PASS, 7/7; `git diff --check` PASS. Node was `22.22.2`, below the project-declared Node 24 engine. No local build, authenticated row-level comparison, or business writes.

## Correction

- The count-domain statement above is incorrect: the inventory report submits `catalogueView: "all"`, and `catalogueDomain("all")` filters `sale_ok = true`. It can include variants hidden from POS; `available_in_pos = true` is the separate default domain for the POS product catalogue. The screenshot's 13,292 therefore represents Odoo saleable product variants in its company/warehouse scope, not Shopfront ACTIVE products and not strictly POS-visible products.
- Code basis: `pos-ui/src/components/OdooProductCataloguePage.tsx` sends `catalogueView` for inventory requests; `pos-ui/src/lib/product-catalogue.ts` defines the all-products domain; `pos-ui/app/api/odoo/records/route.ts` applies that domain before computing inventory totals.
- This correction does not change the historical screenshot figures or upgrade the historical Shopfront/Odoo audit to a current live reconciliation.
