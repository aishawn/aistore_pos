import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { isSameOrigin } from "@/lib/server-auth";

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
  if (!value) throw new CloseError("Odoo connection is not configured on the POS server.", 503);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new CloseError("Odoo connection must use HTTPS.", 503);
  }
  return value;
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  const response = await fetch(`${getBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model, method, args, kwargs },
      id: Date.now(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new CloseError("Odoo did not accept the close-register request.", 502);
  const payload = (await response.json()) as RpcResult<T>;
  if (payload.error) {
    const detail = payload.error.data?.message || payload.error.message || "";
    if (/session|log in|authenticate/i.test(detail)) throw new SessionExpiredError();
    throw new CloseError(detail || "Odoo rejected the close-register request.", 422);
  }
  return payload.result;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const odooSession = request.cookies.get(SESSION_COOKIE)?.value;
  if (!odooSession) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  let body: { configId?: number; countedCash?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid close-register request" }, { status: 400 });
  }
  if (!Number.isInteger(body.configId)) {
    return NextResponse.json({ message: "Choose an Odoo register to close." }, { status: 400 });
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
      headers: { "Content-Type": "application/json", Cookie: `session_id=${odooSession}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const sessionInfo = (await sessionInfoResponse.json()) as RpcResult<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    const companyIds = await resolveOdooAllowedCompanyIds(odooSession, sessionInfo.result);
    if (!sessionInfoResponse.ok || sessionInfo.error || !sessionInfo.result?.uid) throw new SessionExpiredError();
    if (!companyIds.length) throw new CloseError("This Odoo user has no accessible company.", 403);

    const configs = await rpc<Array<{
      id: number;
      name: string;
      current_session_id: [number, string] | false;
      company_id: [number, string] | false;
      payment_method_ids: number[];
    }>>(odooSession, "pos.config", "search_read", [[
      ["id", "=", body.configId],
      ["company_id", "in", companyIds],
    ]], { fields: ["id", "name", "current_session_id", "company_id", "payment_method_ids"], limit: 1 });
    const config = configs?.[0];
    if (!config) throw new CloseError("This register is not available to your Odoo user.", 403);
    const paymentMethods = config.payment_method_ids.length
      ? await rpc<Array<{ id: number; is_cash_count: boolean }>>(odooSession, "pos.payment.method", "search_read", [[
          ["id", "in", config.payment_method_ids],
        ]], { fields: ["id", "is_cash_count"], limit: 100 }) ?? []
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
    );
    if (!sessions?.length) throw new CloseError("The POS session is no longer open.", 409);

    if (body.countedCash != null) {
      await rpc(odooSession, "pos.session", "write", [[sessionId], {
        cash_register_balance_end_real: Math.round(Number(body.countedCash) * 100) / 100,
      }]);
    }

    // Prefer the UI closing control used by Odoo POS; fall back to closing control action.
    try {
      await rpc(odooSession, "pos.session", "action_pos_session_closing_control", [[sessionId]]);
    } catch (primary) {
      try {
        await rpc(odooSession, "pos.session", "close_session_from_ui", [[sessionId]]);
      } catch {
        throw primary;
      }
    }

    const after = await rpc<Array<{ id: number; state: string }>>(
      odooSession,
      "pos.session",
      "search_read",
      [[["id", "=", sessionId]]],
      { fields: ["id", "state"], limit: 1 },
    );

    return NextResponse.json({
      sessionId,
      sessionName,
      registerName: config.name,
      state: after?.[0]?.state ?? "closing_control",
      message: "Register close requested in Odoo. Confirm cash differences in Odoo if the session remains in closing control.",
    }, { status: 200 });
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      const response = NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const status = error instanceof CloseError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Could not close the Odoo register.";
    return NextResponse.json({ message }, { status });
  }
}
