"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertCircle, ArrowUpRight, Clock3, LoaderCircle, RefreshCw, ShoppingBag, Store } from "lucide-react";

type DashboardData = {
  rangeHours: number;
  from: string;
  to: string;
  company: string;
  currency: string;
  trendGranularity: "hour" | "day";
  revenue: number;
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

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", ...options }).format(date);
}

export function OdooReportingDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [rangeHours, setRangeHours] = useState(8);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/odoo/reporting-dashboard?hours=${rangeHours}`, {
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the Odoo dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rangeHours]);

  useEffect(() => { void load(); }, [load]);

  const averageOrder = data?.transactions ? data.revenue / data.transactions : 0;
  const maxRevenue = useMemo(() => Math.max(1, ...(data?.trend.map((item) => item.revenue) ?? [])), [data]);

  if (loading && !data) {
    return <main className="grid h-full place-items-center bg-[var(--oh-surface)]"><LoaderCircle className="animate-spin text-[var(--oh-muted)]" /></main>;
  }

  if (needsConnection && !data) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <Store className="mx-auto text-amber-600" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to view live reports</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">The dashboard reads completed sales and open register sessions from your connected Odoo company.</p>
          <Link href="/settings/integrations" className="mt-5 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Store overview · {data?.company}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Reporting Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Live sales totals from Odoo. All times shown in Sydney time.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="dashboard-range">Reporting period</label>
          <select id="dashboard-range" value={rangeHours} onChange={(event) => setRangeHours(Number(event.target.value))} className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]">
            {ranges.map((range) => <option key={range.hours} value={range.hours}>{range.label}</option>)}
          </select>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-paper)] disabled:opacity-60">
            {refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
          </button>
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}

      <section aria-label="Sales summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Gross sales" value={formatMoney(data?.revenue ?? 0, data?.currency ?? "AUD")} detail="Completed POS orders · incl. tax" icon={<ShoppingBag size={18} />} />
        <MetricCard title="Transactions" value={new Intl.NumberFormat("en-AU").format(data?.transactions ?? 0)} detail={`Average ${formatMoney(averageOrder, data?.currency ?? "AUD")} per sale`} icon={<Activity size={18} />} />
        <MetricCard title="Tax collected" value={formatMoney(data?.tax ?? 0, data?.currency ?? "AUD")} detail="Tax recorded on completed orders" icon={<ArrowUpRight size={18} />} />
        <MetricCard title="Open registers" value={new Intl.NumberFormat("en-AU").format(data?.openRegisters ?? 0)} detail="Across the current Odoo company" icon={<Store size={18} />} />
      </section>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.9fr)]">
        <section className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h2 className="text-base font-semibold text-[var(--oh-text)]">Sales trend</h2><p className="mt-1 text-xs text-[var(--oh-muted)]">{ranges.find((item) => item.hours === rangeHours)?.label} · {data ? `${formatDate(data.from, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} – ${formatDate(data.to, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</p></div>
          </div>
          {data?.trend.length ? (
            <div className="mt-6 flex h-56 items-end gap-2 border-b border-l border-[var(--oh-border)] px-2 pb-0 pt-2 sm:gap-3">
              {data.trend.map((item, index) => {
                const percent = Math.max(item.revenue > 0 ? 4 : 0, (item.revenue / maxRevenue) * 100);
                const label = formatDate(item.label, data.trendGranularity === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" });
                return <div key={`${item.label}-${index}`} className="group flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                  <div className="mb-1 truncate text-[10px] tabular-nums text-[var(--oh-muted)] opacity-0 transition-opacity group-hover:opacity-100" title={`${formatMoney(item.revenue, data.currency)} · ${item.transactions} sales`}>{formatMoney(item.revenue, data.currency)}</div>
                  <div className="relative mx-auto w-full max-w-14 rounded-t bg-[var(--oh-orange)]/85 transition-colors group-hover:bg-[var(--oh-orange)]" style={{ height: `${percent}%` }} title={`${formatMoney(item.revenue, data.currency)} · ${item.transactions} sales`} />
                  <span className="mt-2 truncate text-[10px] text-[var(--oh-muted)]">{label}</span>
                </div>;
              })}
            </div>
          ) : <div className="grid h-56 place-items-center px-4 text-center"><div><p className="text-sm font-semibold text-[var(--oh-text)]">No sales in this period</p><p className="mt-1 text-sm text-[var(--oh-muted)]">Open a register session and complete a sale to see the trend.</p><Link href="/" className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Go to Sell</Link></div></div>}
        </section>

        <section className="flex min-h-0 flex-col rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-4 md:px-5">
            <div><h2 className="text-base font-semibold text-[var(--oh-text)]">Recent sales</h2><p className="mt-1 text-xs text-[var(--oh-muted)]">Latest completed Odoo POS orders</p></div>
            <Link href="/history/odoo" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--oh-primary)] hover:underline">View all <ArrowUpRight size={15} /></Link>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {data?.recentSales.length ? <ul className="divide-y divide-[var(--oh-border)]">
              {data.recentSales.map((sale) => <li key={sale.id} className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--oh-text)]">{sale.pos_reference || sale.name}</p><p className="mt-1 truncate text-xs text-[var(--oh-muted)]">{sale.partner_id ? sale.partner_id[1] : "Walk-in customer"} · {formatDate(sale.date_order, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--oh-text)]">{formatMoney(sale.amount_total, data.currency)}</span>
              </li>)}
            </ul> : <div className="grid min-h-44 place-items-center px-4 text-center"><div><p className="text-sm font-semibold text-[var(--oh-text)]">No recent sales</p><p className="mt-1 text-sm text-[var(--oh-muted)]">Completed Odoo POS orders will appear here.</p><Link href="/history/odoo" className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-surface)]">Open sales history</Link></div></div>}
          </div>
        </section>
      </div>

      <p className="inline-flex items-center gap-2 text-xs text-[var(--oh-muted)]"><Clock3 size={14} />Updated {data ? formatDate(data.to, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}. Revenue excludes drafts and cancelled orders.</p>
    </main>
  );
}

function MetricCard({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return <article className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-[var(--oh-muted)]">{title}</p><span className="grid h-9 w-9 place-items-center rounded-md bg-[#fff2da] text-[var(--oh-orange-dark)]">{icon}</span></div>
    <p className="mt-4 text-2xl font-semibold tracking-tight text-[var(--oh-text)]">{value}</p>
    <p className="mt-1 text-xs text-[var(--oh-muted)]">{detail}</p>
  </article>;
}
