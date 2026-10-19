import { NextRequest, NextResponse } from "next/server";
import { roundCashToFiveCents } from "@/lib/au";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const HISTORY_DAYS = 28;
const MAX_PRODUCTS = 1000;
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

function parseMarginTarget(raw: string | null): number {
  const value = Number(raw ?? DEFAULT_MARGIN);
  if (!Number.isFinite(value)) return DEFAULT_MARGIN;
  // Accept 30 or 0.30
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, normalized));
}

function marginOnSell(price: number, cost: number): number | null {
  if (!(price > 0) || !(cost >= 0)) return null;
  return (price - cost) / price;
}

function suggestShelfPrice(cost: number, marginTarget: number): number {
  if (!(cost > 0) || !(marginTarget > 0) || marginTarget >= 1) return 0;
  const raw = cost / (1 - marginTarget);
  return roundCashToFiveCents(raw);
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  const marginTarget = parseMarginTarget(request.nextUrl.searchParams.get("marginTarget"));
  const now = Date.now();
  const recentFrom = new Date(now - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

  try {
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
    if (forced.error) return NextResponse.json({ message: forced.error }, { status: forced.status });
    const companyId = forced.companyIds[0];
    if (!companyId) return NextResponse.json({ message: "No Odoo companies are available to this user." }, { status: 403 });

    const salesBaseDomain = [
      ["order_id.company_id", "=", companyId],
      ["order_id.state", "in", ["paid", "done", "invoiced"]],
      ["order_id.date_order", ">=", recentFrom],
    ];

    const [recentSales, products, companies] = await Promise.all([
      rpc<Array<{ product_id?: [number, string] | false; qty?: number }>>(
        sessionId,
        "pos.order.line",
        "read_group",
        [[...salesBaseDomain], ["qty:sum"], ["product_id"]],
        { limit: MAX_PRODUCTS, lazy: false },
      ),
      rpc<Array<Record<string, unknown>>>(sessionId, "product.product", "search_read", [[
        ["available_in_pos", "=", true],
        ["company_id", "=", companyId],
      ]], {
        fields: ["id", "name", "display_name", "default_code", "list_price", "standard_price", "qty_available", "uom_id"],
        limit: MAX_PRODUCTS,
        order: "name asc, id asc",
        context: { allowed_company_ids: [companyId], force_company: companyId },
      }),
      rpc<Array<{ name?: string }>>(sessionId, "res.company", "search_read", [[["id", "=", companyId]]], { fields: ["name"], limit: 1 }),
    ]);

    const soldMap = new Map<number, number>();
    for (const row of recentSales ?? []) {
      if (Array.isArray(row.product_id) && Number.isFinite(Number(row.qty))) {
        soldMap.set(row.product_id[0], Number(row.qty));
      }
    }

    const items = (products ?? []).map((product) => {
      const id = Number(product.id);
      const listPrice = Number(product.list_price);
      const costRaw = Number(product.standard_price);
      const hasCost = Number.isFinite(costRaw) && costRaw > 0;
      const hasPrice = Number.isFinite(listPrice) && listPrice > 0;
      const cost = hasCost ? costRaw : null;
      const currentPrice = hasPrice ? listPrice : null;
      const soldUnits = soldMap.get(id) ?? 0;
      const onHand = Number(product.qty_available ?? 0);
      const unit = Array.isArray(product.uom_id) ? String(product.uom_id[1]) : "Units";
      const currentMargin = hasCost && hasPrice ? marginOnSell(listPrice, costRaw) : null;

      let suggestedPrice: number | null = null;
      let suggestedMargin: number | null = null;
      let status: "ok" | "raise" | "review_cost" | "missing_cost" | "unsaleable" = "ok";
      const reasonParts: string[] = [];

      if (!hasPrice) {
        status = "unsaleable";
        reasonParts.push("No shelf price in Odoo — keep unsaleable until the owner sets a price.");
      } else if (!hasCost) {
        status = "missing_cost";
        reasonParts.push("No cost in Odoo — cannot suggest a margin-based price. Do not invent a cost.");
      } else if (listPrice < costRaw) {
        status = "raise";
        suggestedPrice = suggestShelfPrice(costRaw, marginTarget);
        suggestedMargin = marginOnSell(suggestedPrice, costRaw);
        reasonParts.push(`Current shelf price $${listPrice.toFixed(2)} is below cost $${costRaw.toFixed(2)}.`);
        reasonParts.push(`Suggested GST-inclusive shelf ≈ $${suggestedPrice.toFixed(2)} for ${(marginTarget * 100).toFixed(0)}% margin on sell (rounded to 5¢).`);
      } else if (currentMargin !== null && currentMargin + 0.005 < marginTarget) {
        status = "raise";
        suggestedPrice = suggestShelfPrice(costRaw, marginTarget);
        suggestedMargin = marginOnSell(suggestedPrice, costRaw);
        reasonParts.push(`Current margin ${(currentMargin * 100).toFixed(1)}% is below target ${(marginTarget * 100).toFixed(0)}%.`);
        reasonParts.push(`Suggested GST-inclusive shelf ≈ $${suggestedPrice.toFixed(2)} from cost $${costRaw.toFixed(2)} (rules_v1, 5¢ round).`);
        if (suggestedPrice <= listPrice) {
          status = "review_cost";
          reasonParts.push("Suggested price is not higher than current — review cost or target before changing.");
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
        method: "rules_v1_margin_on_sell",
      };
    }).sort((a, b) => {
      const rank = (status: string) => (status === "raise" ? 0 : status === "review_cost" ? 1 : status === "missing_cost" || status === "unsaleable" ? 2 : 3);
      return rank(a.status) - rank(b.status) || b.soldUnits - a.soldUnits || a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      company: companies?.[0]?.name ?? "Current company",
      historyDays: HISTORY_DAYS,
      marginTarget,
      products: items,
      truncated: (products?.length ?? 0) >= MAX_PRODUCTS,
      generatedAt: new Date().toISOString(),
      writeEnabled: false,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PriceSuggestionSessionExpiredError) {
      const response = NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
