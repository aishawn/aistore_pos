# Inventory Count and Unit Scope

Date: 2026-11-06

## Scope

Read-only review of the supplied Shopfront and POS screenshots, inventory aggregation implementation, and deployed runtime identity. No business data was written.

## Evidence

- SKR and Demo `GET /api/public/version`: frontend/backend SHA `2c3784a71484472f70ec0d1faea7e20a0df9b9e6`, built at `2026-11-06T08:25Z`.
- Screenshot Shopfront catalogue: 10,849 active product results.
- Screenshot POS inventory: 13,292 Odoo products and 50,992 available units, with 5,379 negative-stock products.
- Odoo Products query uses `product.product` within the bound company and configured saleable domain. Inventory report uses its complete matching snapshot. These record scopes are not equivalent to Shopfront active catalog products.
- `inventoryTotals` sums only positive `qty_available` balances, separately counts negative rows, and returns `Mixed units` when the result uses more than one UOM. So 50,992 is the screenshot snapshot's positive Odoo quantity; it is not net quantity and is not proven equal to Shopfront stock.
- Archived Shopfront audit evidence from the prior run: active catalog 10,849, inventory snapshot 10,852, complete flag true, positive quantity sum 51,650. Current Shopfront coverage request timed out; the archived figures have not been used as a fresh comparison.

## Changes and Checks

- Clarified UI footer labels to `Odoo saleable variants` and `Odoo positive stock units`; negative-stock rows remain separately reported.
- Shopfront product history now labels its active product count and states that it is not directly comparable with Odoo variants.
- `node --experimental-strip-types --test src/lib/inventory-report.test.ts`: PASS, 7/7.
- `npm run typecheck`: NOT RUN successfully; this worktree has no `tsc` executable (`tsc is not recognized`). No local app build was run, consistent with the project preference.
- `git diff --check`: PASS.
- Post-push read-only runtime check: SKR and Demo both report frontend/backend SHA `0a5b067876934fc009237dcadb1bb4fc158b4872`, confirming the UI label candidate deployed. A later documentation-only commit does not change the runtime code.

## Limits

No authenticated source-ID/product-level match or same-snapshot Odoo-versus-Shopfront quantity reconciliation was completed. The accuracy of the captured 50,992 against current live data is therefore not established. No catalog or stock writes were performed.
