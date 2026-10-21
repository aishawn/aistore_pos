import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { getOdooCompanyTimezone } from "@/lib/odoo-store-timezone";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";

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

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null) {
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${getOdooBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers,
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
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  }
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
  const correlationId = request.headers.get("x-correlation-id");

  try {
    const infoResponse = await fetch(`${getOdooBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!infoResponse.ok) throw new OdooSessionExpiredError();
    const infoPayload = (await infoResponse.json()) as OdooRpcEnvelope<OdooSessionInfo>;
    const info = infoPayload.result;
    if (infoPayload.error || !info?.uid) throw new OdooSessionExpiredError();

    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, info, correlationId);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) {
      return NextResponse.json({ configs: [], activeSessionId: null, message: forced.error }, { status: forced.status });
    }
    const companyIds = forced.companyIds;
    if (!companyIds.length) {
      return NextResponse.json({ configs: [], activeSessionId: null, message: "No accessible Odoo companies are assigned to this user." }, { status: 200 });
    }

    const configs = (await rpc<OdooConfig[]>(sessionId, "pos.config", "search_read", [[
      ["company_id", "in", companyIds],
    ]], {
      fields: ["id", "name", "company_id", "current_session_id", "payment_method_ids", "available_pricelist_ids", "cash_rounding", "only_round_cash_method", "rounding_method"],
      limit: 100,
      order: "name asc, id asc",
    }, correlationId)) ?? [];

    const configuredCompanyIds = [...new Set(configs.map((config) => Array.isArray(config.company_id) ? config.company_id[0] : null).filter((id): id is number => typeof id === "number"))];
    const companies = configuredCompanyIds.length
      ? (await rpc<Array<{ id: number; partner_id?: [number, string] | false }>>(sessionId, "res.company", "search_read", [[
          ["id", "in", configuredCompanyIds],
        ]], { fields: ["id", "partner_id"], limit: 100 }, correlationId)) ?? []
      : [];
    const partnerIds = [...new Set(companies.map((company) => Array.isArray(company.partner_id) ? company.partner_id[0] : null).filter((id): id is number => typeof id === "number"))];
    const partners = partnerIds.length
      ? (await rpc<Array<{ id: number; state_id?: [number, string] | false; country_id?: [number, string] | false }>>(sessionId, "res.partner", "search_read", [[
          ["id", "in", partnerIds],
        ]], { fields: ["id", "state_id", "country_id"], limit: 100 }, correlationId)) ?? []
      : [];
    const partnerById = new Map(partners.map((partner) => [partner.id, partner]));
    const timezoneByCompanyId = new Map(companies.map((company) => {
      const partnerId = Array.isArray(company.partner_id) ? company.partner_id[0] : null;
      const partner = partnerId ? partnerById.get(partnerId) : null;
      return [company.id, getOdooCompanyTimezone(partner?.country_id, partner?.state_id)];
    }));

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
        }, correlationId)) ?? []
      : [];
    const methodIds = [...new Set(configs.flatMap((config) => config.payment_method_ids))];
    const paymentMethods = methodIds.length
      ? (await rpc<OdooPaymentMethod[]>(sessionId, "pos.payment.method", "search_read", [[
          ["id", "in", methodIds],
        ]], {
          fields: ["id", "name", "type", "is_cash_count"],
          limit: 100,
        }, correlationId)) ?? []
      : [];
    const roundingIds = [...new Set(configs.map((config) => Array.isArray(config.rounding_method) ? config.rounding_method[0] : null).filter((id): id is number => typeof id === "number"))];
    const roundingMethods = roundingIds.length
      ? (await rpc<OdooCashRounding[]>(sessionId, "account.cash.rounding", "search_read", [[
          ["id", "in", roundingIds],
        ]], {
          fields: ["id", "rounding", "rounding_method"],
          limit: 100,
        }, correlationId)) ?? []
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
        timezone: Array.isArray(config.company_id) ? timezoneByCompanyId.get(config.company_id[0]) ?? "UTC" : "UTC",
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
