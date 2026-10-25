# POS Dark Mode Audit

## Scope

The local Playwright audit uses the POS preview session and captures dark mode at 390px, 768px, and 1440px. Screenshots are stored under `pos-ui/temp/dark-*.png`.

Audited routes:

- `/dashboard`
- `/dashboard/workspace`
- `/register/odoo`
- `/stock/list`
- `/assistant`
- `/reports/dashboard`
- `/settings/account`
- `/products/odoo`
- `/customers/odoo`
- `/purchases/odoo`
- `/suppliers/odoo`
- `/history/odoo`
- `/orders`
- `/settings/payment`
- `/platform/audit`
- `/platform/operations`
- `/m`
- `/finalise`
- `/close`
- `/manage-cash`
- `/customers`
- `/products`
- `/products/new`
- `/reports/sales`
- `/reports/inventory`
- `/reports/purchase`
- `/reports/closures`
- `/settings/hardware`
- `/settings/receipts`
- `/settings/registers`
- `/platform/stores`
- `/recommend`
- `/sommelier`
- `/classifications/brand/1` (redirects to the catalogue categories route in the fixture)
- `/customer-groups/1/view` (redirects to customer group management in the fixture)
- `/suppliers/new`
- `/stock/more`
- `/stock/capped-pricing`
- `/stock/bulk-price-edit`
- `/stock/buying-periods`
- `/customers/1/payment`
- `/settings/data`
- `/settings/keys`
- `/settings/tax`
- `/reports/ai/metrics`
- `/invoices/scan`
- `/orders/new`, `/orders/manual`, `/orders/1/view`, `/orders/1/edit`
- `/orders/receive/new`, `/orders/return/new`, `/orders/transfer/new`, `/orders/credit/new`
- `/products/1/view`, `/products/1/edit`, `/products/merge`
- `/customers/new`, `/customers/1/edit`, `/customers/merge`, `/customers/balances`
- `/suppliers/1/edit`, `/suppliers/1/assign`
- `/stock/import-supplier-products`, `/stock/external-stocktake`, `/stock/price-suggestions`, `/stock/transfers/new`
- `/stocktake/express`, `/stocktake/external`
- `/settings/devices`, `/settings/integrations`, `/settings/users`, `/settings/roles`, `/settings/store`, `/settings/statements`
- `/reports/actions`, `/reports/daily-sales`, `/reports/transfer`, `/reports/weekly-sales`, `/reports/last-week-sales`, `/reports/last-month-sales`, `/reports/this-month-sales`, `/reports/misc`
- `/invoices/1`, `/invoices/new`, `/platform`, `/platform/failures`, `/platform/usage`, `/pricelists`
- `/promotions`, `/promotion/categories`, `/giftcards`, `/giftcards/import`
- `/utilities/products`, `/utilities/customers`, `/utilities/barcodes`, `/utilities/future-costs`, `/utilities/future-prices`, `/utilities/mail-log`, `/utilities/trashed-items`, `/utilities/vendor-connections`
- Remaining settings groups under `/settings/company/*`, `/settings/outlets/*`, `/settings/registers/*`, plus loyalty, push, pricesets, surcharging, customer display, rules, transferees, and additional information.
- `/reports/ai/1`, `/reports/closures/1`, `/stocktake/express/1`, and classification assignment.
- `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/security`, `/enterprise`, `/auth/bootstrap`, `/media`, `/tickets`, `/overview`, `/overview/workspace`, `/register`, `/register/classic`, `/reports/favourites`, `/suppliers`, `/recommend/grocery`, `/sommelier/find`, and `/sommelier/identify`.

The audit checks the document theme state, light-surface remnants, text content, loading states, and responsive layout. The fixture blocks business writes and returns deterministic read data. The latest full run recaptured the route matrix at 390px and 1440px (362 captures); only `/suppliers/1` returned the known fixture 404, and no route returned a 5xx.

## Fixes Applied

