import { NextRequest, NextResponse } from "next/server";
import { companyReportRpc } from "@/lib/report-odoo";
import { reportAccess } from "@/lib/report-request";
import { readShopfrontSyncState } from "@/lib/report-snapshots";
import { isValidBusinessDay, localMidnightUtc, shiftDay } from "@/lib/replenishment-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
const csvCell = (value: string | number) => {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

export async function GET(request: NextRequest) {
  try {
    const { scope, sessionId, company } = await reportAccess(request);
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const offsetValue = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    const exceptionsOnly = request.nextUrl.searchParams.get("exceptions") === "true";
    const exportCsv = request.nextUrl.searchParams.get("export") === "csv";
    if (!from || !to || !isValidBusinessDay(from) || !isValidBusinessDay(to) || from > to || !Number.isSafeInteger(offsetValue) || offsetValue < 0) {
      return NextResponse.json({ message: "Choose a valid date range and page." }, { status: 400 });
    }
    const dayCount = (Date.parse(`${shiftDay(to, 1)}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
    if (dayCount > 366) return NextResponse.json({ message: "Closure history ranges are limited to 366 days." }, { status: 400 });
    const start = localMidnightUtc(from, scope.timezone);
    const endLocal = localMidnightUtc(shiftDay(to, 1), scope.timezone);
    const domain: unknown[] = [["company_id", "=", scope.companyId], ["state", "=", "closed"], ["stop_at", ">=", start], ["stop_at", "<", endLocal]];
    const rpc = companyReportRpc(scope.companyId);
    const [sessionTotal, rows] = await Promise.all([
      rpc<number>(sessionId, "pos.session", "search_count", [domain]),
      rpc<Array<Record<string, unknown>>>(sessionId, "pos.session", "search_read", [domain], {
        fields: ["id", "name", "state", "config_id", "user_id", "start_at", "stop_at", "cash_register_balance_end", "cash_register_balance_end_real"],
        limit: exceptionsOnly || exportCsv ? 10001 : PAGE_SIZE,
        offset: exceptionsOnly || exportCsv ? 0 : offsetValue,
        order: "stop_at desc, id desc",
      }),
    ]);
    if ((exceptionsOnly || exportCsv) && Number(sessionTotal ?? 0) > 10000) return NextResponse.json({ message: "Too many sessions to export or calculate differences safely. Narrow the date range." }, { status: 422 });
    const allItems = (rows ?? []).map((row) => {
      const expected = typeof row.cash_register_balance_end === "number" ? row.cash_register_balance_end : null;
      const received = typeof row.cash_register_balance_end_real === "number" ? row.cash_register_balance_end_real : null;
      return { id: Number(row.id), register: Array.isArray(row.config_id) ? row.config_id[1] : "Register", name: String(row.name ?? ""), openedAt: row.start_at || null, closedAt: row.stop_at || null, expected, received, difference: expected !== null && received !== null ? Math.round((received - expected) * 100) / 100 : null };
    });
    const differences = exceptionsOnly ? allItems.filter((item) => item.difference !== null && Math.abs(item.difference) >= 0.005) : null;
    if (exportCsv) {
      const exportRows = differences ?? allItems;
      const values = [["Register", "Session", "Opened", "Closed", "Expected cash", "Received cash", "Difference"], ...exportRows.map((item) => [item.register, item.name, String(item.openedAt ?? ""), String(item.closedAt ?? ""), item.expected ?? "", item.received ?? "", item.difference ?? ""])];
      const csv = `\uFEFF${values.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="register-closures-${from}-${to}.csv"`, "Cache-Control": "no-store" } });
    }
    const total = differences?.length ?? Number(sessionTotal ?? 0);
    const items = differences ? differences.slice(offsetValue, offsetValue + PAGE_SIZE) : allItems;
    const shopfrontSync = scope.shopfrontStore ? await readShopfrontSyncState(scope, from, to) : null;
    return NextResponse.json({ company: company.name, currency: company.currency, timezone: scope.timezone, source: "Odoo closed register sessions", shopfrontSync, from, to, generatedAt: new Date().toISOString(), total, offset: offsetValue, hasNext: offsetValue + items.length < total, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Register closure history is unavailable." }, { status });
  }
}
