import { getReportPeriodBounds, type ReportQueryPeriod } from "./report-period.ts";
import { localMidnightUtc, shiftDay } from "./replenishment-safety.ts";
import { type CostSale } from "./dashboard-purchase-cost.ts";
import { verifiedLedgerCosts } from "./dashboard-ledger-cost.ts";
import { storeWeekStart } from "./assistant-business-period.ts";
import { readShopfrontReportMargin } from "./shopfront-report-margin.ts";

export type ReportRpc = <T>(sessionId: string, model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>, correlationId?: string | null) => Promise<T | undefined>;
export type ReportCompany = { name: string; currency: string; timezone: string };
const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function percentDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function moneyField(row: Record<string, unknown>) {
  return Number(row.price_subtotal_incl ?? row.price_subtotal ?? row.amount_total ?? 0);
}

async function calculateOdooGrossMargin(rpc: ReportRpc, sessionId: string, companyId: number,
  orderDomain: unknown[], lineDomain: unknown[], correlationId?: string | null) {
  const [salesRows, lines] = await Promise.all([
    rpc<Array<{ amount_total: number; amount_tax: number }>>(sessionId, "pos.order", "read_group", [orderDomain, ["amount_total:sum", "amount_tax:sum"], []], {}, correlationId).catch(() => null),
    rpc<Array<CostSale & { order_id: [number, string] }>>(sessionId, "pos.order.line", "search_read", [lineDomain],
      { fields: ["id", "order_id", "product_id", "product_uom_id", "price_subtotal", "qty"], order: "id asc", limit: 10001 }, correlationId).catch(() => null),
  ]);
  const salesAvailable = Array.isArray(salesRows) && (!salesRows.length || (numeric(salesRows[0].amount_total) && numeric(salesRows[0].amount_tax)));
  const linesComplete = Array.isArray(lines) && lines.length <= 10000 && lines.every(line => numeric(line.price_subtotal) && numeric(line.qty)
    && (line.qty !== 0 || line.price_subtotal === 0));
  const netSales = salesAvailable ? (salesRows[0]?.amount_total ?? 0) - (salesRows[0]?.amount_tax ?? 0) : null;
  const lineNet = linesComplete ? lines.reduce((sum, line) => sum + line.price_subtotal, 0) : null;
  const reconciled = netSales !== null && lineNet !== null && Math.abs(netSales - lineNet) < 0.011;
  let status = !salesAvailable || !linesComplete ? "unavailable" : !reconciled ? "sales_mismatch" : !lines.length || netSales === 0 ? "no_sales" : "ledger_cost_unverified";
  let coverage = 0;
  let margin: number | null = null;
  if (linesComplete && lines.length && reconciled && netSales !== null && netSales > 0) {
    try {
      const orders = await rpc<Array<{ id: number; date_order: string }>>(sessionId, "pos.order", "search_read",
        [[...orderDomain, ["id", "in", [...new Set(lines.map(line => line.order_id[0]))]]]], { fields: ["date_order"], limit: 10001 }, correlationId);
      const dates = new Map((orders ?? []).map(order => [order.id, order.date_order]));
      if (lines.some(line => !dates.has(line.order_id[0]))) throw new Error("Sale dates are incomplete");
      const costLines = lines.filter(line => line.qty !== 0).map(line => ({ ...line, "order_id.date_order": dates.get(line.order_id[0])! }));
      const costs = await verifiedLedgerCosts(rpc, sessionId, companyId, costLines.map(line => line.id), correlationId);
      const denominator = costLines.reduce((sum, line) => sum + Math.abs(line.price_subtotal), 0);
      coverage = denominator ? costLines.reduce((sum, line) => sum + (costs.has(line.id) ? Math.abs(line.price_subtotal) : 0), 0) / denominator : 0;
      if (costs.size === costLines.length && costLines.length) {
        margin = (netSales - [...costs.values()].reduce((sum, value) => sum + value, 0)) / netSales;
        status = "verified";
      }
    } catch { status = "unavailable"; }
  }
  return { margin, coverage, status, netSales, salesTotal: salesAvailable ? salesRows[0]?.amount_total ?? 0 : 0,
    tax: salesAvailable ? salesRows[0]?.amount_tax ?? null : null, salesAvailable, reconciled, lineNet };
}