- Added early `<html>` theme initialization and `ThemeProvider` persistence using `orithos-theme=light|dark`.
- Added Light/Dark controls to the user menu with 44px minimum touch targets, pressed state, labels, focus styles, and reduced-motion handling.
- Added semantic brand surface, text, border, status, selection, scrollbar, and print tokens in `app/globals.css` and `app/brand-tokens.css`.
- Added compatibility rules for remaining legacy `bg-white`, gray utility, black text, and black border classes while pages migrate to semantic variables.
- Updated login and account/security cards, fields, notices, and icon surfaces.
- Added dark overlays for workspace and AI assistant artwork; source images remain unchanged.
- Updated dashboard, report, register, and product-catalogue loading skeletons to use semantic dark-aware surfaces.
- Fixed the Next route config re-export used by `/register` and `/purchases`, and replaced a register-page root anchor with `Link`.
- Replaced remaining sales-screen hard-coded surfaces in `SellPad`, `CartSidebar`, and the Odoo sell catalog/cart/parked/payment components with semantic `oh-*` variables. Product browse tiles now use shared navy/action tokens and promotion savings use the shared success token.
- Replaced fixed light sidebars and gray content surfaces in product creation, supplier creation, classification detail, customer-group detail, generic tables, and the fallback page scaffold with semantic theme variables. Added a shared scrim token for full-screen product dialogs.
- Replaced the AI report result table's arbitrary light-gray stripe with semantic elevated/muted surfaces.
- Added legacy utility mappings for neutral/slate/gray 800-900 text, 300-400 borders, and neutral/gray hover surfaces. This fixes the shared Stock Tools card hub in both desktop and mobile dark screenshots.
- Added `--oh-surface-inverse` for dark-safe inverse surfaces and used it for capped-pricing headers, customer initials, and product browse tiles.
- Re-ran the Stock Tools, Capped Pricing, Receivables, Data, and invoice-scan captures at 390px; cards, controls, status panels, and fixed action bars remain readable without page-level horizontal overflow.
- Audited order creation/receiving/returns/transfers, product and customer editor routes, supplier assignment, stock import/stocktake flows, settings subpages, and report subpages at 390px and 1440px. Replaced remaining white dropdown, tab, and content surfaces in `EditProductPage` with semantic surfaces.
- Audited the remaining platform, invoice, price list, promotion, gift card, utility, settings, and report detail routes at 390px and 1440px. The remaining `bg-white`/`text-black` counts are limited to intentional control internals or fixture loading states; no visible light page surfaces were found in the screenshots.
- Audited public/auth entry points, classic register, overview aliases, stocktake aliases, supplier/catalogue entry points, and recommendation flows at 390px and 1440px. Login and signup retain readable dark forms and orange actions without requiring dark-specific raster assets.
- Pixel-level screenshot review found and fixed translucent light-mode status panels (`bg-sky-50/70`, `bg-amber-50/70`) across settings and utility pages, plus the classic register's `from-white` sale-key loading gradient. These now resolve to dark semantic info/warning surfaces and elevated POS surfaces.
- Added compatibility for remaining translucent white/blue borders and hover surfaces used by history, promotion, sommelier, and legacy admin components. Fixed the Overview Radial/Workspace switcher, whose selected pill had white text on a light background in dark mode.
- Migrated the remaining high-visibility white containers and controls in platform stores, platform usage/operations, manage-cash, tickets, and Sommelier wine details to semantic elevated surfaces.
- Rechecked media, tickets, manage-cash, forgot-password, reset-password, and Sommelier wine at 390px and 1440px; screenshots show dark surfaces, readable copy, and visible borders. The local preview auth path now preserves an injected fixture identity so platform-specific audit fixtures can represent operator roles without changing production authentication.
- Migrated recommendation and Sommelier home/find/identify surfaces, product cards, search controls, and mobile assistant entry controls from direct white backgrounds to semantic elevated surfaces.
- Fixed the local mobile route redirect/hydration defect: development preview sessions no longer enter control-plane routing on localhost, and `/m` renders its mobile shell while authentication hydrates.
- The mobile AI assistant launcher now repositions after viewport resize, scrolling, and asynchronous content insertion. It scores visible text and interactive controls and excludes itself from obstacle checks. Fresh 390px captures of user settings, product editing, classic register, and Sommelier wine show no launcher overlap with visible copy or controls; the audit reports any remaining geometric overlap.
- Fixed launcher overlap found in the full route sweep: the 44px mobile launcher now uses a clear gap in the top navigation when available, and the desktop launcher also scans visible controls before settling. Follow-up screenshots show no overlap on product/customer creation, reports, supplier creation, stock tools, and order forms at 390px and 1440px.
- Dark-mode screenshots showed deep-orange utility text was too dim on dark surfaces. Added a dark-only mapping for `text-[var(--oh-primary)]`, `text-[var(--oh-orange)]`, and `text-[var(--oh-orange-dark)]` to the brighter semantic link color; orange CTA surfaces and their white labels keep their existing colors. Rechecked reports, account settings, and the Odoo product catalogue at 390px and 1440px.
- The page-by-page pass found the product creation dialog still relied on literal white, amber, red, and blue classes and its floating Save control covered the next section on mobile. Migrated those surfaces and statuses to semantic brand variables, added the dark-aware info foreground token, and made Save a mobile bottom bar while retaining the desktop floating placement. Rechecked `/products/new` at 390px and 1440px.
- The AI report detail page still rendered gray filter panels, white loading/error surfaces, black table text, and fixed blue controls. Migrated the page to the shared surface, border, text, info, and inverse-surface tokens. Rechecked `/reports/ai/1` at 390px and 1440px; the gray blocks are now dark semantic panels with readable controls.
- Migrated shared `AdminPageLayout` cards, search/filter containers, count cards, action footers, and stat cards from literal white backgrounds to `oh-surface-elevated`. Rechecked customer, bulk-price, and AI metrics pages at both widths.
- Migrated the supplier creation dialog's inputs, select surfaces, dialog chrome, scrim, and error notice to semantic dark-aware tokens. Rechecked `/suppliers/new` at 390px and 1440px. The fixture still exposes its separate `items.map is not a function` dependency error.
- Migrated receive, return, and transfer stock forms' inputs, cards, headers, and warning/retry states from literal white and amber classes to semantic theme variables. Rechecked `/orders/receive/new`, `/orders/return/new`, and `/orders/transfer/new` at 390px and 1440px; forms remain readable with no launcher overlap.
- Migrated the legacy `CustomerMakePaymentPage` table and form tokens from black/white/fixed-blue styling to semantic surfaces, borders, text, and info action tokens. Added horizontal scrolling for the wide allocation table on mobile so its columns are not clipped. The routed Receivables fixture page was rechecked at both widths; its backend loading/error state remains dark and readable.

