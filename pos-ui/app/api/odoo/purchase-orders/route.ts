import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_LIMIT = 50;
const STATES = new Set(["draft", "sent", "to approve", "purchase", "done", "cancel"]);

type RpcError = { message?: string; data?: { message?: string; name?: string } };
type RpcEnvelope<T> = { result?: T; error?: RpcError };

function odooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Orithos connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Orithos connection must use HTTPS");
  return value;
}

class PurchaseRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null): Promise<T> {
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new PurchaseRequestError("Orithos purchase records are unavailable", 502);
  const payload = await response.json() as RpcEnvelope<T>;
  if (payload.error) {
    const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""} ${payload.error.data?.message ?? ""}`;
    if (/session|authenticate|log in/i.test(detail)) throw new PurchaseRequestError("Your Orithos session has expired. Sign in to Orithos again.", 401);
    if (/accesserror|access denied|permission/i.test(detail)) throw new PurchaseRequestError("Your Orithos account does not have permission to view purchase records.", 403);
    throw new PurchaseRequestError("Orithos could not load these purchase records.", 502);
  }
  return payload.result as T;
}

async function getCompanies(request: NextRequest, sessionId: string) {
  const correlationId = request.headers.get("x-correlation-id");
  const response = await fetch(`${odooBaseUrl()}/web/session/get_session_info`, {
    method: "POST",
    headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new PurchaseRequestError("Your Orithos session has expired. Sign in to Orithos again.", 401);
  const payload = await response.json() as RpcEnvelope<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
  if (payload.error || !payload.result?.uid) throw new PurchaseRequestError("Your Orithos session has expired. Sign in to Orithos again.", 401);
  const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, payload.result, correlationId);
  const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
  if (forced.error) throw new PurchaseRequestError(forced.error, forced.status);
  if (!forced.companyIds.length) throw new PurchaseRequestError("No Orithos companies are available to this user.", 403);
  return forced.companyIds;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Orithos is unavailable";
  const status = error instanceof PurchaseRequestError ? error.status : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
  const response = NextResponse.json({ message }, { status });
  if (status === 401) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });

  const query = request.nextUrl.searchParams.get("query")?.trim().slice(0, 120) ?? "";
  const requestedState = request.nextUrl.searchParams.get("state") ?? "all";
  if (requestedState !== "all" && !STATES.has(requestedState)) return NextResponse.json({ message: "Invalid purchase status" }, { status: 400 });
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const rawOffset = request.nextUrl.searchParams.get("offset");
  const requestedLimit = rawLimit === null ? 40 : Number(rawLimit);
  const requestedOffset = rawOffset === null ? 0 : Number(rawOffset);
  if (!Number.isFinite(requestedLimit) || !Number.isFinite(requestedOffset)) {
    return NextResponse.json({ message: "Purchase pagination values must be finite numbers" }, { status: 400 });
  }
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(requestedLimit)));
  const offset = Math.max(0, Math.floor(requestedOffset));

  try {
    const correlationId = request.headers.get("x-correlation-id");
    const companyIds = await getCompanies(request, sessionId);
    const domain: unknown[] = [["company_id", "in", companyIds]];
    if (requestedState !== "all") domain.push(["state", "=", requestedState]);
    if (query) domain.push("|", ["name", "ilike", query], ["partner_id", "ilike", query]);
    const items = await rpc<Array<Record<string, unknown>>>(sessionId, "purchase.order", "search_read", [domain], {
      fields: ["id", "name", "partner_id", "date_order", "state", "amount_total", "currency_id", "company_id", "order_line"],
      limit: limit + 1,
      offset,
      order: "date_order desc, id desc",
      context: { allowed_company_ids: companyIds },
    }, correlationId);
    const hasNext = (items?.length ?? 0) > limit;
    return NextResponse.json({ items: (items ?? []).slice(0, limit), limit, offset, hasNext }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