async function loadBusinessMetrics(rpc: ReportRpc, sessionId: string, companyId: number, timezone: string, now: Date, sampleDataClearedAt: string | null, sourceStore?: string, stockLocationId?: number | null, correlationId?: string | null) {
  const bounds = getReportPeriodBounds("yesterday", now, timezone);
  const from = bounds.start.toISOString().slice(0, 19).replace("T", " ");
  const to = bounds.end.toISOString().slice(0, 19).replace("T", " ");
  const orderDomain: unknown[] = [["company_id", "=", companyId], ["date_order", ">=", from], ["date_order", "<", to], ["state", "in", ["paid", "done", "invoiced"]]];
  const lineDomain: unknown[] = [["order_id.company_id", "=", companyId], ["order_id.date_order", ">=", from], ["order_id.date_order", "<", to], ["order_id.state", "in", ["paid", "done", "invoiced"]]];
  if (sampleDataClearedAt) { orderDomain.push("!", ["uuid", "=like", `demo-seed-${companyId}-%`]); lineDomain.push("!", ["order_id.uuid", "=like", `demo-seed-${companyId}-%`]); }
  const stockDomain: unknown[] = [["company_id", "=", companyId], ["location_id.usage", "=", "internal"], ["product_id.available_in_pos", "=", true]];
  if (stockLocationId && Number.isSafeInteger(stockLocationId) && stockLocationId > 0) stockDomain.push(["location_id", "child_of", stockLocationId]);
  const [stockRows, negativeRows, marginMetrics, sourceMarginFallback] = await Promise.all([
    rpc<Array<{ quantity: number; product_id: [number, string] | false; product_uom_id: [number, string] | false }>>(sessionId, "stock.quant", "read_group", [stockDomain, ["quantity:sum"], ["product_id", "product_uom_id"]], { lazy: false }, correlationId).catch(() => null),
    rpc<Array<{ product_id: [number, string]; quantity: number }>>(sessionId, "stock.quant", "read_group", [[...stockDomain, ["quantity", "<", 0]], ["quantity:sum"], ["product_id"]], { lazy: false }, correlationId).catch(() => null),
    calculateOdooGrossMargin(rpc, sessionId, companyId, orderDomain, lineDomain, correlationId),
    readShopfrontReportMargin(rpc, sessionId, sourceStore, from, to, correlationId).catch(() => null),
  ]);
  const yesterdaySales = sourceMarginFallback?.grossSales ?? marginMetrics.salesTotal;
  const yesterdayTax = sourceMarginFallback?.tax ?? marginMetrics.tax;
  const netSales = sourceMarginFallback?.netSales ?? marginMetrics.netSales;
  const reconciled = marginMetrics.reconciled && (!sourceMarginFallback
    || (Math.abs(sourceMarginFallback.grossSales - marginMetrics.salesTotal) < 0.011
      && marginMetrics.tax !== null && Math.abs(sourceMarginFallback.tax - marginMetrics.tax) < 0.011));
  const sourceReconciliation = sourceMarginFallback
    ? reconciled ? "matched" : "mismatch"
    : "unavailable";
  const stockAvailable = Array.isArray(stockRows) && stockRows.every(row => numeric(row.quantity) && row.product_uom_id !== false);
  const mixedUnits = stockAvailable && new Set(stockRows.map(row => row.product_uom_id && row.product_uom_id[0])).size > 1;
  // Negative quants are shortage adjustments, not sellable units. Aggregate by
  // product/UOM and count only each product's available positive balance.
  const inventoryUnits = stockAvailable && !mixedUnits ? stockRows.reduce((sum, row) => sum + Math.max(row.quantity, 0), 0) : null;
  const inventoryNetUnits = stockAvailable && !mixedUnits ? stockRows.reduce((sum, row) => sum + row.quantity, 0) : null;
  return {
    inventoryUnits, inventoryNetUnits, inventoryAvailable: stockAvailable && !mixedUnits,
    inventoryStatus: !stockAvailable || !negativeRows ? "unavailable" : mixedUnits ? "mixed_units" : negativeRows.length ? "negative_stock" : "verified",
    negativeStockProducts: negativeRows?.length ?? null,
    yesterdaySales, yesterdaySalesAvailable: sourceMarginFallback !== null || marginMetrics.salesAvailable, yesterdayTax, yesterdayNetSales: netSales,
    yesterdayGrossMargin: marginMetrics.margin, grossMarginCoverage: marginMetrics.coverage, grossMarginStatus: marginMetrics.status,
    sourceReconciliation,
    sourceMarginFallback,
    salesReconciled: reconciled, salesReconciliationDifference: netSales !== null && marginMetrics.lineNet !== null ? Math.round((marginMetrics.lineNet - netSales) * 100) / 100 : null,
    costBasis: "odoo_recorded_cost", yesterdayFrom: from, yesterdayTo: to,
  };
}


