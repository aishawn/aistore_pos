"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Boxes, ReceiptText, ShoppingBag } from "lucide-react";
import { ReportActionQueue, type ReportActionItem } from "@/components/reports/ReportActionQueue";
import { ReportExecutiveSummary } from "@/components/reports/ReportExecutiveSummary";
import { ReportMiniTrend } from "@/components/reports/ReportMiniTrend";
import { ReportParityNote } from "@/components/reports/ReportParityNote";
import { ReportPeriodToolbar } from "@/components/reports/ReportPeriodToolbar";
import { ReportProductLeaderboard } from "@/components/reports/ReportProductLeaderboard";
import { reportNumber } from "@/components/reports/report-format";
import { fetchNativeOverview, type NativeOverview } from "@/lib/native-overview";
import {
  buildExecutiveHeadline,
  comparePeriod,
  refundAttentionLevel,
  sliceForCompare,
  topProductShare,
} from "@/lib/report-insights";
import {
  comparisonDateRange,
  readReportRangeFromSearch,
  reportDatePreset,
  syncReportRangeToUrl,
  type ReportDatePreset,
} from "@/lib/report-date-selection";

const QUICK_LINKS = [
  { href: "/reports/sales?period=last_7_days", label: "Sales", icon: ReceiptText },
  { href: "/reports/inventory", label: "Inventory", icon: Boxes },
  { href: "/reports/purchase?period=today", label: "Purchase", icon: ShoppingBag },
] as const;

export function NativeReportsDashboardPage() {
  const defaults = useMemo(() => reportDatePreset("last_7_days"), []);
  const [period, setPeriod] = useState<ReportDatePreset>("last_7_days");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [rangeReady, setRangeReady] = useState(false);
  const [data, setData] = useState<NativeOverview | null>(null);
  const [comparison, setComparison] = useState<NativeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const selection = readReportRangeFromSearch(window.location.search);
    setPeriod(selection.period);
    setFrom(selection.from);
    setTo(selection.to);
    syncReportRangeToUrl(selection.period, selection.from, selection.to);
    setRangeReady(true);
  }, []);

  const compareRange = useMemo(
    () => (from <= to ? comparisonDateRange(from, to, "previous_period") : null),
    [from, to],
  );

  const load = useCallback(async (signal: AbortSignal) => {
    if (!rangeReady) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to || !compareRange) {
      setData(null);
      setComparison(null);
      setError("Choose a valid date range.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [current, previous] = await Promise.all([
        fetchNativeOverview(from, to, signal),
        fetchNativeOverview(compareRange.from, compareRange.to, signal),
      ]);
      if (!signal.aborted) {
        setData(current);
        setComparison(previous);
      }
    } catch (cause) {
      if (!signal.aborted) {
        setData(null);
        setComparison(null);
        setError(cause instanceof Error ? cause.message : "Orithos report is unavailable.");
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [compareRange, from, rangeReady, to]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  const deltas = useMemo(
    () => (data && comparison ? comparePeriod(sliceForCompare(data), sliceForCompare(comparison)) : {
      revenuePct: null,
      transactionsPct: null,
      profitPct: null,
      refundsPct: null,
    }),
    [comparison, data],
  );

  const headline = useMemo(
    () => buildExecutiveHeadline(deltas, Boolean(data?.costAvailable)),
    [data?.costAvailable, deltas],
  );

  const periodLabel = from === to ? `Period · ${from}` : `Period · ${from} → ${to}`;

  const actionItems = useMemo((): ReportActionItem[] => {
    if (!data || loading) return [];
    const items: ReportActionItem[] = [];
    const negativeSkus = data.inventoryAvailable ? Number(data.negativeStockProducts) || 0 : 0;
    if (negativeSkus > 0) {
      items.push({
        id: "negative-stock",
        tone: "danger",
        message: `${reportNumber(negativeSkus)} SKUs below zero — review negative stock`,
        href: "/reports/inventory?negative=1",
        hrefLabel: "Inventory",
      });
    }
    if (!data.costAvailable) {
      items.push({
        id: "cost-coverage",
        tone: "warning",
        message: "Cost coverage incomplete — profit figures may be understated",
      });
    }
    if (!data.taxAvailable) {
      items.push({
        id: "tax-coverage",
        tone: "warning",
        message: "Tax totals missing for part of this period",
      });
    }
    const refundLevel = refundAttentionLevel(
      Number(data.grossSales) || data.revenue,
      Number(data.refunds) || 0,
      comparison ? Number(comparison.refunds) || 0 : null,
    );
    if (refundLevel !== "none") {
      items.push({
        id: "refunds",
        tone: refundLevel === "high" ? "danger" : "warning",
        message:
          refundLevel === "high"
            ? "Refunds are elevated for this period — check the daily ledger"
            : "Refunds are higher than the prior period",
        href: "/reports/sales?period=last_7_days#sales-daily-breakdown",
        hrefLabel: "Daily ledger",
      });
    }
    return items;
  }, [comparison, data, loading]);

  const topProducts = useMemo(
    () => (data ? topProductShare(data.topProducts, data.revenue) : []),
    [data],
  );

  const inventoryCaseLevel = data?.inventoryAvailable && data.inventoryCaseLevel != null ? Number(data.inventoryCaseLevel) : null;
  const inventoryItemLevel = data?.inventoryAvailable && data.inventoryItemLevel != null ? Number(data.inventoryItemLevel) : null;
  const salesReportParams = new URLSearchParams({ period });
  if (period === "custom") {
    salesReportParams.set("from", from);
    salesReportParams.set("to", to);
  }
  const salesReportHref = `/reports/sales?${salesReportParams.toString()}`;

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 md:px-6 md:py-3.5">
        <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--oh-text)]">Business overview</h1>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Sales and inventory for the selected period</p>
            {inventoryCaseLevel != null && inventoryItemLevel != null ? (
              <p className="mt-1 text-xs">
                <Link href="/reports/inventory" className="font-medium text-[var(--oh-primary)] hover:underline">
                  {reportNumber(inventoryCaseLevel)} cases · {reportNumber(inventoryItemLevel)} items on hand
                </Link>
              </p>
            ) : null}
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
            onRefresh={() => setRefreshKey((value) => value + 1)}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="mx-auto w-full max-w-[1680px]">
        {error ? (
          <div
            role="alert"
            className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 md:mx-6"
          >
            <AlertCircle size={16} />
            {error}
          </div>
        ) : null}

        <ReportExecutiveSummary
          data={data}
          headline={headline}
          deltas={deltas}
          periodLabel={periodLabel}
          loading={loading}
        />

        <ReportActionQueue items={actionItems} />

        <ReportMiniTrend
          points={data?.dailyTrend ?? []}
          comparisonPoints={comparison?.dailyTrend ?? []}
          periodLabel={periodLabel.replace(/^Period · /u, "")}
          salesHref={salesReportHref}
          loading={loading}
        />

        <section className="mx-4 mt-4 md:mx-6">
          <ReportProductLeaderboard products={topProducts} loading={loading} limit={5} title="Top sellers" />
        </section>

        <nav aria-label="Report shortcuts" className="mx-4 mt-4 flex flex-wrap gap-2 md:mx-6">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href.startsWith("/reports/sales") ? salesReportHref : link.href}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-sm font-semibold text-[var(--oh-text)] hover:border-[var(--oh-primary)] hover:text-[var(--oh-primary)]"
              >
                <Icon size={16} aria-hidden="true" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="mx-4 mt-6 border-t border-[var(--oh-border)] pt-3 md:mx-6">
          <ReportParityNote />
        </div>
        </div>
      </div>
    </main>
  );
}
