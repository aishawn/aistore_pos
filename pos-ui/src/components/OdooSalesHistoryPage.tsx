"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearOdooReadCache } from "@/lib/odoo-read-cache";
import Link from "next/link";
import { WorkspaceRecordsPanel } from "@/components/WorkspaceRecordsPanel";
import { AlertCircle, Download, FileText, LoaderCircle, RefreshCw, X } from "lucide-react";
import { searchOdooDailySales, type OdooDailySaleRecord, type OdooSalesPeriodFilter, type OdooSalesStatusFilter } from "@/lib/odoo-api";
import { formatOdooGroupedDate } from "@/lib/odoo-date";

const PAGE_SIZE = 40;
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amount);

function SalesEmptyState({ searching, onClear }: { searching: boolean; onClear: () => void }) {
  return <div role="status" className="flex min-h-64 flex-col items-center justify-center px-5 py-12 text-center"><span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"><FileText size={20} aria-hidden="true" /></span><h2 className="mt-4 text-sm font-semibold text-[var(--oh-text)]">{searching ? "No matching sales days" : "No sales yet"}</h2><p className="mt-1 max-w-sm text-sm leading-5 text-[var(--oh-muted)]">{searching ? "Try another date or filter." : "Sales available to this Orithos account will appear here."}</p>{searching && <button type="button" onClick={onClear} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-primary)]">Clear filters</button>}</div>;
}

function formatDay(date: string) { return formatOdooGroupedDate(date, { day: "2-digit", month: "short", year: "numeric" }); }

