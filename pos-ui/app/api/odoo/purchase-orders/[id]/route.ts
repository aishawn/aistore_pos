import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
type RpcError = { message?: string; data?: { message?: string; name?: string } };
type RpcEnvelope<T> = { result?: T; error?: RpcError };

function odooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Odoo connection must use HTTPS");
  return value;
}

class PurchaseOrderError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new PurchaseOrderError("Odoo purchase service is unavailable", 502);
  const payload = await response.json() as RpcEnvelope<T>;
  if (payload.error) {
    const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""} ${payload.error.data?.message ?? ""}`;
    if (/session|authenticate|log in/i.test(detail)) throw new PurchaseOrderError("Your Odoo session has expired. Sign in to Odoo again.", 401);
    if (/accesserror|access denied|permission/i.test(detail)) throw new PurchaseOrderError("Your Odoo account does not have permission to access this purchase order.", 403);
    throw new PurchaseOrderError("Odoo could not complete this purchase request.", 422);
  }
  return payload.result as T;
}

async function getCompanyIds(sessionId: string) {
  const response = await fetch(`${odooBaseUrl()}/web/session/get_session_info`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new PurchaseOrderError("Your Odoo session has expired. Sign in to Odoo again.", 401);
  const payload = await response.json() as RpcEnvelope<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
  if (payload.error || !payload.result?.uid) throw new PurchaseOrderError("Your Odoo session has expired. Sign in to Odoo again.", 401);
  const companyIds = await resolveOdooAllowedCompanyIds(sessionId, payload.result);
  if (!companyIds.length) throw new PurchaseOrderError("No Odoo companies are available to this user.", 403);
  return companyIds;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Odoo is unavailable";
  const status = error instanceof PurchaseOrderError ? error.status : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
  const response = NextResponse.json({ message }, { status });
  if (status === 401) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
  const { id: rawId } = await context.params;
  const purchaseId = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(purchaseId) || purchaseId < 1) return NextResponse.json({ message: "Invalid purchase order" }, { status: 400 });

  try {
    const companyIds = await getCompanyIds(sessionId);
    const orderFields = await rpc<Record<string, { type?: string }>>(sessionId, "purchase.order", "fields_get", [["picking_ids", "receipt_status"]], { attributes: ["type"] });
    const availableOrderFields = ["picking_ids", "receipt_status"].filter((field) => Object.hasOwn(orderFields ?? {}, field));
    const orders = await rpc<Array<Record<string, unknown>>>(sessionId, "purchase.order", "search_read", [[
      ["id", "=", purchaseId], ["company_id", "in", companyIds],
    ]], { fields: ["id", "name", "partner_id", "date_order", "date_planned", "state", "amount_untaxed", "amount_tax", "amount_total", "currency_id", "company_id", "user_id", "origin", "notes", "order_line", ...availableOrderFields], limit: 1, context: { allowed_company_ids: companyIds } });
    const order = orders?.[0];
    if (!order) return NextResponse.json({ message: "Purchase order not found or you do not have access to it." }, { status: 404 });
    const orderLineIds = Array.isArray(order.order_line) ? order.order_line.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : [];
    let lines: Array<Record<string, unknown>> = [];
    if (orderLineIds.length) {
      const lineFields = await rpc<Record<string, { type?: string }>>(sessionId, "purchase.order.line", "fields_get", [["product_uom", "product_uom_id"]], { attributes: ["type"] });
      const unitField = lineFields && Object.hasOwn(lineFields, "product_uom") ? "product_uom" : lineFields && Object.hasOwn(lineFields, "product_uom_id") ? "product_uom_id" : null;
      if (!unitField) throw new PurchaseOrderError("Odoo did not expose a purchase unit field for RFQ lines.", 422);
      lines = await rpc<Array<Record<string, unknown>>>(sessionId, "purchase.order.line", "search_read", [[
        ["id", "in", orderLineIds], ["order_id", "=", purchaseId],
      ]], { fields: ["id", "product_id", "name", "product_qty", unitField, "price_unit", "price_subtotal", "qty_received", "date_planned"], limit: 200, context: { allowed_company_ids: companyIds } }) ?? [];
    }
    const pickingIds = Array.isArray(order.picking_ids) ? order.picking_ids.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : [];
    let receiptsAvailable = availableOrderFields.includes("picking_ids");
    let receipts: Array<Record<string, unknown>> = [];
    if (receiptsAvailable && pickingIds.length) {
      try {
        receipts = await rpc<Array<Record<string, unknown>>>(sessionId, "stock.picking", "search_read", [[
          ["id", "in", pickingIds], ["company_id", "in", companyIds],
        ]], {
          fields: ["id", "name", "state", "scheduled_date", "date_done", "picking_type_id", "location_id", "location_dest_id", "origin", "company_id"],
          limit: 100,
          order: "scheduled_date desc, id desc",
          context: { allowed_company_ids: companyIds },
        }) ?? [];
      } catch (error) {
        if (!(error instanceof PurchaseOrderError) || error.status !== 403) throw error;
        receiptsAvailable = false;
      }
    }
    const baseUrl = odooBaseUrl();
    return NextResponse.json({
      order,
      lines: lines ?? [],
      receipts: receipts.map((receipt) => ({
        ...receipt,
        url: `${baseUrl}/web#id=${receipt.id}&model=stock.picking&view_type=form`,
      })),
      receiptsAvailable,
      url: `${baseUrl}/web#id=${purchaseId}&model=purchase.order&view_type=form`,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
  const { id: rawId } = await context.params;
  const purchaseId = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(purchaseId) || purchaseId < 1) return NextResponse.json({ message: "Invalid purchase order" }, { status: 400 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid purchase confirmation" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "confirm") || (body as { confirm?: unknown }).confirm !== true) {
    return NextResponse.json({ message: "Explicit confirmation is required" }, { status: 400 });
  }

  try {
    const companyIds = await getCompanyIds(sessionId);
    const orders = await rpc<Array<{ id: number; name: string; state: string; partner_id: [number, string] | false }>>(sessionId, "purchase.order", "search_read", [[
      ["id", "=", purchaseId], ["company_id", "in", companyIds],
    ]], { fields: ["id", "name", "state", "partner_id"], limit: 1, context: { allowed_company_ids: companyIds } });
    const order = orders?.[0];
    if (!order) return NextResponse.json({ message: "Purchase order not found or you do not have access to it." }, { status: 404 });
    if (order.state !== "draft" && order.state !== "sent") return NextResponse.json({ message: "Only draft or sent RFQs can be confirmed from this page." }, { status: 409 });
    await rpc<unknown>(sessionId, "purchase.order", "button_confirm", [[purchaseId]], { context: { allowed_company_ids: companyIds } });
    return NextResponse.json({ ok: true, id: purchaseId, name: order.name }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
