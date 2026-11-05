"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, Eye, LoaderCircle, Printer, RefreshCw } from "lucide-react";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { formatStoreEpoch } from "@/lib/odoo-date";
import { salesDate, shiftDay } from "@/lib/replenishment-safety";
import { ReportColumnChooser } from "@/components/admin/ReportColumnChooser";
import { ReportDateControls } from "@/components/admin/ReportDateControls";
import { comparisonDateRange, type ReportComparison } from "@/lib/report-date-selection";
import { ReportSourceDetails } from "@/components/admin/ReportSourceDetails";

type Group = "supplier" | "status" | "day" | "month";
const REPORT_COLUMNS = [{ key: "label", label: "Group" }, { key: "count", label: "Orders" }, { key: "amount", label: "Amount" }] as const;
type PurchaseReport = { company: string; group: Group; from: string; to: string; generatedAt: string; source: string; currency: string; timezone: string; shopfrontSync: { fromDay: string; toDay: string; status: "completed" | "partial" | "failed"; updatedAt: string; revision: string } | null; orderCount: number; totalAmount: number; rows: Array<{ key: string; label: string; count: number; amount: number }> };
const money = (value: number, currency: string) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(value);

function initialDates() {
  const to = salesDate(new Date().toISOString(), "Australia/Adelaide");
  return { from: shiftDay(to, -29), to };
}

