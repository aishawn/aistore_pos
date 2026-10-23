import type { AssistantCard } from "@/lib/api";

export interface AssistantCardCta {
  label: string;
  href: string;
}

const workflowLabels: Record<string, string> = {
  "/classifications": "Open classifications",
  "/customer-groups": "Open customer groups",
  "/customers/balances": "Open customer balances",
  "/customers/odoo": "Open customers",
  "/giftcards": "Open gift cards",
  "/invoices": "Open supplier invoices",
  "/invoices/scan": "Open supplier invoices",
  "/invoices/new": "Scan supplier invoice",
  "/orders": "Open orders",
  "/pricelists": "Open price lists",
  "/products/odoo": "Open products",
  "/sommelier": "Open wine recommendations",
  "/recommend": "Open recommendations",
  "/recommend/grocery": "Open grocery recommendations",
  "/stock/bulk-price-edit": "Open bulk price review",
  "/stock/buying-periods": "Open buying periods",
  "/stock/capped-pricing": "Open price review",
  "/stock/replenishment": "Open replenishment",
  "/stocktake": "Open stocktake",
};

const INTERNAL_ORIGIN = "https://orithos.invalid";
const FORBIDDEN_ASSISTANT_ROOTS = new Set(["/admin", "/platform", "/internal", "/debug", "/api"]);
const odooRouteByLegacyRoot: Record<string, string> = {
  "/customers": "/customers/odoo",
  "/products": "/products/odoo",
};

export function normalizeAssistantHref(value: string | null | undefined): string | null {
  const href = value?.trim();
  if (
    !href
    || !href.startsWith("/")
    || href.startsWith("//")
    || /[\\\u0000-\u001f\u007f]/.test(href)
    || /%(?:2f|5c)/i.test(href)
  ) return null;

  try {
    const parsed = new URL(href, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN) return null;
    let decodedPathname = parsed.pathname;
    for (let depth = 0; depth < 3; depth += 1) {
      const root = `/${decodedPathname.split("/")[1] || ""}`.toLowerCase();
      if (FORBIDDEN_ASSISTANT_ROOTS.has(root)) return null;
      const decoded = decodeURIComponent(decodedPathname);
      if (decoded === decodedPathname) break;
      if (/[\\\u0000-\u001f\u007f]/.test(decoded)) return null;
      decodedPathname = decoded;
    }
    if (/%[\da-f]{2}/i.test(decodedPathname)) return null;
    const pathname = odooRouteByLegacyRoot[parsed.pathname] || parsed.pathname;
    return `${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function resolveAssistantCardCta(card: AssistantCard): AssistantCardCta | null {
  const suppliedLabel = card.cta?.label?.trim() || card.ctaLabel?.trim();
  const href = normalizeAssistantHref(card.cta?.route || card.ctaRoute);
  if (!suppliedLabel || !href) return null;

  const label = /^open workflow$/i.test(suppliedLabel)
    ? workflowLabels[href.split(/[?#]/, 1)[0]] || "Open page"
    : suppliedLabel;
  return { label, href };
}
