"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  LoaderCircle,
  Package,
  PieChart,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Store,
} from "lucide-react";
import { fetchOdooRoute, getOdooSessionStatus } from "@/lib/odoo-api";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatOdooDateTime, formatOdooGroupedDate, formatStoreEpoch } from "@/lib/odoo-date";
import { friendlyProductName } from "@/lib/product-display-name";

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
};

type R2Receipt = {
  invoiceNumber: string;
  date: string;
  time: string;
  total: number;
  tax: number;
  items: Array<{ quantity: number }>;
};

const OVERVIEW_RANGES = [
  { hours: 24, label: "24 hours" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
  { hours: 2160, label: "90 days" },
  { hours: 4320, label: "180 days" },
] as const;

const PARKED_SALES_KEY = "orithos-odoo-parked-sales-v1";

const MARK_TONES = [
  { bg: "#eff6ff", fg: "#1d4ed8" },
  { bg: "#ecfdf5", fg: "#047857" },
  { bg: "#fff7ed", fg: "#c2410c" },
  { bg: "#f5f3ff", fg: "#6d28d9" },
  { bg: "#fdf2f8", fg: "#be185d" },
  { bg: "#ecfeff", fg: "#0e7490" },
] as const;

const CATEGORY_COLORS = ["#2563eb", "#0ea5e9", "#16a36a", "#f59e0b", "#6366f1", "#94a3b8"];

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

function Delta({ value, comparisonMessage }: { value: number | null | undefined; comparisonMessage?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return comparisonMessage ? <span className="oh-type-meta text-[var(--oh-muted)]">{comparisonMessage}</span> : null;
  }
  const positive = value >= 0;
  return (
    <span className={cn("oh-type-meta font-semibold", positive ? "text-[var(--oh-success)]" : "text-red-600")}>
      {positive ? "+" : ""}{value.toFixed(1)}% vs last week
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

export function OrithosOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [parkedCount, setParkedCount] = useState(0);
  const [rangeHours, setRangeHours] = useState<number>(720);
  const [r2Receipts, setR2Receipts] = useState<R2Receipt[]>([]);
  const [r2ArchiveUnavailable, setR2ArchiveUnavailable] = useState(false);
  const [r2RetryKey, setR2RetryKey] = useState(0);
  const [sampleDataActive, setSampleDataActive] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const requestRevision = useRef(0);
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

  const load = useCallback(async (refresh = false, hours = rangeHours) => {
    const revision = ++requestRevision.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setRequestId(null);
    try {
      // Establish or restore the browser's Odoo cookie before loading the
      // dashboard, so the first report request does not need a 401 retry.
      await getOdooSessionStatus();
      if (revision !== requestRevision.current) return;
      const correlationId = crypto.randomUUID();
      setRequestId(correlationId);
      const response = await fetchOdooRoute(`/api/odoo/reporting-dashboard?hours=${hours}`, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { "X-Correlation-ID": correlationId },
      });
      if (revision !== requestRevision.current) return;
      setRequestId(response.headers.get("x-correlation-id") || correlationId);
      const payload = await response.json().catch(() => null) as OverviewData | { message?: string } | null;
      if (revision !== requestRevision.current) return;
      if (!response.ok) {
        const message = payload && "message" in payload ? payload.message : undefined;
        // Temporary Odoo outages stay retryable; only a missing/expired session
        // should send the operator to Integrations.
        setNeedsConnection(response.status === 401);
        throw new Error(message || `Could not load overview (${response.status}).`);
      }
      if (!payload || !("revenue" in payload) || !Array.isArray(payload.trend)) {
        throw new Error("Odoo returned an incomplete overview response.");
      }
      setNeedsConnection(false);
      setLastLoadedAt(Date.now());
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
      if (revision === requestRevision.current) {
        setError(cause instanceof Error ? cause.message : "Could not load overview.");
      }
    } finally {
      if (revision === requestRevision.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [rangeHours]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setParkedCount(readParkedCount()); }, []);
  useEffect(() => {
    let active = true;
    void fetch("/api/r2-archive/sales", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("R2 archive unavailable");
        return response.json() as Promise<{ items?: R2Receipt[] }>;
      })
      .then((payload) => {
        if (!active) return;
        setR2Receipts(Array.isArray(payload.items) ? payload.items : []);
        setR2ArchiveUnavailable(false);
      })
      .catch(() => { if (active) setR2ArchiveUnavailable(true); });
    return () => { active = false; };
  }, [r2RetryKey]);

  const averageSale = data?.transactions ? (data.grossSales ?? data.revenue) / data.transactions : 0;
  const maxRevenue = useMemo(() => Math.max(1, ...(data?.trend.map((item) => item.revenue) ?? [0])), [data]);
  const hasTrendData = data?.trend.some((item) => item.revenue > 0) ?? false;
  const hasCategoryData = (data?.byCategory.length ?? 0) > 0;
  const hasAnalyticsData = hasTrendData || hasCategoryData;
  const trendData = data?.trend ?? [];
  const trendGranularity = data?.trendGranularity ?? "hour";
  const trendLabelInterval = Math.max(1, Math.ceil(trendData.length / 6));
  const currency = data?.currency ?? "AUD";
  const rangeLabel = OVERVIEW_RANGES.find((range) => range.hours === rangeHours)?.label ?? "24 hours";
  const r2Total = r2Receipts.reduce((sum, receipt) => sum + receipt.total, 0);
  const r2ItemsSold = r2Receipts.reduce((sum, receipt) => sum + receipt.items.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
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
      <main aria-busy="true" aria-label="Loading overview" className="h-full overflow-y-auto bg-[var(--oh-surface)] p-3 lg:p-3.5">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2"><div className="h-3 w-44 animate-pulse rounded bg-slate-200" /><div className="h-7 w-52 animate-pulse rounded bg-slate-200" /><div className="h-4 w-40 animate-pulse rounded bg-slate-200" /></div>
            <div className="h-11 w-52 animate-pulse rounded-lg bg-slate-200" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-[104px] animate-pulse rounded-lg border border-[var(--oh-border)] bg-white p-3"><div className="h-3 w-24 rounded bg-slate-200" /><div className="mt-4 h-6 w-32 rounded bg-slate-200" /><div className="mt-3 h-3 w-40 rounded bg-slate-100" /></div>)}
          </div>
          <div className="h-16 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" />
          <div className="h-52 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" />
          <div className="grid gap-2 sm:grid-cols-2"><div className="h-56 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" /><div className="h-56 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" /></div>
        </div>
      </main>
    );
  }

  if (needsConnection && !data) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <Store className="mx-auto text-amber-600" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to open Overview</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Overview reads completed sales from your connected Odoo company.</p>
          <Link href="/settings/integrations" className="mt-5 inline-flex h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
        </section>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section role="alert" className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-7 text-center shadow-[var(--oh-shadow-card)]">
          <AlertCircle className="mx-auto text-red-700" size={28} />
          <h1 className="mt-4 text-lg font-semibold text-[var(--oh-text)]">Overview could not load</h1>
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
              <h1 className="oh-type-title mt-0.5 text-[var(--oh-text)]">{greeting}</h1>
              <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">Odoo POS activity · {rangeLabel}{lastLoadedAt !== null && <span className="ml-2">· Last refreshed {formatStoreEpoch(lastLoadedAt, data?.timezone ?? "Australia/Adelaide")}</span>}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <div role="group" aria-label="Odoo sales reporting range" className="inline-flex h-9 items-center rounded-lg border border-[var(--oh-border)] bg-white p-0.5 shadow-sm">
                {OVERVIEW_RANGES.map((range) => (
                  <button key={range.hours} type="button" aria-pressed={rangeHours === range.hours}
                    onClick={() => { setRangeHours(range.hours); void load(true, range.hours); }}
                    className={cn("oh-type-meta min-h-9 rounded-md px-3 font-medium transition-colors", rangeHours === range.hours ? "bg-[var(--oh-primary)] text-white shadow-sm" : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]")}>
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

          {error && (
            <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-900">
              <span className="flex min-w-0 items-start gap-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>
                  {error} The overview below is the last successful result and may be out of date.
                  {requestId ? <span className="mt-1 block break-all font-mono text-[11px] text-red-800/80">Request ID: {requestId}</span> : null}
                </span>
              </span>
              <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 font-semibold text-red-900 disabled:opacity-60">{refreshing ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />} Retry</button>
            </div>
          )}

          {sampleDataActive && (
            <section aria-label="Sample data notice" className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2.5">
              <div className="min-w-0">
                <h2 className="oh-type-label font-semibold text-[var(--oh-text)]">Sample data is still in this store</h2>
                <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">
                  DEMO products and demo seed sales are included in Sell and Overview. Remove them before go-live, then import your catalogue.
                </p>
              </div>
              <Link href="/settings/data" className="oh-type-meta inline-flex min-h-11 items-center rounded-md border border-sky-300 bg-white px-3 font-semibold text-[var(--oh-primary)] hover:bg-sky-50">
                Remove sample data
              </Link>
            </section>
          )}

          <section aria-label={`${rangeLabel} Odoo summary`} className="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiCard
              title="Odoo net sales"
              value={formatMoney(data?.revenue ?? 0, data?.currency ?? "AUD")}
              detail="After refunds · incl. tax"
              delta={data && data.compare.revenue >= 50 ? data.compare.revenueDeltaPct : null}
              comparisonMessage={data && data.compare.revenue < 50 ? "Prior activity too small to compare" : undefined}
              icon={<ShoppingBag size={15} />}
            />
            <KpiCard
              title="Sales"
              value={new Intl.NumberFormat("en-AU").format(data?.transactions ?? 0)}
              detail={`Avg ${formatMoney(averageSale, data?.currency ?? "AUD")} per sale`}
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
              detail="Across the current Odoo company"
              icon={<Store size={15} />}
            />
          </section>

          <section aria-label="R2 archived sales summary" className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="oh-type-label font-semibold text-[var(--oh-text)]">Shopfront R2 archive</h2>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">R2 · TEST · read-only</span>
              </div>
              <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">
                {r2ArchiveUnavailable ? "Archive temporarily unavailable." : `${r2Receipts.length} latest archived receipts · ${r2ItemsSold} items · excluded from Odoo accounting and stock.`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!r2ArchiveUnavailable && <p className="oh-type-label font-semibold tabular-nums text-[var(--oh-text)]">{formatMoney(r2Total, currency)}</p>}
              {r2ArchiveUnavailable ? <button type="button" onClick={() => setR2RetryKey((value) => value + 1)} className="oh-type-meta inline-flex min-h-11 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 font-semibold text-[var(--oh-primary)] hover:bg-amber-50"><RefreshCw size={13} /> Retry archive</button> : <Link href="/history/odoo" className="oh-type-meta inline-flex min-h-11 items-center rounded-md border border-amber-300 bg-white px-3 font-semibold text-[var(--oh-primary)] hover:bg-amber-50">View receipts</Link>}
            </div>
          </section>

          <section className="min-h-0 shrink-0 overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oh-border)] px-3 py-2">
              <div>
                <h2 className="oh-type-label font-semibold text-[var(--oh-text)]">Top products</h2>
                <p className="oh-type-meta text-[var(--oh-muted)]">Odoo POS · {rangeLabel}</p>
              </div>
              <Link href="/products/odoo" className="oh-type-meta inline-flex min-h-11 items-center px-2 font-semibold text-[var(--oh-primary)] hover:underline">View all →</Link>
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

          <div className={cn("grid gap-2 sm:grid-cols-2", hasAnalyticsData ? "min-h-0 flex-1" : "min-h-[15rem] shrink-0")}>
            <section className="flex min-h-0 flex-col rounded-lg border border-[var(--oh-border)] bg-white p-2.5 shadow-[var(--oh-shadow-card)]">
              <h2 className="oh-type-label shrink-0 font-semibold text-[var(--oh-text)]">Sales trend</h2>
                <p className="oh-type-meta shrink-0 text-[var(--oh-muted)]">Odoo POS · {rangeLabel}</p>
              {hasTrendData ? (
                <div className="mt-2 flex min-h-[7rem] flex-1 items-end gap-1.5 border-b border-l border-[var(--oh-border)] px-1.5 pb-0 pt-1">
                  {trendData.map((item, index) => {
                    const percent = Math.max(item.revenue > 0 ? 4 : 0, (item.revenue / maxRevenue) * 100);
                    const label = formatGroupedStoreTime(item.label, trendGranularity === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" });
                    const showLabel = index === 0 || index === trendData.length - 1 || index % trendLabelInterval === 0;
                    return (
                      <div key={`${item.label}-${index}`} className="group flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                        <div aria-hidden="true" className="oh-type-meta mb-0.5 truncate tabular-nums text-[var(--oh-muted)] opacity-0 transition-opacity group-hover:opacity-100">{formatMoney(item.revenue, currency)}</div>
                        <div
                          role="img"
                          aria-label={`${label}: ${formatMoney(item.revenue, currency)}, ${item.transactions} sales`}
                          className="relative mx-auto w-full max-w-10 rounded-t bg-[var(--oh-primary)]/85 transition-colors group-hover:bg-[var(--oh-primary)]"
                          style={{ height: `${percent}%` }}
                          title={`${formatMoney(item.revenue, currency)} · ${item.transactions} sales`}
                        />
                        <span className="oh-type-meta mt-1 min-h-[1.25rem] truncate text-[var(--oh-muted)]" aria-hidden={!showLabel}>
                          {showLabel ? label : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid min-h-[10rem] flex-1 place-items-center p-4 text-center">
                  <div className="max-w-xs">
                    <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"><BarChart3 size={19} /></span>
                    <p className="oh-type-label mt-2 font-semibold text-[var(--oh-text)]">No Odoo sales in this period</p>
                    <p className="oh-type-meta mt-1 text-[var(--oh-muted)]">R2 archive receipts are shown separately above.</p>
                    <Link href="/" className="oh-type-meta mt-2 inline-flex min-h-11 items-center gap-1 rounded-md px-3 font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-accent)]">Open point of sale <ArrowRight size={14} /></Link>
                  </div>
                </div>
              )}
            </section>

            <section className="flex min-h-0 flex-col rounded-lg border border-[var(--oh-border)] bg-white p-2.5 shadow-[var(--oh-shadow-card)]">
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
                <p className="oh-type-meta text-[var(--oh-muted)]">Latest completed Odoo POS orders · {rangeLabel}</p>
              </div>
              <Link href="/history/odoo" className="oh-type-meta inline-flex min-h-11 items-center gap-1 px-2 font-semibold text-[var(--oh-primary)] hover:underline">
                View all <ArrowUpRight size={14} />
              </Link>
            </div>
            {data?.recentSales.length ? (
              <ul className="divide-y divide-[var(--oh-border)]">
                {data.recentSales.slice(0, 8).map((sale) => (
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
                  <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">Widen the period or open sales history for all Odoo rows.</p>
                  <Link href="/history/odoo" className="oh-type-label mt-2 inline-flex h-11 items-center rounded-md border border-[var(--oh-border)] px-3 font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-surface)]">
                    Open sales history
                  </Link>
                </div>
              </div>
            )}
          </section>

          <p className="oh-type-meta shrink-0 text-[var(--oh-muted)]">
            Times use the store timezone ({data?.timezone ?? "Australia/Adelaide"}). Net sales deduct refunds; R2 archive is not included in Odoo totals.
          </p>
        </div>

        <aside className="hidden w-full shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] lg:flex lg:h-full lg:w-[280px]">
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
              href="/history/odoo"
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
  delta,
  comparisonMessage,
  icon,
}: {
  title: string;
  value: string;
  detail?: string;
  delta?: number | null;
  comparisonMessage?: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="flex min-h-[104px] flex-col rounded-lg border border-[var(--oh-border)] bg-white p-2.5 shadow-[var(--oh-shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <p className="oh-type-meta text-[var(--oh-muted)]">{title}</p>
        <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">{icon}</span>
      </div>
      <p className="mt-1.5 text-[1.25rem] font-bold leading-tight tracking-tight text-[var(--oh-text)]">{value}</p>
      <div className="mt-auto pt-1">
        {detail && <p className="oh-type-meta truncate text-[var(--oh-muted)]" title={detail}>{detail}</p>}
        <div className="min-h-4"><Delta value={delta} comparisonMessage={comparisonMessage} /></div>
      </div>
    </article>
  );
}
