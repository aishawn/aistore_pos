# Workspace menu design and implementation

## Navigation

- Products → More → Catalogue / Inventory / Stocktake. Each opens a dialog. Existing management/import/export actions remain available after these entries.
- Purchases → Orders / Invoices / Suppliers / Replenishment. More → Stock Transfers retains the existing transfer workspace.
- Stock sidebar now contains Products and Purchasing; the duplicate standalone Suppliers entry is removed. Supplier permissions and the existing supplier URL remain available.
- Sell upper-right toolbar → Sales → Sales history / Sales lines / Payments / Refunds / Current session. Each opens a dialog without navigating away from Sell.

## Data meaning

- Catalogue lists product variants and company-level stock quantities. Inventory lists individual internal-location stock records with on-hand, reserved and available quantities. One product can have multiple location/lot/owner records, or no inventory record; product and inventory record counts are not expected to match.
- Sales history reuses the existing receipt browser. Sales lines lists individual receipt items. Payments lists payment transactions; split tender can produce multiple payments per receipt. Refunds reuses history with its existing Refunded filter. Current session displays and refreshes the selected register's open session without opening or closing a session.
- New lists read live Odoo models only, scoped to the tenant company; Inventory additionally applies the bound stock location or warehouse. They do not expose staging/crawler tables or reconcile the earlier migration counts. Historical staging data visibility still depends on its approved import into the live Odoo store.
- Read-only lists have server-side search, 40-row pagination, retry and loading/empty states. Sales lists also support time-period filtering. Permission checks are enforced server-side as well as at the menu entry.

## Minimal-change boundaries

Reuse the purchasing workspace, supplier directory, sales-history provider and stock dialog. Add one allowlisted read endpoint and one shared list panel for the missing read views. Preserve existing checkout, refund, stocktake, transfer and purchasing write flows. No Java/backend changes, business writes or local application builds.

## Verification

- Node 24 TypeScript and targeted ESLint pass.
- Real route with in-memory RPC transport: 14 passing checks for permissions, company/warehouse scope, search, pagination, metadata, invalid filters and sanitized provider failures. Evidence: `UAT_WORKSPACE_RECORDS_ROUTE_LOCAL_2026-11-02.json`.
- Intercepted Chromium UI fixtures: 44 passing checks across 390px and 1440px for menu order, dialogs, pagination, error/retry availability, Refunded filter, session refresh, viewport/menu fit, a single Suppliers navigation entry and nonempty cart persistence. Purchases More opens toward the available screen space on narrow screens. Evidence: `UAT_WORKSPACE_MENUS_LOCAL_2026-11-02.json`.
- Sales dropdown follow-up: reproduced clipping on both viewports using `elementFromPoint` hit checks for every menu item. The toolbar's `overflow-x-auto` clipped the absolutely positioned dropdown. Removed that overflow, allowed the register selector to shrink, kept Sales from shrinking, and raised the header stacking context above the sale panels. All five item centers now hit the actual buttons; screenshot evidence: `screenshots/workspace-menus-2026-11-02/sales-dropdown-390.png` and `sales-dropdown-1440.png`. The previous existence/order/modal tests alone did not detect clipping.
- Fixtures prove UI/route behavior only. They do not establish live imported-data completeness, business acceptance or deployment identity. Deployment verification is recorded separately when available.
