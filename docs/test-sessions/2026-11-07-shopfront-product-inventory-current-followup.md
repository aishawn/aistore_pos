# Shopfront Product and Inventory Live Follow-up

- Date: 2026-11-07
- Database: `aipos_uat`
- Store scopes: SKR and Demo
- Base runtime: `0a15fe5810053b064343e9fe6824b17e6006509b` on both hosts
- Candidate: local UI-only change on `main`; deployment pending

## Read-only Findings

- Authenticated `/api/odoo/records` queries on SKR and Demo returned the same Shopfront coverage: 10,849 ACTIVE products, 10,849 mapped, 0 unmapped, 4 ambiguous references, 10,849 inventory-covered products, 51,512 positive units, and 5,373 negative rows.
- The source snapshot timestamp was `2026-11-06T18:13:31.444091`. This is an Odoo-mirrored Shopfront snapshot, not a direct live read from Shopfront.
- `-196 LEMON P/F 6% 330ML` maps to one canonical Odoo product. Shopfront quantity and Odoo quantity are both 128 (4 cases plus 8 items; case quantity 30). Shopfront cost field is 116.75, Shopfront price is 8.99, and 30-day Shopfront sales quantity is 109. Odoo `standard_price` is 123.87.
- The same-name Odoo inventory query returned two saleable variants, with quantities 0 and 128. The zero-quantity variant is outside the canonical Shopfront product-page mapping. Odoo's saleable-variant inventory report is not the Shopfront ACTIVE product list.
- Inventory report sync metadata reports `partial`, run 294, coverage through `2026-11-06`, updated `2026-11-07T05:25:17.882Z`. The direct Shopfront crawler health, status, and coverage endpoints timed out; active crawler job state and a newer full source snapshot were not available.
- Cost differences were left unchanged because purchase-tax and unit-basis evidence is not verified. No business data was written.

## Candidate UI Change

- The Odoo inventory report now labels its company/warehouse snapshot in the page subtitle and provides a direct Products link. The Products page remains the Shopfront-mapped catalogue with category, source cost, inventory, price, 30-day performance, and actions, alongside Odoo stock/cost context.

## Verification

- `node --experimental-strip-types --test src/lib/shopfront-catalogue.test.ts`: PASS, 4/4.
- `npm run typecheck`: PASS.
- `npx eslint src/components/OdooProductCataloguePage.tsx`: PASS, 0 errors and 9 existing `react-hooks/set-state-in-effect` warnings.
- `git diff --check`: PASS.
- Runtime deployment of the candidate and full current Shopfront-to-Odoo row parity: NOT VERIFIED.
