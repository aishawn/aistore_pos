import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";
import { requirePermission, StoreAccessError } from "@/lib/store-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";

type RpcResult<T> = { result?: T; error?: { message?: string; data?: { message?: string } } };

class SessionExpiredError extends Error {}
class CloseError extends Error {
  constructor(message: string, public readonly status = 422) { super(message); }
}

function getBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new CloseError("Orithos connection is not configured on the POS server.", 503);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new CloseError("Orithos connection must use HTTPS.", 503);
  }
  return value;
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null) {
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${getBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model, method, args, kwargs },
      id: Date.now(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new CloseError("Orithos did not accept the close-register request.", 502);
  const payload = (await response.json()) as RpcResult<T>;
  if (payload.error) {
    const detail = payload.error.data?.message || payload.error.message || "";
    if (/session|log in|authenticate/i.test(detail)) throw new SessionExpiredError();
    throw new CloseError(detail || "Orithos rejected the close-register request.", 422);
  }
  return payload.result;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    await requirePermission(request, "sell.register.close");
  } catch (error) {
    if (error instanceof StoreAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
  const odooSession = request.cookies.get(SESSION_COOKIE)?.value;
  if (!odooSession) return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
  const correlationId = request.headers.get("x-correlation-id");

  let body: { configId?: number; countedCash?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid close-register request" }, { status: 400 });
  }
  if (!Number.isInteger(body.configId)) {
    return NextResponse.json({ message: "Choose an Orithos register to close." }, { status: 400 });
  }
  if (body.countedCash != null && (
    typeof body.countedCash !== "number"
    || !Number.isFinite(body.countedCash)
    || body.countedCash < 0
    || body.countedCash > 1_000_000
  )) {
    return NextResponse.json({ message: "Enter a valid counted cash amount, or leave it blank." }, { status: 400 });
  }

  try {
    const sessionInfoResponse = await fetch(`${getBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${odooSession}` }, request),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const sessionInfo = (await sessionInfoResponse.json()) as RpcResult<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    if (!sessionInfoResponse.ok || sessionInfo.error || !sessionInfo.result?.uid) throw new SessionExpiredError();
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(odooSession, sessionInfo.result, correlationId);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) throw new CloseError(forced.error, forced.status);
    const companyIds = forced.companyIds;
    if (!companyIds.length) throw new CloseError("This Orithos user has no accessible company.", 403);

    const configs = await rpc<Array<{
      id: number;
      name: string;
      current_session_id: [number, string] | false;
      company_id: [number, string] | false;
      payment_method_ids: number[];
    }>>(odooSession, "pos.config", "search_read", [[
      ["id", "=", body.configId],
      ["company_id", "in", companyIds],
    ]], { fields: ["id", "name", "current_session_id", "company_id", "payment_method_ids"], limit: 1 }, correlationId);
    const config = configs?.[0];
    if (!config) throw new CloseError("This register is not available to your Orithos user.", 403);
    const paymentMethods = config.payment_method_ids.length
      ? await rpc<Array<{ id: number; is_cash_count: boolean }>>(odooSession, "pos.payment.method", "search_read", [[
          ["id", "in", config.payment_method_ids],
        ]], { fields: ["id", "is_cash_count"], limit: 100 }, correlationId) ?? []
      : [];
    if (paymentMethods.some((method) => method.is_cash_count) && body.countedCash == null) {
      throw new CloseError("Count the cash in the drawer before closing this register.", 422);
    }
    if (!Array.isArray(config.current_session_id)) {
      throw new CloseError("This register has no open POS session to close.", 409);
    }
    const [sessionId, sessionName] = config.current_session_id;

    const sessions = await rpc<Array<{ id: number; state: string; cash_register_balance_end_real?: number }>>(
      odooSession,
      "pos.session",
      "search_read",
      [[["id", "=", sessionId], ["state", "=", "opened"]]],
      { fields: ["id", "state", "cash_register_balance_end_real"], limit: 1 },
      correlationId,
    );
    if (!sessions?.length) throw new CloseError("The POS session is no longer open.", 409);

    const originalCountedCash = sessions[0].cash_register_balance_end_real ?? null;
    let countedCashWritten = false;
    try {
      if (body.countedCash != null) {
        await rpc(odooSession, "pos.session", "write", [[sessionId], {
          cash_register_balance_end_real: Math.round(Number(body.countedCash) * 100) / 100,
        }], {}, correlationId);
        countedCashWritten = true;
      }

      // Prefer the UI closing control used by Orithos POS; fall back to closing control action.
      try {
        await rpc(odooSession, "pos.session", "action_pos_session_closing_control", [[sessionId]], {}, correlationId);
      } catch (primary) {
        try {
          await rpc(odooSession, "pos.session", "close_session_from_ui", [[sessionId]], {}, correlationId);
        } catch {
          throw primary;
        }
      }
    } catch (closeError) {
      // A failed closing action must not leave a new drawer count behind.
      if (countedCashWritten) {
        try {
          await rpc(odooSession, "pos.session", "write", [[sessionId], {
            cash_register_balance_end_real: originalCountedCash,
          }], {}, correlationId);
        } catch {
          throw new CloseError("Register close failed and the counted cash could not be rolled back in Orithos.", 502);
        }
      }
      throw closeError;
    }

    const after = await rpc<Array<{ id: number; state: string }>>(
      odooSession,
      "pos.session",
      "search_read",
      [[["id", "=", sessionId]]],
      { fields: ["id", "state"], limit: 1 },
      correlationId,
    );

    return NextResponse.json({
      sessionId,
      sessionName,
      registerName: config.name,
      state: after?.[0]?.state ?? "closing_control",
      message: "Register close requested in Orithos. Confirm cash differences in Orithos if the session remains in closing control.",
    }, { status: 200 });
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      const response = NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const status = error instanceof CloseError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Could not close the Orithos register.";
    return NextResponse.json({ message }, { status });
  }
}
