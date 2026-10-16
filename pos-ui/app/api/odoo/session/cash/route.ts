import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";

type RpcResult<T> = { result?: T; error?: { message?: string; data?: { message?: string; name?: string } } };

class SessionExpiredError extends Error {}
class CashError extends Error {
  constructor(message: string, public readonly status = 422) {
    super(message);
  }
}

function getBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new CashError("Odoo connection is not configured on the POS server.", 503);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new CashError("Odoo connection must use HTTPS.", 503);
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
  if (!response.ok) throw new CashError("Odoo did not accept the cash request.", 502);
  const payload = (await response.json()) as RpcResult<T>;
  if (payload.error) {
    const detail = payload.error.data?.message || payload.error.message || "";
    if (/session|log in|authenticate/i.test(detail)) throw new SessionExpiredError();
    throw new CashError(detail || "Odoo rejected the cash request.", 422);
  }
  return payload.result;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const odooSession = request.cookies.get(SESSION_COOKIE)?.value;
  if (!odooSession) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  let body: { configId?: number; direction?: string; amount?: number; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid cash request" }, { status: 400 });
  }

  if (!Number.isInteger(body.configId)) {
    return NextResponse.json({ message: "Choose an Odoo register." }, { status: 400 });
  }
  const direction = (body.direction || "").toLowerCase();
  if (direction !== "in" && direction !== "out") {
    return NextResponse.json({ message: "Direction must be in or out." }, { status: 400 });
  }
  if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 1_000_000) {
    return NextResponse.json({ message: "Enter a cash amount greater than zero." }, { status: 400 });
  }
  const amount = Math.round(body.amount * 100) / 100;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";

  try {
    const sessionInfoResponse = await fetch(`${getBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session_id=${odooSession}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const sessionInfo = (await sessionInfoResponse.json()) as RpcResult<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    if (!sessionInfoResponse.ok || sessionInfo.error || !sessionInfo.result?.uid) throw new SessionExpiredError();
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(odooSession, sessionInfo.result);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) throw new CashError(forced.error, forced.status);
    const companyIds = forced.companyIds;
    if (!companyIds.length) throw new CashError("This Odoo user has no accessible company.", 403);
    const companyContext = { allowed_company_ids: companyIds, force_company: companyIds[0] };

    const configs = await rpc<Array<{
      id: number;
      name: string;
      current_session_id: [number, string] | false;
      company_id: [number, string] | false;
    }>>(odooSession, "pos.config", "search_read", [[
      ["id", "=", body.configId],
      ["company_id", "in", companyIds],
    ]], { fields: ["id", "name", "current_session_id", "company_id"], limit: 1, context: companyContext });
    const config = configs?.[0];
    if (!config) throw new CashError("This register is not available to your Odoo user.", 403);
    if (!config.current_session_id) throw new CashError("Open a POS session before managing cash.", 409);

    const sessionId = config.current_session_id[0];
    const sessions = await rpc<Array<{
      id: number;
      name: string;
      state: string;
      cash_register_balance_end?: number;
      cash_register_balance_start?: number;
    }>>(odooSession, "pos.session", "search_read", [[
      ["id", "=", sessionId],
      ["state", "=", "opened"],
    ]], {
      fields: ["id", "name", "state", "cash_register_balance_end", "cash_register_balance_start"],
      limit: 1,
      context: companyContext,
    });
    const session = sessions?.[0];
    if (!session) throw new CashError("The POS session is not open.", 409);

    const signedAmount = direction === "out" ? -amount : amount;
    if (direction === "out") {
      const drawer = typeof session.cash_register_balance_end === "number"
        ? session.cash_register_balance_end
        : typeof session.cash_register_balance_start === "number"
          ? session.cash_register_balance_start
          : null;
      if (drawer != null && signedAmount + drawer < -0.001) {
        throw new CashError("Cash out would drive the drawer negative. Enter a smaller amount.", 422);
      }
    }

    const note = reason || (direction === "in" ? "Orithos cash in" : "Orithos cash out");

    // Prefer native POS cash in/out when available (Odoo 16+/17).
    try {
      await rpc<unknown>(odooSession, "pos.session", "try_cash_in_out", [[session.id], direction, amount, note], { context: companyContext });
    } catch (primaryError) {
      const message = primaryError instanceof Error ? primaryError.message : "";
      if (/try_cash_in_out|AttributeError|does not exist/i.test(message)) {
        // Fallback: post a cashbox statement line when the helper is missing.
        await rpc<unknown>(odooSession, "pos.session", "set_cashbox_pos", [[session.id], amount, note], { context: companyContext }).catch(async () => {
          throw new CashError(
            "This Odoo build does not expose cash in/out over RPC. Use Open in Odoo POS for drawer adjustments, then Close Register for end-of-day count.",
            501,
          );
        });
      } else {
        throw primaryError;
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      sessionName: session.name,
      configId: config.id,
      direction,
      amount,
      reason: note,
      recordedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      const response = NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = error instanceof CashError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}
