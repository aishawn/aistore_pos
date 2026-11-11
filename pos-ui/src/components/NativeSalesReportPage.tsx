"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ReportMetricCard } from "@/components/reports/ReportMetricCard";
import { ReportParityNote } from "@/components/reports/ReportParityNote";
import { ReportPeriodToolbar } from "@/components/reports/ReportPeriodToolbar";
import { reportMoney, reportNumber } from "@/components/reports/report-format";
import { ReportTopProducts } from "@/components/reports/ReportTopProducts";
import { ReportTrendChart } from "@/components/reports/ReportTrendChart";
import { fetchOrithosApi } from "@/lib/orithos-api-fetch";
import {
  readReportRangeFromSearch,
  reportDatePreset,
  syncReportRangeToUrl,
  type ReportDatePreset,
} from "@/lib/report-date-selection";
import { formatShopfrontProfitPercent, shopfrontAlignedMarginRatio } from "@/lib/shopfront-aligned-margin";

type Report = {
  source: "orithos_ledger";
  revenue: number;
  cost: number | null;
  tax: number | null;
  discount: number | null;
  grossProfit: number | null;
  profitMargin: number | null;
  averageSale: number | null;
  costAvailable: boolean;
  taxAvailable: boolean;
  transactions: number;
  dailyTrend: Array<{
    date: string;
    revenue: number;
    transaction_count: number;
    cost: number | null;
    tax: number | null;
    discount: number | null;
    grossProfit: number | null;
    profitMargin?: number | null;
    costAvailable: boolean;
    taxAvailable: boolean;
  }>;
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
};

function dayProfitPercent(row: Report["dailyTrend"][number]): string {
  if (row.profitMargin != null && Number.isFinite(Number(row.profitMargin))) {
    return `${Number(row.profitMargin).toFixed(2)}%`;
  }
  const ratio = shopfrontAlignedMarginRatio(row.grossProfit, Number(row.revenue));
  return ratio == null ? "—" : formatShopfrontProfitPercent(ratio);
}

export function NativeSalesReportPage() {
  const defaults = useMemo(() => reportDatePreset("last_7_days"), []);
  const [period, setPeriod] = useState<ReportDatePreset>("last_7_days");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [rangeReady, setRangeReady] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const selection = readReportRangeFromSearch(window.location.search);
    setPeriod(selection.period);
    setFrom(selection.from);
    setTo(selection.to);
    syncReportRangeToUrl(selection.period, selection.from, selection.to);
    setRangeReady(true);
  }, []);

  useEffect(() => {
    if (!rangeReady) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      setReport(null);
      setError("Choose a valid date range.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });
    fetchOrithosApi(`/reports/native-overview?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { data?: Report; message?: string } | null;
        if (!response.ok || !body?.data || body.data.source !== "orithos_ledger") {
          throw new Error(body?.message || "Orithos sales data is unavailable.");
        }
        setReport(body.data);
        setError(null);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setReport(null);
          setError(cause instanceof Error ? cause.message : "Orithos sales data is unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [from, to, revision, rangeReady]);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)]">
      <header className="shrink-0 space-y-4 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[var(--oh-muted)]">Orithos ledger · Australia/Adelaide</p>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Sales report</h1>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">{from === to ? from : `${from} → ${to}`}</p>
          </div>
          <ReportPeriodToolbar
            period={period}
            from={from}
            to={to}
            loading={loading}
            onChange={(next) => {
              setPeriod(next.period);
              setFrom(next.from);
              setTo(next.to);
            }}
            onRefresh={() => setRevision((value) => value + 1)}
          />
        </div>
      </header>

      {error ? (
        <div role="alert" className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 md:mx-6">
          <AlertCircle size={16} />
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section aria-busy={loading} className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 md:px-6 xl:grid-cols-7">
          <ReportMetricCard label="Revenue" value={report ? reportMoney(report.revenue) : "—"} loading={loading} />
          <ReportMetricCard
            label="COGS"
            value={report?.costAvailable && report.cost !== null ? reportMoney(report.cost) : "—"}
            tone={report && !report.costAvailable ? "warning" : "neutral"}
            loading={loading}
          />
          <ReportMetricCard label="Profit" value={report?.grossProfit != null ? reportMoney(report.grossProfit) : "—"} loading={loading} />
          <ReportMetricCard
            label="Profit %"
            value={report?.profitMargin != null ? `${Number(report.profitMargin).toFixed(2)}%` : "—"}
            loading={loading}
          />
          <ReportMetricCard
            label="Tax"
            value={report?.taxAvailable && report.tax !== null ? reportMoney(report.tax) : "—"}
            loading={loading}
          />
          <ReportMetricCard
            label="Avg sale"
            value={report?.averageSale != null ? reportMoney(report.averageSale) : "—"}
            loading={loading}
          />
          <ReportMetricCard
            label="Transactions"
            value={report ? reportNumber(report.transactions) : "—"}
            loading={loading}
            className="col-span-2 md:col-span-1 xl:col-span-1"
          />
        </section>

        <section className="grid gap-4 px-4 pb-4 md:px-6 xl:grid-cols-[1.35fr_1fr]">
          <ReportTrendChart
            points={report?.dailyTrend ?? []}
            loading={loading}
            emptyMessage="No Orithos sales in this range."
          />
          <ReportTopProducts
            products={report?.topProducts ?? []}
            loading={loading}
            emptyMessage="Product detail unavailable."
          />
        </section>

        <section className="border-t border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[var(--oh-surface-muted)] text-xs uppercase tracking-wide text-[var(--oh-muted)]">
                <tr>
                  {["Business date", "Revenue", "Cost", "Profit", "Profit %", "Tax", "Discount", "Transactions"].map((label) => (
                    <th key={label} className="px-3 py-2.5 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report?.dailyTrend.map((row, index) => (
                  <tr
                    key={String(row.date)}
                    className={index % 2 === 0 ? "bg-[var(--oh-surface-elevated)]" : "bg-[var(--oh-surface)]"}
                  >
                    <td className="px-3 py-2.5 tabular-nums">{String(row.date)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{reportMoney(Number(row.revenue))}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {row.costAvailable && row.cost !== null ? reportMoney(Number(row.cost)) : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {row.grossProfit !== null ? reportMoney(Number(row.grossProfit)) : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{dayProfitPercent(row)}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {row.taxAvailable && row.tax !== null ? reportMoney(Number(row.tax)) : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {row.discount != null ? reportMoney(Number(row.discount)) : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {Number(row.transaction_count).toLocaleString("en-AU")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && report?.dailyTrend.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--oh-muted)]">No Orithos sales in this range.</p>
            ) : null}
          </div>
        </section>

        <div className="border-t border-[var(--oh-border)] px-4 py-3 md:px-6">
          <ReportParityNote />
        </div>
      </div>
    </main>
  );
}
