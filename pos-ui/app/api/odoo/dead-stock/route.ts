import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const WINDOWS = [30, 60, 90] as const;
type RpcResult<T> = { result?: T; error?: { message?: string; data?: { message?: string } } };

function baseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Orithos connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Orithos connection must use HTTPS");
  return value;
}

class SessionExpired extends Error {}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null) {
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${baseUrl()}/web/dataset/call_kw`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }), cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("Orithos reporting is unavailable");
  const payload = await response.json() as RpcResult<T>;
  if (payload.error) {
    if (/session|log in|authenticate/i.test(payload.error.message ?? "")) throw new SessionExpired();
    throw new Error("Orithos could not load dead-stock data");
  }
  return payload.result;
}

function errorResponse(message: string, status: number, correlationId?: string | null) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  return NextResponse.json({ message }, { status, headers });
}

function dateString(daysAgo: number) {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export async function GET(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id");
  if (!isSameOrigin(request)) return errorResponse("Cross-origin requests are not allowed", 403, correlationId);
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return errorResponse("Orithos session expired", 401, correlationId);
  try {
    const sessionResponse = await fetch(`${baseUrl()}/web/session/get_session_info`, { method: "POST", headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request), body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }), cache: "no-store", signal: AbortSignal.timeout(12_000) });
    const sessionPayload = await sessionResponse.json() as RpcResult<{ uid?: number }>;
    if (!sessionResponse.ok || sessionPayload.error || !sessionPayload.result?.uid) throw new SessionExpired();
    const ids = await resolveOdooAllowedCompanyIds(sessionId, sessionPayload.result, correlationId);
    const forced = await resolveTenantForcedCompanyIds(request, ids);
    if (forced.error) return errorResponse(forced.error, forced.status, correlationId);
    const companyId = forced.companyIds[0];
    if (!companyId) return errorResponse("No Orithos companies are available to this user.", 403, correlationId);

    const products = await rpc<Array<Record<string, unknown>>>(sessionId, "product.product", "search_read", [["sale_ok", "=", true], ["active", "=", true]], { fields: ["id", "display_name", "default_code", "qty_available", "standard_price", "categ_id"], limit: 5000, order: "display_name asc", context: { allowed_company_ids: [companyId] } }, correlationId) ?? [];
    const salesByWindow = new Map<number, Map<number, number>>();
    for (const days of WINDOWS) {
      const rows = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [[ ["order_id.company_id", "=", companyId], ["order_id.date_order", ">=", dateString(days)], ["order_id.state", "in", ["paid", "done", "invoiced"]] ], ["qty:sum"], ["product_id"]], { lazy: false }, correlationId).catch(() => []);
      const map = new Map<number, number>();
      for (const row of rows ?? []) {
        const product = row.product_id;
        const id = Array.isArray(product) ? Number(product[0]) : 0;
        if (id > 0) map.set(id, Number(row.qty ?? 0));
      }
      salesByWindow.set(days, map);
    }
    const items = products.map((product) => {
      const id = Number(product.id);
      const qty = Number(product.qty_available);
      const cost = Number(product.standard_price);
      const sales = Object.fromEntries(WINDOWS.map((days) => [days, salesByWindow.get(days)?.get(id) ?? 0]));
      const validValue = Number.isFinite(qty) && qty >= 0 && Number.isFinite(cost) && cost >= 0;
      return { id, name: String(product.display_name ?? "Product"), sku: product.default_code ? String(product.default_code) : "", category: Array.isArray(product.categ_id) ? String(product.categ_id[1] ?? "Uncategorised") : "Uncategorised", onHand: Number.isFinite(qty) ? qty : null, unitCost: Number.isFinite(cost) && cost >= 0 ? cost : null, inventoryValue: validValue ? qty * cost : null, sales, invalidReason: validValue ? null : (!Number.isFinite(cost) || cost < 0 ? "MISSING_OR_INVALID_COST" : "NEGATIVE_OR_INVALID_STOCK") };
    });
    const bucketCounts = Object.fromEntries(WINDOWS.map((days) => [days, items.filter((item) => item.sales[String(days)] === 0).length]));
    const cashValueByBucket = Object.fromEntries(WINDOWS.map((days) => [days, items.filter((item) => item.sales[String(days)] === 0).reduce((sum, item) => sum + (item.inventoryValue ?? 0), 0)]));
    return NextResponse.json({ companyId, bucketCounts, cashValueByBucket, invalidCostOrStockCount: items.filter((item) => item.invalidReason).length, products: items.filter((item) => WINDOWS.some((days) => item.sales[String(days)] === 0)).sort((a, b) => (b.inventoryValue ?? -1) - (a.inventoryValue ?? -1)), dataQuality: "CURRENT_NATIVE_STOCK_POS_SALES_READ_ONLY", writeRequests: [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SessionExpired) { const response = errorResponse("Orithos session expired", 401, correlationId); response.cookies.delete(SESSION_COOKIE); return response; }
    const message = error instanceof Error ? error.message : "Orithos is unavailable";
    return errorResponse(message, message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502, correlationId);
  }
}