## Evidence Notes

The updated account, dashboard, workspace, assistant, reports, register, and stock screenshots show dark canvas surfaces, readable text, visible borders, and orange actions. Product and purchase/customer routes can remain at `Loading...` in the fixture when their backend-shaped responses are not available; those screenshots validate the loading state only and are not business-data acceptance.

No new background bitmap was required. Existing workspace and assistant artwork is retained and darkened with CSS overlays so logos and product imagery are not inverted.

The mobile captures show the payment tab strip as a horizontally scrollable control at 390px; this does not create page-level horizontal overflow. The `/m` route returns successfully but currently renders no substantive content in the preview fixture, so it remains an entry-point follow-up rather than a functional mobile workflow acceptance.

The `/m` blank result is reproducible in the local preview when the server-side `AppShell` has no authenticated user during the initial render; the preview cookie used by the audit does not hydrate the client branch in this dev setup. This is an authentication/preview harness limitation, not evidence of a dark-surface defect. Production authentication still needs a direct mobile-session check.

Several alias routes intentionally redirect to their canonical pages (for example `/overview` to `/dashboard`, `/settings` to the settings landing route, and `/stocktake` to the product stocktake tab). A few parameterized legacy paths return the app's 404 page in the fixture; those are route availability findings rather than dark-mode surface defects.

