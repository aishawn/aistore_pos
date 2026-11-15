"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { ReportAlertStrip } from "@/components/reports/ReportAlertStrip";
import { ReportMetricCard } from "@/components/reports/ReportMetricCard";
import { ReportParityNote } from "@/components/reports/ReportParityNote";
import { ReportPeriodToolbar } from "@/components/reports/ReportPeriodToolbar";
import { reportMoney, reportNumber, reportPercent } from "@/components/reports/report-format";
import { ReportTopProducts } from "@/components/reports/ReportTopProducts";
import { ReportTrendChart } from "@/components/reports/ReportTrendChart";
import { fetchOrithosApi } from "@/lib/orithos-api-fetch";
import {
  comparisonDateRange,
  readReportRangeFromSearch,
  reportDatePreset,
  syncReportRangeToUrl,
  type ReportDatePreset,
} from "@/lib/report-date-selection";

type NativeOverview = {
  source: "orithos_ledger";
  from: string;
  to: string;
  revenue: number;
  cost: number | null;
  tax: number | null;
  grossProfit: number | null;
  profitMargin: number | null;
  costAvailable: boolean;
  taxAvailable: boolean;
  transactions: number;
  dailyTrend: Array<{
    date: string;
    revenue: number;
    transaction_count: number;
    cost: number | null;
    tax: number | null;
    grossProfit: number | null;
    costAvailable: boolean;
    taxAvailable: boolean;
  }>;
  topProducts: Array<{ id: number; name: string; revenue: number; quantity: number }>;
  inventoryAvailable?: boolean;
  inventoryUnits?: number | null;
  inventoryCaseLevel?: number | null;
  inventoryItemLevel?: number | null;
  inventoryStatus?: string | null;
  negativeStockProducts?: number | null;
};

async function readOverview(from: string, to: string, signal: AbortSignal): Promise<NativeOverview> {
  const params = new URLSearchParams({ from, to });
  const response = await fetchOrithosApi(`/reports/native-overview?${params}`, { signal });
  const body = await response.json().catch(() => null) as { data?: NativeOverview; message?: string } | null;
  if (!response.ok || !body?.data || body.data.source !== "orithos_ledger") {
    throw new Error(body?.message || "Orithos sales data is unavailable.");
  }
  return body.data;
}

export function NativeReportsDashboardPage() {
  const defaults = useMemo(() => reportDatePreset("yesterday"), []);
  const [period, setPeriod] = useState<ReportDatePreset>("yesterday");
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
        readOverview(from, to, signal),
        readOverview(compareRange.from, compareRange.to, signal),
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

  const revenueDelta =
    data && comparison && comparison.revenue !== 0
      ? ((data.revenue - comparison.revenue) / Math.abs(comparison.revenue)) * 100
      : null;
  const negativeSkus = data?.inventoryAvailable ? Number(data.negativeStockProducts) || 0 : 0;
  const inventoryCaseLevel = data?.inventoryAvailable && data.inventoryCaseLevel != null ? Number(data.inventoryCaseLevel) : null;
  const inventoryItemLevel = data?.inventoryAvailable && data.inventoryItemLevel != null ? Number(data.inventoryItemLevel) : null;
  const singleDay = from === to;
  const comparisonPanel =
    singleDay && data && comparison && compareRange
      ? {
          current: {
            label: from,
            revenue: data.revenue,
            transactions: data.transactions,
            grossProfit: data.grossProfit,
          },
          previous: {
            label: compareRange.from === compareRange.to ? compareRange.from : `${compareRange.from}–${compareRange.to}`,
            revenue: comparison.revenue,
            transactions: comparison.transactions,
            grossProfit: comparison.grossProfit,
          },
        }
      : null;

  const salesDeltaDetailClass =
    revenueDelta == null
      ? undefined
      : revenueDelta >= 0
        ? "font-medium text-[var(--oh-success)]"
        : "font-medium text-[var(--oh-warning)]";

  const showAlerts =
    !loading && (negativeSkus > 0 || (data && !data.costAvailable) || (data && !data.taxAvailable));

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[var(--oh-muted)]">Orithos ledger · Australia/Adelaide</p>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Reports overview</h1>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">{from === to ? from : `${from} → ${to}`}</p>
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div
            role="alert"
            className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 md:mx-6"
          >
            <AlertCircle size={16} />
            {error}
          </div>
        ) : null}

        {showAlerts ? (
          <section className="space-y-2 p-4 pb-0 md:px-6 md:pt-4">
            {negativeSkus > 0 ? (
              <ReportAlertStrip
                tone="danger"
                message={`${reportNumber(negativeSkus)} SKUs below zero — review negative stock`}
                href="/reports/inventory?negative=1"
                hrefLabel="Inventory report"
              />
            ) : null}
            {data && !data.costAvailable ? (
              <ReportAlertStrip
                tone="warning"
                message="Cost coverage unavailable — profit may be incomplete until historical cost is synced"
              />
            ) : null}
            {data && !data.taxAvailable ? (
              <ReportAlertStrip tone="warning" message="Tax totals are missing for part of this period" />
            ) : null}
          </section>
        ) : null}

        <section aria-busy={loading} className="grid grid-cols-2 gap-3 p-4 md:px-6 lg:grid-cols-4">
          <ReportMetricCard
            label="Sales"
            value={data ? reportMoney(data.revenue) : "—"}
            detail={revenueDelta == null ? "Comparison unavailable" : `${reportPercent(revenueDelta)} vs previous period`}
            detailClassName={salesDeltaDetailClass}
            loading={loading}
          />
          <ReportMetricCard
            label="Transactions"
            value={data ? reportNumber(data.transactions) : "—"}
            detail="Orithos ledger records"
            loading={loading}
          />
          <ReportMetricCard
            label="Profit"
            value={data?.grossProfit != null ? reportMoney(data.grossProfit) : "—"}
            detail={data?.costAvailable && data.cost !== null ? `COGS ${reportMoney(data.cost)}` : "Cost coverage unavailable"}
            tone={data && !data.costAvailable ? "warning" : "neutral"}
            loading={loading}
          />
          <ReportMetricCard
            label="Profit %"
            value={data?.profitMargin != null ? `${Number(data.profitMargin).toFixed(2)}%` : "—"}
            detail="Gross margin"
            loading={loading}
          />
        </section>

        <section className="grid min-h-0 gap-4 px-4 pb-4 md:px-6 xl:grid-cols-[1.4fr_1fr] xl:items-stretch">
          <ReportTrendChart
            points={data?.dailyTrend ?? []}
            loading={loading}
            comparison={comparisonPanel}
          />
          <ReportTopProducts products={data?.topProducts ?? []} loading={loading} className="xl:min-h-full" />
        </section>

        <div className="border-t border-[var(--oh-border)] px-4 py-3 md:px-6">
          <ReportParityNote />
        </div>
      </div>
    </main>
  );
}