async function loadLineExtras(rpc: ReportRpc, sessionId: string, lineDomain: unknown[], compareLineDomain: unknown[], correlationId?: string | null) {
  const [qtyRows, productRows, compareQtyRows] = await Promise.all([
    rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["qty:sum"], []], { lazy: false }, correlationId),
    rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [lineDomain, ["qty:sum", "price_subtotal_incl:sum"], ["product_id"]], { lazy: false }, correlationId),
    rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [compareLineDomain, ["qty:sum"], []], { lazy: false }, correlationId),
  ]);
  const products = (productRows ?? []).map(row => ({ id: Array.isArray(row.product_id) ? Number(row.product_id[0]) : 0,
    name: Array.isArray(row.product_id) ? String(row.product_id[1]) : "Product", qty: Number(row.qty ?? 0), revenue: moneyField(row) })).filter(row => row.id > 0);
  // Odoo cannot group a line by the dotted many-to-one path product_id.categ_id.
  // Read category metadata once for the grouped products instead of swallowing that RPC failure.
  const categoryProducts = products.length ? await rpc<Array<{ id: number; categ_id: [number, string] | false }>>(sessionId, "product.product", "read", [products.map(row => row.id)], { fields: ["categ_id"] }, correlationId) : [];
  const categoryByProduct = new Map((categoryProducts ?? []).map(row => [row.id, row.categ_id ? row.categ_id[1] : "Uncategorised"]));
  const categories = new Map<string, number>();
  for (const row of products) { const category = categoryByProduct.get(row.id) ?? "Uncategorised"; categories.set(category, (categories.get(category) ?? 0) + row.revenue); }
  const total = [...categories.values()].reduce((sum, value) => sum + value, 0) || 1;
  return {
    itemsSold: Number(qtyRows?.[0]?.qty ?? 0), compareItemsSold: Number(compareQtyRows?.[0]?.qty ?? 0),
    topProducts: products.sort((a, b) => b.revenue - a.revenue || b.qty - a.qty).slice(0, 8),
    byCategory: [...categories].map(([name, revenue]) => ({ name, revenue, share: Math.round(revenue / total * 1000) / 10 })).sort((a, b) => b.revenue - a.revenue).slice(0, 6),
  };
}

async function readSalesTrend(rpc: ReportRpc, sessionId: string, domain: unknown[], rangeHours: number, timezone: string, correlationId?: string | null, calendarGranularity?: "hour" | "day") {
  // Hourly for short windows; daily through 30d; weekly for 90d/180d so the chart stays readable.
  const granularity = calendarGranularity ?? (rangeHours <= 24 ? "hour" : rangeHours <= 720 ? "day" : "week");
  try {
    const rows = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "read_group", [domain, ["amount_total:sum"], [`date_order:${granularity}`]], { lazy: false, context: { tz: timezone } }, correlationId);
    return { rows: rows ?? [], granularity };
  } catch (error) {
    // Older Orithos builds may lack hour/week date grouping — fall back to day.
    if (granularity === "day") throw error;
    const rows = await rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "read_group", [domain, ["amount_total:sum"], ["date_order:day"]], { lazy: false, context: { tz: timezone } }, correlationId);
    return { rows: rows ?? [], granularity: "day" };
  }
}


