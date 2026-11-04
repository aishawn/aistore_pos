"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Clock3,
  LoaderCircle,
  Package,
  PieChart,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Store,
} from "lucide-react";
import { fetchPreparedReport } from "@/lib/report-client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatOdooDateTime, formatOdooGroupedDate, formatStoreEpoch } from "@/lib/odoo-date";
import type { ReportPeriod } from "@/lib/report-period";
import { friendlyProductName } from "@/lib/product-display-name";
import { DashboardInsightsPanel } from "@/components/admin/DashboardInsightsPanel";
import { useShopfrontSyncRefresh } from "@/hooks/useShopfrontSyncRefresh";

type RecentSale = {
  id: number;
  name: string;
  pos_reference: string | false;
  date_order: string;
  amount_total: number;
  partner_id: [number, string] | false;
  session_id: [number, string] | false;
};

type OverviewData = {
  taskId?: string;
  generatedAt?: string;
  queryThrough?: string;
  cacheStatus?: string;
  updateStatus?: string;
  completeness?: "complete" | "incomplete" | "unverified";
  sourceSyncedThrough?: string | null;
  dataRevision?: string;
  period?: ReportPeriod;
  comparisonLabel?: string;
  rangeHours: number;
  from: string;
  to: string;
  company: string;
  currency: string;
  timezone: string;
  sampleDataCleared?: boolean;
  sampleDataClearedAt?: string | null;
  trendGranularity: "hour" | "day" | "week";
  revenue: number;
  grossSales?: number;
  refunds?: number;
  refundTransactions?: number;
  tax: number;
  transactions: number;
  itemsSold: number;
  openRegisters: number;
  lowStockCount?: number;
  trend: { label: string; revenue: number; transactions: number }[];
  recentSales: RecentSale[];
  topProducts: { id: number; name: string; qty: number; revenue: number }[];
  byCategory: { name: string; revenue: number; share: number }[];
  compare: {
    revenue: number;
    transactions: number;
    itemsSold: number;
    revenueDeltaPct: number | null;
    transactionsDeltaPct: number | null;
    itemsSoldDeltaPct: number | null;
    averageSaleDeltaPct: number | null;
  };
  grossMarginPercent?: number | null;
  grossMarginCoverage?: number;
  grossMarginStatus?: string;
  grossMarginBasis?: string;
};

function storeDay(value: string, timezone: string) {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

type DeadStockData = {
  bucketCounts: Record<string, number>;
  cashValueByBucket: Record<string, number>;
  invalidCostOrStockCount: number;
  catalogueCoverage?: { loadedProducts: number; totalProducts: number | null; complete: boolean };
  truncated?: boolean;
  products: Array<{ id: number; name: string; inventoryValue: number | null; onHand: number | null; invalidReason: string | null }>;
  dataQuality: string;
};

const OVERVIEW_RANGES = [
  { period: "yesterday", label: "Yesterday" },
  { period: "last_7_days", label: "Last 7 days" },
  { period: "last_week", label: "Last week" },
  { period: "last_month", label: "Last month" },
] as const;

const PARKED_SALES_KEY = "orithos-odoo-parked-sales-v1";

const MARK_TONES = [
  { bg: "var(--brand-module-blue-tint)", fg: "var(--brand-module-blue)" },
  { bg: "var(--brand-module-green-tint)", fg: "var(--brand-module-green)" },
  { bg: "var(--brand-module-orange-tint)", fg: "var(--brand-module-orange)" },
  { bg: "var(--brand-module-purple-tint)", fg: "var(--brand-module-purple)" },
  { bg: "var(--brand-module-gray-tint)", fg: "var(--brand-module-gray)" },
  { bg: "var(--brand-module-teal-tint)", fg: "var(--brand-module-teal)" },
] as const;

const CATEGORY_COLORS = ["var(--brand-module-blue)", "var(--brand-module-teal)", "var(--brand-module-green)", "var(--brand-module-orange)", "var(--brand-module-purple)", "var(--brand-module-gray)"];

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatGroupedStoreTime(value: string, options: Intl.DateTimeFormatOptions) {
  return formatOdooGroupedDate(value, options);
}

function greetingForTimezone(timezone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "numeric", hour12: false }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function markTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 1)) % MARK_TONES.length;
  return MARK_TONES[hash] ?? MARK_TONES[0];
}

function friendlyName(name: string) {
  return friendlyProductName(name);
}

function Delta({ value, comparisonMessage, comparisonLabel }: { value: number | null | undefined; comparisonMessage?: string; comparisonLabel?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return comparisonMessage ? <span className="oh-type-meta text-[var(--oh-muted)]">{comparisonMessage}</span> : null;
  }
  const positive = value >= 0;
  return (
    <span className={cn("oh-type-meta font-semibold", positive ? "text-[var(--oh-success)]" : "text-red-600")}>
      {positive ? "+" : ""}{value.toFixed(1)}% {comparisonLabel}
    </span>
  );
}