export function PurchaseReportPage() {
  const [draftDates, setDraftDates] = useState(initialDates);
  const [dates, setDates] = useState(() => draftDates);
  const [group, setGroup] = useState<Group>("supplier");
  const [selectedColumns, setSelectedColumns] = useState<string[]>(REPORT_COLUMNS.map((column) => column.key));
  const [comparison, setComparison] = useState<ReportComparison>("none");
  const [report, setReport] = useState<PurchaseReport | null>(null);
  const [comparisonReport, setComparisonReport] = useState<PurchaseReport | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [sourceDetails, setSourceDetails] = useState<{ key: string; title: string; amount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const requestRevision = useRef(0);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const from = params.get("from"); const to = params.get("to"); const selected = params.get("group");
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) { setDates({ from, to }); setDraftDates({ from, to }); }
    if (selected === "supplier" || selected === "status" || selected === "day" || selected === "month") setGroup(selected);
    const selectedComparison = params.get("compare"); const selectedColumnsParam = params.get("columns");
    if (selectedComparison === "none" || selectedComparison === "previous_period" || selectedComparison === "last_year") setComparison(selectedComparison);
    if (selectedColumnsParam) {
      const columns = selectedColumnsParam.split(",").filter((key) => REPORT_COLUMNS.some((column) => column.key === key));
      if (columns.length) setSelectedColumns(columns);
    }
    setUrlReady(true);
    const onPopState = () => {
      const next = new URLSearchParams(location.search); const nextFrom = next.get("from"); const nextTo = next.get("to"); const nextGroup = next.get("group");
      if (nextFrom && nextTo && /^\d{4}-\d{2}-\d{2}$/.test(nextFrom) && /^\d{4}-\d{2}-\d{2}$/.test(nextTo)) { setDates({ from: nextFrom, to: nextTo }); setDraftDates({ from: nextFrom, to: nextTo }); }
      if (nextGroup === "supplier" || nextGroup === "status" || nextGroup === "day" || nextGroup === "month") setGroup(nextGroup);
      const nextComparison = next.get("compare"); const nextColumns = next.get("columns");
      if (nextComparison === "none" || nextComparison === "previous_period" || nextComparison === "last_year") setComparison(nextComparison);
      if (nextColumns) {
        const columns = nextColumns.split(",").filter((key) => REPORT_COLUMNS.some((column) => column.key === key));
        if (columns.length) setSelectedColumns(columns);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams(location.search);
    params.set("from", dates.from); params.set("to", dates.to);
    params.set("group", group); params.set("compare", comparison);
    params.set("columns", selectedColumns.join(","));
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, [dates, group, comparison, selectedColumns, urlReady]);
  const load = useCallback(async () => {
    const revision = ++requestRevision.current;
    setLoading(true); setError(null);
    setReport(null);
    setComparisonReport(null);
    setComparisonError(null);
    try {
      const params = new URLSearchParams({ from: dates.from, to: dates.to, group });
      const response = await fetchOdooRoute(`/api/odoo/purchase-report?${params}`, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json() as PurchaseReport & { message?: string };
      if (!response.ok || !Array.isArray(body.rows)) throw new Error(body.message || "Purchase report is unavailable.");
      if (revision === requestRevision.current) setReport(body);
      if (comparison !== "none") {
        const range = comparisonDateRange(dates.from, dates.to, comparison);
        if (range) {
          try {
            const compareParams = new URLSearchParams({ from: range.from, to: range.to, group });
            const compareResponse = await fetchOdooRoute(`/api/odoo/purchase-report?${compareParams}`, { credentials: "same-origin", cache: "no-store" });
            const compareBody = await compareResponse.json() as PurchaseReport & { message?: string };
            if (!compareResponse.ok || !Array.isArray(compareBody.rows)) throw new Error(compareBody.message || "Comparison period is unavailable.");
            if (revision === requestRevision.current) setComparisonReport(compareBody);
          } catch (cause) {
            if (revision === requestRevision.current) setComparisonError(cause instanceof Error ? cause.message : "Comparison period is unavailable.");
          }
        }
      }
    } catch (cause) { if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Purchase report is unavailable."); }
    finally { if (revision === requestRevision.current) setLoading(false); }
  }, [dates, group, comparison]);
  useEffect(() => () => { requestRevision.current++; }, []);
  useEffect(() => { if (urlReady) void load(); }, [load, urlReady]);

  function updateUrl(next: { from?: string; to?: string; group?: Group; comparison?: ReportComparison; columns?: string[] } = {}) {
    const params = new URLSearchParams(location.search);
    params.set("from", next.from ?? dates.from); params.set("to", next.to ?? dates.to);
    params.set("group", next.group ?? group); params.set("compare", next.comparison ?? comparison);
    params.set("columns", (next.columns ?? selectedColumns).join(","));
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }

  function selectComparison(value: ReportComparison) { setComparison(value); updateUrl({ comparison: value }); }
  function toggleColumn(key: string) {
    const next = selectedColumns.includes(key) ? selectedColumns.filter((item) => item !== key) : [...selectedColumns, key];
    setSelectedColumns(next); updateUrl({ columns: next });
  }

  function exportCsv() {
    if (!report) return;
    const exportColumns = REPORT_COLUMNS.map((column) => column.key).filter((key) => selectedColumns.includes(key));
    const labels: Record<string, string> = { label: group === "supplier" ? "Supplier" : group === "status" ? "Status" : group === "day" ? "Date" : "Month", count: "Orders", amount: `Confirmed amount (${report.currency})` };
    const rows: string[][] = [exportColumns.map((column) => labels[column]), ...report.rows.map((row) => exportColumns.map((column) => column === "label" ? row.label : column === "count" ? String(row.count) : row.amount.toFixed(2)))];
    if (exportColumns.includes("label")) rows.push(exportColumns.map((column) => column === "label" ? "Total" : column === "count" ? String(report.orderCount) : report.totalAmount.toFixed(2)));
    const cell = (value: string) => { const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value; return `"${safe.replaceAll('"', '""')}"`; };
    const csv = rows.map((line) => line.map((value) => cell(value)).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `purchase-report-${dates.from}-${dates.to}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <main className="h-full overflow-y-auto bg-[var(--oh-surface)] p-3 lg:p-5">
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Odoo · {report?.company ?? "Store"}</p><h1 className="oh-type-title mt-1">Purchase report</h1><p className="mt-1 text-sm text-[var(--oh-muted)]">Confirmed purchase order value by supplier, status or date. This is a report; use Purchase Orders to receive stock.</p></div>
        <Link href="/purchases" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white">Open Purchase Orders</Link>
      </header>
      <section aria-label="Purchase report filters" className="print:hidden flex flex-wrap items-end gap-3 border-y border-[var(--oh-border)] py-3">
        <ReportDateControls value={draftDates} onChange={setDraftDates} comparison={comparison} onComparisonChange={selectComparison} timezone={report?.timezone} />
        <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">From<input type="date" value={draftDates.from} onChange={(event) => setDraftDates((value) => ({ ...value, from: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]" /></label>
        <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">To<input type="date" value={draftDates.to} onChange={(event) => setDraftDates((value) => ({ ...value, to: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]" /></label>
        <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">Group by<select value={group} onChange={(event) => { const value = event.target.value as Group; setGroup(value); updateUrl({ group: value }); }} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]"><option value="supplier">Supplier</option><option value="status">Status</option><option value="day">Date</option><option value="month">Month</option></select></label>
        <button type="button" onClick={() => setDates({ ...draftDates })} disabled={loading || !draftDates.from || !draftDates.to || draftDates.from > draftDates.to} className="min-h-11 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50">Apply</button>
        <button type="button" onClick={() => void load()} disabled={loading || !dates.from || !dates.to || dates.from > dates.to} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold disabled:opacity-50">{loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}Refresh</button>
        <button type="button" onClick={exportCsv} disabled={!report || loading} aria-label="Export purchase report CSV" title="Export CSV" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white disabled:opacity-50"><Download size={16} /></button>
        <button type="button" onClick={() => window.print()} aria-label="Print purchase report" title="Print" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white"><Printer size={16} /></button>
        <ReportColumnChooser columns={[...REPORT_COLUMNS]} selected={selectedColumns} onChange={toggleColumn} />
      </section>
      <p className="text-xs text-[var(--oh-muted)]">Company scope: {report?.company ?? "—"} · Period: {report?.from ?? dates.from} to {report?.to ?? dates.to} · Timezone: {report?.timezone ?? "—"} · Source: Odoo confirmed purchase orders · Shopfront archive sync (separate; excluded from Odoo totals): {report?.shopfrontSync ? `${report.shopfrontSync.status}, through ${report.shopfrontSync.toDay}, updated ${formatStoreEpoch(Date.parse(report.shopfrontSync.updatedAt), report.timezone)}` : "unknown (no sync coverage evidence)"} · Report prepared {report?.generatedAt ? formatStoreEpoch(Date.parse(report.generatedAt), report.timezone) : "—"}</p>
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      <section aria-label="Purchase totals" className="grid gap-3 sm:grid-cols-2"><div className="border-l-2 border-[var(--oh-primary)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">Confirmed purchase orders</p><p className="mt-1 text-xl font-semibold tabular-nums">{report?.orderCount.toLocaleString("en-AU") ?? "—"}</p></div><div className="border-l-2 border-[var(--oh-primary)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">Confirmed order amount</p><p className="mt-1 text-xl font-semibold tabular-nums">{report ? money(report.totalAmount, report.currency) : "—"}</p></div></section>
      {comparison !== "none" && <p className="border-l-2 border-[var(--oh-border)] px-3 py-2 text-sm text-[var(--oh-muted)]">{comparisonError ? `Comparison unavailable: ${comparisonError}` : comparisonReport ? `Compared with ${comparison === "previous_period" ? `${comparisonReport.from} to ${comparisonReport.to}` : `same period last year (${comparisonReport.from} to ${comparisonReport.to})`}: ${money(report!.totalAmount - comparisonReport.totalAmount, report!.currency)} amount change; ${report!.orderCount - comparisonReport.orderCount} order change.` : "Loading comparison…"}</p>}
      <div className="overflow-x-auto border-y border-[var(--oh-border)] bg-white"><table className="w-full min-w-[480px] border-collapse text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr>{selectedColumns.includes("label") && <th className="px-4 py-3">{group === "supplier" ? "Supplier" : group === "status" ? "Status" : group === "day" ? "Date" : "Month"}</th>}{selectedColumns.includes("count") && <th className="px-4 py-3 text-right">Orders</th>}{selectedColumns.includes("amount") && <th className="px-4 py-3 text-right">Amount</th>}</tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{report?.rows.map((row) => <tr key={row.key}>{selectedColumns.includes("label") && <th scope="row" className="px-4 py-3 font-medium"><button type="button" onClick={() => setSourceDetails({ key: row.key, title: row.label, amount: row.amount })} className="inline-flex min-h-8 items-center gap-1.5 text-left text-[var(--oh-primary)] hover:underline" title={`View source records for ${row.label}`}><Eye size={14} aria-hidden="true" />{row.label}</button></th>}{selectedColumns.includes("count") && <td className="px-4 py-3 text-right tabular-nums">{row.count.toLocaleString("en-AU")}</td>}{selectedColumns.includes("amount") && <td className="px-4 py-3 text-right tabular-nums">{money(row.amount, report.currency)}</td>}</tr>)}{!loading && !report?.rows.length && <tr><td colSpan={selectedColumns.length} className="px-4 py-10 text-center text-[var(--oh-muted)]">No confirmed purchases in this period.</td></tr>}</tbody><tfoot className="border-t-2 border-[var(--oh-border)] font-semibold"><tr>{selectedColumns.includes("label") && <th className="px-4 py-3">Total</th>}{selectedColumns.includes("count") && <td className="px-4 py-3 text-right tabular-nums">{report?.orderCount.toLocaleString("en-AU") ?? "—"}</td>}{selectedColumns.includes("amount") && <td className="px-4 py-3 text-right tabular-nums">{report ? money(report.totalAmount, report.currency) : "—"}</td>}</tr></tfoot></table></div>
      {sourceDetails && report && <ReportSourceDetails kind="purchases" title={sourceDetails.title} from={dates.from} to={dates.to} group={group} detailKey={sourceDetails.key} expectedAmount={sourceDetails.amount} currency={report.currency} timezone={report.timezone} onClose={() => setSourceDetails(null)} />}
    </div>
  </main>;
}
