# Product catalogue improvements — 2026-10-24

The Odoo management catalogue at `/products/odoo` now supports finding product issues across the full active sale catalogue, including products hidden from POS. Cashier product queries retain their POS-only default.

## Delivered

- Server-side quick views: all sale products, zero stock, negative stock, zero base price, missing barcode, uncategorised and hidden from POS. Search and POS category compose with these filters before pagination. The management opt-in requires `stock.products.view`; existing company scoping remains in place.
- Desktop filter buttons and a compact mobile selector; clear filters restores the unfiltered first page. Pagination uses the server's `hasNext` rather than counting an extra client-side row.
- Product issue badges, actual Odoo inventory units and tax-inclusive standard sale prices. A failed/missing tax quote is explicitly marked “Tax unconfirmed”; base-price editing follows the existing Odoo tax configuration.
- Click a product name for details: SKU, barcode, categories, on-hand/available stock, unit and POS visibility; continue into the existing editor. Display names hide import markers as before.
- Search/filter changes remove stale row actions; revision checks discard obsolete responses, including quick query reversals. Error state and retry remain available.
- Pagination leaves room for the existing floating AI launcher. Details/create/edit/import dialogs use body portals above the launcher so their actions remain clickable.
- Creating a product resets the issue filter before searching for the new name.

## Verification

- Node 24.19.0 TypeScript no-emit and targeted ESLint: PASS. No local application build or Maven run.
- Real Next records route with in-memory transport: **13/13 PASS**. Checks cover search/category/domain composition, second-page boundaries, cashier defaults, invalid filters, product permission, cross-origin rejection and company isolation. Evidence: `UAT_PRODUCT_CATALOGUE_ROUTE_LOCAL_2026-10-24.json`.
- Local Playwright fixture at 320/390/768/1024/1440px: **107/107 PASS**, browser errors 0, business writes 0. Covers all quick views, pagination, empty/reset, tax labels, details, keyboard focus restoration, editing entry, stale search responses, query reversals, failure/retry, overflow and real modal button hit testing. Evidence: `UAT_PRODUCT_CATALOGUE_LOCAL_2026-10-24.json`; screenshots: `screenshots/2026-10-24-product-catalogue/`.
- Screenshots reviewed at desktop and mobile widths, including modal stacking. All browser APIs were intercepted; route tests used an in-memory transport. This is implementation/local verification, not live Odoo or deployed acceptance.

## Boundaries and release

No costs, margins, sales curves, supplier dimensions or case/bottle conversion are inferred. Packaging needs real package quantities/barcodes; margin needs cost permissions and verified tax treatment. Hidden from POS is distinct from archive/delete. Categories retain the existing category dataset; an unknown category ID is displayed explicitly rather than mislabelled uncategorised. Location-specific inventory remains a reporting/stocktake concern.

No `pos-api` changes, real business writes, build, commit, push or deployment. The checkout already contains extensive unrelated changes, including pre-existing edits in `odoo-api.ts`; those were preserved. Freeze and review a separate release scope before publishing. Pilot status is unchanged.
