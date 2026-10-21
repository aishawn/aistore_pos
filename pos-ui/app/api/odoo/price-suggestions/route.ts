import { NextRequest, NextResponse } from "next/server";
import { netMargin, suggestedListPrice, type SuggestionTax } from "@/lib/price-suggestion-math";
import { requireStoreAdmin, StoreAccessError } from "@/lib/store-access";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const HISTORY_DAYS = 28;
const PAGE_SIZE = 30;
const DEFAULT_MARGIN = 0.3;
const MIN_MARGIN = 0.05;
const MAX_MARGIN = 0.8;

type RpcEnvelope<T> = { result?: T; error?: { message?: string } };

function getBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Odoo connection must use HTTPS");
  return value;
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  const response = await fetch(`${getBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Odoo price suggestion data is unavailable");
  const payload = await response.json() as RpcEnvelope<T>;
  if (payload.error) {
    if (/session|authenticate|log in/i.test(payload.error.message ?? "")) throw new PriceSuggestionSessionExpiredError();
    throw new Error("Your Odoo account cannot read the product prices needed for suggestions.");
  }
  return payload.result;
}

class PriceSuggestionSessionExpiredError extends Error {}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}

function parseMarginTarget(raw: string | null): number {
  const value = Number(raw ?? DEFAULT_MARGIN);
  if (!Number.isFinite(value)) return DEFAULT_MARGIN;
  // Accept 30 or 0.30
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, normalized));
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return noStoreJson({ message: "Cross-origin requests are not allowed" }, 403);
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return noStoreJson({ message: "Odoo session expired" }, 401);

  const marginTarget = parseMarginTarget(request.nextUrl.searchParams.get("marginTarget"));
  const now = Date.now();
  const recentFrom = new Date(now - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

  try {
    await requireStoreAdmin(request);
    const sessionResponse = await fetch(`${getBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!sessionResponse.ok) throw new PriceSuggestionSessionExpiredError();
    const session = await sessionResponse.json() as RpcEnvelope<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    if (session.error || !session.result?.uid) throw new PriceSuggestionSessionExpiredError();
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, session.result);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) return noStoreJson({ message: forced.error }, forced.status);
    const companyId = forced.companyIds[0];
    if (!companyId) return noStoreJson({ message: "No Odoo companies are available to this user." }, 403);

    const salesBaseDomain = [
      ["order_id.company_id", "=", companyId],
      ["order_id.state", "in", ["paid", "done", "invoiced"]],
      ["order_id.date_order", ">=", recentFrom],
    ];

    const rawOffset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(rawOffset) || rawOffset < 0) return noStoreJson({ message: "Invalid page offset." }, 400);
    const context = { allowed_company_ids: [companyId], force_company: companyId };
    const products = await rpc<Array<Record<string, unknown>>>(sessionId, "product.product", "search_read", [[
      ["available_in_pos", "=", true], ["company_id", "=", companyId],
    ]], {
      fields: ["id", "name", "display_name", "default_code", "list_price", "standard_price", "qty_available", "uom_id", "taxes_id"],
      limit: PAGE_SIZE + 1, offset: rawOffset, order: "name asc, id asc", context,
    }) ?? [];
    const pageProducts = products.slice(0, PAGE_SIZE);
    const productIds = pageProducts.map((product) => Number(product.id));
    const taxIds = [...new Set(pageProducts.flatMap((product) => Array.isArray(product.taxes_id) ? product.taxes_id as number[] : []))];
    const [recentSales, taxes, companies] = await Promise.all([
      rpc<Array<{ product_id?: [number, string] | false; qty?: number }>>(
        sessionId,
        "pos.order.line",
        "read_group",
        [[...salesBaseDomain, ["product_id", "in", productIds]], ["qty:sum"], ["product_id"]],
        { limit: PAGE_SIZE, lazy: false, context },
      ),
      taxIds.length ? rpc<SuggestionTax[]>(sessionId, "account.tax", "search_read", [[
        ["id", "in", taxIds], ["company_id", "=", companyId], ["type_tax_use", "=", "sale"],
      ]], { fields: ["id", "amount", "amount_type", "price_include", "include_base_amount"], limit: taxIds.length, context }) : [],
      rpc<Array<{ name?: string }>>(sessionId, "res.company", "search_read", [[["id", "=", companyId]]], { fields: ["name"], limit: 1, context }),
    ]);

    const soldMap = new Map<number, number>();
    for (const row of recentSales ?? []) {
      if (Array.isArray(row.product_id) && Number.isFinite(Number(row.qty))) {
        soldMap.set(row.product_id[0], Number(row.qty));
      }
    }

    const taxById = new Map((taxes ?? []).map((tax) => [tax.id, tax]));
    async function buildSuggestion(product: Record<string, unknown>) {
      const id = Number(product.id);
      const listPrice = Number(product.list_price);
      const costRaw = Number(product.standard_price);
      const hasCost = Number.isFinite(costRaw) && costRaw > 0;
      const hasPrice = Number.isFinite(listPrice) && listPrice > 0;
      const cost = hasCost ? costRaw : null;
      const productTaxIds = Array.isArray(product.taxes_id) ? product.taxes_id as number[] : [];
      const productTaxes = productTaxIds.map((id) => taxById.get(id)).filter((tax): tax is SuggestionTax => Boolean(tax));
      const proposedList = productTaxes.length === productTaxIds.length ? suggestedListPrice(costRaw, marginTarget, productTaxes) : null;
      let currentNetPrice: number | null = null;
      let currentPrice: number | null = null;
      let currentGst: number | null = null;
      let suggestedNetPrice: number | null = null;
      let suggestedGst: number | null = null;
      let suggestedPrice: number | null = null;
      const taxReady = productTaxIds.length > 0 && productTaxes.length === productTaxIds.length
        && suggestedListPrice(1, marginTarget, productTaxes) !== null;
      if (hasPrice && taxReady) {
        const compute = async (price: number) => {
          const totals = await rpc<{ total_excluded: number; total_included: number }>(sessionId!, "account.tax", "compute_all", [productTaxIds, price, null, 1, id, false], { context });
          if (!totals || !Number.isFinite(totals.total_excluded) || !Number.isFinite(totals.total_included)
            || totals.total_excluded <= 0 || totals.total_included < totals.total_excluded) throw new Error("Odoo returned invalid tax totals.");
          return totals;
        };
        const current = await compute(listPrice);
        currentNetPrice = current.total_excluded;
        currentPrice = current.total_included;
        currentGst = Math.round((currentPrice - currentNetPrice) * 100) / 100;
        if (proposedList !== null && netMargin(currentNetPrice, costRaw)! + 0.005 < marginTarget) {
          const proposed = await compute(proposedList);
          suggestedPrice = proposed.total_included;
          suggestedNetPrice = proposed.total_excluded;
          suggestedGst = Math.round((suggestedPrice - suggestedNetPrice) * 100) / 100;
        }
      }
      const soldUnits = soldMap.get(id) ?? 0;
      const onHand = Number(product.qty_available ?? 0);
      const unit = Array.isArray(product.uom_id) ? String(product.uom_id[1]) : "Units";
      const currentMargin = hasCost && currentNetPrice !== null ? netMargin(currentNetPrice, costRaw) : null;
      const suggestedMargin = suggestedNetPrice !== null ? netMargin(suggestedNetPrice, costRaw) : null;
      let status: "ok" | "raise" | "review_cost" | "review_tax" | "missing_cost" | "unsaleable" = "ok";
      const reasonParts: string[] = [];

      if (!hasPrice) {
        status = "unsaleable";
        reasonParts.push("No shelf price in Odoo — keep unsaleable until the owner sets a price.");
      } else if (!hasCost) {
        status = "missing_cost";
        reasonParts.push("No cost in Odoo — cannot suggest a margin-based price. Do not invent a cost.");
      } else if (!taxReady) {
        status = "review_tax";
        reasonParts.push("Missing or complex Odoo sale tax configuration. Review it before calculating a shelf price; no GST rate is assumed.");
      } else if (currentMargin !== null && currentMargin + 0.005 < marginTarget) {
        status = "raise";
        reasonParts.push(`Current margin ${(currentMargin * 100).toFixed(1)}% is below target ${(marginTarget * 100).toFixed(0)}%.`);
        reasonParts.push(`Margin uses net sales excluding GST and Odoo standard cost. Odoo calculates the shelf tax.`);
        if (suggestedPrice === null || currentPrice === null || suggestedPrice <= currentPrice || suggestedMargin === null || suggestedMargin + 0.005 < marginTarget) {
          status = "review_cost";
          suggestedPrice = null;
          reasonParts.push("Review cost, tax rounding or target before changing this price.");
        }
      } else {
        status = "ok";
        reasonParts.push(
          currentMargin === null
            ? "Price and cost present."
            : `Current margin ${(currentMargin * 100).toFixed(1)}% meets or exceeds target ${(marginTarget * 100).toFixed(0)}%. No change suggested.`,
        );
      }

      return {
        id,
        name: String(product.display_name ?? product.name ?? "Product"),
        sku: product.default_code ? String(product.default_code) : "",
        unit,
        soldUnits,
        onHand,
        cost,
        currentPrice,
        currentMargin,
        suggestedPrice,
        suggestedMargin,
        status,
        reason: reasonParts.join(" "),
        reasonParts,
        currentNetPrice, currentGst, suggestedNetPrice, suggestedGst,
        currentListPrice: hasPrice ? listPrice : null,
        suggestedListPrice: status === "raise" ? proposedList : null,
        taxBasis: "odoo_sale_taxes",
        marginBasis: "net_sales_excluding_gst",
        costBasis: "odoo_standard_cost",
        method: "rules_v2_net_margin",
      };
    }
    // Bound Odoo concurrency: never fan out an entire catalogue into RPC calls.
    const items: Awaited<ReturnType<typeof buildSuggestion>>[] = [];
    for (let start = 0; start < pageProducts.length; start += 5) {
      items.push(...await Promise.all(pageProducts.slice(start, start + 5).map(buildSuggestion)));
    }
    items.sort((a, b) => {
      const rank = (status: string) => (status === "raise" ? 0 : status === "review_cost" || status === "review_tax" ? 1 : status === "missing_cost" || status === "unsaleable" ? 2 : 3);
      return rank(a.status) - rank(b.status) || b.soldUnits - a.soldUnits || a.name.localeCompare(b.name);
    });

    return noStoreJson({
      company: companies?.[0]?.name ?? "Current company",
      historyDays: HISTORY_DAYS,
      marginTarget,
      products: items,
      truncated: products.length > PAGE_SIZE,
      nextOffset: products.length > PAGE_SIZE ? rawOffset + PAGE_SIZE : null,
      offset: rawOffset,
      pageSize: PAGE_SIZE,
      marginBasis: "net_sales_excluding_gst",
      stockScope: "company",
      generatedAt: new Date().toISOString(),
      writeEnabled: false,
    });
  } catch (error) {
    if (error instanceof PriceSuggestionSessionExpiredError) {
      const response = noStoreJson({ message: "Odoo session expired" }, 401);
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = error instanceof StoreAccessError ? error.status : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return noStoreJson({ message }, status);
  }
}
