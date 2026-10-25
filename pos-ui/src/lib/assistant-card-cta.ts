import type { AssistantCard } from "@/lib/api";

export interface AssistantCardCta {
  label: string;
  href: string;
}

const cardTitlesZh: Record<string, string> = {
  product_count: "商品目录",
  stock_history: "历史库存",
  guided_action: "操作指引",
  sommelier: "品鉴推荐",
  recommend: "商品推荐",
  pricing: "价格复核建议",
  replenishment: "补货建议",
};

const workflowLabelsZh: Record<string, string> = {
  "/": "打开工作区",
  "/classifications": "打开商品分类",
  "/customer-groups": "打开客户分组",
  "/customers/balances": "打开客户余额",
  "/customers": "打开客户目录",
  "/giftcards": "打开礼品卡",
  "/invoices": "打开供应商发票",
  "/invoices/scan": "打开供应商发票",
  "/invoices/new": "扫描供应商发票",
  "/orders": "打开采购订单",
  "/pricelists": "打开价目表",
  "/products": "打开商品目录",
  "/sommelier": "打开品鉴推荐",
  "/recommend": "打开商品推荐",
  "/recommend/grocery": "打开商品推荐",
  "/stock/bulk-price-edit": "打开批量改价",
  "/stock/buying-periods": "打开采购周期",
  "/stock/capped-pricing": "打开价格复核",
  "/stock/replenishment": "打开补货页面",
  "/stock/list": "打开库存列表",
  "/stocktake": "打开库存盘点",
  "/stock/stocktake": "打开库存盘点",
  "/purchases": "打开采购记录",
  "/stock/transfers": "打开库存调拨",
  "/stock/transfers/new": "创建库存调拨",
};

export function assistantCardTitle(type: string, fallback: string, chinese: boolean): string {
  return chinese ? cardTitlesZh[type] ?? fallback : fallback;
}

export function assistantCardCtaLabel(cta: AssistantCardCta, chinese: boolean): string {
  if (!chinese) return cta.label;
  const pathname = cta.href.split(/[?#]/, 1)[0];
  return workflowLabelsZh[pathname] ?? "打开页面";
}

const workflowLabels: Record<string, string> = {
  "/classifications": "Open classifications",
  "/customer-groups": "Open customer groups",
  "/customers/balances": "Open customer balances",
  "/customers": "Open customers",
  "/giftcards": "Open gift cards",
  "/invoices": "Open supplier invoices",
  "/invoices/scan": "Open supplier invoices",
  "/invoices/new": "Scan supplier invoice",
  "/orders": "Open orders",
  "/pricelists": "Open price lists",
  "/products": "Open products",
  "/sommelier": "Open wine recommendations",
  "/recommend": "Open recommendations",
  "/recommend/grocery": "Open grocery recommendations",
  "/stock/bulk-price-edit": "Open bulk price review",
  "/stock/buying-periods": "Open buying periods",
  "/stock/capped-pricing": "Open price review",
  "/stock/replenishment": "Open replenishment",
  "/stock/list": "Open stock list",
  "/stocktake": "Open stocktake",
  "/stock/stocktake": "Open stocktake",
  "/purchases": "Open purchases",
  "/stock/transfers": "Open transfers",
  "/stock/transfers/new": "Create transfer",
};

const INTERNAL_ORIGIN = "https://orithos.invalid";
const FORBIDDEN_ASSISTANT_ROOTS = new Set(["/admin", "/platform", "/internal", "/debug", "/api"]);
const odooRouteByLegacyRoot: Record<string, string> = {
  "/customers": "/customers",
  "/products": "/products",
};

export function assistantSaleActionHref(action: string | null | undefined): string {
  const normalized = action?.trim().toLowerCase();
  if (normalized === "create customer") return "/customers";
  if (normalized === "create product") return "/products";
  return "/";
}

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
