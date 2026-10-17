"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertCircle, ArrowUpRight, Clock3, LoaderCircle, RefreshCw, RotateCcw, ShoppingBag, Store } from "lucide-react";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { formatOdooDateTime, formatOdooGroupedDate, formatStoreEpoch } from "@/lib/odoo-date";

type DashboardData = {
  rangeHours: number;
  from: string;
  to: string;
  company: string;
  currency: string;
  timezone: string;
  trendGranularity: "hour" | "day";
  revenue: number;
  grossSales: number;
  refunds: number;
  refundTransactions: number;
  tax: number;
  transactions: number;
  openRegisters: number;
  trend: { label: string; revenue: number; transactions: number }[];
  recentSales: {
    id: number;
    name: string;
    pos_reference: string | false;
    date_order: string;
    amount_total: number;
    partner_id: [number, string] | false;
    session_id: [number, string] | false;
  }[];
};

const ranges = [
  { hours: 8, label: "Last 8 hours" },
  { hours: 24, label: "Last 24 hours" },
  { hours: 168, label: "Last 7 days" },
  { hours: 720, label: "Last 30 days" },
];

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions, timezone: string) {
  return formatOdooDateTime(value, timezone, options);
}

function formatGroupedDate(value: string, options: Intl.DateTimeFormatOptions) {
  return formatOdooGroupedDate(value, options);
}