The production site was also audited with an administrator session supplied from the local environment; credentials were not printed or saved in this report. The read-only pass captured 181 routes at 390px and 1440px (362 route screenshots). No route produced a page JavaScript error or 5xx response. `/purchases`, `/suppliers/1`, and `/register` returned 404 at both widths. The audit record is `pos-ui/temp/prod-dark-audit.jsonl` and screenshots use the `prod-dark-*` prefix. The browser audit blocked business writes and allowed only the login flow and explicitly read-only Odoo searches.

Production screenshots still show light surfaces in parts of the reports, stock, account, product, customer, and assistant experiences. The checked-in UI changes and local fixture screenshots are evidence for the workspace version only; they do not establish that those fixes have shipped to production. Production API requests also returned 410 or 401 on several data routes (including gift cards), so some authenticated screens show incomplete data. Keep these as deployment/backend findings rather than treating fixture rendering as production acceptance.

The audit's automated contrast estimates are not a WCAG pass: its color parser does not reliably resolve `lab()` values, gradients, or layered surfaces. Use the screenshots for visual review and calculate contrast from resolved foreground/background colors before claiming the 4.5:1 and 3:1 thresholds. The local preview's `/m` content is covered by the later 390px/768px captures; production mobile behavior still needs a direct authenticated check.

## Validation

- `npm run typecheck` passed after the final launcher changes.
- `npm run lint` passed with 0 errors and 22 warnings across the repository; targeted ESLint also passed for `SellAiPanel.tsx`.
- `npm run build` passed with Next 16.2.1 using a temporary `NEXT_DIST_DIR`, which was removed after the build.
- After restoring dependencies from the lockfile, `npm run typecheck`, `npm run build`, and targeted ESLint passed again after the sales and admin surface fixes.
- `git diff --check` passed.

The remaining lint output consists of warnings in the existing repository, including React effect and dependency warnings. `node --check temp/dark-audit.mjs` and `git diff --check` also pass.

The first post-launcher audit caught a server-rendering error because the mobile icon size read `window` during render. The launcher now detects viewport size after mount and on resize, preserving a consistent server render. A fresh 20-capture pass across dashboard/workspace, reports, product/customer/supplier forms, stock tools, order forms, and invoice entry returned HTTP 200 with no browser errors and no `fabOverlaps` at 390px or 1440px.

`npm run build` passed after the server-rendering fix using an isolated temporary Next output directory; the generated directory and temporary `tsconfig.json` include entries were removed afterward.

Latest verification after the dark text mapping: `npm run lint` passed with 0 errors and 22 warnings, `npm run typecheck` passed, `npm run build` passed with an isolated `NEXT_DIST_DIR`, and `git diff --check` passed. The warnings are existing repository lint warnings.

The latest full local fixture sweep produced 362 route records (181 routes at 390px and 1440px), with no page errors, no AI launcher overlaps, and only the known fixture `/suppliers/1` 404 at both widths. The focused product-dialog recapture passed typecheck and showed no mobile CTA overlap.

The focused AI report recapture returned HTTP 200 at both widths, with no page errors or launcher overlap; targeted ESLint and typecheck passed after the migration.

The shared-layout and supplier-dialog recaptures returned HTTP 200 at both widths with no page errors or launcher overlap; targeted ESLint and typecheck passed.

The receive, return, and transfer form recaptures returned HTTP 200 at both widths with no page errors or launcher overlap; targeted ESLint and typecheck passed.

The payment-page visual migration passed targeted ESLint and typecheck; the routed fixture state returned HTTP 200 at both widths with no page errors or launcher overlap.

Migrated `BulkPriceEditPage` inputs, toggle, price cards, error popovers, toolbar, and desktop table header to semantic theme tokens. Migrated `AlertDialog` danger/info variants and dialog surface/scrim to semantic dark-aware tokens. Rechecked bulk price edit at 390px and 1440px; targeted ESLint and typecheck passed.

Migrated shared `AsyncState` and `AsyncDependencyNotice` loading, empty, error, and retry surfaces to semantic status tokens. Migrated `AiMetricsPage` cards, controls, warning/error notices, and panels from literal white/amber/red surfaces. Rechecked AI metrics at 390px and 1440px; targeted ESLint and typecheck passed.

