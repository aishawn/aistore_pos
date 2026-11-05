import { NextRequest, NextResponse } from "next/server";
import { companyReportRpc } from "@/lib/report-odoo";
import { reportAccess } from "@/lib/report-request";
import { readShopfrontSyncState } from "@/lib/report-snapshots";
import { isValidBusinessDay, localMidnightUtc, shiftDay } from "@/lib/replenishment-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GROUP_FIELDS = {
  supplier: "partner_id",
  status: "state",
  month: "date_order:month",
} as const;

export async function GET(request: NextRequest) {
  try {
    const { scope, sessionId, company } = await reportAccess(request);
    const group = request.nextUrl.searchParams.get("group") ?? "supplier";
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    if (!Object.hasOwn(GROUP_FIELDS, group)) return NextResponse.json({ message: "Choose supplier, status or month grouping." }, { status: 400 });
    if (!from || !to || !isValidBusinessDay(from) || !isValidBusinessDay(to) || from > to) {
      return NextResponse.json({ message: "Choose a valid purchase report date range." }, { status: 400 });
    }
    const dayCount = (Date.parse(`${shiftDay(to, 1)}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
    if (dayCount > 366) return NextResponse.json({ message: "Purchase report ranges are limited to 366 days." }, { status: 400 });
    const start = localMidnightUtc(from, scope.timezone);
    const end = localMidnightUtc(shiftDay(to, 1), scope.timezone);
    const domain = [["company_id", "=", scope.companyId], ["date_order", ">=", start], ["date_order", "<", end], ["state", "in", ["purchase", "done"]]];
    const rpc = companyReportRpc(scope.companyId);
    const [totals, rows] = await Promise.all([
      rpc<Array<{ amount_total?: number; __count?: number }>>(sessionId, "purchase.order", "read_group", [domain, ["amount_total:sum"], []]),
      rpc<Array<Record<string, unknown>>>(sessionId, "purchase.order", "read_group", [domain, ["amount_total:sum"], [GROUP_FIELDS[group as keyof typeof GROUP_FIELDS]]], { lazy: false }),
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
        return { label: String(label ?? "Unassigned"), count: Number(row.__count ?? 0), amount: Number(row.amount_total ?? 0) };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Purchase report is unavailable." }, { status });
  }
}
