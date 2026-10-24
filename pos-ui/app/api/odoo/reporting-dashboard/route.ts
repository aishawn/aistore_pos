import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { getOdooCompanyTimezone } from "@/lib/odoo-store-timezone";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
// Sliding windows in hours: 8h, 24h, 7d, 30d, 90d, 180d.
const ALLOWED_RANGES = new Set([8, 24, 168, 720, 2160, 4320]);
const DEFAULT_RANGE_HOURS = 720;

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
  if (!response.ok) throw new Error("Odoo reporting is unavailable");
  const payload = await response.json() as RpcResult<T>;
  if (payload.error) {
    if (/session|log in|authenticate/i.test(payload.error.message ?? "")) throw new OdooSessionExpiredError();
    throw new Error("Odoo could not load reporting data");
  }
  return payload.result;
}

class OdooSessionExpiredError extends Error {}

function errorResponse(message: string, status: number, correlationId?: string | null) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (correlationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(correlationId)) {
    headers.set("X-Correlation-ID", correlationId);
  }
  return NextResponse.json({ message }, { status, headers });
}

function percentDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function moneyField(row: Record<string, unknown>) {
  return Number(row.price_subtotal_incl ?? row.price_subtotal ?? row.amount_total ?? 0);
}

async function loadLineExtras(sessionId: string, lineDomain: unknown[], correlationId?: string | null) {
  const empty = { itemsSold: 0, compareItemsSold: 0, topProducts: [] as Array<{ id: number; name: string; qty: number; revenue: number }>, byCategory: [] as Array<{ name: string; revenue: number; share: number }> };
  try {
    const compareLineDomain = lineDomain.map((clause) => {
      if (!Array.isArray(clause) || clause.length < 3) return clause;
      const [field, op, value] = clause as [string, string, unknown];
      if (field === "order_id.date_order" && typeof value === "string") {
        const shifted = new Date(`${value.replace(" ", "T")}Z`);
        if (!Number.isNaN(shifted.getTime())) {
          shifted.setUTCDate(shifted.getUTCDate() - 7);
          return [field, op, shifted.toISOString().slice(0, 19).replace("T", " ")];
        }
      }
      return clause;
    });

    const [qtyRows, productRows, categoryRows, compareQtyRows] = await Promise.all([
      rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["qty:sum"], []], { lazy: false }, correlationId).catch(() => []),
      rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["qty:sum", "price_subtotal_incl:sum"], ["product_id"]], { lazy: false }, correlationId).catch(async () => (
        rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["qty:sum", "price_subtotal:sum"], ["product_id"]], { lazy: false }, correlationId).catch(() => [])
      )),
      rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["price_subtotal_incl:sum"], ["product_id.categ_id"]], { lazy: false }, correlationId).catch(async () => (
        rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["price_subtotal:sum"], ["product_id.categ_id"]], { lazy: false }, correlationId).catch(() => [])
      )),
      rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [compareLineDomain, ["qty:sum"], []], { lazy: false }, correlationId).catch(() => []),
    ]);

    const itemsSold = Number(qtyRows?.[0]?.qty ?? 0);
    const compareItemsSold = Number(compareQtyRows?.[0]?.qty ?? 0);

    const topProducts = (productRows ?? [])
      .map((row) => {
        const product = row.product_id;
        const id = Array.isArray(product) ? Number(product[0]) : 0;
        const name = Array.isArray(product) ? String(product[1] ?? "Product") : "Product";
        return {
          id,
          name,
          qty: Number(row.qty ?? 0),
          revenue: moneyField(row),
        };
      })
      .filter((row) => row.id > 0)
      .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty)
      .slice(0, 8);

    const categoryRevenue = (categoryRows ?? []).map((row) => {
      const category = row["product_id.categ_id"] ?? row.categ_id;
      const name = Array.isArray(category) ? String(category[1] ?? "Uncategorised") : "Uncategorised";
      return { name, revenue: moneyField(row) };
    });
    const categoryTotal = categoryRevenue.reduce((sum, row) => sum + row.revenue, 0) || 1;
    const byCategory = categoryRevenue
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6)
      .map((row) => ({
        name: row.name,
        revenue: row.revenue,
        share: Math.round((row.revenue / categoryTotal) * 1000) / 10,
      }));

    return { itemsSold, compareItemsSold, topProducts, byCategory };
  } catch {
    return empty;
  }
}

