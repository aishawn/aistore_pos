import { NextRequest, NextResponse } from "next/server";
import { companyReportRpc } from "@/lib/report-odoo";
import { reportAccess } from "@/lib/report-request";
import { readShopfrontSyncState } from "@/lib/report-snapshots";
import { isValidBusinessDay, localMidnightUtc, shiftDay } from "@/lib/replenishment-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const GROUPS = ["day", "product", "category"] as const;
type Group = typeof GROUPS[number];
type Row = { label: string; count: number; quantity: number | null; amount: number };

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const { scope, sessionId, company, binding } = await reportAccess(request);
    const from = request.nextUrl.searchParams.get("from"); const to = request.nextUrl.searchParams.get("to");
    const group = request.nextUrl.searchParams.get("group") as Group | null;
    const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
    const exportCsv = request.nextUrl.searchParams.get("export") === "csv";
    if (!from || !to || !isValidBusinessDay(from) || !isValidBusinessDay(to) || from > to || !group || !GROUPS.includes(group) || !Number.isSafeInteger(offset) || offset < 0) {
      return NextResponse.json({ message: "Choose valid dates and a sales grouping." }, { status: 400 });
    }
    const start = localMidnightUtc(from, scope.timezone);
    const end = localMidnightUtc(shiftDay(to, 1), scope.timezone);
    const dayCount = (Date.parse(`${shiftDay(to, 1)}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
    if (dayCount > 366) return NextResponse.json({ message: "Sales report ranges are limited to 366 days." }, { status: 400 });
    const orderDomain: unknown[] = [["company_id", "=", scope.companyId], ["date_order", ">=", start], ["date_order", "<", end], ["state", "in", ["paid", "done", "invoiced"]], ["amount_total", ">", 0]];
    const lineDomain: unknown[] = [["order_id.company_id", "=", scope.companyId], ["order_id.date_order", ">=", start], ["order_id.date_order", "<", end], ["order_id.state", "in", ["paid", "done", "invoiced"]], ["order_id.amount_total", ">", 0]];
    if (binding.sampleDataClearedAt) {
      orderDomain.push("!", ["uuid", "=like", `demo-seed-${scope.companyId}-%`]);
      lineDomain.push("!", ["order_id.uuid", "=like", `demo-seed-${scope.companyId}-%`]);
    }
    const rpc = companyReportRpc(scope.companyId);
    let rows: Row[];
    if (group === "day") {
      const grouped = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "read_group", [orderDomain, ["amount_total:sum"], ["date_order:day"]], { lazy: false, context: { tz: scope.timezone } });
      rows = (grouped ?? []).map((item) => ({ label: String(item["date_order:day"] ?? ""), count: Number(item.__count ?? 0), quantity: null, amount: Number(item.amount_total ?? 0) }));
    } else {
      const grouped = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["qty:sum", "price_subtotal_incl:sum"], ["product_id"]], { lazy: false });
      const products = (grouped ?? []).filter((item) => Array.isArray(item.product_id)).map((item) => ({ id: Number((item.product_id as unknown[])[0]), label: String((item.product_id as unknown[])[1]), count: Number(item.__count ?? 0), quantity: Number(item.qty ?? 0), amount: Number(item.price_subtotal_incl ?? 0), category: "Uncategorised" }));
      if (group === "product") rows = products.map(({ label, count, quantity, amount }) => ({ label, count, quantity, amount })).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
      else {
        const productInfo = await rpc<Array<{ id: number; pos_categ_ids: Array<[number, string]> }>>(sessionId, "product.product", "read", [products.map((item) => item.id)], { fields: ["pos_categ_ids"] });
        const categoryByProduct = new Map((productInfo ?? []).map((item) => [item.id, item.pos_categ_ids?.[0]?.[1] ?? "Uncategorised"]));
        const aggregate = new Map<string, Row>();
        for (const product of products) {
          const label = categoryByProduct.get(product.id) ?? "Uncategorised";
          const row = aggregate.get(label);
          if (!row) aggregate.set(label, { label, count: product.count, quantity: product.quantity, amount: product.amount });
          else {
            row.count += product.count;
            if (row.quantity !== null) row.quantity += product.quantity;
            row.amount += product.amount;
          }
        }
        rows = [...aggregate.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
      }
    }
    if (!Array.isArray(rows)) throw new Error("Sales report data is incomplete.");
    const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
    const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
    const totalQuantity = rows.some((row) => row.quantity === null) ? null : rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
    if (exportCsv) {
      const csvRows = [["Group", "Transactions or lines", "Quantity", `Gross sales (${company.currency})`], ...rows.map((row) => [row.label, row.count, row.quantity ?? "", row.amount.toFixed(2)])];
      const csv = `\uFEFF${csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sales-report-${from}-${to}.csv"`, "Cache-Control": "no-store" } });
    }
    const pageSize = 100;
    const shopfrontSync = scope.shopfrontStore ? await readShopfrontSyncState(scope, from, to) : null;
    return NextResponse.json({ company: company.name, currency: company.currency, timezone: scope.timezone, source: "Odoo completed POS sales, excluding refunds", shopfrontSync, from, to, generatedAt: new Date().toISOString(), group, totalRows: rows.length, totalAmount, totalCount, totalQuantity, offset, hasNext: offset + pageSize < rows.length, rows: rows.slice(offset, offset + pageSize) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Sales report is unavailable." }, { status });
  }
}
