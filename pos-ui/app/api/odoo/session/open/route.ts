import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { odooCompanyContext, resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isExpiredOdooSessionError, resolveRegisterOpenDecision } from "@/lib/odoo-session-open";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";
import { requirePermission, StoreAccessError } from "@/lib/store-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";

type RpcResult<T> = { result?: T; error?: { message?: string; data?: { message?: string } } };
type OdooSessionInfo = { uid?: number; user_context?: { allowed_company_ids?: number[] } };

class SessionExpiredError extends Error {}
class OpenSessionError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); }
}

function getOdooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new OpenSessionError("Orithos connection is not configured", 503);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new OpenSessionError("Orithos connection must use HTTPS", 503);
  }
  return value;
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], context: Record<string, unknown>, request: NextRequest) {
  const response = await fetch(`${getOdooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs: { context } }, id: Date.now(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new OpenSessionError("Orithos POS is unavailable", 502);
  const payload = await response.json() as RpcResult<T>;
  if (payload.error) {
    const detail = `${payload.error.message ?? ""} ${payload.error.data?.message ?? ""}`;
    if (isExpiredOdooSessionError(detail)) throw new SessionExpiredError();
    throw new OpenSessionError("Orithos could not open the selected register", 409);
  }
  return payload.result;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "sell.register.open");
  } catch (error) {
    if (error instanceof StoreAccessError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }

  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });

  let body: { configId?: number; openingCash?: number | null; openingNotes?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid POS session request" }, { status: 400 }); }
  const configId = Number(body.configId);
  if (!Number.isSafeInteger(configId) || configId <= 0) {
    return NextResponse.json({ message: "Choose a valid Orithos register" }, { status: 400 });
  }
  if (body.openingCash != null && (
    typeof body.openingCash !== "number"
    || !Number.isFinite(body.openingCash)
    || body.openingCash < 0
    || body.openingCash > 1_000_000
  )) {
    return NextResponse.json({ message: "Enter a valid opening cash amount, or leave it blank." }, { status: 400 });
  }

  try {
    const baseUrl = getOdooBaseUrl();
    const sessionResponse = await fetch(`${baseUrl}/web/session/get_session_info`, {
      method: "POST",
      headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!sessionResponse.ok) throw new SessionExpiredError();
    const sessionPayload = await sessionResponse.json() as RpcResult<OdooSessionInfo>;
    if (sessionPayload.error || !sessionPayload.result?.uid) throw new SessionExpiredError();

    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, sessionPayload.result, request.headers.get("x-correlation-id"));
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) throw new OpenSessionError(forced.error, forced.status);
    if (!forced.companyIds.length) throw new OpenSessionError("This Orithos user has no accessible company.", 403);
    const companyContext = odooCompanyContext(forced.companyIds);

    const configs = await rpc<Array<{
      id: number;
      company_id: [number, string] | false;
      current_session_id: [number, string] | false;
    }>>(sessionId, "pos.config", "search_read", [[
      ["id", "=", configId],
      ["company_id", "in", forced.companyIds],
    ]], companyContext, request);
    const config = configs?.[0];
    const companyId = Array.isArray(config?.company_id) ? config.company_id[0] : null;
    const currentSessionId = Array.isArray(config?.current_session_id) ? config.current_session_id[0] : null;
    const openSessions = currentSessionId
      ? await rpc<Array<{ id: number }>>(sessionId, "pos.session", "search_read", [[
          ["id", "=", currentSessionId], ["state", "=", "opened"],
        ]], companyContext, request)
      : [];
    const decision = resolveRegisterOpenDecision(
      config ? { configId: config.id, companyId, hasOpenSession: Boolean(openSessions?.length) } : null,
      configId,
      forced.companyIds,
    );
    if (decision === "denied") throw new OpenSessionError("This register is not available to your Orithos user.", 403);
    if (decision === "already-open") return NextResponse.json({ opened: false, alreadyOpen: true, configId }, { status: 200 });

    await rpc(sessionId, "pos.config", "open_ui", [[configId]], companyContext, request);

    // Odoo creates a session in opening_control when cash control is enabled.
    // open_ui alone does not make it tradable; the POS frontend normally calls
    // set_opening_control after the cashier confirms the drawer count.
    const refreshedConfigs = await rpc<Array<{
      id: number;
      current_session_id: [number, string] | false;
    }>>(sessionId, "pos.config", "search_read", [[
      ["id", "=", configId],
      ["company_id", "in", forced.companyIds],
    ]], companyContext, request);
    const refreshedSessionId = Array.isArray(refreshedConfigs?.[0]?.current_session_id)
      ? refreshedConfigs[0].current_session_id[0]
      : null;
    if (!refreshedSessionId) throw new OpenSessionError("Orithos did not create an opening POS session", 502);

    const openingSessions = await rpc<Array<{
      id: number;
      state: string;
      cash_register_balance_start?: number;
    }>>(sessionId, "pos.session", "search_read", [[
      ["id", "=", refreshedSessionId],
    ]], companyContext, request);
    const openingSession = openingSessions?.[0];
    if (!openingSession) throw new OpenSessionError("Orithos did not return the opening POS session", 502);
    if (openingSession.state === "opening_control") {
      const openingCash = body.openingCash ?? openingSession.cash_register_balance_start ?? 0;
      const openingNotes = typeof body.openingNotes === "string" ? body.openingNotes.trim().slice(0, 200) : "";
      await rpc(sessionId, "pos.session", "set_opening_control", [[refreshedSessionId], openingCash, openingNotes], companyContext, request);
    }
    return NextResponse.json({ opened: true, configId, sessionId: refreshedSessionId, openingCash: body.openingCash ?? openingSession.cash_register_balance_start ?? 0 }, { status: 200 });
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      const response = NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const message = error instanceof Error ? error.message : "Orithos could not open the POS register";
    const status = error instanceof OpenSessionError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}
