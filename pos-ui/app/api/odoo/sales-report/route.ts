import { NextRequest, NextResponse } from "next/server";
import { companyReportRpc } from "@/lib/report-odoo";
import { reportAccess } from "@/lib/report-request";
import { readShopfrontSyncState } from "@/lib/report-snapshots";
import { reconcileSalesAmounts } from "@/lib/sales-report-reconciliation";
import { summarizeSalesTotals } from "@/lib/sales-report-totals";
import { isValidBusinessDay, localMidnightUtc, shiftDay } from "@/lib/replenishment-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const GROUPS = ["day", "product", "category"] as const;
const EXPORT_COLUMNS = ["label", "count", "quantity", "amount"] as const;
type Group = typeof GROUPS[number];
type Row = { key: string; label: string; count: number; quantity: number | null; amount: number };

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
    const printAll = request.nextUrl.searchParams.get("export") === "print";
    const requestedColumns = request.nextUrl.searchParams.get("columns");
    const detailKey = request.nextUrl.searchParams.get("detailKey");
    const detailOffset = Number(request.nextUrl.searchParams.get("detailOffset") ?? 0);
    const exportColumns = requestedColumns ? requestedColumns.split(",") : [...EXPORT_COLUMNS];
    if (!from || !to || !isValidBusinessDay(from) || !isValidBusinessDay(to) || from > to || !group || !GROUPS.includes(group) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(detailOffset) || detailOffset < 0) {
      return NextResponse.json({ message: "Choose valid dates and a sales grouping." }, { status: 400 });
    }
    if (!exportColumns.length || exportColumns.length > EXPORT_COLUMNS.length || new Set(exportColumns).size !== exportColumns.length || exportColumns.some((column) => !EXPORT_COLUMNS.includes(column as typeof EXPORT_COLUMNS[number]))) {
      return NextResponse.json({ message: "Choose valid sales report columns." }, { status: 400 });
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
    if (detailKey !== null) {
      const detailPageSize = 100;
      if (group === "day") {
        if (!isValidBusinessDay(detailKey) || detailKey < from || detailKey > to) return NextResponse.json({ message: "Choose a date within the report range." }, { status: 400 });
        const detailDomain = [...orderDomain, ["date_order", ">=", localMidnightUtc(detailKey, scope.timezone)], ["date_order", "<", localMidnightUtc(shiftDay(detailKey, 1), scope.timezone)]];
        const [count, totals, items] = await Promise.all([
          rpc<number>(sessionId, "pos.order", "search_count", [detailDomain]),
          rpc<Array<{ amount_total?: number }>>(sessionId, "pos.order", "read_group", [detailDomain, ["amount_total:sum"], []]),
          rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "search_read", [detailDomain], { fields: ["id", "name", "date_order", "partner_id", "user_id", "amount_total"], limit: detailPageSize, offset: detailOffset, order: "date_order desc, id desc" }),
        ]);
        return NextResponse.json({ detailType: "orders", total: Number(count ?? 0), totalAmount: Number(totals?.[0]?.amount_total ?? 0), offset: detailOffset, hasNext: detailOffset + (items?.length ?? 0) < Number(count ?? 0), rows: (items ?? []).map((item) => ({ id: Number(item.id), order: String(item.name ?? ""), date: String(item.date_order ?? ""), customer: Array.isArray(item.partner_id) ? item.partner_id[1] : "Walk-in", cashier: Array.isArray(item.user_id) ? item.user_id[1] : "—", amount: Number(item.amount_total ?? 0) })) }, { headers: { "Cache-Control": "no-store" } });
      }
      let productIds: number[];
      if (/^[1-9]\d*$/.test(detailKey) && group === "product") productIds = [Number(detailKey)];
      else {
        const categoryId = detailKey === "uncategorized" ? null : /^[1-9]\d*$/.test(detailKey) ? Number(detailKey) : Number.NaN;
        if (group !== "category" || (categoryId !== null && !Number.isSafeInteger(categoryId))) return NextResponse.json({ message: "Choose a valid sales report group." }, { status: 400 });
        const groupedProducts = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["qty:sum", "price_subtotal_incl:sum"], ["product_id"]], { lazy: false });
        const candidates = (groupedProducts ?? []).filter((item) => Array.isArray(item.product_id)).map((item) => Number((item.product_id as unknown[])[0]));
        const productInfo = candidates.length ? await rpc<Array<{ id: number; pos_categ_ids: Array<[number, string]> }>>(sessionId, "product.product", "read", [candidates], { fields: ["pos_categ_ids"] }) : [];
        productIds = (productInfo ?? []).filter((item) => {
          const firstCategoryId = item.pos_categ_ids?.[0]?.[0];
          return categoryId === null ? !firstCategoryId : firstCategoryId === categoryId;
        }).map((item) => item.id);
      }
      const detailDomain = [...lineDomain, ["product_id", "in", productIds]];
      const [count, totals, items] = await Promise.all([
        productIds.length ? rpc<number>(sessionId, "pos.order.line", "search_count", [detailDomain]) : Promise.resolve(0),
        productIds.length ? rpc<Array<{ qty?: number; price_subtotal_incl?: number }>>(sessionId, "pos.order.line", "read_group", [detailDomain, ["qty:sum", "price_subtotal_incl:sum"], []]) : Promise.resolve([]),
        productIds.length ? rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "search_read", [detailDomain], { fields: ["id", "order_id", "product_id", "qty", "price_subtotal_incl"], limit: detailPageSize, offset: detailOffset, order: "id desc" }) : Promise.resolve([]),
      ]);
      const orderIds = [...new Set((items ?? []).map((item) => Array.isArray(item.order_id) ? Number(item.order_id[0]) : 0).filter(Boolean))];
      const orders = orderIds.length ? await rpc<Array<{ id: number; name: string; date_order: string }>>(sessionId, "pos.order", "read", [orderIds], { fields: ["name", "date_order"] }) : [];
      const orderById = new Map((orders ?? []).map((order) => [order.id, order]));
      return NextResponse.json({ detailType: "lines", total: Number(count ?? 0), totalAmount: Number(totals?.[0]?.price_subtotal_incl ?? 0), offset: detailOffset, hasNext: detailOffset + (items?.length ?? 0) < Number(count ?? 0), rows: (items ?? []).map((item) => { const orderId = Array.isArray(item.order_id) ? Number(item.order_id[0]) : 0; const order = orderById.get(orderId); return { id: Number(item.id), order: Array.isArray(item.order_id) ? String(item.order_id[1]) : "", date: order?.date_order ?? "", product: Array.isArray(item.product_id) ? String(item.product_id[1]) : "", quantity: Number(item.qty ?? 0), amount: Number(item.price_subtotal_incl ?? 0) }; }) }, { headers: { "Cache-Control": "no-store" } });
    }
    const refundDomain = [...orderDomain.filter((item) => !(Array.isArray(item) && item[0] === "amount_total")), ["amount_total", "<", 0]];
    const [orderTotals, refundTotals, refundCount] = await Promise.all([
      rpc<Array<{ amount_total?: number; __count?: number }>>(sessionId, "pos.order", "read_group", [orderDomain, ["amount_total:sum"], []]),
      rpc<Array<{ amount_total?: number }>>(sessionId, "pos.order", "read_group", [refundDomain, ["amount_total:sum"], []]),
      rpc<number>(sessionId, "pos.order", "search_count", [refundDomain]),
    ]);
    const refundOrderTotal = Number(refundTotals?.[0]?.amount_total ?? 0);
    const salesTotals = summarizeSalesTotals(Number(orderTotals?.[0]?.amount_total ?? 0), refundOrderTotal);
    let rows: Row[];
  let periodLineQuantity: number | null = null;
    if (group === "day") {
      const [grouped, qtyByDay, periodQty] = await Promise.all([
        rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "read_group", [orderDomain, ["amount_total:sum"], ["date_order:day"]], { lazy: false, context: { tz: scope.timezone } }),
        rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["qty:sum"], ["order_id.date_order:day"]], { lazy: false, context: { tz: scope.timezone } }),
        rpc<Array<{ qty?: number }>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["qty:sum"], []], { lazy: false }),
      ]);
      periodLineQuantity = typeof periodQty?.[0]?.qty === "number" && Number.isFinite(periodQty[0].qty) ? periodQty[0].qty : null;
      const quantityByDay = new Map<string, number>();
      for (const item of qtyByDay ?? []) {
        const raw = String(item["order_id.date_order:day"] ?? "");
        const range = item.__range && typeof item.__range === "object" ? (item.__range as Record<string, { from?: string }>)["order_id.date_order:day"] : undefined;
        const key = range?.from?.slice(0, 10) ?? raw.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? raw;
        if (key) quantityByDay.set(key, Number(item.qty ?? 0));
      }
      rows = (grouped ?? []).map((item) => {
        const raw = String(item["date_order:day"] ?? "");
        const range = item.__range && typeof item.__range === "object" ? (item.__range as Record<string, { from?: string }>) ["date_order:day"] : undefined;
        const key = range?.from?.slice(0, 10) ?? raw.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? raw;
        return { key, label: raw, count: Number(item.__count ?? 0), quantity: quantityByDay.has(key) ? quantityByDay.get(key)! : 0, amount: Number(item.amount_total ?? 0) };
      });
    } else {
      const grouped = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["qty:sum", "price_subtotal_incl:sum"], ["product_id"]], { lazy: false });
      const products = (grouped ?? []).filter((item) => Array.isArray(item.product_id)).map((item) => ({ id: Number((item.product_id as unknown[])[0]), label: String((item.product_id as unknown[])[1]), count: Number(item.__count ?? 0), quantity: Number(item.qty ?? 0), amount: Number(item.price_subtotal_incl ?? 0), category: "Uncategorised" }));
      if (group === "product") rows = products.map(({ id, label, count, quantity, amount }) => ({ key: String(id), label, count, quantity, amount })).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
      else {
        const productInfo = await rpc<Array<{ id: number; pos_categ_ids: Array<[number, string]> }>>(sessionId, "product.product", "read", [products.map((item) => item.id)], { fields: ["pos_categ_ids"] });
        const categoryByProduct = new Map((productInfo ?? []).map((item) => [item.id, item.pos_categ_ids?.[0]?.[1] ?? "Uncategorised"]));
        const aggregate = new Map<string, Row>();
        for (const product of products) {
          const category = productInfo?.find((item) => item.id === product.id)?.pos_categ_ids?.[0];
          const key = category ? String(category[0]) : "uncategorized";
          const label = categoryByProduct.get(product.id) ?? "Uncategorised";
          const row = aggregate.get(key);
          if (!row) aggregate.set(key, { key, label, count: product.count, quantity: product.quantity, amount: product.amount });
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
    const totalQuantity = group === "day"
      ? periodLineQuantity
      : rows.some((row) => row.quantity === null) ? null : rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
    if (exportCsv) {
      const reconciliation = reconcileSalesAmounts(Number(orderTotals?.[0]?.amount_total ?? 0), totalAmount);
      const labels: Record<typeof EXPORT_COLUMNS[number], string> = { label: group === "day" ? "Date" : group === "product" ? "Product" : "Category", count: group === "day" ? "Transactions" : "Sale lines", quantity: "Quantity", amount: `Grouped amount (${company.currency})` };
      const values: Record<typeof EXPORT_COLUMNS[number], (row: Row) => string | number> = { label: (row) => row.label, count: (row) => row.count, quantity: (row) => row.quantity ?? "", amount: (row) => row.amount.toFixed(2) };
      const csvRows: Array<Array<string | number>> = [exportColumns.map((column) => labels[column as typeof EXPORT_COLUMNS[number]]), ...rows.map((row) => exportColumns.map((column) => values[column as typeof EXPORT_COLUMNS[number]](row)))];
      if (exportColumns.includes("amount")) {
        csvRows.push([], exportColumns.map((column) => column === "label" ? "Order gross total" : column === "amount" ? reconciliation.orderGrossAmount.toFixed(2) : ""));
        csvRows.push(exportColumns.map((column) => column === "label" ? "Grouped total" : column === "amount" ? reconciliation.groupedAmount.toFixed(2) : ""));
        csvRows.push(exportColumns.map((column) => column === "label" ? "Grouped minus order total" : column === "amount" ? reconciliation.difference.toFixed(2) : ""));
        csvRows.push(exportColumns.map((column) => column === "label" ? "Negative-total refund orders" : column === "count" ? Number(refundCount ?? 0) : column === "amount" ? salesTotals.refunds.toFixed(2) : ""));
        csvRows.push(exportColumns.map((column) => column === "label" ? "Net sales after refund orders" : column === "amount" ? salesTotals.netSales.toFixed(2) : ""));
      }
      const csv = `\uFEFF${csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sales-report-${from}-${to}.csv"`, "Cache-Control": "no-store" } });
    }
    const pageSize = 100;
    const shopfrontSync = scope.shopfrontStore ? await readShopfrontSyncState(scope, from, to) : null;
    const reconciliation = reconcileSalesAmounts(Number(orderTotals?.[0]?.amount_total ?? 0), totalAmount);
    const result = { company: company.name, currency: company.currency, timezone: scope.timezone, source: "Odoo completed POS orders; groups use positive-total orders, net sales also subtract negative-total refund orders", shopfrontSync, from, to, generatedAt: new Date().toISOString(), group, totalRows: rows.length, totalAmount: reconciliation.groupedAmount, orderGrossAmount: reconciliation.orderGrossAmount, refundOrderTotal, refundAmount: salesTotals.refunds, refundOrderCount: Number(refundCount ?? 0), netSalesAmount: salesTotals.netSales, reconciliationDifference: reconciliation.difference, reconcilesToCent: reconciliation.reconcilesToCent, orderCount: Number(orderTotals?.[0]?.__count ?? 0), totalCount, totalQuantity, offset: printAll ? 0 : offset, hasNext: printAll ? false : offset + pageSize < rows.length, rows: printAll ? rows : rows.slice(offset, offset + pageSize) };
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 502;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Sales report is unavailable." }, { status });
  }
}