export function OdooReportingDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [rangeHours, setRangeHours] = useState(8);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetchOdooRoute(`/api/odoo/reporting-dashboard?hours=${rangeHours}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as DashboardData | { message?: string } | null;
      if (!response.ok) {
        const message = payload && "message" in payload ? payload.message : undefined;
        setNeedsConnection(response.status === 401 || response.status === 503);
        throw new Error(message || `Could not load the Odoo dashboard (${response.status}).`);
      }
      if (!payload || !("revenue" in payload) || !Array.isArray(payload.trend) || !Array.isArray(payload.recentSales)) {
        throw new Error("Odoo returned an incomplete dashboard response.");
      }
      setNeedsConnection(false);
      setData(payload);
      setLastLoadedAt(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the Odoo dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeHours]);

  useEffect(() => { void load(); }, [load]);

  const averageOrder = data?.transactions ? data.grossSales / data.transactions : 0;
  const maxRevenue = useMemo(() => Math.max(1, ...(data?.trend.map((item) => item.revenue) ?? [])), [data]);

  if (loading && !data) return <DashboardSkeleton />;

  if (needsConnection && !data) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <Store className="mx-auto text-amber-600" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to view live reports</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">The dashboard reads completed sales and open register sessions from your connected Odoo company.</p>
          <Link href="/settings/integrations" className="mt-5 inline-flex h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
        </section>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section role="alert" className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <AlertCircle className="mx-auto text-red-700" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Could not load the reporting dashboard</h1>
          <p className="mt-2 text-sm leading-6 text-red-800">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"><RefreshCw size={16} /> Retry</button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="oh-type-meta font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Deep dive · {data?.company}</p>
          <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">Reporting Dashboard</h1>
          <p className="oh-type-label mt-1 text-[var(--oh-muted)]">
            Live sales totals from Odoo. For a lighter daily view, open{" "}
            <Link href="/overview" className="font-semibold text-[var(--oh-primary)] hover:underline">Overview</Link>.
            {" "}Times use the store timezone ({data?.timezone ?? "Odoo company timezone"}).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="dashboard-range">Reporting period</label>
          <select id="dashboard-range" value={rangeHours} onChange={(event) => setRangeHours(Number(event.target.value))} className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]">
            {ranges.map((range) => <option key={range.hours} value={range.hours}>{range.label}</option>)}
          </select>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-paper)] disabled:opacity-60">
            {refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
          </button>
        </div>
      </header>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"><span className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error} The dashboard below is the last successful result and may be out of date.</span><button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-white px-3 font-semibold text-red-900 disabled:opacity-60">{refreshing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry</button></div>}

      <section aria-label="Sales summary" className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Net sales" value={formatMoney(data?.revenue ?? 0, data?.currency ?? "AUD")} detail="Completed sales less refunds · incl. tax" icon={<ShoppingBag size={18} />} />
        <MetricCard title="Sales" value={new Intl.NumberFormat("en-AU").format(data?.transactions ?? 0)} detail={`Average ${formatMoney(averageOrder, data?.currency ?? "AUD")} per sale`} icon={<Activity size={18} />} />
        <MetricCard title="Refunds" value={formatMoney(data?.refunds ?? 0, data?.currency ?? "AUD")} detail={`${new Intl.NumberFormat("en-AU").format(data?.refundTransactions ?? 0)} refunded orders`} icon={<RotateCcw size={18} />} />
        <MetricCard title="Net tax" value={formatMoney(data?.tax ?? 0, data?.currency ?? "AUD")} detail="Sales tax less refunded tax" icon={<ArrowUpRight size={18} />} />
        <div className="col-span-2 xl:col-span-1">
          <article className="flex min-h-[72px] items-center justify-between gap-3 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2.5 shadow-[var(--oh-shadow-card)] xl:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"><Store size={18} /></span>
              <div className="min-w-0"><p className="oh-type-label text-[var(--oh-muted)]">Open registers</p><p className="oh-type-meta truncate text-[var(--oh-muted)]">Across the current Odoo company</p></div>
            </div>
            <p className="oh-type-kpi shrink-0 text-[var(--oh-text)]">{new Intl.NumberFormat("en-AU").format(data?.openRegisters ?? 0)}</p>
          </article>
          <div className="hidden xl:block"><MetricCard title="Open registers" value={new Intl.NumberFormat("en-AU").format(data?.openRegisters ?? 0)} detail="Across the current Odoo company" icon={<Store size={18} />} /></div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.9fr)]">
        <section className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h2 className="oh-type-title text-[var(--oh-text)]">Sales trend</h2><p className="oh-type-meta mt-1 text-[var(--oh-muted)]">{ranges.find((item) => item.hours === rangeHours)?.label} · {data ? `${formatDate(data.from, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }, data.timezone)} – ${formatDate(data.to, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }, data.timezone)}` : ""}</p></div>
          </div>
          {data?.trend.length ? (
            <>
            <div className="mt-6 flex h-48 items-end gap-2 border-b border-l border-[var(--oh-border)] px-2 pb-0 pt-2 sm:gap-3">
              {data.trend.map((item, index) => {
                const percent = Math.max(item.revenue > 0 ? 4 : 0, (item.revenue / maxRevenue) * 100);
                const label = formatGroupedDate(item.label, data.trendGranularity === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" });
                return <div key={`${item.label}-${index}`} role="img" aria-label={`${label}: ${formatMoney(item.revenue, data.currency)}, ${item.transactions} sales`} tabIndex={0} className="group flex h-full min-w-0 flex-1 flex-col justify-end text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
                  <div className="oh-type-meta mb-1 w-full min-w-0 truncate tabular-nums text-[var(--oh-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" title={`${formatMoney(item.revenue, data.currency)} · ${item.transactions} sales`}>{formatMoney(item.revenue, data.currency)}</div>
                  <div className="relative mx-auto w-full max-w-14 rounded-t bg-[var(--oh-orange)]/85 transition-colors group-hover:bg-[var(--oh-orange)]" style={{ height: `${percent}%` }} title={`${formatMoney(item.revenue, data.currency)} · ${item.transactions} sales`} />
                  <span className="oh-type-meta mt-2 hidden w-full min-w-0 truncate text-[var(--oh-muted)] sm:block">{label}</span>
                </div>;
              })}
            </div>
            <div className="mt-2 flex justify-between gap-3 text-xs text-[var(--oh-muted)] sm:hidden" aria-hidden="true">
              <span>{formatGroupedDate(data.trend[0].label, data.trendGranularity === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" })}</span>
              <span>{formatGroupedDate(data.trend[data.trend.length - 1].label, data.trendGranularity === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" })}</span>
            </div>
            </>
          ) : <div className="grid h-48 place-items-center px-4 text-center"><div><p className="oh-type-body-strong text-[var(--oh-text)]">No sales in this period</p><p className="oh-type-label mt-1 text-[var(--oh-muted)]">Open a register session and complete a sale to see the trend.</p><Link href="/" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Go to Sell</Link></div></div>}
        </section>

        <section className="flex flex-col rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-4 md:px-5">
            <div><h2 className="oh-type-title text-[var(--oh-text)]">Recent sales &amp; refunds</h2><p className="oh-type-meta mt-1 text-[var(--oh-muted)]">Latest completed Odoo POS orders</p></div>
            <Link href="/history/odoo" className="oh-type-label inline-flex min-h-11 shrink-0 items-center gap-1 px-1 font-semibold text-[var(--oh-primary)] hover:underline">View all <ArrowUpRight size={15} /></Link>
          </div>
          <div>
            {data?.recentSales.length ? <ul className="divide-y divide-[var(--oh-border)]">
              {data.recentSales.map((sale) => <li key={sale.id} className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
                <div className="min-w-0"><p className="oh-type-body-strong truncate text-[var(--oh-text)]">{sale.pos_reference || sale.name}</p><p className="oh-type-meta mt-1 truncate text-[var(--oh-muted)]">{sale.amount_total < 0 ? "Refund · " : "Sale · "}{sale.partner_id ? sale.partner_id[1] : "Walk-in customer"} · {formatDate(sale.date_order, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }, data.timezone)}</p></div>
                <span className={`oh-type-body-strong shrink-0 tabular-nums ${sale.amount_total < 0 ? "text-[var(--oh-danger)]" : "text-[var(--oh-text)]"}`}>{formatMoney(sale.amount_total, data.currency)}</span>
              </li>)}
            </ul> : <div className="grid min-h-44 place-items-center px-4 text-center"><div><p className="oh-type-body-strong text-[var(--oh-text)]">No recent sales</p><p className="oh-type-label mt-1 text-[var(--oh-muted)]">Completed Odoo POS orders will appear here.</p><Link href="/history/odoo" className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-surface)]">Open sales history</Link></div></div>}
          </div>
        </section>
      </div>

      <p className="oh-type-meta inline-flex flex-wrap items-center gap-2 text-[var(--oh-muted)]"><Clock3 size={14} />Data through {data ? formatDate(data.to, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }, data.timezone) : "—"}{lastLoadedAt !== null && <> · Loaded {formatStoreEpoch(lastLoadedAt, data?.timezone ?? "Australia/Adelaide")}</>}. Sales excludes drafts, cancelled orders, and refunds; net sales deduct refunds.</p>
    </main>
  );
}

function DashboardSkeleton() {
  return (
    <main aria-label="Loading reporting dashboard" className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2"><span className="h-3 w-32 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-8 w-64 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 w-96 max-w-[80vw] animate-pulse rounded bg-[var(--oh-border)]" /></div>
        <div className="h-11 w-44 animate-pulse rounded-md bg-[var(--oh-border)]" />
      </header>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" />)}</section>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.9fr)]"><div className="min-h-64 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" /><div className="min-h-64 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" /></div>
    </main>
  );
}

function MetricCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return <article className="rounded-lg border border-[var(--oh-border)] bg-white p-3.5 shadow-[var(--oh-shadow-card)]">
    <div className="flex items-center justify-between gap-3"><p className="oh-type-label text-[var(--oh-muted)]">{title}</p><span className="grid h-9 w-9 place-items-center rounded-md bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">{icon}</span></div>
    <p className="oh-type-kpi mt-3 text-[var(--oh-text)]">{value}</p>
    <p className="oh-type-meta mt-1 text-[var(--oh-muted)]">{detail}</p>
  </article>;
}