After the shared-layout and supplier-dialog changes, an isolated `NEXT_DIST_DIR` production build completed successfully. The temporary output and generated `tsconfig.json` entries were removed afterward.

Migrated `AssignClassificationPage` and `AssignSupplierPage` product panes, alternating product rows, toggle knobs, and back-button hover surfaces from literal white to `oh-surface-*` semantic tokens. Rechecked both assignment views at 390px and 1440px; targeted ESLint and typecheck passed.

Migrated `CustomerGroupViewPage` summary/actions, `CreateStockTransferPage` cards, inputs, status notices, and result hover state, plus `CustomerMakePaymentModal` controls from literal white/neutral/hex styling to semantic surface, text, status, border, and focus tokens. Rechecked customer-group and stock-transfer routes at 390px and 1440px; targeted ESLint, typecheck, and `git diff --check` passed.

Migrated `CustomerMergePage`, `SupplyChainPage`, `ScanInvoicePage`, `CustomerViewPage`, and `StockListPage` from white containers and literal amber/rose/sky controls to semantic elevated/surface/status tokens. Rechecked stock, customer view, invoice scan, and customer merge route captures at 390px and 1440px; the fixture customer-merge path resolves to the customer directory, so its screenshot validates the resolved route while source lint/typecheck cover the merge component. Targeted ESLint and typecheck passed.

Migrated the shared `SettingsScaffold`, `CreateCustomerPage`, `InvoiceScanDetailPage`, and `ExpressStocktakePage` controls, cards, dialogs, inputs, and success/error states to semantic theme tokens. Rechecked settings general, customer creation, invoice detail, and express stocktake routes at 390px and 1440px; targeted ESLint and typecheck passed, with only pre-existing InvoiceScanDetail Hook dependency warnings.

Migrated `ProductMergePage`, `OrderViewPage`, `InvoiceScansListPage`, `ProductBuyingPeriodsPage`, and `EditCustomerGroupPage` dialogs, cards, forms, status badges, and empty states to semantic dark-aware tokens. Rechecked product merge, order view, and invoice list routes at 390px and 1440px; the fixture customer-group edit path resolves to the customer directory, while its source migration is covered by targeted ESLint and typecheck.

Migrated `OdooStocktakePanel`, `CreateOrderPage`, `CreateCreditNotePage`, and `EditSaleKeysPage` inputs, cards, retry states, status badges, and action bars to semantic surface/status/focus tokens. Rechecked order creation, credit note, and express stocktake routes at 390px and 1440px; targeted ESLint and typecheck passed.

Migrated `ReportBuilder` refresh/filter controls, summary cards, report-definition panel, table surface, header, and error state to semantic dark-aware tokens. Targeted ESLint, typecheck, and `git diff --check` passed.

Migrated shared `Modal` and `ConfirmDialog`, `ViewAllStatementsModal`, `CreatePriceListModal`, and `StockTransfersPage` dialogs, fields, empty states, retry controls, and headers to semantic dark-aware tokens. Targeted ESLint and typecheck passed; only existing ViewAllStatements effect warnings remain.

Migrated shared filter dropdowns, multi-selects, date pickers, empty state, capped pricing, and classification surfaces to semantic elevated/muted surfaces with theme-aware text and focus colors. Migrated supplier import, edit order, product view, gift-card/product import, customer statements, catalogue details, stocktake/export modals, create product/customer wizard surfaces, and Odoo category form controls. Targeted ESLint, full `npm run lint`, `npm run typecheck`, and `git diff --check` passed.

Migrated the remaining shared admin import/export modals, entity form fields, pagination, segmented controls, classification selectors, order filters, stock workspace dialog, list table striping, and filter select controls. Rechecked `/products/odoo`, `/customers/odoo`, `/history/odoo`, `/stock/replenishment`, `/close`, and `/settings/users` at 390px and 1440px. All returned HTTP 200 with no page errors or assistant launcher overlaps; screenshots show dark surfaces, readable controls, visible borders, and intentional fixed close-register action bar. Legacy literal `bg-white` classes still present in several older Odoo screens are covered by the dark compatibility mapping in `app/globals.css`; no white surface defect appeared in the captures.
