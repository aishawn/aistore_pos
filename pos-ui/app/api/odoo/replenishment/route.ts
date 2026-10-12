import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const HISTORY_DAYS = 56;
const MAX_PRODUCTS = 1000;
const COVERAGE_OPTIONS = new Set([7, 14, 21, 28, 42]);

type RpcEnvelope<T> = { result?: T; error?: { message?: string } };

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

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
  if (!response.ok) throw new Error("Odoo replenishment data is unavailable");
  const payload = await response.json() as RpcEnvelope<T>;
  if (payload.error) {
    if (/session|authenticate|log in/i.test(payload.error.message ?? "")) throw new ReplenishmentSessionExpiredError();
    throw new Error("Your Odoo account cannot read the sales history needed for a replenishment plan.");
  }
  return payload.result;
}

class ReplenishmentSessionExpiredError extends Error {}

export async function GET(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  const parsedCoverage = Number(request.nextUrl.searchParams.get("coverageDays") ?? 21);
  const coverageDays = COVERAGE_OPTIONS.has(parsedCoverage) ? parsedCoverage : 21;
  const from = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

  try {
    const sessionResponse = await fetch(`${getBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!sessionResponse.ok) throw new ReplenishmentSessionExpiredError();
    const session = await sessionResponse.json() as RpcEnvelope<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    const companyIds = (session.result?.user_context?.allowed_company_ids ?? []).filter(Number.isInteger);
    const companyId = companyIds[0];
    if (session.error || !session.result?.uid) throw new ReplenishmentSessionExpiredError();
    if (!companyId) return NextResponse.json({ message: "No Odoo companies are available to this user." }, { status: 403 });

    const salesDomain = [
      ["order_id.company_id", "=", companyId],
      ["order_id.date_order", ">=", from],
      ["order_id.state", "in", ["paid", "done", "invoiced"]],
    ];
    const [salesByProduct, products, companies] = await Promise.all([
      rpc<Array<{ product_id?: [number, string] | false; qty?: number; __count?: number }>>(sessionId, "pos.order.line", "read_group", [salesDomain, ["qty:sum"], ["product_id"]], { limit: MAX_PRODUCTS, lazy: false }),
      rpc<Array<Record<string, unknown>>>(sessionId, "product.product", "search_read", [[
        ["available_in_pos", "=", true],
      ]], { fields: ["id", "name", "display_name", "default_code", "qty_available", "uom_id"], limit: MAX_PRODUCTS, order: "name asc, id asc", context: { allowed_company_ids: [companyId] } }),
      rpc<Array<{ name?: string }>>(sessionId, "res.company", "search_read", [[["id", "=", companyId]]], { fields: ["name"], limit: 1 }),
    ]);

    const sold = new Map<number, number>();
    for (const row of salesByProduct ?? []) {
      if (Array.isArray(row.product_id) && Number.isFinite(Number(row.qty))) sold.set(row.product_id[0], Number(row.qty));
    }
    const replenishmentItems = (products ?? []).map((product) => {
      const id = Number(product.id);
      const soldUnits = sold.get(id) ?? 0;
      const onHand = Number(product.qty_available ?? 0);
      const unitsPerDay = soldUnits / HISTORY_DAYS;
      const suggestedQuantity = Math.max(0, Math.ceil(unitsPerDay * coverageDays - onHand));
      const unit = Array.isArray(product.uom_id) ? String(product.uom_id[1]) : "Units";
      return {
        id,
        name: String(product.display_name ?? product.name ?? "Product"),
        sku: product.default_code ? String(product.default_code) : "",
        unit,
        soldUnits,
        unitsPerDay,
        onHand,
        daysOfStock: unitsPerDay > 0 ? onHand / unitsPerDay : null,
        suggestedQuantity,
      };
    }).sort((a, b) => b.suggestedQuantity - a.suggestedQuantity || b.unitsPerDay - a.unitsPerDay || a.name.localeCompare(b.name));

    return NextResponse.json({
      company: companies?.[0]?.name ?? "Current company",
      historyDays: HISTORY_DAYS,
      coverageDays,
      products: replenishmentItems,
      truncated: (products?.length ?? 0) >= MAX_PRODUCTS || (salesByProduct?.length ?? 0) >= MAX_PRODUCTS,
      generatedAt: new Date().toISOString(),
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ReplenishmentSessionExpiredError) {
      const response = NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
