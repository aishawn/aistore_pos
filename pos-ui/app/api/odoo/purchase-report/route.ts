import { NextRequest, NextResponse } from "next/server";
import { companyReportRpc } from "@/lib/report-odoo";
import { reportAccess } from "@/lib/report-request";
import { readShopfrontSyncState } from "@/lib/report-snapshots";
import { isValidBusinessDay, localMidnightUtc, shiftDay } from "@/lib/replenishment-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DETAIL_PAGE_SIZE = 100;

const GROUP_FIELDS = {
  supplier: "partner_id",
  status: "state",
  month: "date_order:month",
  day: "date_order:day",
} as const;

export async function GET(request: NextRequest) {
  try {
    const { scope, sessionId, company } = await reportAccess(request);
    const group = request.nextUrl.searchParams.get("group") ?? "supplier";
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const detailKey = request.nextUrl.searchParams.get("detailKey");
    const detailOffset = Number(request.nextUrl.searchParams.get("detailOffset") ?? 0);
    if (!Object.hasOwn(GROUP_FIELDS, group)) return NextResponse.json({ message: "Choose supplier, status, day or month grouping." }, { status: 400 });
    if (!from || !to || !isValidBusinessDay(from) || !isValidBusinessDay(to) || from > to || !Number.isSafeInteger(detailOffset) || detailOffset < 0) {
      return NextResponse.json({ message: "Choose a valid purchase report date range." }, { status: 400 });
    }
    const dayCount = (Date.parse(`${shiftDay(to, 1)}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
    if (dayCount > 366) return NextResponse.json({ message: "Purchase report ranges are limited to 366 days." }, { status: 400 });
    const start = localMidnightUtc(from, scope.timezone);
    const end = localMidnightUtc(shiftDay(to, 1), scope.timezone);
    const domain = [["company_id", "=", scope.companyId], ["date_order", ">=", start], ["date_order", "<", end], ["state", "in", ["purchase", "done"]]];
    const rpc = companyReportRpc(scope.companyId);
    if (detailKey !== null) {
      const detailDomain: unknown[] = [...domain];
      if (group === "supplier") {
        if (detailKey === "unassigned") detailDomain.push(["partner_id", "=", false]);
        else if (/^[1-9]\d*$/.test(detailKey)) detailDomain.push(["partner_id", "=", Number(detailKey)]);
        else return NextResponse.json({ message: "Choose a valid supplier group." }, { status: 400 });
      } else if (group === "status") {
        if (detailKey !== "purchase" && detailKey !== "done") return NextResponse.json({ message: "Choose a valid purchase status group." }, { status: 400 });
        detailDomain.push(["state", "=", detailKey]);
      } else if (group === "day") {
        if (!isValidBusinessDay(detailKey) || detailKey < from || detailKey > to) return NextResponse.json({ message: "Choose a date within the report range." }, { status: 400 });
        detailDomain.push(["date_order", ">=", localMidnightUtc(detailKey, scope.timezone)], ["date_order", "<", localMidnightUtc(shiftDay(detailKey, 1), scope.timezone)]);
      } else {
        if (!/^\d{4}-\d{2}$/.test(detailKey)) return NextResponse.json({ message: "Choose a valid purchase month group." }, { status: 400 });
        const monthStart = `${detailKey}-01`;
        const monthDate = new Date(`${monthStart}T12:00:00Z`);
        monthDate.setUTCMonth(monthDate.getUTCMonth() + 1);
        const nextMonth = monthDate.toISOString().slice(0, 10);
        if (monthStart > to || nextMonth <= from) return NextResponse.json({ message: "Choose a month within the report range." }, { status: 400 });
        const boundedStart = monthStart < from ? from : monthStart;
        const boundedEnd = nextMonth > shiftDay(to, 1) ? shiftDay(to, 1) : nextMonth;
        detailDomain.push(["date_order", ">=", localMidnightUtc(boundedStart, scope.timezone)], ["date_order", "<", localMidnightUtc(boundedEnd, scope.timezone)]);
      }
      const [count, totals, items] = await Promise.all([
        rpc<number>(sessionId, "purchase.order", "search_count", [detailDomain]),
        rpc<Array<{ amount_total?: number }>>(sessionId, "purchase.order", "read_group", [detailDomain, ["amount_total:sum"], []]),
        rpc<Array<Record<string, unknown>>>(sessionId, "purchase.order", "search_read", [detailDomain], { fields: ["id", "name", "partner_id", "date_order", "state", "amount_total"], limit: DETAIL_PAGE_SIZE, offset: detailOffset, order: "date_order desc, id desc" }),
      ]);
      return NextResponse.json({ total: Number(count ?? 0), totalAmount: Number(totals?.[0]?.amount_total ?? 0), offset: detailOffset, hasNext: detailOffset + (items?.length ?? 0) < Number(count ?? 0), rows: (items ?? []).map((item) => ({ id: Number(item.id), name: String(item.name ?? ""), supplier: Array.isArray(item.partner_id) ? item.partner_id[1] : "Unassigned", date: String(item.date_order ?? ""), state: String(item.state ?? ""), amount: Number(item.amount_total ?? 0) })) }, { headers: { "Cache-Control": "no-store" } });
    }
    const [totals, rows] = await Promise.all([
      rpc<Array<{ amount_total?: number; __count?: number }>>(sessionId, "purchase.order", "read_group", [domain, ["amount_total:sum"], []]),
      rpc<Array<Record<string, unknown>>>(sessionId, "purchase.order", "read_group", [domain, ["amount_total:sum"], [GROUP_FIELDS[group as keyof typeof GROUP_FIELDS]]], { lazy: false, ...(group === "day" || group === "month" ? { context: { tz: scope.timezone } } : {}) }),
    ]);
    const shopfrontSync = scope.shopfrontStore ? await readShopfrontSyncState(scope, from, to) : null;
    return NextResponse.json({
      company: company.name,
      group,
      from,
      to,
      timezone: scope.timezone,
      generatedAt: new Date().toISOString(),
      source: "Odoo confirmed purchase orders",
      shopfrontSync,
      currency: company.currency,
      orderCount: Number(totals?.[0]?.__count ?? 0),
      totalAmount: Number(totals?.[0]?.amount_total ?? 0),
      rows: (rows ?? []).map((row) => {
        const value = row[GROUP_FIELDS[group as keyof typeof GROUP_FIELDS]];
        const label = Array.isArray(value) ? value[1] : value;
        const raw = Array.isArray(value) ? String(value[0]) : String(value ?? "Unassigned");
        const range = row.__range && typeof row.__range === "object" ? (row.__range as Record<string, { from?: string }>)[GROUP_FIELDS[group as keyof typeof GROUP_FIELDS]] : undefined;
        const dateKey = range?.from?.slice(0, 10) ?? raw.match(/\d{4}-\d{2}(?:-\d{2})?/)?.[0] ?? raw;
        const key = group === "supplier" && !Array.isArray(value) ? "unassigned" : group === "day" ? raw.slice(0, 10) : group === "month" ? raw.slice(0, 7) : raw;
        const stableKey = group === "day" || group === "month" ? dateKey.slice(0, group === "day" ? 10 : 7) : key;
        return { key: stableKey, label: String(label ?? "Unassigned"), count: Number(row.__count ?? 0), amount: Number(row.amount_total ?? 0) };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Purchase report is unavailable." }, { status });
  }
}
