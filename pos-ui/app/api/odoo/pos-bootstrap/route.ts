import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";

type OdooRpcEnvelope<T> = {
  result?: T;
  error?: { message?: string; data?: { message?: string } };
};

type OdooSessionInfo = {
  uid?: number;
  username?: string;
  user_context?: { allowed_company_ids?: number[] };
};

type OdooConfig = {
  id: number;
  name: string;
  company_id: [number, string] | false;
  current_session_id: [number, string] | false;
  payment_method_ids: number[];
  available_pricelist_ids: number[];
  cash_rounding: boolean;
  only_round_cash_method: boolean;
  rounding_method: [number, string] | false;
};

type OdooSession = {
  id: number;
  name: string;
  state: string;
  config_id: [number, string];
  user_id: [number, string] | false;
  start_at: string | false;
};

type OdooPaymentMethod = {
  id: number;
  name: string;
  type: string;
  is_cash_count: boolean;
};

type OdooCashRounding = { id: number; rounding: number; rounding_method: "UP" | "DOWN" | "HALF-UP" };

function getOdooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Odoo connection must use HTTPS");
  }
  return value;
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  const response = await fetch(`${getOdooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model, method, args, kwargs },
      id: Date.now(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Odoo POS configuration is unavailable");
  const payload = (await response.json()) as OdooRpcEnvelope<T>;
  if (payload.error) {
    const message = payload.error.data?.message || payload.error.message || "Odoo request failed";
    if (/session|log in|authenticate/i.test(message)) throw new OdooSessionExpiredError();
    throw new Error("Odoo could not load POS configuration");
  }
  return payload.result;
}

class OdooSessionExpiredError extends Error {}

export async function GET(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  }
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  try {
    const infoResponse = await fetch(`${getOdooBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!infoResponse.ok) throw new OdooSessionExpiredError();
    const infoPayload = (await infoResponse.json()) as OdooRpcEnvelope<OdooSessionInfo>;
    const info = infoPayload.result;
    if (infoPayload.error || !info?.uid) throw new OdooSessionExpiredError();

    const companyIds = (info.user_context?.allowed_company_ids ?? []).filter(Number.isInteger);
    if (!companyIds.length) {
      return NextResponse.json({ configs: [], activeSessionId: null, message: "No accessible Odoo companies are assigned to this user." }, { status: 200 });
    }

    const configs = (await rpc<OdooConfig[]>(sessionId, "pos.config", "search_read", [[
      ["company_id", "in", companyIds],
    ]], {
      fields: ["id", "name", "company_id", "current_session_id", "payment_method_ids", "available_pricelist_ids", "cash_rounding", "only_round_cash_method", "rounding_method"],
      limit: 100,
      order: "name asc, id asc",
    })) ?? [];

    const sessionIds = configs
      .map((config) => Array.isArray(config.current_session_id) ? config.current_session_id[0] : null)
      .filter((id): id is number => typeof id === "number");
    const sessions = sessionIds.length
      ? (await rpc<OdooSession[]>(sessionId, "pos.session", "search_read", [[
          ["id", "in", sessionIds],
          ["state", "=", "opened"],
        ]], {
          fields: ["id", "name", "state", "config_id", "user_id", "start_at"],
          limit: 100,
        })) ?? []
      : [];
    const methodIds = [...new Set(configs.flatMap((config) => config.payment_method_ids))];
    const paymentMethods = methodIds.length
      ? (await rpc<OdooPaymentMethod[]>(sessionId, "pos.payment.method", "search_read", [[
          ["id", "in", methodIds],
        ]], {
          fields: ["id", "name", "type", "is_cash_count"],
          limit: 100,
        })) ?? []
      : [];
    const roundingIds = [...new Set(configs.map((config) => Array.isArray(config.rounding_method) ? config.rounding_method[0] : null).filter((id): id is number => typeof id === "number"))];
    const roundingMethods = roundingIds.length
      ? (await rpc<OdooCashRounding[]>(sessionId, "account.cash.rounding", "search_read", [[
          ["id", "in", roundingIds],
        ]], {
          fields: ["id", "rounding", "rounding_method"],
          limit: 100,
        })) ?? []
      : [];
    const sessionsById = new Map(sessions.map((item) => [item.id, item]));
    const methodsById = new Map(paymentMethods.map((item) => [item.id, item]));
    const roundingById = new Map(roundingMethods.map((item) => [item.id, item]));

    const data = configs.map((config) => {
      const sessionIdForConfig = Array.isArray(config.current_session_id) ? config.current_session_id[0] : null;
      return {
        id: config.id,
        name: config.name,
        company: config.company_id,
        session: sessionIdForConfig ? sessionsById.get(sessionIdForConfig) ?? null : null,
        paymentMethods: config.payment_method_ids.map((id) => methodsById.get(id)).filter(Boolean),
        pricelistIds: config.available_pricelist_ids,
        cashRounding: config.cash_rounding && Array.isArray(config.rounding_method)
          ? roundingById.get(config.rounding_method[0]) ?? null
          : null,
        onlyRoundCashMethod: config.only_round_cash_method,
      };
    });

    const activeSessionId = data.find((config) => config.session)?.session?.id ?? null;
    return NextResponse.json({ configs: data, activeSessionId }, { status: 200 });
  } catch (error) {
    if (error instanceof OdooSessionExpiredError) {
      const response = NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
