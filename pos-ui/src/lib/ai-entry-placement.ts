const HEADER_AI_ROUTES = new Set([
  "/",
  "/finalise",
  "/products/odoo",
  "/customers/odoo",
  "/suppliers/odoo",
  "/purchases/odoo",
  "/stock/list",
  "/stock/capped-pricing",
  "/stock/bulk-price-edit",
  "/stock/price-suggestions",
  "/stock/replenishment",
  "/stock/stocktake",
]);

const HEADER_ONLY_AI_ROUTES = new Set([
  "/products/odoo",
  "/customers/odoo",
  "/suppliers/odoo",
  "/purchases/odoo",
  "/stock/list",
  "/stock/capped-pricing",
  "/stock/bulk-price-edit",
  "/stock/price-suggestions",
  "/stock/replenishment",
  "/stock/stocktake",
]);

export function usesHeaderAiEntry(pathname: string): boolean {
  return HEADER_AI_ROUTES.has(pathname);
}

export function showsFloatingAiLauncher(pathname: string): boolean {
  return !HEADER_ONLY_AI_ROUTES.has(pathname);
}
