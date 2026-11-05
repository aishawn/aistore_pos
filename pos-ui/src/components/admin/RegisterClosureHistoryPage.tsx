"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, LoaderCircle, Printer, RefreshCw } from "lucide-react";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { formatOdooDateTime, formatStoreEpoch } from "@/lib/odoo-date";
import { salesDate, shiftDay } from "@/lib/replenishment-safety";

type Closure = { id: number; register: string; name: string; openedAt: string | false | null; closedAt: string | false | null; expected: number | null; received: number | null; difference: number | null };
type Page = { company: string; currency: string; timezone: string; source: string; shopfrontSync: { fromDay: string; toDay: string; status: "completed" | "partial" | "failed"; updatedAt: string; revision: string } | null; from: string; to: string; generatedAt: string; total: number; offset: number; hasNext: boolean; items: Closure[] };
const STORE_TIMEZONE = "Australia/Adelaide";

function initialDates() {
  const to = salesDate(new Date().toISOString(), STORE_TIMEZONE);
  return { from: shiftDay(to, -29), to };
}

export function RegisterClosureHistoryPage() {
  const [draftDates, setDraftDates] = useState(initialDates);
  const [dates, setDates] = useState(() => draftDates);
  const [rows, setRows] = useState<Closure[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [company, setCompany] = useState("Store");
  const [currency, setCurrency] = useState("AUD");
  const [timezone, setTimezone] = useState(STORE_TIMEZONE);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [shopfrontSync, setShopfrontSync] = useState<Page["shopfrontSync"]>(null);
  const loadedCount = useRef(0);
  const requestRevision = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search); const from = params.get("from"); const to = params.get("to");
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) { setDates({ from, to }); setDraftDates({ from, to }); }
    setExceptionsOnly(params.get("exceptions") === "true");
    const onPopState = () => {
      const next = new URLSearchParams(location.search); const nextFrom = next.get("from"); const nextTo = next.get("to");
      if (nextFrom && nextTo && /^\d{4}-\d{2}-\d{2}$/.test(nextFrom) && /^\d{4}-\d{2}-\d{2}$/.test(nextTo)) { setDates({ from: nextFrom, to: nextTo }); setDraftDates({ from: nextFrom, to: nextTo }); }
      setExceptionsOnly(next.get("exceptions") === "true");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams({ from: dates.from, to: dates.to });
    if (exceptionsOnly) params.set("exceptions", "true");
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, [dates, exceptionsOnly]);
  const money = useMemo(() => {
    try { return new Intl.NumberFormat("en-AU", { style: "currency", currency }); }
    catch { return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }); }
  }, [currency]);
  async function exportCsv() {
    try {
      const params = new URLSearchParams({ from: dates.from, to: dates.to, export: "csv" });
      if (exceptionsOnly) params.set("exceptions", "true");
      const response = await fetchOdooRoute(`/api/odoo/register-closures?${params}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) { const body = await response.json() as { message?: string }; throw new Error(body.message || "CSV export failed."); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `register-closures-${dates.from}-${dates.to}.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "CSV export failed."); }
  }
  const load = useCallback(async (append = false) => {
    const revision = ++requestRevision.current;
    const offset = append ? loadedCount.current : 0;
    setLoading(!append); setLoadingMore(append); setError(null);
    if (!append) { setRows([]); loadedCount.current = 0; setTotal(0); setHasNext(false); }
    try {
      const params = new URLSearchParams({ from: dates.from, to: dates.to, offset: String(offset) });
      if (exceptionsOnly) params.set("exceptions", "true");
      const response = await fetchOdooRoute(`/api/odoo/register-closures?${params}`, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json() as Page & { message?: string };
      if (!response.ok || !Array.isArray(body.items)) throw new Error(body.message || "Register closure history is unavailable.");
      if (revision !== requestRevision.current) return;
      setRows((current) => append ? [...current, ...body.items] : body.items);
      loadedCount.current = offset + body.items.length;
      setTotal(body.total); setHasNext(body.hasNext); setCompany(body.company); setCurrency(body.currency); setTimezone(body.timezone); setGeneratedAt(body.generatedAt); setShopfrontSync(body.shopfrontSync);
    } catch (cause) { if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Register closure history is unavailable."); }
    finally { if (revision === requestRevision.current) { setLoading(false); setLoadingMore(false); } }
  }, [dates.from, dates.to, exceptionsOnly]);
  useEffect(() => { void load(false); }, [load]);
  useEffect(() => () => { requestRevision.current++; }, []);
  const visible = rows;

  return <main className="h-full overflow-y-auto bg-[var(--oh-surface)] p-3 lg:p-5"><div className="mx-auto flex max-w-[1500px] flex-col gap-4">
    <header><p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Odoo · {company}</p><h1 className="oh-type-title mt-1">Register closure history</h1><p className="mt-1 text-sm text-[var(--oh-muted)]">Closed register sessions and cash reconciliation differences.</p></header>
    <section aria-label="Closure history filters" className="flex flex-wrap items-end gap-3 border-y border-[var(--oh-border)] py-3">
      <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">From<input type="date" value={draftDates.from} onChange={(event) => setDraftDates((value) => ({ ...value, from: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm" /></label>
      <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">To<input type="date" value={draftDates.to} onChange={(event) => setDraftDates((value) => ({ ...value, to: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm" /></label>
      <button type="button" onClick={() => setDates({ ...draftDates })} disabled={loading || !draftDates.from || !draftDates.to || draftDates.from > draftDates.to} className="min-h-11 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50">Apply</button>
      <button type="button" aria-pressed={exceptionsOnly} onClick={() => setExceptionsOnly((value) => !value)} className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${exceptionsOnly ? "border-amber-400 bg-amber-50 text-amber-950" : "border-[var(--oh-border)] bg-white text-[var(--oh-text)]"}`}><AlertTriangle size={15} className="mr-2 inline" />Differences only</button>
      <button type="button" onClick={() => void exportCsv()} aria-label="Export all matching closure rows to CSV" title="Export CSV" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white"><Download size={16} /></button>
      <button type="button" onClick={() => window.print()} aria-label="Print register closure history" title="Print" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white"><Printer size={16} /></button>
      <button type="button" onClick={() => void load(false)} disabled={loading} aria-label="Refresh closure history" title="Refresh" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white disabled:opacity-50">{loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}</button>
    </section>
    <p className="text-xs text-[var(--oh-muted)]">Store: {company} · Period: {dates.from} to {dates.to} · Source: closed Odoo register sessions · Shopfront coverage: {shopfrontSync ? `${shopfrontSync.status}, through ${shopfrontSync.toDay}, updated ${formatStoreEpoch(Date.parse(shopfrontSync.updatedAt), timezone)}` : "unavailable for this period"} · Report prepared {generatedAt ? formatStoreEpoch(Date.parse(generatedAt), timezone) : "—"}</p>
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    <div className="overflow-x-auto border-y border-[var(--oh-border)] bg-white"><table className="w-full min-w-[950px] border-collapse text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr><th className="px-3 py-3">Register</th><th className="px-3 py-3">Opened</th><th className="px-3 py-3">Closed</th><th className="px-3 py-3 text-right">Expected cash</th><th className="px-3 py-3 text-right">Received cash</th><th className="px-3 py-3 text-right">Difference</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{visible.map((row) => <tr key={row.id} className={row.difference !== null && Math.abs(row.difference) >= 0.005 ? "bg-amber-50/60" : ""}><th scope="row" className="px-3 py-3 font-medium">{row.register}</th><td className="px-3 py-3">{row.openedAt ? formatOdooDateTime(row.openedAt, timezone) : "—"}</td><td className="px-3 py-3">{row.closedAt ? formatOdooDateTime(row.closedAt, timezone) : "—"}</td><td className="px-3 py-3 text-right tabular-nums">{row.expected == null ? "—" : money.format(row.expected)}</td><td className="px-3 py-3 text-right tabular-nums">{row.received == null ? "—" : money.format(row.received)}</td><td className={`px-3 py-3 text-right font-semibold tabular-nums ${row.difference != null && Math.abs(row.difference) >= 0.005 ? "text-amber-900" : ""}`}>{row.difference == null ? "—" : money.format(row.difference)}</td></tr>)}{!loading && !visible.length && <tr><td colSpan={6} className="px-4 py-12 text-center text-[var(--oh-muted)]">{exceptionsOnly ? "No cash differences in the loaded sessions." : "No closed registers in this period."}</td></tr>}</tbody></table></div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--oh-border)] py-3 text-sm"><span role="status" aria-live="polite" className="text-[var(--oh-muted)]">Loaded {rows.length.toLocaleString("en-AU")} of {total.toLocaleString("en-AU")} {exceptionsOnly ? "cash differences" : "sessions"}</span>{hasNext && <button type="button" onClick={() => void load(true)} disabled={loadingMore} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 font-semibold disabled:opacity-50">{loadingMore ? <LoaderCircle size={15} className="animate-spin" /> : null}Load more</button>}</footer>
  </div></main>;
}