export async function calculateReport(rpc: ReportRpc, options: {
  sessionId: string; companyId: number; company: ReportCompany; period?: string | null; fromDay?: string | null; toDay?: string | null;
  hours?: number; summaryOnly?: boolean; sampleDataClearedAt?: string | null; sourceStore?: string; stockLocationId?: number | null; now?: Date; correlationId?: string | null;
}) {
  const { sessionId, companyId, company, period, summaryOnly = false, sampleDataClearedAt = null, sourceStore, correlationId } = options;
  const timezone = company.timezone;
  const rangeHours = options.hours ?? 720;
  let end = options.now ?? new Date();
  let start = new Date(end.getTime() - rangeHours * 3_600_000);
  if (period === "this_week") start = storeWeekStart(end, timezone);
  const customRange = period === "custom" && options.fromDay && options.toDay
    ? { start: new Date(`${localMidnightUtc(options.fromDay, timezone).replace(" ", "T")}Z`), end: new Date(`${localMidnightUtc(shiftDay(options.toDay, 1), timezone).replace(" ", "T")}Z`) }
    : null;
  if (customRange) {
    if (!Number.isFinite(customRange.start.getTime()) || !Number.isFinite(customRange.end.getTime()) || customRange.end <= customRange.start) throw new Error("Choose a valid report date range.");
    const days = (customRange.end.getTime() - customRange.start.getTime()) / 86_400_000;
    if (days > 366) throw new Error("Custom report ranges are limited to 366 days.");
    start = customRange.start;
    end = customRange.end;
  }
  const calendarPeriod = ["today", "yesterday", "last_7_days", "last_week", "last_month"].includes(period ?? "")
    ? getReportPeriodBounds(period as ReportQueryPeriod, end, timezone) : null;
  if (calendarPeriod) { start = calendarPeriod.start; end = calendarPeriod.end; }
  const from = start.toISOString().slice(0, 19).replace("T", " ");
  const to = end.toISOString().slice(0, 19).replace("T", " ");
  const endOperator = calendarPeriod ? "<" : "<=";
  const excludeDemoSeed = Boolean(sampleDataClearedAt);
  const demoUuidPrefix = `demo-seed-${companyId}-%`;
  const excludeDemoOrderClause: unknown[] = ["!", ["uuid", "=like", demoUuidPrefix]];
  const excludeDemoLineClause: unknown[] = ["!", ["order_id.uuid", "=like", demoUuidPrefix]];
    const domain = [
      ["company_id", "=", companyId],
      ["date_order", ">=", from],
      ["date_order", endOperator, to],
      ["state", "in", ["paid", "done", "invoiced"]],
      ...(excludeDemoSeed ? [excludeDemoOrderClause] : []),
    ];
    // Calendar periods supply aligned comparison bounds; legacy windows shift back seven days.
    const compareStart = calendarPeriod?.compareStart ?? new Date(start.getTime() - (customRange ? end.getTime() - start.getTime() : 7 * 24 * 60 * 60 * 1000));
    const compareEnd = calendarPeriod?.compareEnd ?? new Date(end.getTime() - (customRange ? end.getTime() - start.getTime() : 7 * 24 * 60 * 60 * 1000));
    const compareFromAligned = compareStart.toISOString().slice(0, 19).replace("T", " ");
    const compareToAligned = compareEnd.toISOString().slice(0, 19).replace("T", " ");
    const compareDomain = [
      ["company_id", "=", companyId],
      ["date_order", ">=", compareFromAligned],
      ["date_order", endOperator, compareToAligned],
      ["state", "in", ["paid", "done", "invoiced"]],
      ...(excludeDemoSeed ? [excludeDemoOrderClause] : []),
    ];
    const salesDomain = [...domain, ["amount_total", ">", 0]];
    const refundDomain = [...domain, ["amount_total", "<", 0]];
    const compareSalesDomain = [...compareDomain, ["amount_total", ">", 0]];
    const lineDomain = [
      ["order_id.company_id", "=", companyId],
      ["order_id.date_order", ">=", from],
      ["order_id.date_order", endOperator, to],
      ["order_id.state", "in", ["paid", "done", "invoiced"]],
      ["order_id.amount_total", ">", 0],
      ...(excludeDemoSeed ? [excludeDemoLineClause] : []),
    ];

    const compareLineDomain = lineDomain.map((clause) => {
      if (Array.isArray(clause) && clause[0] === "order_id.date_order") {
        return [clause[0], clause[1], clause[1] === ">=" ? compareFromAligned : compareToAligned];
      }
      return clause;
    });


    if (summaryOnly) {
      const [totals, count, openRegisters, businessMetrics] = await Promise.all([
        rpc<Array<{ amount_total?: number }>>(sessionId, "pos.order", "read_group", [domain, ["amount_total:sum"], []], {}, correlationId),
        rpc<number>(sessionId, "pos.order", "search_count", [salesDomain], {}, correlationId),
        rpc<number>(sessionId, "pos.session", "search_count", [[["company_id", "=", companyId], ["state", "=", "opened"]]], {}, correlationId),
        loadBusinessMetrics(rpc, sessionId, companyId, timezone, options.now ?? new Date(), sampleDataClearedAt, sourceStore, options.stockLocationId, correlationId),
      ]);
      return { period: "today", from, to, timezone, company: company.name, currency: company.currency,
        ...businessMetrics, revenue: Number(totals?.[0]?.amount_total ?? 0), transactions: Number(count ?? 0), openRegisters: Number(openRegisters ?? 0) };
    }

    const [count, totals, grossTotals, refundCount, refundTotals, trendData, recentSales, openSessions, compareCount, compareTotals, compareGrossTotals, lineExtras, marginMetrics, sourceMarginFallback] = await Promise.all([
      rpc<number>(sessionId, "pos.order", "search_count", [salesDomain], {}, correlationId),
      rpc<Array<{ amount_total?: number; amount_tax?: number; __count?: number }>>(sessionId, "pos.order", "read_group", [domain, ["amount_total:sum", "amount_tax:sum"], []], {}, correlationId),
      rpc<Array<{ amount_total?: number }>>(sessionId, "pos.order", "read_group", [salesDomain, ["amount_total:sum"], []], {}, correlationId),
      rpc<number>(sessionId, "pos.order", "search_count", [refundDomain], {}, correlationId),
      rpc<Array<{ amount_total?: number }>>(sessionId, "pos.order", "read_group", [refundDomain, ["amount_total:sum"], []], {}, correlationId),
      readSalesTrend(rpc, sessionId, salesDomain, rangeHours, timezone, correlationId, calendarPeriod?.trendGranularity ?? (customRange ? "day" : undefined)),
      rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "search_read", [domain], {
        fields: ["id", "name", "pos_reference", "date_order", "amount_total", "partner_id", "session_id"],
        order: "date_order desc, id desc",
        limit: 10,
      }, correlationId),
      rpc<number>(sessionId, "pos.session", "search_count", [[
        ["company_id", "=", companyId], ["state", "=", "opened"],
      ]], {}, correlationId),
      rpc<number>(sessionId, "pos.order", "search_count", [compareSalesDomain], {}, correlationId),
      rpc<Array<{ amount_total?: number; amount_tax?: number; __count?: number }>>(sessionId, "pos.order", "read_group", [compareDomain, ["amount_total:sum", "amount_tax:sum"], []], {}, correlationId),
      rpc<Array<{ amount_total?: number }>>(sessionId, "pos.order", "read_group", [compareSalesDomain, ["amount_total:sum"], []], {}, correlationId),
      loadLineExtras(rpc, sessionId, lineDomain, compareLineDomain, correlationId),
      calculateOdooGrossMargin(rpc, sessionId, companyId, domain,
        lineDomain.filter(clause => !(Array.isArray(clause) && clause[0] === "order_id.amount_total")), correlationId),
      readShopfrontReportMargin(rpc, sessionId, sourceStore, from, to, correlationId).catch(() => null),
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

    return {
      rangeHours: calendarPeriod ? (end.getTime() - start.getTime()) / 3_600_000 : rangeHours,
      period: calendarPeriod?.period ?? (customRange ? "custom" : period === "this_week" ? "this_week" : "rolling"),
      comparisonLabel: calendarPeriod?.comparisonLabel ?? (customRange ? "vs previous period" : "vs last week"),
      from,
      to,
      company: company.name,
      currency: company.currency,
      timezone,
      sampleDataCleared: excludeDemoSeed,
      sampleDataClearedAt: sampleDataClearedAt,
      trendGranularity: trendData.granularity,
      revenue,
      grossSales,
      refunds,
      refundTransactions,
      grossMarginPercent: marginMetrics.margin,
      grossMarginCoverage: marginMetrics.coverage,
      grossMarginStatus: marginMetrics.status,
      grossMarginBasis: "odoo_recorded_cost",
      sourceMarginFallback,
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
    };
}
