"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, LoaderCircle, Printer, RefreshCw } from "lucide-react";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { formatStoreEpoch } from "@/lib/odoo-date";
import { salesDate, shiftDay } from "@/lib/replenishment-safety";

type Group = "supplier" | "status" | "month";
type PurchaseReport = { company: string; group: Group; from: string; to: string; generatedAt: string; source: string; currency: string; timezone: string; shopfrontSync: { fromDay: string; toDay: string; status: "completed" | "partial" | "failed"; updatedAt: string; revision: string } | null; orderCount: number; totalAmount: number; rows: Array<{ label: string; count: number; amount: number }> };
const money = (value: number, currency: string) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(value);

function initialDates() {
  const to = salesDate(new Date().toISOString(), "Australia/Adelaide");
  return { from: shiftDay(to, -29), to };
}

export function PurchaseReportPage() {
  const [draftDates, setDraftDates] = useState(initialDates);
  const [dates, setDates] = useState(() => draftDates);
  const [group, setGroup] = useState<Group>("supplier");
  const [report, setReport] = useState<PurchaseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRevision = useRef(0);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const from = params.get("from"); const to = params.get("to"); const selected = params.get("group");
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) { setDates({ from, to }); setDraftDates({ from, to }); }
    if (selected === "supplier" || selected === "status" || selected === "month") setGroup(selected);
    const onPopState = () => {
      const next = new URLSearchParams(location.search); const nextFrom = next.get("from"); const nextTo = next.get("to"); const nextGroup = next.get("group");
      if (nextFrom && nextTo && /^\d{4}-\d{2}-\d{2}$/.test(nextFrom) && /^\d{4}-\d{2}-\d{2}$/.test(nextTo)) { setDates({ from: nextFrom, to: nextTo }); setDraftDates({ from: nextFrom, to: nextTo }); }
      if (nextGroup === "supplier" || nextGroup === "status" || nextGroup === "month") setGroup(nextGroup);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams({ from: dates.from, to: dates.to, group });
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, [dates, group]);
  const load = useCallback(async () => {
    const revision = ++requestRevision.current;
    setLoading(true); setError(null);
    setReport(null);
    try {
      const params = new URLSearchParams({ from: dates.from, to: dates.to, group });
      const response = await fetchOdooRoute(`/api/odoo/purchase-report?${params}`, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json() as PurchaseReport & { message?: string };
      if (!response.ok || !Array.isArray(body.rows)) throw new Error(body.message || "Purchase report is unavailable.");
      if (revision === requestRevision.current) setReport(body);
    } catch (cause) { if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Purchase report is unavailable."); }
    finally { if (revision === requestRevision.current) setLoading(false); }
  }, [dates, group]);
  useEffect(() => () => { requestRevision.current++; }, []);
  useEffect(() => { void load(); }, [load]);

  function exportCsv() {
    if (!report) return;
    const lines = [["Group", "Purchase orders", `Confirmed amount (${report.currency})`], ...report.rows.map((row) => [row.label, String(row.count), row.amount.toFixed(2)])];
    const cell = (value: string) => { const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value; return `"${safe.replaceAll('"', '""')}"`; };
    const csv = lines.map((line) => line.map((value) => cell(value)).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `purchase-report-${dates.from}-${dates.to}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <main className="h-full overflow-y-auto bg-[var(--oh-surface)] p-3 lg:p-5">
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Odoo · {report?.company ?? "Store"}</p><h1 className="oh-type-title mt-1">Purchasing report</h1><p className="mt-1 text-sm text-[var(--oh-muted)]">Confirmed purchase orders by supplier, status or month.</p></div>
        <Link href="/purchases" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white">Open Purchase Orders</Link>
      </header>
      <section aria-label="Purchase report filters" className="flex flex-wrap items-end gap-3 border-y border-[var(--oh-border)] py-3">
        <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">From<input type="date" value={draftDates.from} onChange={(event) => setDraftDates((value) => ({ ...value, from: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]" /></label>
        <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">To<input type="date" value={draftDates.to} onChange={(event) => setDraftDates((value) => ({ ...value, to: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]" /></label>
        <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">Group by<select value={group} onChange={(event) => setGroup(event.target.value as Group)} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]"><option value="supplier">Supplier</option><option value="status">Status</option><option value="month">Month</option></select></label>
        <button type="button" onClick={() => setDates({ ...draftDates })} disabled={loading || !draftDates.from || !draftDates.to || draftDates.from > draftDates.to} className="min-h-11 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50">Apply</button>
        <button type="button" onClick={() => void load()} disabled={loading || !dates.from || !dates.to || dates.from > dates.to} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold disabled:opacity-50">{loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}Refresh</button>
        <button type="button" onClick={exportCsv} disabled={!report || loading} aria-label="Export purchase report CSV" title="Export CSV" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white disabled:opacity-50"><Download size={16} /></button>
        <button type="button" onClick={() => window.print()} aria-label="Print purchase report" title="Print" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white"><Printer size={16} /></button>
      </section>
      <p className="text-xs text-[var(--oh-muted)]">Store: {report?.company ?? "—"} · Date: {report?.from ?? dates.from} to {report?.to ?? dates.to} · Source: Odoo confirmed purchase orders · Shopfront coverage: {report?.shopfrontSync ? `${report.shopfrontSync.status}, through ${report.shopfrontSync.toDay}, updated ${formatStoreEpoch(Date.parse(report.shopfrontSync.updatedAt), report.timezone)}` : "unavailable for this period"} · Report prepared {report?.generatedAt ? formatStoreEpoch(Date.parse(report.generatedAt), report.timezone) : "—"}</p>
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      <section aria-label="Purchase totals" className="grid gap-3 sm:grid-cols-2"><div className="border-l-2 border-[var(--oh-primary)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">Confirmed purchase orders</p><p className="mt-1 text-xl font-semibold tabular-nums">{report?.orderCount.toLocaleString("en-AU") ?? "—"}</p></div><div className="border-l-2 border-[var(--oh-primary)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">Confirmed order amount</p><p className="mt-1 text-xl font-semibold tabular-nums">{report ? money(report.totalAmount, report.currency) : "—"}</p></div></section>
      <div className="overflow-x-auto border-y border-[var(--oh-border)] bg-white"><table className="w-full min-w-[480px] border-collapse text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr><th className="px-4 py-3">{group === "supplier" ? "Supplier" : group === "status" ? "Status" : "Month"}</th><th className="px-4 py-3 text-right">Orders</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{report?.rows.map((row) => <tr key={row.label}><th scope="row" className="px-4 py-3 font-medium">{row.label}</th><td className="px-4 py-3 text-right tabular-nums">{row.count.toLocaleString("en-AU")}</td><td className="px-4 py-3 text-right tabular-nums">{money(row.amount, report.currency)}</td></tr>)}{!loading && !report?.rows.length && <tr><td colSpan={3} className="px-4 py-10 text-center text-[var(--oh-muted)]">No confirmed purchases in this period.</td></tr>}</tbody><tfoot className="border-t-2 border-[var(--oh-border)] font-semibold"><tr><th className="px-4 py-3">Total</th><td className="px-4 py-3 text-right tabular-nums">{report?.orderCount.toLocaleString("en-AU") ?? "—"}</td><td className="px-4 py-3 text-right tabular-nums">{report ? money(report.totalAmount, report.currency) : "—"}</td></tr></tfoot></table></div>
    </div>
  </main>;
}
