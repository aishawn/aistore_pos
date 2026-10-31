import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const HISTORY_DAYS = 56;
const PERIOD_DAYS = 28;
const MAX_PRODUCTS = 1000;
const COVERAGE_OPTIONS = new Set([7, 14, 21, 28, 42]);

type RpcEnvelope<T> = { result?: T; error?: { message?: string } };

function getBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Orithos connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Orithos connection must use HTTPS");
  return value;
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null) {
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${getBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Orithos replenishment data is unavailable");
  const payload = await response.json() as RpcEnvelope<T>;
  if (payload.error) {
    if (/session|authenticate|log in/i.test(payload.error.message ?? "")) throw new ReplenishmentSessionExpiredError();
    throw new Error("Your Orithos account cannot read the sales history needed for a replenishment plan.");
  }
  return payload.result;
}

class ReplenishmentSessionExpiredError extends Error {}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
  const correlationId = request.headers.get("x-correlation-id");

  const parsedCoverage = Number(request.nextUrl.searchParams.get("coverageDays") ?? 21);
  const coverageDays = COVERAGE_OPTIONS.has(parsedCoverage) ? parsedCoverage : 21;
  const now = Date.now();
  const recentFrom = new Date(now - PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const previousFrom = new Date(now - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

  try {
    const sessionResponse = await fetch(`${getBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!sessionResponse.ok) throw new ReplenishmentSessionExpiredError();
    const session = await sessionResponse.json() as RpcEnvelope<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    if (session.error || !session.result?.uid) throw new ReplenishmentSessionExpiredError();
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, session.result, correlationId);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) return NextResponse.json({ message: forced.error }, { status: forced.status });
    const companyId = forced.companyIds[0];
    if (!companyId) return NextResponse.json({ message: "No Orithos companies are available to this user." }, { status: 403 });

    const salesBaseDomain = [
      ["order_id.company_id", "=", companyId],
      ["order_id.state", "in", ["paid", "done", "invoiced"]],
    ];
    const [recentSales, previousSales, products, companies] = await Promise.all([
      rpc<Array<{ product_id?: [number, string] | false; qty?: number; __count?: number }>>(sessionId, "pos.order.line", "read_group", [[...salesBaseDomain, ["order_id.date_order", ">=", recentFrom]], ["qty:sum"], ["product_id"]], { limit: MAX_PRODUCTS, lazy: false }, correlationId),
      rpc<Array<{ product_id?: [number, string] | false; qty?: number; __count?: number }>>(sessionId, "pos.order.line", "read_group", [[...salesBaseDomain, ["order_id.date_order", ">=", previousFrom], ["order_id.date_order", "<", recentFrom]], ["qty:sum"], ["product_id"]], { limit: MAX_PRODUCTS, lazy: false }, correlationId),
      rpc<Array<Record<string, unknown>>>(sessionId, "product.product", "search_read", [[
        ["available_in_pos", "=", true],
        ["company_id", "=", companyId],
        ]], { fields: ["id", "name", "display_name", "default_code", "product_tmpl_id", "qty_available", "virtual_available", "uom_id"], limit: MAX_PRODUCTS, order: "name asc, id asc", context: { allowed_company_ids: [companyId], force_company: companyId } }, correlationId),
      rpc<Array<{ name?: string }>>(sessionId, "res.company", "search_read", [[["id", "=", companyId]]], { fields: ["name"], limit: 1 }, correlationId),
    ]);

    const recentSold = new Map<number, number>();
    const previousSold = new Map<number, number>();
    for (const row of recentSales ?? []) {
      if (Array.isArray(row.product_id) && Number.isFinite(Number(row.qty))) recentSold.set(row.product_id[0], Number(row.qty));
    }
    for (const row of previousSales ?? []) {
      if (Array.isArray(row.product_id) && Number.isFinite(Number(row.qty))) previousSold.set(row.product_id[0], Number(row.qty));
    }
    const leadTimes = new Map<number, number>();
    let leadTimeQuality: "AVAILABLE" | "UNKNOWN" = "AVAILABLE";
    try {
      const templateIds = (products ?? []).map((product) => Array.isArray(product.product_tmpl_id) ? Number(product.product_tmpl_id[0]) : 0).filter((id) => id > 0);
      if (templateIds.length) {
        const suppliers = await rpc<Array<{ product_tmpl_id?: [number, string]; delay?: number }>>(sessionId, "product.supplierinfo", "search_read", [[
          ["product_tmpl_id", "in", templateIds],
        ]], { fields: ["product_tmpl_id", "delay", "sequence"], limit: MAX_PRODUCTS * 2, order: "sequence asc, delay asc" }, correlationId);
        for (const supplier of suppliers ?? []) {
          const templateId = Array.isArray(supplier.product_tmpl_id) ? Number(supplier.product_tmpl_id[0]) : 0;
          const delay = Number(supplier.delay);
          if (templateId > 0 && Number.isFinite(delay) && delay >= 0 && (!leadTimes.has(templateId) || delay < (leadTimes.get(templateId) ?? Infinity))) leadTimes.set(templateId, delay);
        }
      }
    } catch {
      leadTimeQuality = "UNKNOWN";
    }
    const hasLeadTime = leadTimes.size > 0;
    const replenishmentItems = (products ?? []).map((product) => {
      const id = Number(product.id);
      const recentUnits = recentSold.get(id) ?? 0;
      const previousUnits = previousSold.get(id) ?? 0;
      const soldUnits = recentUnits + previousUnits;
      const onHand = Number(product.qty_available ?? 0);
      const virtualAvailable = Number(product.virtual_available);
      const forecastStock = Number.isFinite(virtualAvailable) ? virtualAvailable : onHand;
      const templateId = Array.isArray(product.product_tmpl_id) ? Number(product.product_tmpl_id[0]) : 0;
      const leadTimeDays = templateId > 0 ? leadTimes.get(templateId) ?? null : null;
      const recentUnitsPerDay = recentUnits / PERIOD_DAYS;
      const previousUnitsPerDay = previousUnits / PERIOD_DAYS;
      const unitsPerDay = recentUnits > 0 && previousUnits > 0
        ? recentUnitsPerDay * 0.7 + previousUnitsPerDay * 0.3
        : recentUnitsPerDay || previousUnitsPerDay;
      const trendPercent = previousUnitsPerDay > 0 ? ((recentUnitsPerDay / previousUnitsPerDay) - 1) * 100 : null;
      const trend = recentUnits > 0 && previousUnits === 0
        ? "new"
        : trendPercent === null ? null
          : trendPercent > 10 ? "up"
            : trendPercent < -10 ? "down" : "steady";
      const targetDays = Math.max(coverageDays, leadTimeDays ?? 0);
      const suggestedQuantity = Math.max(0, Math.ceil(unitsPerDay * targetDays - forecastStock));
      const unit = Array.isArray(product.uom_id) ? String(product.uom_id[1]) : "Units";
      const daysOfStock = unitsPerDay > 0 ? forecastStock / unitsPerDay : null;
      const risk = daysOfStock === null ? "UNKNOWN"
        : daysOfStock <= (leadTimeDays ?? coverageDays) ? "HIGH"
          : daysOfStock <= targetDays ? "MEDIUM" : "LOW";
      const confidence = soldUnits >= 14 ? "MEDIUM" : "LOW";
      const reasonParts: string[] = [];
      if (soldUnits <= 0) {
        reasonParts.push("No completed POS sales in the lookback window — suggestion is zero until demand appears.");
      } else {
        reasonParts.push(
          `Demand ≈ ${unitsPerDay.toFixed(2)} ${unit}/day from ${HISTORY_DAYS}d sales (recent ${PERIOD_DAYS}d weighted 70%).`,
        );
        reasonParts.push(`Target cover ${coverageDays}d ⇒ need ≈ ${(unitsPerDay * coverageDays).toFixed(1)} ${unit}.`);
        reasonParts.push(`Forecast stock ${forecastStock.toFixed(1)} ${unit} (on hand ${onHand.toFixed(1)} incl. scheduled moves).`);
        if (suggestedQuantity > 0) {
          reasonParts.push(`Suggested order = ceil(need − forecast) = ${suggestedQuantity} ${unit}.`);
        } else {
          reasonParts.push("Forecast stock already covers the target window — no order suggested.");
        }
        if (trend === "up") reasonParts.push(`Trend up ${Number(trendPercent?.toFixed(0) ?? 0)}% vs prior period.`);
        if (trend === "down") reasonParts.push(`Trend down ${Math.abs(Number(trendPercent?.toFixed(0) ?? 0))}% vs prior period.`);
        if (trend === "new") reasonParts.push("New demand — sold recently with no prior-period sales.");
      }
      if (leadTimeDays === null) reasonParts.push("Data quality warning: supplier lead time is unknown; coverage target is used as a fallback.");
      else reasonParts.push(`Supplier lead time ${leadTimeDays}d; target coverage uses ${targetDays}d.`);
      if (risk === "UNKNOWN") reasonParts.push("Risk is unknown because there is no positive demand baseline.");
      if (soldUnits < 14) reasonParts.push("Data quality warning: fewer than 14 units sold in the lookback window; treat the estimate as low confidence.");
      return {
        id,
        name: String(product.display_name ?? product.name ?? "Product"),
        sku: product.default_code ? String(product.default_code) : "",
        unit,
        soldUnits,
        recentUnits,
        previousUnits,
        unitsPerDay,
        trendPercent,
        trend,
        onHand,
        forecastStock,
        daysOfStock,
        leadTimeDays,
        risk,
        confidence,
        dataQuality: leadTimeQuality === "AVAILABLE" && leadTimeDays !== null ? "NATIVE_STOCK_SALES_SUPPLIER_LEAD_TIME" : "NATIVE_STOCK_SALES_LEAD_TIME_UNKNOWN",
        suggestedQuantity,
        reason: reasonParts.join(" "),
        reasonParts,
        method: "rules_v1_weighted_velocity",
      };
    }).sort((a, b) => b.suggestedQuantity - a.suggestedQuantity || b.unitsPerDay - a.unitsPerDay || a.name.localeCompare(b.name));

    return NextResponse.json({
      company: companies?.[0]?.name ?? "Current company",
      historyDays: HISTORY_DAYS,
      periodDays: PERIOD_DAYS,
      coverageDays,
      products: replenishmentItems,
      truncated: (products?.length ?? 0) >= MAX_PRODUCTS || (recentSales?.length ?? 0) >= MAX_PRODUCTS || (previousSales?.length ?? 0) >= MAX_PRODUCTS,
      generatedAt: new Date().toISOString(),
      dataQuality: leadTimeQuality === "AVAILABLE" && hasLeadTime ? "NATIVE_STOCK_SALES_SUPPLIER_LEAD_TIME" : "NATIVE_STOCK_SALES_LEAD_TIME_UNKNOWN",
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ReplenishmentSessionExpiredError) {
      const response = NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const message = error instanceof Error ? error.message : "Orithos is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
