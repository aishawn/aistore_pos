# SKR and Demo store UI parity

## Scope and changes

Owner requested that both customer-trial stores use Odoo supplier management and that similar store-specific UI substitutions be checked.

- Removed ShopfrontPurchasingGate from OdooSupplierDirectoryPage. Both /suppliers and /suppliers/odoo now mount the same Odoo supplier management component for every store.
- Removed the same gate from OdooPurchaseOrdersPage. Purchasing orders, /orders and /reports/purchase now use the Odoo purchase-order component for every store, including embedded views. Transfer tabs continue to be handled by the native component.
- No supplier, order, stock or tenant configuration data was changed. Existing company-scoped Odoo queries remain in place. Shopfront archive code/data is retained, but no longer replaces these operational pages. Historical archive orders are not converted to receivable Odoo orders.

## Other surfaces inspected

Tracked-source searches covered pos-ui/app, pos-ui/src/components, pos-ui/src/lib and pos-api/src/main for Shopfront references, archive-prefix conditions, host/subdomain checks and explicit SKR/Demo branches.

- Products, customers, Sell and stocktake entry routes use common Odoo components or redirects. PurchasingWorkspace uses shared permission-based tabs.
- No other SKR-specific operational page replacement was found in these searches. This is a source audit, not an authenticated visual comparison of every route.
- Platform demo-reset and the platform console's Demo link intentionally identify Demo. They are platform administration behavior, not alternate store business pages.
- Existing legacy/retired routes and archive APIs remain; their presence is not evidence that live store workflows use them. Business permissions, company configuration, module availability and records can still legitimately differ between stores.

## Verification and trial limitations

- Node 24.19.0 TypeScript --noEmit passed before and after latest-main integration. Targeted component ESLint passed with zero errors and four pre-existing effect warnings; replenishment route lint passed. No local application build was run.
- Latest-main integration contained a missing closing bracket in the replenishment sales-history RPC argument list. Corrected that syntax and repeated integrated typecheck before push.
- Existing scripts/audit-tenant-scope.mjs passed: 78 controllers, zero findings. Evidence: UAT_TENANT_SCOPE_AUDIT_1793550780585.json. This heuristic static audit does not prove live tenant isolation.
- Both public version endpoints returned frontend/backend 46ae01309c918d7048975c62251e6ac412c87b5a during this audit. This predates the changes above.
- Both public UAT context endpoints returned isolated=false. Existing project status describes shared aipos_uat; these stores must not be described as verified isolated customer production environments.
- Authenticated live supplier counts, purchase visibility and create/receive permissions were not verified: no usable trial login credentials were available in this checkout/environment. No business writes were performed.
- After deployment, verify matching runtime SHA on both hosts, common Suppliers/Purchasing UI, each store's company binding and supplier completeness, purchase filters/detail, and cross-tenant access with authorized accounts. Run actual trial transaction acceptance only within the approved environment and scope. UI parity alone is not customer-trial acceptance.
