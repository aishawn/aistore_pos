import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getReportPeriodBounds } from "@/lib/report-period";
import { serveReport } from "@/lib/report-request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "development" && request.cookies.get("orithos_local_preview")?.value === "1") {
    const requested = request.nextUrl.searchParams.get("period");
    const previewPeriod = getReportPeriodBounds(
      requested === "today" || requested === "last_7_days" || requested === "last_week" || requested === "last_month" ? requested : "yesterday",
      new Date(), "Australia/Adelaide",
    );
    return NextResponse.json({
      period: previewPeriod.period,
      comparisonLabel: previewPeriod.comparisonLabel,
      from: previewPeriod.start.toISOString(),
      to: previewPeriod.end.toISOString(),
      trendGranularity: previewPeriod.trendGranularity,
      rangeHours: (previewPeriod.end.getTime() - previewPeriod.start.getTime()) / 3_600_000,
      generatedAt: new Date().toISOString(),
      queryThrough: new Date().toISOString(),
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
  return serveReport(request);
}
