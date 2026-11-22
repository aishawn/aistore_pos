"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { ReportDayLedgerTable } from "@/components/reports/ReportDayLedgerTable";
import { ReportParityNote } from "@/components/reports/ReportParityNote";
import { ReportPeriodSummaryBar } from "@/components/reports/ReportPeriodSummaryBar";
import { ReportPeriodToolbar } from "@/components/reports/ReportPeriodToolbar";
import { ReportProductLeaderboard } from "@/components/reports/ReportProductLeaderboard";
import { ReportTrendChart } from "@/components/reports/ReportTrendChart";
import { fetchNativeOverview, type NativeOverview } from "@/lib/native-overview";
import { topProductShare } from "@/lib/report-insights";
import {
  readReportRangeFromSearch,
  reportDatePreset,
  syncReportRangeToUrl,
  type ReportDatePreset,
} from "@/lib/report-date-selection";

export function NativeSalesReportPage() {
  const defaults = useMemo(() => reportDatePreset("last_7_days"), []);
  const [period, setPeriod] = useState<ReportDatePreset>("last_7_days");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [rangeReady, setRangeReady] = useState(false);
  const [report, setReport] = useState<NativeOverview | null>(null);
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
    fetchNativeOverview(from, to, controller.signal)
      .then((data) => {
        setReport(data);
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

  const trendPoints = useMemo(
    () =>
      (report?.dailyTrend ?? []).map((row) => ({
        date: row.date,
        revenue: row.revenue,
        transaction_count: row.transaction_count,
        grossProfit: row.grossProfit,
        costAvailable: row.costAvailable,
      })),
    [report?.dailyTrend],
  );

  const topProducts = useMemo(
    () => (report ? topProductShare(report.topProducts, report.revenue) : []),
    [report],
  );

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)]">
      <header className="shrink-0 space-y-4 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[var(--oh-muted)]">Orithos ledger · Australia/Melbourne</p>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Sales ledger</h1>
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
        <ReportPeriodSummaryBar data={report} loading={loading} />

        <section className="grid gap-4 p-4 md:px-6 xl:grid-cols-[1.35fr_1fr] xl:items-stretch">
          <ReportTrendChart
            points={trendPoints}
            loading={loading}
            emptyMessage="No Orithos sales in this range."
            breakdownAnchorId="sales-daily-breakdown"
            overlayProfit={Boolean(report?.costAvailable)}
          />
          <ReportProductLeaderboard
            products={topProducts}
            loading={loading}
            emptyMessage="Product detail unavailable."
            className="xl:min-h-full"
          />
        </section>

        <section
          id="sales-daily-breakdown"
          className="scroll-mt-4 border-t border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]"
        >
          <h2 className="px-4 pt-4 text-sm font-semibold text-[var(--oh-text)] md:px-6">Daily breakdown</h2>
          <div className="p-4 pt-2 md:px-6">
            <ReportDayLedgerTable rows={report?.dailyTrend ?? []} loading={loading} />
          </div>
        </section>

        <div className="border-t border-[var(--oh-border)] px-4 py-3 md:px-6">
          <ReportParityNote />
        </div>
      </div>
    </main>
  );
}
