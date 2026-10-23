export type UiMode = "web" | "mobile";

const UI_MODE_KEY = "orithos-ui-mode";

export function getUiMode(): UiMode {
  if (typeof localStorage === "undefined") return "web";
  return localStorage.getItem(UI_MODE_KEY) === "mobile" ? "mobile" : "web";
}

export function setUiMode(mode: UiMode) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(UI_MODE_KEY, mode);
}

export function clearUiMode() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(UI_MODE_KEY);
}

function pathOf(href: string): string {
  return href.split("?")[0].split("#")[0];
}

/** Phone sessions: AI home, cashier, product lookup, stock list, and AI reports. */
export function isMobileAllowedPath(pathname: string): boolean {
  const path = pathOf(pathname);
  return (
    path === "/m" ||
    path === "/" ||
    path === "/finalise" ||
    path === "/products" ||
    path.startsWith("/products/") ||
    path === "/stock/list" ||
    path.startsWith("/stock/list/") ||
    path === "/reports/ai" ||
    path.startsWith("/reports/ai/") ||
    path === "/assistant" ||
    path.startsWith("/assistant/") ||
    path === "/sommelier" ||
    path.startsWith("/sommelier/") ||
    path === "/recommend" ||
    path.startsWith("/recommend/") ||
    path === "/invoices/scan" ||
    path.startsWith("/invoices/") ||
    path === "/stock/stocktake" ||
    path.startsWith("/stock/stocktake/") ||
    path === "/stock/transfers" ||
    path.startsWith("/stock/transfers/")
  );
}

export function isMobileAllowedHref(href: string): boolean {
  return isMobileAllowedPath(pathOf(href));
}
