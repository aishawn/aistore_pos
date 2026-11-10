"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

type NativeOverview = {
  source: "orithos_ledger";
  from: string;
  to: string;
  revenue: number;
  cost: number;
  tax: number;
  grossProfit: number | null;
  costAvailable: boolean;
  transactions: number;
  dailyTrend: Array<{ date: string; revenue: number; transaction_count: number; cost: number }>;
  topProducts: Array<{ id: number; name: string; revenue: number; quantity: number }>;
  inventoryAvailable: false;
};

function dayInAdelaide(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

async function readOverview(from: string, to: string, signal: AbortSignal): Promise<NativeOverview> {
  const params = new URLSearchParams({ from, to });
  const response = await fetch(`/api/reports/native-overview?${params}`, { credentials: "same-origin", cache: "no-store", signal });
  const body = await response.json().catch(() => null) as { data?: NativeOverview; message?: string } | null;
  if (!response.ok || !body?.data || body.data.source !== "orithos_ledger") {
    throw new Error(body?.message || "Orithos sales data is unavailable.");
  }
  return body.data;
}

export function NativeReportsDashboardPage() {
  const [period, setPeriod] = useState<"today" | "yesterday" | "last_week" | "last_month">("yesterday");
  const [data, setData] = useState<NativeOverview | null>(null);
  const [comparison, setComparison] = useState<NativeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const today = dayInAdelaide(new Date());
  const bounds = useMemo(() => {
    const anchor = period === "today" ? today : shiftDay(today, -1);
    if (period === "today" || period === "yesterday") return { from: anchor, to: anchor };
    if (period === "last_week") return { from: shiftDay(anchor, -6), to: anchor };
    const date = new Date(`${anchor}T12:00:00Z`);
    date.setUTCDate(1);
    const first = date.toISOString().slice(0, 10);
    return { from: first, to: anchor };
  }, [period, today]);
  const { from, to } = bounds;
  const span = Math.max(1, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1);
  const compareFrom = shiftDay(from, -span);
  const compareTo = shiftDay(from, -1);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [current, previous] = await Promise.all([
        readOverview(from, to, signal),
        readOverview(compareFrom, compareTo, signal),
      ]);
      if (!signal.aborted) {
        setData(current);
        setComparison(previous);
      }
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Orithos report is unavailable.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [compareFrom, compareTo, from, to]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get("period");
    if (requested === "today" || requested === "yesterday" || requested === "last_week" || requested === "last_month") setPeriod(requested);
  }, []);

  const delta = data && comparison && comparison.revenue !== 0
    ? ((data.revenue - comparison.revenue) / Math.abs(comparison.revenue)) * 100
    : null;
  const maxRevenue = Math.max(1, ...(data?.dailyTrend ?? []).map(row => Number(row.revenue)));

  return <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--oh-border)] pb-4">
      <div><p className="text-xs font-medium text-[var(--oh-muted)]">Orithos ledger · Australia/Adelaide</p><h1 className="text-xl font-semibold text-[var(--oh-text)]">Reports overview</h1><p className="text-xs text-[var(--oh-muted)]">{from} to {to}</p></div>
      <div className="flex items-center gap-2"><div role="group" aria-label="Reporting period" className="flex rounded-md border border-[var(--oh-border)] bg-white p-0.5">{(["today", "yesterday", "last_week", "last_month"] as const).map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => { setPeriod(value); const url = new URL(location.href); url.searchParams.set("period", value); history.replaceState(null, "", url); }} className={`min-h-8 px-2 text-xs ${period === value ? "bg-[var(--oh-primary)] text-white" : "text-[var(--oh-text)]"}`}>{value.replace("_", " ")}</button>)}</div><button type="button" onClick={() => setRefreshKey(value => value + 1)} disabled={loading} aria-label="Refresh report" title="Refresh report" className="grid size-9 place-items-center rounded-md border border-[var(--oh-border)] bg-white disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button></div>
    </header>
    {error && <div role="alert" className="flex items-center gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"><AlertCircle size={16} />{error}</div>}
    <section aria-busy={loading} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="Sales" value={data ? money(data.revenue) : "—"} detail={delta === null ? "Comparison unavailable" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% vs previous 7 days`} />
      <Metric label="Transactions" value={data ? data.transactions.toLocaleString("en-AU") : "—"} detail="Orithos ledger records" />
      <Metric label="Gross profit" value={data?.grossProfit != null ? money(data.grossProfit) : "—"} detail={data?.costAvailable ? `Cost ${money(data.cost)}` : "Cost coverage unavailable"} />
      <Metric label="Inventory" value="Unavailable" detail="No native snapshot in this report" />
    </section>
    <section className="grid gap-4 lg:grid-cols-2">
      <section className="border border-[var(--oh-border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--oh-text)]">Daily sales</h2>
        {data?.dailyTrend.length ? <div className="mt-4 flex h-36 items-end gap-2 border-b border-l border-[var(--oh-border)] px-2">
          {data.dailyTrend.map(row => <div key={String(row.date)} className="group flex h-full min-w-0 flex-1 items-end" title={`${row.date}: ${money(Number(row.revenue))}`}><div className="w-full rounded-t bg-[var(--oh-primary)]" style={{ height: `${Math.max(4, Number(row.revenue) / maxRevenue * 100)}%` }} /></div>)}
        </div> : <p className="mt-5 text-sm text-[var(--oh-muted)]">{loading ? "Loading…" : "No Orithos sales for this period."}</p>}
        <div className="mt-2 flex justify-between text-xs text-[var(--oh-muted)]"><span>{data?.dailyTrend[0]?.date}</span><span>{data?.dailyTrend.at(-1)?.date}</span></div>
      </section>
      <section className="border border-[var(--oh-border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--oh-text)]">Top products</h2>
        {data?.topProducts.length ? <ul className="mt-2 divide-y divide-[var(--oh-border)]">{data.topProducts.map(row => <li key={row.id || row.name} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate">{row.name}</span><span className="shrink-0 text-[var(--oh-muted)]">{row.quantity} units</span><strong className="shrink-0">{money(Number(row.revenue))}</strong></li>)}</ul> : <p className="mt-5 text-sm text-[var(--oh-muted)]">{loading ? "Loading…" : "Product detail unavailable."}</p>}
      </section>
    </section>
    <p className="text-xs text-[var(--oh-muted)]">Only transactions stored in Orithos are included. Historical Shopfront records not present in this ledger are not included.</p>
  </main>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="border border-[var(--oh-border)] bg-white p-3"><p className="text-xs text-[var(--oh-muted)]">{label}</p><p className="mt-1 text-lg font-semibold text-[var(--oh-text)]">{value}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">{detail}</p></div>;
}
