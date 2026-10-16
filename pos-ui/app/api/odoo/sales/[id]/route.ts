import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { getOdooCompanyTimezone } from "@/lib/odoo-store-timezone";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";

type RpcEnvelope<T> = { result?: T; error?: { message?: string; data?: { message?: string } } };

function baseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Odoo connection must use HTTPS");
  return value;
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  const response = await fetch(`${baseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Odoo sales are unavailable");
  const payload = await response.json() as RpcEnvelope<T>;
  if (payload.error) {
    if (/session|authenticate|log in/i.test(payload.error.message ?? "")) throw new SaleSessionExpiredError();
    throw new Error("Odoo could not load the sale details");
  }
  return payload.result;
}

class SaleSessionExpiredError extends Error {}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
  const { id: rawId } = await context.params;
  const saleId = Number(rawId);
  if (!Number.isSafeInteger(saleId) || saleId < 1) return NextResponse.json({ message: "Invalid sale id" }, { status: 400 });

  try {
    const sessionResponse = await fetch(`${baseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!sessionResponse.ok) throw new SaleSessionExpiredError();
    const session = await sessionResponse.json() as RpcEnvelope<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    if (session.error || !session.result?.uid) throw new SaleSessionExpiredError();
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, session.result);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) return NextResponse.json({ message: forced.error }, { status: forced.status });
    const companyIds = forced.companyIds;
    if (!companyIds.length) return NextResponse.json({ message: "No Odoo companies are available to this user." }, { status: 403 });

    const orders = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "search_read", [[
      ["id", "=", saleId], ["company_id", "in", companyIds],
    ]], {
      fields: ["id", "name", "pos_reference", "date_order", "state", "amount_total", "amount_tax", "amount_paid", "amount_return", "partner_id", "session_id", "config_id", "user_id", "company_id", "lines", "payment_ids"],
      limit: 1,
    });
    const order = orders?.[0];
    if (!order) return NextResponse.json({ message: "Sale not found or you do not have access to it." }, { status: 404 });

    const [lines, payments, companies] = await Promise.all([
      Array.isArray(order.lines) && order.lines.length
        ? rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "search_read", [[["id", "in", order.lines]]], {
            fields: ["id", "product_id", "qty", "refunded_qty", "price_unit", "discount", "tax_ids", "price_subtotal", "price_subtotal_incl"],
            limit: 200,
          })
        : Promise.resolve([]),
      Array.isArray(order.payment_ids) && order.payment_ids.length
        ? rpc<Array<Record<string, unknown>>>(sessionId, "pos.payment", "search_read", [[["id", "in", order.payment_ids]]], {
            fields: ["id", "payment_method_id", "amount", "payment_date"],
            limit: 50,
          })
        : Promise.resolve([]),
      Array.isArray(order.company_id)
        ? rpc<Array<{ id: number; name: string; currency_id: [number, string] | false; partner_id?: [number, string] | false }>>(sessionId, "res.company", "search_read", [[["id", "=", order.company_id[0]]]], { fields: ["id", "name", "currency_id", "partner_id"], limit: 1 })
        : Promise.resolve([]),
    ]);

    const company = companies?.[0] ?? null;
    const partnerId = Array.isArray(company?.partner_id) ? company.partner_id[0] : null;
    const partners = partnerId ? await rpc<Array<{ state_id?: [number, string] | false; country_id?: [number, string] | false }>>(sessionId, "res.partner", "search_read", [[["id", "=", partnerId]]], { fields: ["state_id", "country_id"], limit: 1 }) : [];
    const timezone = getOdooCompanyTimezone(partners?.[0]?.country_id, partners?.[0]?.state_id);

    return NextResponse.json({
      order,
      lines: (lines ?? []).sort((left, right) => Number(left.id) - Number(right.id)),
      payments: payments ?? [],
      company: company ? { id: company.id, name: company.name, currency_id: company.currency_id, timezone } : null,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SaleSessionExpiredError) {
      const response = NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
