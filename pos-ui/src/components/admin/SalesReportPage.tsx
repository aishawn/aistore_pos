"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Printer, RefreshCw } from "lucide-react";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { formatStoreEpoch } from "@/lib/odoo-date";
import { salesDate, shiftDay } from "@/lib/replenishment-safety";

type Group = "day" | "product" | "category";
type SalesReport = { company: string; currency: string; timezone: string; source: string; shopfrontSync: { fromDay: string; toDay: string; status: "completed" | "partial" | "failed"; updatedAt: string; revision: string } | null; from: string; to: string; generatedAt: string; group: Group; totalRows: number; totalAmount: number; totalCount: number; totalQuantity: number | null; offset: number; hasNext: boolean; rows: Array<{ label: string; count: number; quantity: number | null; amount: number }> };
function defaultDates() { const to = salesDate(new Date().toISOString(), "Australia/Adelaide"); return { from: shiftDay(to, -29), to }; }
function csvDownload(response: Response, name: string) { return response.blob().then((blob) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }); }

export function SalesReportPage() {
  const [draftDates, setDraftDates] = useState(defaultDates);
  const [dates, setDates] = useState(defaultDates);
  const [draftGroup, setDraftGroup] = useState<Group>("day");
  const [group, setGroup] = useState<Group>("day");
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const requestRevision = useRef(0);
  const load = useCallback(async (offset = 0) => {
    const revision = ++requestRevision.current;
    setLoading(offset === 0); setLoadingMore(offset > 0); setError(null);
    if (offset === 0) setReport(null);
    try {
      const params = new URLSearchParams({ from: dates.from, to: dates.to, group, offset: String(offset) });
      const response = await fetchOdooRoute(`/api/odoo/sales-report?${params}`, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json() as SalesReport & { message?: string };
      if (!response.ok || !Array.isArray(body.rows)) throw new Error(body.message || "Sales report is unavailable.");
      if (revision === requestRevision.current) setReport((current) => offset ? { ...body, rows: [...(current?.rows ?? []), ...body.rows] } : body);
    } catch (cause) { if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Sales report is unavailable."); }
    finally { if (revision === requestRevision.current) { setLoading(false); setLoadingMore(false); } }
  }, [dates.from, dates.to, group]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const from = params.get("from"); const to = params.get("to"); const selected = params.get("group");
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) { setDates({ from, to }); setDraftDates({ from, to }); }
    if (selected === "day" || selected === "product" || selected === "category") { setGroup(selected); setDraftGroup(selected); }
    setUrlReady(true);
    const onPopState = () => {
      const next = new URLSearchParams(location.search);
      const nextFrom = next.get("from"); const nextTo = next.get("to"); const nextGroup = next.get("group");
      if (nextFrom && nextTo && /^\d{4}-\d{2}-\d{2}$/.test(nextFrom) && /^\d{4}-\d{2}-\d{2}$/.test(nextTo)) { setDates({ from: nextFrom, to: nextTo }); setDraftDates({ from: nextFrom, to: nextTo }); }
      if (nextGroup === "day" || nextGroup === "product" || nextGroup === "category") { setGroup(nextGroup); setDraftGroup(nextGroup); }
    };
    window.addEventListener("popstate", onPopState);
    return () => { window.removeEventListener("popstate", onPopState); requestRevision.current++; };
  }, []);
  useEffect(() => { if (urlReady) void load(0); }, [load, urlReady]);
  const groupLabel = group === "day" ? "Date" : group === "product" ? "Product" : "Category";

  async function apply() {
    if (!draftDates.from || !draftDates.to || draftDates.from > draftDates.to) return;
    const params = new URLSearchParams({ from: draftDates.from, to: draftDates.to, group: draftGroup });
    history.replaceState(null, "", `${location.pathname}?${params}`);
    setDates({ ...draftDates }); setGroup(draftGroup);
  }
  async function exportAll() {
    if (!report) return;
    try {
      const params = new URLSearchParams({ from: report.from, to: report.to, group: report.group, export: "csv" });
      const response = await fetchOdooRoute(`/api/odoo/sales-report?${params}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) { const body = await response.json() as { message?: string }; throw new Error(body.message || "CSV export failed."); }
      await csvDownload(response, `sales-report-${report.from}-${report.to}.csv`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "CSV export failed."); }
  }

  return <main className="h-full overflow-y-auto bg-[var(--oh-surface)] p-3 lg:p-5"><div className="mx-auto flex max-w-[1400px] flex-col gap-4">
    <header><p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Odoo · {report?.company ?? "Store"}</p><h1 className="oh-type-title mt-1">Sales report</h1><p className="mt-1 text-sm text-[var(--oh-muted)]">Completed POS sales, excluding refunds. Select a grouping to inspect trends and product mix.</p></header>
    <section aria-label="Sales report filters" className="flex flex-wrap items-end gap-3 border-y border-[var(--oh-border)] py-3">
      <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">From<input type="date" value={draftDates.from} onChange={(event) => setDraftDates((value) => ({ ...value, from: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm" /></label>
      <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">To<input type="date" value={draftDates.to} onChange={(event) => setDraftDates((value) => ({ ...value, to: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm" /></label>
      <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">Group by<select value={draftGroup} onChange={(event) => setDraftGroup(event.target.value as Group)} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm"><option value="day">Date</option><option value="product">Product</option><option value="category">Category</option></select></label>
      <button type="button" onClick={() => void apply()} disabled={loading || !draftDates.from || !draftDates.to || draftDates.from > draftDates.to} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}Apply</button>
      <button type="button" onClick={() => void exportAll()} disabled={!report || loading} title="Export all matching groups" aria-label="Export all matching sales groups to CSV" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white disabled:opacity-50"><Download size={16} /></button>
      <button type="button" onClick={() => window.print()} title="Print report" aria-label="Print sales report" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white"><Printer size={16} /></button>
    </section>
    <p className="text-xs text-[var(--oh-muted)]">Store: {report?.company ?? "—"} · Period: {dates.from} to {dates.to} · Source: {report?.source ?? "Odoo completed POS sales"} · Shopfront coverage: {report?.shopfrontSync ? `${report.shopfrontSync.status}, through ${report.shopfrontSync.toDay}, updated ${formatStoreEpoch(Date.parse(report.shopfrontSync.updatedAt), report.timezone)}` : "unavailable for this period"} · Report prepared {report?.generatedAt ? formatStoreEpoch(Date.parse(report.generatedAt), report.timezone) : "—"}</p>
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    <section aria-label="Sales report totals" className="grid gap-3 sm:grid-cols-3"><div className="border-l-2 border-[var(--oh-primary)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">Gross sales · incl. tax</p><p className="mt-1 text-xl font-semibold tabular-nums">{report ? new Intl.NumberFormat("en-AU", { style: "currency", currency: report.currency }).format(report.totalAmount) : "—"}</p></div><div className="border-l-2 border-[var(--oh-primary)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">{group === "day" ? "Transactions" : "Sale lines"}</p><p className="mt-1 text-xl font-semibold tabular-nums">{report?.totalCount.toLocaleString("en-AU") ?? "—"}</p></div><div className="border-l-2 border-[var(--oh-primary)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">Items sold</p><p className="mt-1 text-xl font-semibold tabular-nums">{report?.totalQuantity?.toLocaleString("en-AU", { maximumFractionDigits: 2 }) ?? "—"}</p></div></section>
    <div className="overflow-x-auto border-y border-[var(--oh-border)] bg-white"><table className="w-full min-w-[620px] border-collapse text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr><th className="px-4 py-3">{groupLabel}</th><th className="px-4 py-3 text-right">{group === "day" ? "Transactions" : "Sale lines"}</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3 text-right">Gross sales</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{report?.rows.map((row) => <tr key={row.label}><th scope="row" className="px-4 py-3 font-medium">{row.label}</th><td className="px-4 py-3 text-right tabular-nums">{row.count.toLocaleString("en-AU")}</td><td className="px-4 py-3 text-right tabular-nums">{row.quantity?.toLocaleString("en-AU", { maximumFractionDigits: 2 }) ?? "—"}</td><td className="px-4 py-3 text-right tabular-nums">{new Intl.NumberFormat("en-AU", { style: "currency", currency: report.currency }).format(row.amount)}</td></tr>)}{!loading && !report?.rows.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-[var(--oh-muted)]">No completed sales in this period.</td></tr>}</tbody></table></div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--oh-border)] py-3 text-sm"><span role="status" aria-live="polite" className="text-[var(--oh-muted)]">Loaded {report?.rows.length.toLocaleString("en-AU") ?? 0} of {report?.totalRows.toLocaleString("en-AU") ?? 0} groups</span>{report?.hasNext && <button type="button" onClick={() => void load(report.rows.length)} disabled={loadingMore} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 font-semibold disabled:opacity-50">{loadingMore ? <LoaderCircle size={15} className="animate-spin" /> : null}Load more</button>}</footer>
  </div></main>;
}