export function OdooSalesHistoryPage({ variant = "page", onRequestClose, initialStatus = "all" }: { variant?: "page" | "panel"; onRequestClose?: () => void; initialStatus?: OdooSalesStatusFilter } = {}) {
  const [view, setView] = useState<"daily" | "lines">("daily");
  const [linesRefreshKey, setLinesRefreshKey] = useState(0);
  const isPanel = variant === "panel";
  const Root = isPanel ? "div" : "main";
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<OdooDailySaleRecord[]>([]);
  const [status, setStatus] = useState<OdooSalesStatusFilter>(initialStatus);
  const [period, setPeriod] = useState<OdooSalesPeriodFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const nextOffset = useRef(0);
  const busy = useRef(false);
  const scrollRoot = useRef<HTMLElement>(null);
  const sentinel = useRef<HTMLElement>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState("AUD");
  const [error, setError] = useState<string | null>(null);

  const revision = useRef(0);
  const loadSales = useCallback(async (append = false) => {
    if (append && busy.current) return;
    busy.current = true;
    if (!append) scrollRoot.current?.scrollTo({ top: 0 });
    const current = ++revision.current;
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const page = await searchOdooDailySales({ status, period, fromDate: fromDate || undefined, toDate: toDate || undefined, limit: PAGE_SIZE, offset: append ? nextOffset.current : 0 });
      if (current !== revision.current) return;
      setConnected(true);
      setItems(previous => append ? [...previous, ...page.items.filter(row => !previous.some(item => item.date === row.date))] : page.items); nextOffset.current = page.offset + page.items.length; setHasNext(page.hasNext); setCurrency(page.currency);
    } catch (cause) { if (current === revision.current) setError(cause instanceof Error ? cause.message : "Could not load daily sales."); }
    finally { if (current === revision.current) { busy.current = false; setLoading(false); setLoadingMore(false); } }
  }, [fromDate, period, status, toDate]);

  useEffect(() => {
    setItems([]); setHasNext(false); nextOffset.current = 0;
    void loadSales();
    return () => { revision.current++; busy.current = false; };
  }, [loadSales]);
  useEffect(() => {
    const node = sentinel.current, root = scrollRoot.current;
    if (!node || !root || loading || loadingMore || !hasNext || error) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void loadSales(true);
    }, { root, rootMargin: "240px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [view, hasNext, loading, loadingMore, error, loadSales]);
  function clearFilters() { setStatus("all"); setPeriod("all"); setFromDate(""); setToDate(""); }
  function exportVisibleSales() {
    if (!items.length) return;
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/gu, '""')}"`;
    const rows = [["Date", "Sales transactions", "Refund transactions", "Sales", "Refunds", "Net sales", "Tax"], ...items.map((row) => [formatDay(row.date), row.salesTransactions, row.refundTransactions, row.salesAmount.toFixed(2), row.refundAmount.toFixed(2), row.netSales.toFixed(2), row.tax.toFixed(2)])];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "orithos-sales-daily.csv"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }
  const hasActiveFilter = status !== "all" || period !== "all" || Boolean(fromDate || toDate);

  const viewSwitch = (
    <nav aria-label="Sales history views" className="flex shrink-0 gap-2">
      {([['daily', 'Daily summary'], ['lines', 'Sales lines']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${view === key ? "border-[var(--oh-primary)] bg-[var(--oh-orange-light)] text-[var(--oh-primary)]" : "border-[var(--oh-border)] bg-white"}`}>{label}</button>)}
    </nav>
  );

  return <Root className={isPanel ? "flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-white p-3 sm:p-4" : "flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-[var(--oh-surface)] p-4 md:p-6"}>
    <header className="flex shrink-0 items-start justify-between gap-3"><div className="min-w-0"><h1 className={isPanel ? "text-lg font-semibold text-[var(--oh-text)]" : "oh-type-title text-[var(--oh-text)]"}>Sales History</h1>{!isPanel && <p className="oh-type-label mt-1 text-[var(--oh-muted)]">Daily sales, refunds and reporting totals from the connected Orithos ledger.</p>}</div><div className="flex shrink-0 items-center gap-2"><button type="button" onClick={() => { clearOdooReadCache(); if (view === "lines") setLinesRefreshKey((value) => value + 1); else void loadSales(); }} disabled={view === "daily" && loading} aria-label={view === "daily" && loading ? "Refreshing sales" : "Refresh sales"} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] disabled:opacity-60"><RefreshCw size={16} className={view === "daily" && loading ? "animate-spin" : ""} />{!isPanel ? "Refresh" : null}</button>{isPanel && onRequestClose && <button type="button" onClick={onRequestClose} aria-label="Close sales history" className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--oh-border)] text-[var(--oh-text)]"><X size={18} /></button>}</div></header>

    {view === "lines" ? <section className="min-h-0 flex-1"><WorkspaceRecordsPanel type="lines" toolbarStart={viewSwitch} embedded refreshKey={linesRefreshKey} /></section> : <>
    {connected === false ? <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center"><div className="max-w-md"><AlertCircle className="mx-auto text-amber-600" size={28} /><h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Connect Orithos to view sales</h2><p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Connect with your Orithos staff account to view daily sales.</p><Link href="/settings/integrations" className="mt-4 inline-flex h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Connect Orithos</Link></div></section> : <>
      <div className="flex w-full shrink-0 flex-wrap items-center gap-2">{viewSwitch}<label className="flex shrink-0 items-center gap-2 text-sm font-medium text-[var(--oh-muted)]">From<input aria-label="Sales history from date" type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); }} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-normal text-[var(--oh-text)]" /></label><label className="flex shrink-0 items-center gap-2 text-sm font-medium text-[var(--oh-muted)]">To<input aria-label="Sales history to date" type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); }} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-normal text-[var(--oh-text)]" /></label><label className="flex h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)]"><span className="sr-only">Filter sales by time</span><select aria-label="Filter sales by time" value={period} onChange={(event) => { setPeriod(event.target.value as OdooSalesPeriodFilter); setFromDate(""); setToDate(""); }} className="h-full bg-transparent outline-none"><option value="all">All time</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="180d">Last 180 days</option></select></label><label className="flex h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)]"><span className="sr-only">Filter sales by status</span><select aria-label="Filter sales by status" value={status} onChange={(event) => { setStatus(event.target.value as OdooSalesStatusFilter); }} className="h-full bg-transparent outline-none"><option value="all">All statuses</option><option value="completed">Completed</option><option value="refunded">Refunded</option><option value="cancelled">Cancelled</option><option value="draft">Draft</option></select></label><button type="button" onClick={exportVisibleSales} disabled={!items.length || loading} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text)] disabled:opacity-50"><Download size={16} /> Export visible</button></div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>}
      <section ref={scrollRoot} className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]"><table aria-label="Orithos daily sales history" className="hidden w-full min-w-[900px] border-collapse text-left text-sm md:table"><thead className="sticky top-0 bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Sales count</th><th className="px-4 py-3 text-right">Refund count</th><th className="px-4 py-3 text-right">Sales</th><th className="px-4 py-3 text-right">Refunds</th><th className="px-4 py-3 text-right">Net sales</th><th className="px-4 py-3 text-right">Tax</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{loading && items.length === 0 ? Array.from({ length: 6 }, (_, index) => <tr key={index}><td colSpan={7} className="px-4 py-5"><div className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /></td></tr>) : items.length === 0 ? <tr><td colSpan={7} className="p-0"><SalesEmptyState searching={hasActiveFilter} onClear={clearFilters} /></td></tr> : items.map((row) => <tr key={row.date} className="hover:bg-[var(--oh-surface)]/70"><td className="px-4 py-3 font-medium text-[var(--oh-text)]">{formatDay(row.date)}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{row.salesTransactions}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{row.refundTransactions}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{money(row.salesAmount, currency)}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{money(row.refundAmount, currency)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--oh-text)]">{money(row.netSales, currency)}</td><td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{money(row.tax, currency)}</td></tr>)}</tbody></table><div className="divide-y divide-[var(--oh-border)] md:hidden">{loading && items.length === 0 ? <div className="p-5"><LoaderCircle size={20} className="mx-auto animate-spin text-[var(--oh-muted)]" /></div> : items.length === 0 ? <SalesEmptyState searching={hasActiveFilter} onClear={clearFilters} /> : items.map((row) => <article key={row.date} className="p-4"><div className="flex items-center justify-between"><h2 className="font-semibold text-[var(--oh-text)]">{formatDay(row.date)}</h2><span className="text-xs text-[var(--oh-muted)]">{row.salesTransactions} sales · {row.refundTransactions} refunds</span></div><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-[var(--oh-muted)]">Sales</dt><dd className="font-medium">{money(row.salesAmount, currency)}</dd></div><div><dt className="text-[var(--oh-muted)]">Refunds</dt><dd className="font-medium">{money(row.refundAmount, currency)}</dd></div><div><dt className="text-[var(--oh-muted)]">Net sales</dt><dd className="font-semibold">{money(row.netSales, currency)}</dd></div><div><dt className="text-[var(--oh-muted)]">Tax</dt><dd className="font-medium">{money(row.tax, currency)}</dd></div></dl></article>)}</div>
      {items.length > 0 && <footer ref={sentinel} aria-live="polite" className="flex min-h-14 flex-wrap items-center justify-center gap-3 p-3 text-sm text-[var(--oh-muted)]">
        <span>{loadingMore ? "Loading more sales days…" : hasNext ? `Loaded ${items.length} days` : `All ${items.length} days loaded`}</span>
        {hasNext && <button type="button" disabled={loading || loadingMore} onClick={() => void loadSales(true)} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-semibold text-[var(--oh-primary)] disabled:opacity-60">{error ? "Retry" : "Load more"}</button>}
      </footer>}
      </section>
    </>}
    </>}
  </Root>;
}