function readParkedCount() {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PARKED_SALES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function OrithosReportsDashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [parkedCount, setParkedCount] = useState(0);
  const [period, setPeriod] = useState<ReportPeriod>("yesterday");
  const [sampleDataActive, setSampleDataActive] = useState(false);
  const [slowLoading, setSlowLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [deadStock, setDeadStock] = useState<DeadStockData | null>(null);
  const requestRevision = useRef(0);
  const periodCache = useRef(new Map<ReportPeriod, { data: OverviewData; expires: number; businessDay: string }>());
  const reportAbort = useRef<AbortController | null>(null);
  const deadAbort = useRef<AbortController | null>(null);
  const [deadStockError, setDeadStockError] = useState<string | null>(null);
  const [deadStockRefreshing, setDeadStockRefreshing] = useState(false);
  const [deadStockGeneratedAt, setDeadStockGeneratedAt] = useState<string | null>(null);
  const loadDeadStock = useCallback(async (refresh = false) => {
    deadAbort.current?.abort();
    const controller = new AbortController(); deadAbort.current = controller;
    setDeadStockRefreshing(true); setDeadStockError(null);
    try {
      const response = await fetchPreparedReport("/api/odoo/dead-stock", { refresh, signal: controller.signal });
      const payload = await response.json() as DeadStockData & { generatedAt?: string };
      if (!response.ok || !payload.bucketCounts || !payload.cashValueByBucket) throw new Error("Dead-stock analysis is unavailable.");
      if (!controller.signal.aborted) { setDeadStock(payload); setDeadStockGeneratedAt(payload.generatedAt ?? null); }
    } catch (cause) { if (!controller.signal.aborted) setDeadStockError(cause instanceof Error ? cause.message : "Dead-stock analysis is unavailable."); }
    finally { if (!controller.signal.aborted) setDeadStockRefreshing(false); }
  }, []);
  const periodRef = useRef<ReportPeriod>("yesterday");
  const greeting = useMemo(() => greetingForTimezone(data?.timezone ?? "Australia/Adelaide"), [data?.timezone]);

  useEffect(() => {
    let cancelled = false;
    void api.get<{ state?: string; canPurge?: boolean }>("/api/tenant/sample-data/status")
      .then((status) => {
        if (!cancelled) setSampleDataActive(status.state === "active" && Boolean(status.canPurge));
      })
      .catch(() => {
        if (!cancelled) setSampleDataActive(false);
      });
    return () => { cancelled = true; };
  }, [data?.sampleDataClearedAt, lastLoadedAt]);

  const load = useCallback(async (refresh = false, selectedPeriod = periodRef.current) => {
    const revision = ++requestRevision.current;
    reportAbort.current?.abort();
    const controller = new AbortController(); reportAbort.current = controller;
    const cached = periodCache.current.get(selectedPeriod);
    if (!refresh && cached && cached.expires > Date.now() && cached.businessDay === new Intl.DateTimeFormat("en-CA", { timeZone: cached.data.timezone }).format(new Date())) {
      setData(cached.data); setLastLoadedAt(cached.data.generatedAt ? Date.parse(cached.data.generatedAt) : null);
      setError(null); setLoading(false); setRefreshing(false); return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setRequestId(null);
    try {
      const correlationId = crypto.randomUUID();
      setRequestId(correlationId);
      const response = await fetchPreparedReport(`/api/odoo/reporting-dashboard?period=${selectedPeriod}`, { refresh, signal: controller.signal, correlationId });
      if (revision !== requestRevision.current) return;
      setRequestId(response.headers.get("x-correlation-id") || correlationId);
      const payload = await response.json().catch(() => null) as OverviewData | { message?: string } | null;
      if (revision !== requestRevision.current) return;
      if (!response.ok) {
        const message = payload && "message" in payload ? payload.message : undefined;
        // Temporary Orithos outages stay retryable; only a missing/expired session
        // should send the operator to Integrations.
        setNeedsConnection(response.status === 401);
        throw new Error(message || `Could not load overview (${response.status}).`);
      }
      if (!payload || !("revenue" in payload) || !Array.isArray(payload.trend)) {
        throw new Error("Orithos returned an incomplete overview response.");
      }
      setNeedsConnection(false);
      setLastLoadedAt(payload.generatedAt ? Date.parse(payload.generatedAt) : null);
      if (payload.cacheStatus !== "STALE") periodCache.current.set(selectedPeriod, { data: payload, expires: Date.now() + 30_000,
        businessDay: new Intl.DateTimeFormat("en-CA", { timeZone: payload.timezone }).format(new Date()) });
      setData({
        ...payload,
        itemsSold: Number(payload.itemsSold ?? 0),
        recentSales: Array.isArray(payload.recentSales) ? payload.recentSales as RecentSale[] : [],
        topProducts: Array.isArray(payload.topProducts) ? payload.topProducts : [],
        byCategory: Array.isArray(payload.byCategory) ? payload.byCategory : [],
        compare: payload.compare ?? {
          revenue: 0,
          transactions: 0,
          itemsSold: 0,
          revenueDeltaPct: null,
          transactionsDeltaPct: null,
          itemsSoldDeltaPct: null,
          averageSaleDeltaPct: null,
        },
      });
    } catch (cause) {
      if (revision === requestRevision.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Could not load overview.");
      }
    } finally {
      if (revision === requestRevision.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useShopfrontSyncRefresh(() => {
    periodCache.current.clear();
    void load(true, periodRef.current);
    void loadDeadStock(true);
  });

  useEffect(() => {
    const saved = new URLSearchParams(location.search).get("period");
    if (saved && OVERVIEW_RANGES.some(range => range.period === saved)) {
      periodRef.current = saved as ReportPeriod; setPeriod(saved as ReportPeriod);
    }
    void load();
    return () => { requestRevision.current++; reportAbort.current?.abort(); };
  }, [load]);
  useEffect(() => { void loadDeadStock(); return () => deadAbort.current?.abort(); }, [loadDeadStock]);
  useEffect(() => {
    const reset = (event: Event) => {
      periodCache.current.clear();
      const detail = (event as CustomEvent<{ reason?: string; active?: boolean }>).detail;
      if (detail?.reason === "identity") { requestRevision.current++; reportAbort.current?.abort(); deadAbort.current?.abort(); setData(null); setDeadStock(null); }
      if (detail?.active === false) { setLoading(false); setNeedsConnection(true); return; }
      void load(); void loadDeadStock();
    };
    window.addEventListener("orithos-read-cache-cleared", reset);
    return () => window.removeEventListener("orithos-read-cache-cleared", reset);
  }, [load, loadDeadStock]);
  useEffect(() => {
    if (!loading || data) {
      setSlowLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowLoading(true), 3000);
    return () => window.clearTimeout(timer);
  }, [data, loading]);
  useEffect(() => {
    if (!data?.taskId || data.cacheStatus !== "STALE") return;
    const controller = new AbortController(); const selected = periodRef.current;
    void fetchPreparedReport(`/api/odoo/reporting-dashboard?period=${selected}&task=${data.taskId}`, { signal: controller.signal }).then(async response => {
      const next = await response.json() as OverviewData;
      if (!response.ok || !Array.isArray(next.trend)) throw new Error("Report update failed. Please retry.");
      if (!controller.signal.aborted && selected === periodRef.current) {
        setData(next); setLastLoadedAt(next.generatedAt ? Date.parse(next.generatedAt) : null);
        periodCache.current.set(selected, { data: next, expires: Date.now() + 300_000, businessDay: new Intl.DateTimeFormat("en-CA", { timeZone: next.timezone }).format(new Date()) });
      }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Report update failed."); });
    return () => controller.abort();
  }, [data?.taskId, data?.cacheStatus]);
  useEffect(() => {
    let lastRefresh = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastRefresh < 15_000) return;
      lastRefresh = Date.now();
      periodCache.current.delete(periodRef.current);
      void load(false, periodRef.current);
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  useEffect(() => { setParkedCount(readParkedCount()); }, []);
  const averageSale = data?.transactions ? (data.grossSales ?? data.revenue) / data.transactions : 0;
  const maxRevenue = useMemo(() => Math.max(1, ...(data?.trend.map((item) => item.revenue) ?? [0])), [data]);
  const hasTrendData = data?.trend.some((item) => item.revenue > 0) ?? false;
  const trendData = data?.trend ?? [];
  const trendGranularity = data?.trendGranularity ?? "hour";
  const trendLabelOptions: Intl.DateTimeFormatOptions =
    trendGranularity === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" };
  const trendLabelInterval = Math.max(1, Math.ceil(trendData.length / 6));
  const currency = data?.currency ?? "AUD";
  const rangeLabel = OVERVIEW_RANGES.find((range) => range.period === (data?.period ?? period))?.label ?? "Yesterday";
  const comparisonLabel = data?.comparisonLabel ?? "vs same day last week";
  const trendSummary = useMemo(() => {
    if (!data?.trend.length) return "No sales in this period.";
    const totalRevenue = data.trend.reduce((sum, item) => sum + item.revenue, 0);
    const totalTransactions = data.trend.reduce((sum, item) => sum + item.transactions, 0);
    const peak = data.trend.reduce((highest, item) => (item.revenue > highest.revenue ? item : highest), data.trend[0]);
    const peakLabel = formatGroupedStoreTime(
      peak.label,
      data.trendGranularity === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" },
    );
    return `${data.trend.length} periods with ${formatMoney(totalRevenue, data.currency)} in sales across ${totalTransactions} transactions. Highest period: ${peakLabel} at ${formatMoney(peak.revenue, data.currency)}.`;
  }, [data]);
  const dateOptions: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
  const periodEnd = data ? new Date(data.to.includes("T") ? data.to : `${data.to.replace(" ", "T")}Z`).getTime() - 1 : 0;
  const periodBounds = data
    ? data.period === "yesterday"
      ? formatOdooDateTime(data.from, data.timezone, dateOptions)
      : `${formatOdooDateTime(data.from, data.timezone, dateOptions)} – ${formatStoreEpoch(periodEnd, data.timezone, dateOptions)}`
    : "";
  const donutGradient = useMemo(() => {
    if (!data?.byCategory.length) return "conic-gradient(#e2e8f0 0 100%)";
    let cursor = 0;
    const parts = data.byCategory.map((item, index) => {
      const start = cursor;
      cursor += item.share;
      return `${CATEGORY_COLORS[index % CATEGORY_COLORS.length]} ${start}% ${cursor}%`;
    });
    if (cursor < 100) parts.push(`#e2e8f0 ${cursor}% 100%`);
    return `conic-gradient(${parts.join(", ")})`;
  }, [data]);

  if (loading && !data) {
    return (
      <main aria-busy="true" aria-live="polite" aria-label="Loading reports" className="h-full overflow-y-auto bg-[var(--oh-surface)] p-3 lg:p-3.5">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2"><div className="h-3 w-44 animate-pulse rounded bg-[var(--oh-border)]" /><div className="h-7 w-52 animate-pulse rounded bg-[var(--oh-surface-muted)]" /><div className="h-4 w-40 animate-pulse rounded bg-[var(--oh-border)]" /></div>
            <div className="h-11 w-52 animate-pulse rounded-lg bg-[var(--oh-surface-muted)]" />
          </div>
          {slowLoading ? (
            <p className="oh-type-meta rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2 text-[var(--oh-muted)]">
              Connecting to Orithos… sales data can take a few seconds to arrive.
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[104px] animate-pulse rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-3"><div className="h-3 w-24 rounded bg-[var(--oh-border)]" /><div className="mt-4 h-6 w-32 rounded bg-[var(--oh-surface-muted)]" /><div className="mt-3 h-3 w-40 rounded bg-[var(--oh-border)]" /></div>)}
          </div>
          <div className="h-16 animate-pulse rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]" />
          <div className="h-52 animate-pulse rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]" />
          <div className="grid gap-2 sm:grid-cols-2"><div className="h-56 animate-pulse rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]" /><div className="h-56 animate-pulse rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]" /></div>
          <div className="h-56 animate-pulse rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]" />
        </div>
      </main>
    );
  }

  if (needsConnection && !data) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <Store className="mx-auto text-amber-600" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Orithos to open Reports</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Reports reads completed sales and open register sessions from your connected Orithos company.</p>
          <Link href="/settings/integrations" className="mt-5 inline-flex h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Orithos</Link>
        </section>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section role="alert" className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-7 text-center shadow-[var(--oh-shadow-card)]">
          <AlertCircle className="mx-auto text-red-700" size={28} />
          <h1 className="mt-4 text-lg font-semibold text-[var(--oh-text)]">Reports could not load</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
            {error}
            {requestId ? <span className="mt-2 block break-all font-mono text-xs text-red-800/80">Request ID: {requestId}</span> : null}
          </p>
          <button type="button" onClick={() => void load()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">
            <RefreshCw size={15} /> Retry
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--oh-surface)]">
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3 lg:flex-row lg:gap-3 lg:p-3.5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="oh-type-meta text-[var(--oh-muted)]">{data?.company ?? "Store"}</p>
              <h1 className="oh-type-title mt-0.5 text-[var(--oh-text)]">Reports</h1>
              <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">
                {greeting} · Orithos POS activity · {rangeLabel}
                {periodBounds ? <span className="ml-1.5 hidden sm:inline">· {periodBounds}</span> : null}
                {lastLoadedAt !== null && <span className="ml-1.5">· Data prepared {formatStoreEpoch(lastLoadedAt, data?.timezone ?? "Australia/Adelaide")}</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div role="group" aria-label="Orithos sales reporting range" className="inline-flex max-w-full flex-wrap items-center rounded-lg border border-[var(--oh-border)] bg-white p-0.5 shadow-sm">
                {OVERVIEW_RANGES.map((range) => (
                  <button key={range.period} type="button" aria-pressed={period === range.period}
                    aria-label={range.label}
                    title={`${range.label}: complete calendar period in the store timezone`}
                    onClick={() => {
                      const url = new URL(location.href); url.searchParams.set("period", range.period); history.replaceState(null, "", url);
                      periodRef.current = range.period; setPeriod(range.period); void load(false, range.period);
                    }}
                    className={cn("oh-type-meta min-h-9 rounded-md px-2.5 font-medium transition-colors sm:px-3", period === range.period ? "bg-[var(--oh-primary)] text-white shadow-sm" : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]")}>
                    {range.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                className="oh-type-meta inline-flex h-11 items-center gap-1.5 rounded-full border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] shadow-sm hover:bg-white disabled:opacity-60"
              >
                {refreshing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh
              </button>
              <Link href="/" className="oh-type-label inline-flex h-11 items-center gap-1 rounded-lg bg-[var(--oh-primary)] px-3 font-semibold text-white no-underline hover:bg-[var(--oh-primary-hover)] lg:hidden">
                Open point of sale <ArrowRight size={15} />
              </Link>
            </div>
          </header>
          {data && data.completeness !== "complete" ? (
            <section role="status" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <span>{data.completeness === "incomplete" ? "Shopfront data is incomplete for this period." : "Shopfront coverage has not been confirmed for this period."}</span>
              <span>{data.sourceSyncedThrough ? `Synced through ${data.sourceSyncedThrough}` : "Source sync status unavailable"}</span>
            </section>
          ) : null}

          {(loading || refreshing) && data && <p role="status" className="text-xs text-[var(--oh-muted)]">Preparing report…</p>}
          {data?.cacheStatus === "STALE" && <p role="status" className="text-xs text-amber-800">Showing the last prepared report. An updated report is being prepared.</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--oh-muted)]">
            <span>{deadStockError ?? (deadStockGeneratedAt ? `Dead-stock prepared ${formatStoreEpoch(Date.parse(deadStockGeneratedAt), data?.timezone ?? "Australia/Adelaide")}` : "Preparing dead-stock analysis…")}</span>
            <button type="button" disabled={deadStockRefreshing} onClick={() => void loadDeadStock(true)} className="min-h-9 rounded border px-2 disabled:opacity-50">{deadStockRefreshing ? "Preparing…" : "Refresh dead-stock"}</button>
          </div>
          {error && (
            <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-900">
              <span className="flex min-w-0 items-start gap-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>
                  {error} The report below is the last successful result and may be out of date.
                  {requestId ? <span className="mt-1 block break-all font-mono text-[11px] text-red-800/80">Request ID: {requestId}</span> : null}
                </span>
              </span>
              <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 font-semibold text-red-900 disabled:opacity-60">{refreshing ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />} Retry</button>
            </div>
          )}

          {sampleDataActive && (
            <section aria-label="Sample data notice" className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <h2 className="oh-type-label font-semibold text-[var(--oh-text)]">Sample data is still in this store</h2>
                <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">
                  DEMO products and demo seed sales are included in Sell and Reports. Remove them before go-live, then import your catalogue.
                </p>
              </div>
              <Link href="/settings/data" className="oh-type-meta inline-flex min-h-11 shrink-0 items-center rounded-md border border-sky-300 bg-white px-3 font-semibold text-[var(--oh-primary)] hover:bg-sky-50">
                Remove sample data
              </Link>
            </section>
          )}

          <section aria-label={`${rangeLabel} Orithos summary`} className="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiCard
              title="Orithos net sales"
              value={formatMoney(data?.revenue ?? 0, data?.currency ?? "AUD")}
              detail="After refunds · incl. tax"
              comparisonLabel={comparisonLabel}
              delta={data && data.compare.revenue >= 50 ? data.compare.revenueDeltaPct : null}
              comparisonMessage={data && data.compare.revenue < 50 ? "Prior activity too small to compare" : undefined}
              icon={<ShoppingBag size={15} />}
            />
            <KpiCard
              title="Gross margin"
              value={typeof data?.grossMarginPercent === "number" && Number.isFinite(data.grossMarginPercent) ? `${(data.grossMarginPercent * 100).toFixed(1)}%` : "—"}
              detail={data?.grossMarginStatus === "verified"
                ? `Odoo recorded cost · ${Math.round((data.grossMarginCoverage ?? 0) * 100)}% cost coverage`
                : data?.grossMarginStatus === "sales_mismatch" ? "Odoo sales and line totals do not reconcile"
                  : data?.grossMarginStatus === "no_sales" ? "No sales in this period" : "Odoo cost records are incomplete"}
              icon={<BarChart3 size={15} />}
              href={`/products?dialog=cost-reconciliation&fromDay=${data ? storeDay(data.from, data.timezone) : ""}&toDay=${data ? storeDay(data.to, data.timezone) : ""}`}
            />
            <KpiCard
              title="Sales"
              value={new Intl.NumberFormat("en-AU").format(data?.transactions ?? 0)}
              detail={`Avg ${formatMoney(averageSale, data?.currency ?? "AUD")} per sale`}
              comparisonLabel={comparisonLabel}
              delta={data && data.compare.transactions >= 3 ? data.compare.transactionsDeltaPct : null}
              comparisonMessage={data && data.compare.transactions < 3 ? "Prior activity too small to compare" : undefined}
              icon={<Package size={15} />}
            />
            <KpiCard
              title="Refunds"
              value={formatMoney(data?.refunds ?? 0, data?.currency ?? "AUD")}
              detail={`${new Intl.NumberFormat("en-AU").format(data?.refundTransactions ?? 0)} refunded orders`}
              icon={<RotateCcw size={15} />}
            />
            <KpiCard
              title="Items sold"
              value={new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(data?.itemsSold ?? 0)}
              detail="From completed sales"
              comparisonLabel={comparisonLabel}
              delta={data && data.compare.itemsSold >= 5 ? data.compare.itemsSoldDeltaPct : null}
              comparisonMessage={data && data.compare.itemsSold < 5 ? "Prior activity too small to compare" : undefined}
              icon={<Archive size={15} />}
            />
            <KpiCard
              title="Net tax"
              value={formatMoney(data?.tax ?? 0, data?.currency ?? "AUD")}
              detail="Sales tax less refunded tax"
              icon={<ArrowUpRight size={15} />}
            />
            <KpiCard
              title="Open registers"
              value={new Intl.NumberFormat("en-AU").format(data?.openRegisters ?? 0)}
                detail="At the report preparation time"
              icon={<Store size={15} />}
            />
          </section>

          <DashboardInsightsPanel
            data={data ? {
              company: data.company,
              currency: data.currency,
              rangeLabel,
              periodBounds,
              revenue: data.revenue,
              transactions: data.transactions,
              refunds: data.refunds ?? 0,
              refundTransactions: data.refundTransactions ?? 0,
              itemsSold: data.itemsSold,
              tax: data.tax,
              openRegisters: data.openRegisters,
              topProducts: data.topProducts,
              byCategory: data.byCategory,
              compare: data.compare,
              lowStockCount: data.lowStockCount,
            } : null}
          />

          {deadStock ? (
            <section aria-label="Dead stock cash occupancy" className="shrink-0 rounded-lg border border-[var(--oh-border)] bg-white p-3 shadow-[var(--oh-shadow-card)]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="oh-type-label font-semibold text-[var(--oh-text)]">Dead stock and cash tied up</h2>
                  <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">Current native stock compared with completed POS sales. Read-only analysis.</p>
                </div>
                <Link href="/stock/replenishment" className="oh-type-meta inline-flex min-h-9 items-center px-2 font-semibold text-[var(--oh-primary)] hover:underline">Review inventory →</Link>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[30, 60, 90].map((days) => (
                  <div key={days} className="rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2.5 py-2">
                    <p className="oh-type-meta text-[var(--oh-muted)]">No sales in {days} days</p>
                    <p className="oh-type-value mt-0.5 text-[var(--oh-text)]">{new Intl.NumberFormat("en-AU").format(deadStock.bucketCounts[String(days)] ?? 0)} products</p>
                    <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">{formatMoney(deadStock.cashValueByBucket[String(days)] ?? 0, data?.currency ?? "AUD")} at cost</p>
                  </div>
                ))}
              </div>
              {deadStock.invalidCostOrStockCount > 0 ? (
                <p className="oh-type-meta mt-2 text-amber-700">{deadStock.invalidCostOrStockCount} products need manual cost or stock review before cash value is trusted.</p>
              ) : null}
              {deadStock.truncated || deadStock.catalogueCoverage?.complete === false ? (
                <p className="oh-type-meta mt-1 text-amber-700">Partial catalogue loaded ({deadStock.catalogueCoverage?.loadedProducts.toLocaleString("en-AU")} of {deadStock.catalogueCoverage?.totalProducts?.toLocaleString("en-AU") ?? "unknown"}). Cash totals are a review queue, not a complete store total.</p>
              ) : null}
            </section>
          ) : null}

          <section className="min-h-0 shrink-0 overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oh-border)] px-3 py-2">
              <div>
                <h2 className="oh-type-label font-semibold text-[var(--oh-text)]">Top products</h2>
                <p className="oh-type-meta text-[var(--oh-muted)]">Orithos POS · {rangeLabel}</p>
              </div>
              <Link href="/products" className="oh-type-meta inline-flex min-h-11 items-center px-2 font-semibold text-[var(--oh-primary)] hover:underline">View all →</Link>
            </div>
            {data?.topProducts.length ? (
              <div className="overflow-x-auto">
                <table aria-label="Top products by revenue" className="w-full table-fixed text-left">
                  <thead>
                    <tr className="oh-type-meta border-b border-[var(--oh-border)] text-[var(--oh-muted)]">
                      <th scope="col" className="w-[52%] px-3 py-1.5 font-semibold">Product</th>
                      <th scope="col" className="w-[16%] px-2 py-1.5 text-right font-semibold">Units</th>
                      <th scope="col" className="w-[32%] px-3 py-1.5 text-right font-semibold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--oh-border)]">
                    {data.topProducts.slice(0, 4).map((product) => {
                      const label = friendlyName(product.name);
                      const tone = markTone(label);
                      const initial = (label.replace(/[^A-Za-z0-9]/gu, "").charAt(0) || "?").toUpperCase();
                      return (
                        <tr key={product.id}>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <span className="oh-type-meta grid h-7 w-7 shrink-0 place-items-center rounded-full font-bold" style={{ background: tone.bg, color: tone.fg }} aria-hidden="true">{initial}</span>
                              <p className="oh-type-label min-w-0 truncate font-medium text-[var(--oh-text)]" title={product.name}>{label}</p>
                            </div>
                          </td>
                          <td className="oh-type-meta px-2 py-1.5 text-right tabular-nums text-[var(--oh-text)]">{new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(product.qty)}</td>
                          <td className="oh-type-label px-3 py-1.5 text-right font-medium tabular-nums text-[var(--oh-text)]">{formatMoney(product.revenue, data.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid place-items-center px-3 py-4 text-center">
                <div>
                  <p className="oh-type-label font-medium text-[var(--oh-text)]">No product sales yet</p>
                  <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">Complete a sale to see top products.</p>
                  <Link href="/" className="oh-type-label mt-2 inline-flex h-11 items-center rounded-md bg-[var(--oh-primary)] px-3 font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Open point of sale</Link>
                </div>
              </div>
            )}
          </section>

          {/* Keep a hard min-height: flex-1 + min-h-0 was crushing the trend plot to ~0 and letting bars paint over Recent sales. */}
          <div className="grid min-h-[16rem] shrink-0 gap-2 sm:grid-cols-2">
            <section className="flex min-h-[16rem] flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white p-2.5 shadow-[var(--oh-shadow-card)]">
              <h2 className="oh-type-label shrink-0 font-semibold text-[var(--oh-text)]">Sales trend</h2>
              <p className="oh-type-meta shrink-0 text-[var(--oh-muted)]">
                {rangeLabel}{periodBounds ? ` · ${periodBounds}` : ""}
              </p>
              {hasTrendData ? (
                <div className="mt-2 flex min-w-0 flex-col">
                  <div
                    aria-describedby="reports-sales-trend-summary"
                    className="relative flex h-36 items-end gap-1.5 overflow-hidden border-b border-l border-[var(--oh-border)] px-1.5 pb-0 pt-1"
                  >
                    <p id="reports-sales-trend-summary" className="sr-only">{trendSummary}</p>
                    {trendData.map((item, index) => {
                      const percent = Math.max(item.revenue > 0 ? 4 : 0, (item.revenue / maxRevenue) * 100);
                      const label = formatGroupedStoreTime(item.label, trendLabelOptions);
                      return (
                        <div
                          key={`${item.label}-${index}`}
                          role="img"
                          tabIndex={0}
                          aria-label={`${label}: ${formatMoney(item.revenue, currency)}, ${item.transactions} sales`}
                          className="group relative flex h-full min-w-0 flex-1 flex-col justify-end text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
                        >
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-0 top-0 z-10 truncate tabular-nums text-[11px] text-[var(--oh-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                          >
                            {formatMoney(item.revenue, currency)}
                          </div>
                          <div
                            className="mx-auto w-full max-w-10 rounded-t bg-[var(--oh-primary)]/85 transition-colors group-hover:bg-[var(--oh-primary)]"
                            style={{ height: `${percent}%` }}
                            title={`${formatMoney(item.revenue, currency)} · ${item.transactions} sales`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1 hidden gap-1.5 sm:flex" aria-hidden="true">
                    {trendData.map((item, index) => {
                      const label = formatGroupedStoreTime(item.label, trendLabelOptions);
                      const showLabel = index === 0 || index === trendData.length - 1 || index % trendLabelInterval === 0;
                      return (
                        <span key={`trend-label-${item.label}-${index}`} className="oh-type-meta min-h-[1.25rem] min-w-0 flex-1 truncate text-center text-[var(--oh-muted)]">
                          {showLabel ? label : ""}
                        </span>
                      );
                    })}
                  </div>
                  {trendData.length > 0 && (
                    <div className="mt-1 flex justify-between gap-3 text-[11px] text-[var(--oh-muted)] sm:hidden" aria-hidden="true">
                      <span>{formatGroupedStoreTime(trendData[0].label, trendLabelOptions)}</span>
                      <span>{formatGroupedStoreTime(trendData[trendData.length - 1].label, trendLabelOptions)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid min-h-[10rem] flex-1 place-items-center p-4 text-center">
                  <div className="max-w-xs">
                    <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"><BarChart3 size={19} /></span>
                    <p className="oh-type-label mt-2 font-semibold text-[var(--oh-text)]">No Orithos sales in this period</p>
                    <p className="oh-type-meta mt-1 text-[var(--oh-muted)]">
                      No completed Orithos POS orders in {rangeLabel}.
                      {data?.sampleDataCleared ? " Demo sample orders were cleared for this store." : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                      <Link href="/" className="oh-type-meta inline-flex min-h-11 items-center gap-1 rounded-md bg-[var(--oh-primary)] px-3 font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Open point of sale <ArrowRight size={14} /></Link>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="flex min-h-[16rem] flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white p-2.5 shadow-[var(--oh-shadow-card)]">
              <h2 className="oh-type-label shrink-0 font-semibold text-[var(--oh-text)]">Sales by category</h2>
              <p className="oh-type-meta shrink-0 text-[var(--oh-muted)]">Share of revenue</p>
              {data?.byCategory.length ? (
                <div className="mt-2 flex min-h-0 flex-1 flex-wrap items-center gap-4">
                  <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: donutGradient }} aria-hidden="true">
                    <div className="absolute inset-[28%] rounded-full bg-white" />
                  </div>
                  <ul className="min-w-0 flex-1 space-y-1.5">
                    {data.byCategory.map((item, index) => (
                      <li key={item.name} className="oh-type-meta flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
                          <span className="truncate text-[var(--oh-text)]">{item.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-[var(--oh-text-secondary)]">{item.share}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="grid min-h-[10rem] flex-1 place-items-center p-4 text-center">
                  <div className="max-w-xs">
                    <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"><PieChart size={19} /></span>
                    <p className="oh-type-label mt-2 font-semibold text-[var(--oh-text)]">No category mix yet</p>
                    <p className="oh-type-meta mt-1 text-[var(--oh-muted)]">Category shares appear after completed sales.</p>
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oh-border)] px-3 py-2">
              <div>
                <h2 className="oh-type-label font-semibold text-[var(--oh-text)]">Recent sales &amp; refunds</h2>
                <p className="oh-type-meta text-[var(--oh-muted)]">Latest completed Orithos POS orders · {rangeLabel}</p>
              </div>
              <Link href="/history" className="oh-type-meta inline-flex min-h-11 items-center gap-1 px-2 font-semibold text-[var(--oh-primary)] hover:underline">
                View all <ArrowUpRight size={14} />
              </Link>
            </div>
            {data?.recentSales.length ? (
              <ul className="divide-y divide-[var(--oh-border)]">
                {data.recentSales.map((sale) => (
                  <li key={sale.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="oh-type-label truncate font-semibold text-[var(--oh-text)]">{sale.pos_reference || sale.name}</p>
                      <p className="oh-type-meta mt-0.5 truncate text-[var(--oh-muted)]">
                        {sale.amount_total < 0 ? "Refund · " : "Sale · "}
                        {sale.partner_id ? sale.partner_id[1] : "Walk-in customer"}
                        {" · "}
                        {formatOdooDateTime(sale.date_order, data.timezone, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className={cn("oh-type-label shrink-0 font-semibold tabular-nums", sale.amount_total < 0 ? "text-[var(--oh-danger)]" : "text-[var(--oh-text)]")}>
                      {formatMoney(sale.amount_total, data.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid place-items-center px-3 py-5 text-center">
                <div>
                  <p className="oh-type-label font-medium text-[var(--oh-text)]">No recent sales</p>
                  <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">
                    No completed Orithos POS orders in {rangeLabel}. Open sales history for all-time Orithos rows.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    <Link href="/history" className="oh-type-label inline-flex h-11 items-center rounded-md border border-[var(--oh-border)] px-3 font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-surface)]">
                      Open sales history
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </section>

          <p className="oh-type-meta inline-flex shrink-0 flex-wrap items-start gap-1.5 text-[var(--oh-muted)]">
            <Clock3 size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Data before {data ? formatOdooDateTime(data.to, data.timezone, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
              {lastLoadedAt !== null && <> · Loaded {formatStoreEpoch(lastLoadedAt, data?.timezone ?? "Australia/Adelaide")}</>}.
              {" "}Sales count excludes drafts, cancelled orders, and refunds; net sales deduct refunds. Times use the store timezone ({data?.timezone ?? "Australia/Adelaide"}).
            </span>
          </p>
        </div>

        <aside className="hidden w-full shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] lg:sticky lg:top-3 lg:flex lg:h-fit lg:w-[280px]">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--oh-border)] px-3 py-2">
            <h2 className="oh-type-label font-semibold text-[var(--oh-text)]">Current sale</h2>
            {parkedCount > 0 && (
              <Link href="/" className="oh-type-meta inline-flex items-center gap-1 rounded-full bg-[var(--oh-orange-light)] px-2 py-0.5 font-medium text-[var(--oh-primary)]">
                <Archive size={12} /> {parkedCount} parked
              </Link>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-5 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">
              <ShoppingBag size={20} />
            </span>
            <div>
              <p className="oh-type-label font-medium text-[var(--oh-text)]">Ready when you are</p>
              <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">
                Open the register to sell.
              </p>
            </div>
          </div>
          <div className="shrink-0 border-t border-[var(--oh-border)] p-3">
            <Link
              href="/"
              className="oh-type-label inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--oh-primary)] font-semibold text-white hover:bg-[var(--oh-primary-hover)]"
            >
              Open point of sale <ArrowRight size={16} />
            </Link>
            <Link
              href="/history"
              className="oh-type-label mt-1.5 inline-flex h-11 w-full items-center justify-center rounded-lg border border-[var(--oh-border)] font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]"
            >
              Sales history
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

function KpiCard({
  title,
  value,
  detail,
  detailTitle,
  delta,
  comparisonMessage,
  comparisonLabel,
  icon,
  href,
}: {
  title: string;
  value: string;
  detail?: string;
  detailTitle?: string;
  delta?: number | null;
  comparisonMessage?: string;
  comparisonLabel?: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const card = (
    <article className="flex min-h-[104px] flex-col rounded-lg border border-[var(--oh-border)] bg-white p-2.5 shadow-[var(--oh-shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <p className="oh-type-meta text-[var(--oh-muted)]">{title}</p>
        <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">{icon}</span>
      </div>
      <p className="mt-1.5 text-[1.25rem] font-bold leading-tight tracking-tight text-[var(--oh-text)]">{value}</p>
      <div className="mt-auto pt-1">
        {detail && <p className="oh-type-meta line-clamp-2 whitespace-normal text-[var(--oh-muted)]" title={detailTitle ?? detail}>{detail}</p>}
        <div className="min-h-4"><Delta value={delta} comparisonMessage={comparisonMessage} comparisonLabel={comparisonLabel} /></div>
      </div>
    </article>
  );
  return href ? <Link href={href} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">{card}</Link> : card;
}