async function readSalesTrend(sessionId: string, domain: unknown[], rangeHours: number, timezone: string, correlationId?: string | null) {
  // Hourly for short windows; daily through 30d; weekly for 90d/180d so the chart stays readable.
  const granularity = rangeHours <= 24 ? "hour" : rangeHours <= 720 ? "day" : "week";
  try {
    const rows = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "read_group", [domain, ["amount_total:sum"], [`date_order:${granularity}`]], { lazy: false, context: { tz: timezone } }, correlationId);
    return { rows: rows ?? [], granularity };
  } catch (error) {
    // Older Odoo builds may lack hour/week date grouping — fall back to day.
    if (granularity === "day") throw error;
    const rows = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "read_group", [domain, ["amount_total:sum"], ["date_order:day"]], { lazy: false, context: { tz: timezone } }, correlationId);
    return { rows: rows ?? [], granularity: "day" };
  }
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "development" && request.cookies.get("orithos_local_preview")?.value === "1") {
    return NextResponse.json({
      rangeHours: 24,
      company: "Orithos Local Preview",
      currency: "AUD",
      timezone: "Australia/Adelaide",
      revenue: 1234.5,
      grossSales: 1234.5,
      refunds: 0,
      refundTransactions: 0,
      tax: 112.23,
      transactions: 18,
      itemsSold: 24,
      openRegisters: 1,
      // Explicitly local-preview-only, so the UI can exercise the insight
      // affordances without implying that production reporting has these fields.
      opportunities: 1,
      lowStockCount: 3,
      newCustomers: 0,
      trend: [],
      recentSales: [],
      topProducts: [],
      byCategory: [],
      compare: { revenue: 0, transactions: 0, itemsSold: 0, revenueDeltaPct: null, transactionsDeltaPct: null, itemsSoldDeltaPct: null, averageSaleDeltaPct: null },
    });
  }
  const correlationId = request.headers.get("x-correlation-id");
  if (!isSameOrigin(request)) return errorResponse("Cross-origin requests are not allowed", 403, correlationId);
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return errorResponse("Odoo session expired", 401, correlationId);

  const parsedRange = Number(request.nextUrl.searchParams.get("hours") ?? DEFAULT_RANGE_HOURS);
  const rangeHours = ALLOWED_RANGES.has(parsedRange) ? parsedRange : DEFAULT_RANGE_HOURS;
  const end = new Date();
  const start = new Date(end.getTime() - rangeHours * 60 * 60 * 1000);
  const from = start.toISOString().slice(0, 19).replace("T", " ");
  const to = end.toISOString().slice(0, 19).replace("T", " ");

  try {
    const sessionResponse = await fetch(`${getOdooBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!sessionResponse.ok) throw new OdooSessionExpiredError();
    const sessionPayload = await sessionResponse.json() as RpcResult<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    const session = sessionPayload.result;
    if (sessionPayload.error || !session?.uid) throw new OdooSessionExpiredError();
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, session, correlationId);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) return errorResponse(forced.error, forced.status, correlationId);
    const companyId = forced.companyIds[0];
    if (!companyId) return errorResponse("No Odoo companies are available to this user.", 403, correlationId);
    const companies = await rpc<Array<{ name?: string; currency_id?: [number, string] | false; partner_id?: [number, string] | false }>>(sessionId, "res.company", "search_read", [[
      ["id", "=", companyId],
    ]], { fields: ["name", "currency_id", "partner_id"], limit: 1 }, correlationId);
    const partnerId = Array.isArray(companies?.[0]?.partner_id) ? companies[0].partner_id[0] : null;
    const partners = partnerId ? await rpc<Array<{ state_id?: [number, string] | false; country_id?: [number, string] | false }>>(sessionId, "res.partner", "search_read", [[
      ["id", "=", partnerId],
    ]], { fields: ["state_id", "country_id"], limit: 1 }, correlationId) : [];
    const timezone = getOdooCompanyTimezone(partners?.[0]?.country_id, partners?.[0]?.state_id);

    const excludeDemoSeed = Boolean(forced.binding?.sampleDataClearedAt);
    const demoUuidPrefix = `demo-seed-${companyId}-%`;
    const excludeDemoOrderClause: unknown[] = ["!", ["uuid", "=like", demoUuidPrefix]];
    const excludeDemoLineClause: unknown[] = ["!", ["order_id.uuid", "=like", demoUuidPrefix]];

    const domain = [
      ["company_id", "=", companyId],
      ["date_order", ">=", from],
      ["date_order", "<=", to],
      ["state", "in", ["paid", "done", "invoiced"]],
      ...(excludeDemoSeed ? [excludeDemoOrderClause] : []),
    ];
    // Same-length window shifted back 7 days for week-over-week deltas.
    const compareStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
    const compareEnd = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const compareFromAligned = compareStart.toISOString().slice(0, 19).replace("T", " ");
    const compareToAligned = compareEnd.toISOString().slice(0, 19).replace("T", " ");
    const compareDomain = [
      ["company_id", "=", companyId],
      ["date_order", ">=", compareFromAligned],
      ["date_order", "<=", compareToAligned],
      ["state", "in", ["paid", "done", "invoiced"]],
      ...(excludeDemoSeed ? [excludeDemoOrderClause] : []),
    ];
    const salesDomain = [...domain, ["amount_total", ">", 0]];
    const refundDomain = [...domain, ["amount_total", "<", 0]];
    const compareSalesDomain = [...compareDomain, ["amount_total", ">", 0]];
    const lineDomain = [
      ["order_id.company_id", "=", companyId],
      ["order_id.date_order", ">=", from],
      ["order_id.date_order", "<=", to],
      ["order_id.state", "in", ["paid", "done", "invoiced"]],
      ["order_id.amount_total", ">", 0],
      ...(excludeDemoSeed ? [excludeDemoLineClause] : []),
    ];

    const [count, totals, grossTotals, refundCount, refundTotals, trendData, recentSales, openSessions, compareCount, compareTotals, compareGrossTotals, lineExtras] = await Promise.all([
      rpc<number>(sessionId, "pos.order", "search_count", [salesDomain], {}, correlationId),
      rpc<Array<{ amount_total?: number; amount_tax?: number; __count?: number }>>(sessionId, "pos.order", "read_group", [domain, ["amount_total:sum", "amount_tax:sum"], []], {}, correlationId),
      rpc<Array<{ amount_total?: number }>>(sessionId, "pos.order", "read_group", [salesDomain, ["amount_total:sum"], []], {}, correlationId),
      rpc<number>(sessionId, "pos.order", "search_count", [refundDomain], {}, correlationId),
      rpc<Array<{ amount_total?: number }>>(sessionId, "pos.order", "read_group", [refundDomain, ["amount_total:sum"], []], {}, correlationId),
      readSalesTrend(sessionId, salesDomain, rangeHours, timezone, correlationId),
      rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "search_read", [domain], {
        fields: ["id", "name", "pos_reference", "date_order", "amount_total", "partner_id", "session_id"],
        order: "date_order desc, id desc",
        limit: 10,
      }, correlationId),
      rpc<number>(sessionId, "pos.session", "search_count", [[
        ["company_id", "=", companyId], ["state", "=", "opened"],
      ]], {}, correlationId),
      rpc<number>(sessionId, "pos.order", "search_count", [compareSalesDomain], {}, correlationId).catch(() => 0),
      rpc<Array<{ amount_total?: number; amount_tax?: number; __count?: number }>>(sessionId, "pos.order", "read_group", [compareDomain, ["amount_total:sum", "amount_tax:sum"], []], {}, correlationId).catch(() => []),
      rpc<Array<{ amount_total?: number }>>(sessionId, "pos.order", "read_group", [compareSalesDomain, ["amount_total:sum"], []], {}, correlationId).catch(() => []),
      loadLineExtras(sessionId, lineDomain, correlationId),
    ]);

    const summary = totals?.[0] ?? {};
    const grossSummary = grossTotals?.[0] ?? {};
    const refundSummary = refundTotals?.[0] ?? {};
    const compareSummary = compareTotals?.[0] ?? {};
    const revenue = Number(summary.amount_total ?? 0);
    const transactions = Number(count ?? summary.__count ?? 0);
    const grossSales = Number(grossSummary.amount_total ?? 0);
    const refunds = Math.abs(Number(refundSummary.amount_total ?? 0));
    const refundTransactions = Number(refundCount ?? 0);
    const compareRevenue = Number(compareSummary.amount_total ?? 0);
    const compareTransactions = Number(compareCount ?? compareSummary.__count ?? 0);
    const compareGrossSales = Number(compareGrossTotals?.[0]?.amount_total ?? 0);

    return NextResponse.json({
      rangeHours,
      from,
      to,
      company: companies?.[0]?.name ?? "Current company",
      currency: Array.isArray(companies?.[0]?.currency_id) ? companies[0].currency_id[1] : "AUD",
      timezone,
      sampleDataCleared: excludeDemoSeed,
      sampleDataClearedAt: forced.binding?.sampleDataClearedAt ?? null,
      trendGranularity: trendData.granularity,
      revenue,
      grossSales,
      refunds,
      refundTransactions,
      tax: Number(summary.amount_tax ?? 0),
      transactions,
      itemsSold: lineExtras.itemsSold,
      openRegisters: Number(openSessions ?? 0),
      trend: trendData.rows.map((row) => ({
        label: String(row[`date_order:${trendData.granularity}`] ?? ""),
        revenue: Number(row.amount_total ?? 0),
        transactions: Number(row.__count ?? 0),
      })),
      recentSales: recentSales ?? [],
      topProducts: lineExtras.topProducts,
      byCategory: lineExtras.byCategory,
      compare: {
        from: compareFromAligned,
        to: compareToAligned,
        revenue: compareRevenue,
        transactions: compareTransactions,
        itemsSold: lineExtras.compareItemsSold,
        revenueDeltaPct: percentDelta(revenue, compareRevenue),
        transactionsDeltaPct: percentDelta(transactions, compareTransactions),
        itemsSoldDeltaPct: percentDelta(lineExtras.itemsSold, lineExtras.compareItemsSold),
        averageSaleDeltaPct: percentDelta(
          transactions ? grossSales / transactions : 0,
          compareTransactions ? compareGrossSales / compareTransactions : 0,
        ),
      },
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OdooSessionExpiredError) {
      const response = errorResponse("Odoo session expired", 401, correlationId);
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return errorResponse(message, status, correlationId);
  }
}
