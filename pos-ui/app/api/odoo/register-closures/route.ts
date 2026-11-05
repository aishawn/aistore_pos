import { NextRequest, NextResponse } from "next/server";
import { companyReportRpc } from "@/lib/report-odoo";
import { reportAccess } from "@/lib/report-request";
import { summarizeRegisterClosures } from "@/lib/register-closure-summary";
import { isValidBusinessDay, localMidnightUtc, shiftDay } from "@/lib/replenishment-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
const FETCH_BATCH_SIZE = 1000;
const MAX_FULL_RESULT_ROWS = 10000;
const EXPORT_COLUMNS = ["register", "opened", "closed", "expected", "received", "difference"] as const;
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
    const printAll = request.nextUrl.searchParams.get("export") === "print";
    const summaryOnly = request.nextUrl.searchParams.get("export") === "summary";
    const requestedColumns = request.nextUrl.searchParams.get("columns");
    const exportColumns = requestedColumns ? requestedColumns.split(",") : [...EXPORT_COLUMNS];
    if (!from || !to || !isValidBusinessDay(from) || !isValidBusinessDay(to) || from > to || !Number.isSafeInteger(offsetValue) || offsetValue < 0) {
      return NextResponse.json({ message: "Choose a valid date range and page." }, { status: 400 });
    }
    if (!exportColumns.length || exportColumns.length > EXPORT_COLUMNS.length || new Set(exportColumns).size !== exportColumns.length || exportColumns.some((column) => !EXPORT_COLUMNS.includes(column as typeof EXPORT_COLUMNS[number]))) {
      return NextResponse.json({ message: "Choose valid register columns." }, { status: 400 });
    }
    const dayCount = (Date.parse(`${shiftDay(to, 1)}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
    if (dayCount > 366) return NextResponse.json({ message: "Closure history ranges are limited to 366 days." }, { status: 400 });
    const start = localMidnightUtc(from, scope.timezone);
    const endLocal = localMidnightUtc(shiftDay(to, 1), scope.timezone);
    const domain: unknown[] = [["company_id", "=", scope.companyId], ["state", "=", "closed"], ["stop_at", ">=", start], ["stop_at", "<", endLocal]];
    const rpc = companyReportRpc(scope.companyId);
    const sessionTotal = await rpc<number>(sessionId, "pos.session", "search_count", [domain]);
    const fields = ["id", "name", "state", "config_id", "user_id", "start_at", "stop_at", "cash_register_balance_end", "cash_register_balance_end_real"];
    let rows: Array<Record<string, unknown>> = [];
    if ((exceptionsOnly || exportCsv || printAll || summaryOnly) && Number(sessionTotal ?? 0) > MAX_FULL_RESULT_ROWS) {
      return NextResponse.json({ message: "This full result exceeds 10,000 sessions. Narrow the date range before filtering, exporting, or printing." }, { status: 422 });
    }
    if (exceptionsOnly || exportCsv || printAll || summaryOnly) {
      for (let offset = 0; offset < Number(sessionTotal ?? 0); offset += FETCH_BATCH_SIZE) {
        const batch = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.session", "search_read", [domain], {
          fields, limit: FETCH_BATCH_SIZE, offset, order: "stop_at desc, id desc",
        });
        rows.push(...(batch ?? []));
        if (!batch?.length) break;
      }
    } else {
      rows = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.session", "search_read", [domain], {
        fields, limit: PAGE_SIZE, offset: offsetValue, order: "stop_at desc, id desc",
      }) ?? [];
    }
    const allItems = (rows ?? []).map((row) => {
      const expected = typeof row.cash_register_balance_end === "number" ? row.cash_register_balance_end : null;
      const received = typeof row.cash_register_balance_end_real === "number" ? row.cash_register_balance_end_real : null;
      return { id: Number(row.id), register: Array.isArray(row.config_id) ? row.config_id[1] : "Register", name: String(row.name ?? ""), openedAt: row.start_at || null, closedAt: row.stop_at || null, expected, received, difference: expected !== null && received !== null ? Math.round((received - expected) * 100) / 100 : null };
    });
    const differences = exceptionsOnly ? allItems.filter((item) => item.difference !== null && Math.abs(item.difference) >= 0.005) : null;
    const resultItems = differences ?? allItems;
    const summary = summarizeRegisterClosures(resultItems);
    if (exportCsv) {
      const exportRows = resultItems;
      const headers: Record<typeof EXPORT_COLUMNS[number], string> = { register: "Register", opened: "Opened", closed: "Closed", expected: "Expected cash", received: "Received cash", difference: "Received minus expected" };
      const fields: Record<typeof EXPORT_COLUMNS[number], (item: typeof allItems[number]) => string | number> = { register: (item) => item.register, opened: (item) => String(item.openedAt ?? ""), closed: (item) => String(item.closedAt ?? ""), expected: (item) => item.expected ?? "", received: (item) => item.received ?? "", difference: (item) => item.difference ?? "" };
      const values: Array<Array<string | number>> = [exportColumns.map((column) => headers[column as typeof EXPORT_COLUMNS[number]]), ...exportRows.map((item) => exportColumns.map((column) => fields[column as typeof EXPORT_COLUMNS[number]](item)))];
      values.push(exportColumns.map((column) => {
        if (column === "register") return "Total";
        if (column === "expected") return summary.expectedCash;
        if (column === "received") return summary.receivedCash;
        if (column === "difference") return summary.cashDifference;
        return "";
      }));
      const csv = `\uFEFF${values.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="register-closures-${from}-${to}.csv"`, "Cache-Control": "no-store" } });
    }
    const total = differences?.length ?? Number(sessionTotal ?? 0);
    if (summaryOnly) return NextResponse.json({ summary, total, from, to }, { headers: { "Cache-Control": "no-store" } });
    if (printAll) return NextResponse.json({ company: company.name, currency: company.currency, timezone: scope.timezone, source: "Odoo closed register sessions", from, to, generatedAt: new Date().toISOString(), total, offset: 0, hasNext: false, items: resultItems }, { headers: { "Cache-Control": "no-store" } });
    const items = differences ? differences.slice(offsetValue, offsetValue + PAGE_SIZE) : allItems;
    return NextResponse.json({ company: company.name, currency: company.currency, timezone: scope.timezone, source: "Odoo closed register sessions", from, to, generatedAt: new Date().toISOString(), total, offset: offsetValue, hasNext: offsetValue + items.length < total, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Register closure history is unavailable." }, { status });
  }
}
