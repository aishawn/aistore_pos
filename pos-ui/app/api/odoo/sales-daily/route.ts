import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { getOdooCompanyTimezone } from "@/lib/odoo-store-timezone";
import { isSameOrigin } from "@/lib/server-auth";
import { odooCompanyContext } from "@/lib/odoo-tenant-company";
import { requirePermission } from "@/lib/store-access";
import { parseDailySalesGroup, mergeDailySalesGroups } from "@/lib/sales-daily";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_LIMIT = 100;
const PERIOD_HOURS: Record<string, number> = { "24h": 24, "7d": 168, "30d": 720, "90d": 2160, "180d": 4320 };
const FINAL_STATES = ["paid", "done", "invoiced"];

type Status = "all" | "completed" | "refunded" | "cancelled" | "draft";

function baseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/u, "");
  if (!value) throw new Error("Orithos connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Orithos connection must use HTTPS");
  return value;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  const response = await fetch(`${baseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Orithos daily sales are unavailable");
  const payload = await response.json() as { result?: T; error?: { message?: string; data?: { message?: string } } };
  if (payload.error) throw new Error(payload.error.message ?? payload.error.data?.message ?? "Orithos daily sales are unavailable");
  return payload.result as T;
}

function zonedMidnightUtc(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(candidate);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
  let midnight = new Date(candidate.getTime() - (localAsUtc - candidate.getTime()));
  // Re-evaluate at local midnight because UTC midnight may follow a DST change.
  for (let i = 0; i < 3; i++) {
    const formatted = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(midnight);
    const local = Object.fromEntries(formatted.map((part) => [part.type, part.value]));
    const delta = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute), Number(local.second)) - candidate.getTime();
    if (!delta) break;
    midnight = new Date(midnight.getTime() - delta);
  }
  return midnight;
}

function odooDate(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function nextDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function statusDomain(status: Status) {
  if (status === "completed") return [["state", "in", FINAL_STATES]];
  if (status === "refunded") return [["amount_total", "<", 0]];
  if (status === "cancelled") return [["state", "=", "cancel"]];
  if (status === "draft") return [["state", "=", "draft"]];
  return [];
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return errorResponse("Cross-origin requests are not allowed", 403);
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return errorResponse("Orithos session expired", 401);

  try {
    await requirePermission(request, "sell.checkout", "sell.refund", "reports.dashboard");
    const body = await request.json() as { status?: Status; period?: string; fromDate?: string; toDate?: string; limit?: number; offset?: number };
    const status = body.status ?? "all";
    if (!["all", "completed", "refunded", "cancelled", "draft"].includes(status)) return errorResponse("Sales status filter is invalid", 400);
    if (body.period !== undefined && body.period !== "all" && !(body.period in PERIOD_HOURS)) return errorResponse("Sales period filter is invalid", 400);
    if ((body.fromDate !== undefined && !validDate(body.fromDate)) || (body.toDate !== undefined && !validDate(body.toDate))) return errorResponse("Sales date filter is invalid", 400);
    if (body.fromDate && body.toDate && body.fromDate > body.toDate) return errorResponse("Sales date range is invalid", 400);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(body.limit ?? 40))));
    const offset = Math.max(0, Math.floor(Number(body.offset ?? 0)));
    if (!Number.isFinite(limit) || !Number.isFinite(offset)) return errorResponse("Sales pagination values are invalid", 400);

    const sessionResponse = await fetch(`${baseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const sessionPayload = await sessionResponse.json() as { result?: { uid?: number; user_context?: { allowed_company_ids?: number[] } }; error?: unknown };
    const sessionInfo = sessionPayload.result;
    if (!sessionResponse.ok || sessionPayload.error || !sessionInfo?.uid) return errorResponse("Orithos session expired", 401);
    const allowed = await resolveOdooAllowedCompanyIds(sessionId, sessionInfo, request.headers.get("x-correlation-id"));
    const forced = await resolveTenantForcedCompanyIds(request, allowed);
    if (forced.error) return errorResponse(forced.error, forced.status);
    const companyId = forced.companyIds[0];
    if (!companyId) return errorResponse("No accessible Orithos company is mapped to this store.", 403);

    const company = await rpc<Array<{ currency_id?: [number, string] | false; partner_id?: [number, string] | false }>>(sessionId, "res.company", "search_read", [[["id", "=", companyId]]], { fields: ["currency_id", "partner_id"], limit: 1 });
    const partnerId = Array.isArray(company[0]?.partner_id) ? company[0].partner_id[0] : null;
    const partner = partnerId ? await rpc<Array<{ country_id?: [number, string] | false; state_id?: [number, string] | false }>>(sessionId, "res.partner", "search_read", [[["id", "=", partnerId]]], { fields: ["country_id", "state_id"], limit: 1 }) : [];
    const timezone = getOdooCompanyTimezone(partner[0]?.country_id, partner[0]?.state_id);

    const domain: unknown[] = [["company_id", "=", companyId], ...statusDomain(status)];
    if (forced.binding?.sampleDataClearedAt) domain.push("!", ["uuid", "=like", `demo-seed-${companyId}-%`]);
    if (body.fromDate || body.toDate) {
      if (body.fromDate) domain.push(["date_order", ">=", odooDate(zonedMidnightUtc(body.fromDate, timezone))]);
      if (body.toDate) domain.push(["date_order", "<", odooDate(zonedMidnightUtc(nextDate(body.toDate), timezone))]);
    } else if (body.period && body.period !== "all") {
      domain.push(["date_order", ">=", odooDate(new Date(Date.now() - PERIOD_HOURS[body.period] * 60 * 60 * 1000))]);
    }

    type Group = Record<string, unknown>;
    // Aggregate each sign separately: netting first loses refund counts and gross sales.
    const kwargs = { lazy: false, context: { ...odooCompanyContext([companyId]), tz: timezone } };
    const [sales, refunds] = await Promise.all([
      rpc<Group[]>(sessionId, "pos.order", "read_group", [[...domain, ["amount_total", ">=", 0]], ["amount_total:sum", "amount_tax:sum"], ["date_order:day"]], kwargs),
      rpc<Group[]>(sessionId, "pos.order", "read_group", [[...domain, ["amount_total", "<", 0]], ["amount_total:sum", "amount_tax:sum"], ["date_order:day"]], kwargs),
    ]);
    const allItems = mergeDailySalesGroups([...sales, ...refunds].map((row) => parseDailySalesGroup(row, timezone)));
    const items = allItems.slice(offset, offset + limit);
    return NextResponse.json({ items, hasNext: offset + limit < allItems.length, limit, offset, timezone, currency: Array.isArray(company[0]?.currency_id) ? company[0].currency_id[1] : "AUD" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos daily sales are unavailable";
    return errorResponse("Could not load daily sales. Please refresh and try again.", error && typeof error === "object" && "status" in error ? Number(error.status) : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502);
  }
}
