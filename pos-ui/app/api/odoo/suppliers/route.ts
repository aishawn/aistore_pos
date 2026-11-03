import { withReportInvalidation } from "@/lib/report-write-invalidation";
import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";

type RpcEnvelope<T> = { result?: T; error?: { message?: string; data?: { message?: string; name?: string } } };

class SupplierRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

function odooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Orithos connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Orithos connection must use HTTPS");
  return value;
}

async function handlePOST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
  const correlationId = request.headers.get("x-correlation-id");

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid supplier request" }, { status: 400 });
  }
  const allowed = new Set(["name", "phone", "email", "vat", "ref"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return NextResponse.json({ message: "This supplier request contains unsupported fields" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const vat = typeof body.vat === "string" ? body.vat.trim() : "";
  const ref = typeof body.ref === "string" ? body.ref.trim() : "";
  if (!name || name.length > 120) return NextResponse.json({ message: "Supplier name is required and must be 120 characters or fewer" }, { status: 400 });
  if (phone.length > 32 || email.length > 254 || vat.length > 32 || ref.length > 64) return NextResponse.json({ message: "Phone, email, ABN or reference is too long" }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ message: "Enter a valid email address" }, { status: 400 });

  try {
    const sessionInfoResponse = await fetch(`${odooBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!sessionInfoResponse.ok) throw new SupplierRequestError("Your Orithos session has expired. Sign in to Orithos again.", 401);
    const sessionInfo = await sessionInfoResponse.json() as RpcEnvelope<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    if (sessionInfo.error || !sessionInfo.result?.uid) throw new SupplierRequestError("Your Orithos session has expired. Sign in to Orithos again.", 401);
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, sessionInfo.result, correlationId);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) throw new SupplierRequestError(forced.error, forced.status);
    if (!forced.companyIds.length) throw new SupplierRequestError("No Orithos companies are available to this user.", 403);
    const companyIds = forced.companyIds;
    const companyContext = { allowed_company_ids: companyIds, force_company: companyIds[0] };
    const headers = withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request);
    const duplicateCheck = vat ? await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
      method: "POST", headers,
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model: "res.partner", method: "search_read", args: [[
        ["vat", "=", vat], ["company_id", "in", companyIds],
      ]], kwargs: { fields: ["id", "name", "supplier_rank", "company_id"], limit: 1, context: companyContext } }, id: Date.now() }),
      cache: "no-store", signal: AbortSignal.timeout(12_000),
    }) : null;
    if (duplicateCheck) {
      if (!duplicateCheck.ok) return NextResponse.json({ message: "Orithos supplier service is unavailable" }, { status: 502 });
      const duplicatePayload = await duplicateCheck.json() as { result?: Array<{ id: number; name: string; supplier_rank: number }>; error?: { message?: string } };
      if (duplicatePayload.error) {
        const detail = duplicatePayload.error.message ?? "";
        if (/session|authenticate|log in/i.test(detail)) return NextResponse.json({ message: "Your Orithos session has expired. Sign in to Orithos again." }, { status: 401 });
        if (/accesserror|access denied|permission/i.test(detail)) return NextResponse.json({ message: "Your Orithos account does not have permission to create suppliers." }, { status: 403 });
        return NextResponse.json({ message: "Orithos could not check for an existing ABN. No supplier was created." }, { status: 422 });
      }
      const duplicate = duplicatePayload.result?.[0];
      if (duplicate) return NextResponse.json({ message: `ABN / Tax ID already belongs to ${duplicate.name}${duplicate.supplier_rank > 0 ? " (existing supplier)" : " (existing contact)"}. Review that record before continuing.` }, { status: 409 });
    }

    const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
      method: "POST", headers,
      body: JSON.stringify({
        jsonrpc: "2.0", method: "call",
        params: { model: "res.partner", method: "create", args: [{ name, type: "contact", company_type: "company", is_company: true, supplier_rank: 1, company_id: companyIds[0], phone: phone || false, email: email || false, vat: vat || false, ref: ref || false }], kwargs: { context: companyContext } },
        id: Date.now(),
      }),
      cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return NextResponse.json({ message: "Orithos supplier service is unavailable" }, { status: 502 });
    const payload = await response.json() as { result?: unknown; error?: { message?: string; data?: { name?: string } } };
    if (payload.error) {
      const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""}`;
      if (/session|authenticate|log in/i.test(detail)) return NextResponse.json({ message: "Your Orithos session has expired. Sign in to Orithos again." }, { status: 401 });
      if (/accesserror|access denied|permission/i.test(detail)) return NextResponse.json({ message: "Your Orithos account does not have permission to create suppliers." }, { status: 403 });
      return NextResponse.json({ message: "Orithos rejected this supplier. Check the details and your Orithos purchase permissions." }, { status: 422 });
    }
    if (!Number.isSafeInteger(payload.result) || Number(payload.result) < 1) return NextResponse.json({ message: "Orithos did not confirm the new supplier" }, { status: 502 });
    return NextResponse.json({ id: payload.result, name }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos is unavailable";
    const status = error instanceof SupplierRequestError
      ? error.status
      : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}

export const POST = withReportInvalidation(handlePOST);
