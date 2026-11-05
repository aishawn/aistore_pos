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
    const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim().toLowerCase().split(":")[0];
    if (host === "skr.orithos.com.au" || host === "demo.orithos.com.au") {
      const runs = await rpc<Array<{ status?: string; error?: string }>>(sessionId, "shopfront.sync.import.run", "search_read", [[
        ["store_key", "=", "skr"], ["import_type", "=", "purchase_orders"],
      ]], { fields: ["status", "error"], limit: 1, order: "id desc" }, correlationId).catch(() => null);
      if (runs?.[0]?.status === "failed" && /not authorized/i.test(String(runs[0].error || ""))) {
        return NextResponse.json({ message: "Shopfront purchasing is not authorized for this store." }, { status: 403 });
      }
      const rows = await rpc<Array<Record<string, unknown>>>(sessionId, "shopfront.sync.purchase.order", "search_read", [[
        ["store_key", "=", "skr"], ["company_id", "in", companyIds],
      ]], {
        fields: ["id", "source_id", "supplier_source_id", "source_status", "order_date", "source_total", "company_id", "raw_payload"],
        limit: limit + 1, offset, order: "id desc",
      }, correlationId).catch(() => null);
      if (rows) {
        const filtered = rows.filter((row) => {
          const status = String(row.source_status || "");
          const sourceId = String(row.source_id || "");
          const raw = row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload as Record<string, unknown> : {};
          const supplier = raw.supplier && typeof raw.supplier === "object" ? raw.supplier as Record<string, unknown> : {};
          const supplierName = String(supplier.name || "");
          if (requestedState !== "all" && status.toLowerCase() !== requestedState) return false;
          if (query && !`${sourceId} ${supplierName}`.toLowerCase().includes(query.toLowerCase())) return false;
          return true;
        });
        const hasNext = filtered.length > limit;
        const items = filtered.slice(0, limit).map((row) => {
          const raw = row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload as Record<string, unknown> : {};
          const supplier = raw.supplier && typeof raw.supplier === "object" ? raw.supplier as Record<string, unknown> : {};
          return {
            id: row.id, name: String(row.source_id || row.id),
            partner_id: [0, String(supplier.name || row.supplier_source_id || "Shopfront supplier")],
            date_order: row.order_date || false, state: String(row.source_status || "purchase"),
            amount_total: Number(row.source_total || 0), currency_id: [0, "AUD"], company_id: row.company_id, order_line: [],
          };
        });
        return NextResponse.json({ items, limit, offset, hasNext, generatedAt: new Date().toISOString(), scope: ["SKR"] }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    const companies = await rpc<Array<{ id: number; name: string }>>(sessionId, "res.company", "read", [companyIds], {
      fields: ["id", "name"],
      context: { allowed_company_ids: companyIds },
    }, correlationId).catch(() => companyIds.map((id) => ({ id, name: `Company ${id}` })));
    const domain: unknown[] = [["company_id", "in", companyIds]];
    if (requestedState !== "all") domain.push(["state", "=", requestedState]);
    if (query) domain.push("|", ["name", "ilike", query], ["partner_id", "ilike", query]);
    const items = await rpc<Array<Record<string, unknown>>>(sessionId, "purchase.order", "search_read", [domain], {
      fields: ["id", "name", "partner_id", "date_order", "state", "amount_total", "currency_id", "company_id", "order_line"],
      limit: limit + 1,
      offset,
      // Copies have different internal IDs; keep same-day orders aligned across stores.
      order: "date_order desc, name desc, id desc",
      context: { allowed_company_ids: companyIds },
    }, correlationId);
    const hasNext = (items?.length ?? 0) > limit;
    return NextResponse.json({ items: (items ?? []).slice(0, limit), limit, offset, hasNext, generatedAt: new Date().toISOString(), scope: companies.map((company) => company.name) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
