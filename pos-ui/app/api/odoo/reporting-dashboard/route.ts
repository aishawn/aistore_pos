import { NextRequest, NextResponse } from "next/server";
import { getOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const ALLOWED_RANGES = new Set([8, 24, 168, 720]);

type RpcResult<T> = { result?: T; error?: { message?: string; data?: { message?: string } } };

function getOdooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Odoo connection must use HTTPS");
  }
  return value;
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
  if (!response.ok) throw new Error("Odoo reporting is unavailable");
  const payload = await response.json() as RpcResult<T>;
  if (payload.error) {
    if (/session|log in|authenticate/i.test(payload.error.message ?? "")) throw new OdooSessionExpiredError();
    throw new Error("Odoo could not load reporting data");
  }
  return payload.result;
}

class OdooSessionExpiredError extends Error {}

async function readSalesTrend(sessionId: string, domain: unknown[], rangeHours: number) {
  const granularity = rangeHours <= 24 ? "hour" : "day";
  try {
    const rows = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "read_group", [domain, ["amount_total:sum"], [`date_order:${granularity}`]], { lazy: false });
    return { rows: rows ?? [], granularity };
  } catch (error) {
    // Odoo versions before 18 do not support hourly date grouping.
    if (granularity !== "hour") throw error;
    const rows = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "read_group", [domain, ["amount_total:sum"], ["date_order:day"]], { lazy: false });
    return { rows: rows ?? [], granularity: "day" };
  }
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  const parsedRange = Number(request.nextUrl.searchParams.get("hours") ?? 8);
  const rangeHours = ALLOWED_RANGES.has(parsedRange) ? parsedRange : 8;
  const end = new Date();
  const start = new Date(end.getTime() - rangeHours * 60 * 60 * 1000);
  const from = start.toISOString().slice(0, 19).replace("T", " ");
  const to = end.toISOString().slice(0, 19).replace("T", " ");

  try {
    const sessionResponse = await fetch(`${getOdooBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!sessionResponse.ok) throw new OdooSessionExpiredError();
    const sessionPayload = await sessionResponse.json() as RpcResult<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    const session = sessionPayload.result;
    if (sessionPayload.error || !session?.uid) throw new OdooSessionExpiredError();
    const companyIds = getOdooAllowedCompanyIds(session);
    const companyId = companyIds[0];
    if (!companyId) return NextResponse.json({ message: "No Odoo companies are available to this user." }, { status: 403 });

    const domain = [
      ["company_id", "=", companyId],
      ["date_order", ">=", from],
      ["date_order", "<=", to],
      ["state", "in", ["paid", "done", "invoiced"]],
    ];
    const [count, totals, trendData, recentSales, openSessions, companies] = await Promise.all([
      rpc<number>(sessionId, "pos.order", "search_count", [domain]),
      rpc<Array<{ amount_total?: number; amount_tax?: number; __count?: number }>>(sessionId, "pos.order", "read_group", [domain, ["amount_total:sum", "amount_tax:sum"], []]),
      readSalesTrend(sessionId, domain, rangeHours),
      rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "search_read", [domain], {
        fields: ["id", "name", "pos_reference", "date_order", "amount_total", "partner_id", "session_id"],
        order: "date_order desc, id desc",
        limit: 10,
      }),
      rpc<number>(sessionId, "pos.session", "search_count", [[
        ["company_id", "=", companyId], ["state", "=", "opened"],
      ]]),
      rpc<Array<{ name?: string; currency_id?: [number, string] | false }>>(sessionId, "res.company", "search_read", [[
        ["id", "=", companyId],
      ]], { fields: ["name", "currency_id"], limit: 1 }),
    ]);

    const summary = totals?.[0] ?? {};
    return NextResponse.json({
      rangeHours,
      from,
      to,
      company: companies?.[0]?.name ?? "Current company",
      currency: Array.isArray(companies?.[0]?.currency_id) ? companies[0].currency_id[1] : "AUD",
      trendGranularity: trendData.granularity,
      revenue: Number(summary.amount_total ?? 0),
      tax: Number(summary.amount_tax ?? 0),
      transactions: Number(count ?? summary.__count ?? 0),
      openRegisters: Number(openSessions ?? 0),
      trend: trendData.rows.map((row) => ({
        label: String(row[`date_order:${trendData.granularity}`] ?? ""),
        revenue: Number(row.amount_total ?? 0),
        transactions: Number(row.__count ?? 0),
      })),
      recentSales: recentSales ?? [],
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
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
