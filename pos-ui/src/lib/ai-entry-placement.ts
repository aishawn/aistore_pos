const HEADER_AI_ROUTES = new Set([
  "/",
  "/register/odoo",
  "/close",
  "/finalise",
  "/overview",
  "/reports/dashboard",
  "/pricelists",
  "/orders/receive/new",
  "/products/odoo",
  "/customers/odoo",
  "/customer-groups",
  "/suppliers/odoo",
  "/purchases/odoo",
  "/stock/list",
  "/stock/capped-pricing",
  "/stock/bulk-price-edit",
  "/stock/price-suggestions",
  "/stock/replenishment",
  "/stock/stocktake",
  "/stocktake",
]);

const HEADER_ONLY_AI_ROUTES = new Set([
  "/overview",
  "/reports/dashboard",
  "/pricelists",
  "/register/odoo",
  "/close",
  "/orders/receive/new",
  "/products/odoo",
  "/customers/odoo",
  "/customer-groups",
  "/suppliers/odoo",
  "/purchases/odoo",
  "/stock/list",
  "/stock/capped-pricing",
  "/stock/bulk-price-edit",
  "/stock/price-suggestions",
  "/stock/replenishment",
  "/stock/stocktake",
  "/stocktake",
]);

function isSupplierEditorRoute(pathname: string): boolean {
  return pathname === "/suppliers/new" || /^\/suppliers\/[^/]+\/(?:edit|assign)$/.test(pathname);
}

export function usesHeaderAiEntry(pathname: string): boolean {
  return HEADER_AI_ROUTES.has(pathname) || isSupplierEditorRoute(pathname);
}

export function showsFloatingAiLauncher(pathname: string): boolean {
  return !HEADER_ONLY_AI_ROUTES.has(pathname) && !isSupplierEditorRoute(pathname);
}
