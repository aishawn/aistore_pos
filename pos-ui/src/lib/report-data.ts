import { getReportPeriodBounds, type ReportQueryPeriod } from "./report-period.ts";
import { storeWeekStart } from "./assistant-business-period.ts";

export type ReportRpc = <T>(sessionId: string, model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>, correlationId?: string | null) => Promise<T | undefined>;
export type ReportCompany = { name: string; currency: string; timezone: string };
function percentDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function moneyField(row: Record<string, unknown>) {
  return Number(row.price_subtotal_incl ?? row.price_subtotal ?? row.amount_total ?? 0);
}

async function loadBusinessMetrics(rpc: ReportRpc, sessionId: string, companyId: number, timezone: string, now: Date, sampleDataClearedAt: string | null, correlationId?: string | null) {
  const empty = { inventoryUnits: null as number | null, yesterdaySales: 0, yesterdaySalesAvailable: false, yesterdayGrossMargin: null as number | null, grossMarginCoverage: 0, inventoryAvailable: false };
  try {
    const bounds = getReportPeriodBounds("yesterday", now, timezone);
    const yesterday = { from: bounds.start, to: bounds.end };
    const fromDate = yesterday.from.toISOString().slice(0, 19).replace("T", " ");
    const toDate = yesterday.to.toISOString().slice(0, 19).replace("T", " ");
    const orderDomain: unknown[] = [["company_id", "=", companyId], ["date_order", ">=", fromDate], ["date_order", "<", toDate], ["state", "in", ["paid", "done", "invoiced"]]];
    const lineDomain: unknown[] = [["order_id.company_id", "=", companyId], ["order_id.date_order", ">=", fromDate], ["order_id.date_order", "<", toDate], ["order_id.state", "in", ["paid", "done", "invoiced"]], ["order_id.amount_total", ">", 0]];
    if (sampleDataClearedAt) { orderDomain.push("!", ["uuid", "=like", `demo-seed-${companyId}-%`]); lineDomain.push("!", ["order_id.uuid", "=like", `demo-seed-${companyId}-%`]); }
    const [salesRows, lines, stockRows] = await Promise.all([
      rpc<Array<Record<string, unknown>>>(sessionId, "pos.order", "read_group", [orderDomain, ["amount_total:sum"], []], {}, correlationId).catch(() => null),
      rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "search_read", [lineDomain, ["price_subtotal", "price_subtotal_incl", "qty", "purchase_price"]], { limit: 5000 }, correlationId).catch(() => null),
      rpc<Array<Record<string, unknown>>>(sessionId, "stock.quant", "read_group", [[["company_id", "=", companyId], ["location_id.usage", "=", "internal"]], ["quantity:sum"], []], {}, correlationId).catch(() => null),
    ]);
    const validLines = (lines ?? []).map((line) => ({ revenue: Number(line.price_subtotal ?? line.price_subtotal_incl ?? 0), cost: typeof line.purchase_price === "number" && Number.isFinite(line.purchase_price) ? Number(line.purchase_price) * Number(line.qty ?? 0) : null })).filter((line) => line.revenue > 0);
    const costedLines = validLines.filter((line): line is { revenue: number; cost: number } => line.cost !== null);
    const marginRevenue = costedLines.reduce((sum, line) => sum + line.revenue, 0);
    const margin = marginRevenue > 0 ? costedLines.reduce((sum, line) => sum + line.revenue - line.cost, 0) / marginRevenue : null;
    return { inventoryUnits: stockRows ? Number(stockRows[0]?.quantity ?? 0) : null, yesterdaySales: Number(salesRows?.[0]?.amount_total ?? 0), yesterdaySalesAvailable: Boolean(salesRows), yesterdayGrossMargin: lines && lines.length < 5000 ? margin : null, grossMarginCoverage: validLines.length ? costedLines.length / validLines.length : 0, inventoryAvailable: Boolean(stockRows) };
  } catch { return empty; }
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
  sessionId: string; companyId: number; company: ReportCompany; period?: string | null;
  hours?: number; summaryOnly?: boolean; sampleDataClearedAt?: string | null; now?: Date; correlationId?: string | null;
}) {
  const { sessionId, companyId, company, period, summaryOnly = false, sampleDataClearedAt = null, correlationId } = options;
  const timezone = company.timezone;
  const rangeHours = options.hours ?? 720;
  let end = options.now ?? new Date();
  let start = new Date(end.getTime() - rangeHours * 3_600_000);
  if (period === "this_week") start = storeWeekStart(end, timezone);
  const calendarPeriod = ["today", "yesterday", "last_week", "last_month"].includes(period ?? "")
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
    const compareStart = calendarPeriod?.compareStart ?? new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);
    const compareEnd = calendarPeriod?.compareEnd ?? new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
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
        loadBusinessMetrics(rpc, sessionId, companyId, timezone, options.now ?? new Date(), sampleDataClearedAt, correlationId),
      ]);
      return { period: "today", from, to, timezone, company: company.name, currency: company.currency,
        ...businessMetrics, revenue: Number(totals?.[0]?.amount_total ?? 0), transactions: Number(count ?? 0), openRegisters: Number(openRegisters ?? 0) };
    }

    const [count, totals, grossTotals, refundCount, refundTotals, trendData, recentSales, openSessions, compareCount, compareTotals, compareGrossTotals, lineExtras] = await Promise.all([
      rpc<number>(sessionId, "pos.order", "search_count", [salesDomain], {}, correlationId),
      rpc<Array<{ amount_total?: number; amount_tax?: number; __count?: number }>>(sessionId, "pos.order", "read_group", [domain, ["amount_total:sum", "amount_tax:sum"], []], {}, correlationId),
      rpc<Array<{ amount_total?: number }>>(sessionId, "pos.order", "read_group", [salesDomain, ["amount_total:sum"], []], {}, correlationId),
      rpc<number>(sessionId, "pos.order", "search_count", [refundDomain], {}, correlationId),
      rpc<Array<{ amount_total?: number }>>(sessionId, "pos.order", "read_group", [refundDomain, ["amount_total:sum"], []], {}, correlationId),
      readSalesTrend(rpc, sessionId, salesDomain, rangeHours, timezone, correlationId, calendarPeriod?.trendGranularity),
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
      period: calendarPeriod?.period ?? (period === "this_week" ? "this_week" : "rolling"),
      comparisonLabel: calendarPeriod?.comparisonLabel ?? "vs last week",
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
