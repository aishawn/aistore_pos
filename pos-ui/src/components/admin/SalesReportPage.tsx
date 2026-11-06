"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, LoaderCircle, Printer, RefreshCw } from "lucide-react";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { formatStoreEpoch } from "@/lib/odoo-date";
import { salesDate, shiftDay } from "@/lib/replenishment-safety";
import { ReportColumnChooser } from "@/components/admin/ReportColumnChooser";
import { ReportDateControls } from "@/components/admin/ReportDateControls";
import { comparisonDateRange, type ReportComparison } from "@/lib/report-date-selection";
import { ReportSourceDetails } from "@/components/admin/ReportSourceDetails";
import { ShopfrontSalesSummary } from "@/components/ShopfrontSourceSections";

type Group = "day" | "product" | "category";
const REPORT_COLUMNS = [{ key: "label", label: "Group" }, { key: "count", label: "Transactions or lines" }, { key: "quantity", label: "Quantity" }, { key: "amount", label: "Grouped amount" }] as const;
type SalesReport = { company: string; currency: string; timezone: string; source: string; shopfrontSync: { fromDay: string; toDay: string; status: "completed" | "partial" | "failed"; updatedAt: string; revision: string } | null; from: string; to: string; generatedAt: string; group: Group; totalRows: number; totalAmount: number; orderGrossAmount: number; refundOrderTotal: number; refundAmount: number; refundOrderCount: number; netSalesAmount: number; reconciliationDifference: number; reconcilesToCent: boolean; orderCount: number; totalCount: number; totalQuantity: number | null; offset: number; hasNext: boolean; rows: Array<{ key: string; label: string; count: number; quantity: number | null; amount: number }> };
function defaultDates() { const to = salesDate(new Date().toISOString(), "Australia/Adelaide"); return { from: shiftDay(to, -29), to }; }
function csvDownload(response: Response, name: string) { return response.blob().then((blob) => { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }); }

export function SalesReportPage() {
  const [draftDates, setDraftDates] = useState(defaultDates);
  const [dates, setDates] = useState(defaultDates);
  const [draftGroup, setDraftGroup] = useState<Group>("day");
  const [group, setGroup] = useState<Group>("day");
  const [selectedColumns, setSelectedColumns] = useState<string[]>(REPORT_COLUMNS.map((column) => column.key));
  const [comparison, setComparison] = useState<ReportComparison>("none");
  const [report, setReport] = useState<SalesReport | null>(null);
  const [printRows, setPrintRows] = useState<SalesReport["rows"] | null>(null);
  const [comparisonReport, setComparisonReport] = useState<SalesReport | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [sourceDetails, setSourceDetails] = useState<{ key: string; title: string; amount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const requestRevision = useRef(0);
  const load = useCallback(async (offset = 0) => {
    const revision = ++requestRevision.current;
    setLoading(offset === 0); setLoadingMore(offset > 0); setError(null);
    if (offset === 0) { setReport(null); setComparisonReport(null); setComparisonError(null); }
    try {
      const params = new URLSearchParams({ from: dates.from, to: dates.to, group, offset: String(offset) });
      const response = await fetchOdooRoute(`/api/odoo/sales-report?${params}`, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json() as SalesReport & { message?: string };
      if (!response.ok || !Array.isArray(body.rows)) throw new Error(body.message || "Sales report is unavailable.");
      if (revision === requestRevision.current) setReport((current) => offset ? { ...body, rows: [...(current?.rows ?? []), ...body.rows] } : body);
      if (offset === 0 && comparison !== "none") {
        const range = comparisonDateRange(dates.from, dates.to, comparison);
        if (range) {
          try {
            const compareParams = new URLSearchParams({ from: range.from, to: range.to, group });
            const compareResponse = await fetchOdooRoute(`/api/odoo/sales-report?${compareParams}`, { credentials: "same-origin", cache: "no-store" });
            const compareBody = await compareResponse.json() as SalesReport & { message?: string };
            if (!compareResponse.ok || !Array.isArray(compareBody.rows)) throw new Error(compareBody.message || "Comparison period is unavailable.");
            if (revision === requestRevision.current) setComparisonReport(compareBody);
          } catch (cause) {
            if (revision === requestRevision.current) setComparisonError(cause instanceof Error ? cause.message : "Comparison period is unavailable.");
          }
        }
      }
    } catch (cause) { if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Sales report is unavailable."); }
    finally { if (revision === requestRevision.current) { setLoading(false); setLoadingMore(false); } }
  }, [dates.from, dates.to, group, comparison]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const from = params.get("from"); const to = params.get("to"); const selected = params.get("group");
    const selectedComparison = params.get("compare"); const selectedColumnsParam = params.get("columns");
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) { setDates({ from, to }); setDraftDates({ from, to }); }
    if (selected === "day" || selected === "product" || selected === "category") { setGroup(selected); setDraftGroup(selected); }
    if (selectedComparison === "none" || selectedComparison === "previous_period" || selectedComparison === "last_year") setComparison(selectedComparison);
    if (selectedColumnsParam) {
      const columns = selectedColumnsParam.split(",").filter((key) => REPORT_COLUMNS.some((column) => column.key === key));
      if (columns.length) setSelectedColumns(columns);
    }
    setUrlReady(true);
    const onPopState = () => {
      const next = new URLSearchParams(location.search);
      const nextFrom = next.get("from"); const nextTo = next.get("to"); const nextGroup = next.get("group");
      const nextComparison = next.get("compare"); const nextColumns = next.get("columns");
      if (nextFrom && nextTo && /^\d{4}-\d{2}-\d{2}$/.test(nextFrom) && /^\d{4}-\d{2}-\d{2}$/.test(nextTo)) { setDates({ from: nextFrom, to: nextTo }); setDraftDates({ from: nextFrom, to: nextTo }); }
      if (nextGroup === "day" || nextGroup === "product" || nextGroup === "category") { setGroup(nextGroup); setDraftGroup(nextGroup); }
      if (nextComparison === "none" || nextComparison === "previous_period" || nextComparison === "last_year") setComparison(nextComparison);
      if (nextColumns) {
        const columns = nextColumns.split(",").filter((key) => REPORT_COLUMNS.some((column) => column.key === key));
        if (columns.length) setSelectedColumns(columns);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => { window.removeEventListener("popstate", onPopState); requestRevision.current++; };
  }, []);
  useEffect(() => { if (urlReady) void load(0); }, [load, urlReady]);
  const groupLabel = group === "day" ? "Date" : group === "product" ? "Product" : "Category";

  function updateUrl(next: { from?: string; to?: string; group?: Group; comparison?: ReportComparison; columns?: string[] }) {
    const params = new URLSearchParams(location.search);
    params.set("from", next.from ?? dates.from); params.set("to", next.to ?? dates.to);
    params.set("group", next.group ?? group); params.set("compare", next.comparison ?? comparison);
    params.set("columns", (next.columns ?? selectedColumns).join(","));
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }

  async function apply() {
    if (!draftDates.from || !draftDates.to || draftDates.from > draftDates.to) return;
    updateUrl({ from: draftDates.from, to: draftDates.to, group: draftGroup });
    setDates({ ...draftDates }); setGroup(draftGroup);
  }
  function selectComparison(value: ReportComparison) { setComparison(value); updateUrl({ comparison: value }); }
  function toggleColumn(key: string) {
    const next = selectedColumns.includes(key) ? selectedColumns.filter((item) => item !== key) : [...selectedColumns, key];
    setSelectedColumns(next); updateUrl({ columns: next });
  }
  async function exportAll() {
    if (!report) return;
    try {
      const params = new URLSearchParams({ from: report.from, to: report.to, group: report.group, export: "csv" });
      params.set("columns", REPORT_COLUMNS.map((column) => column.key).filter((key) => selectedColumns.includes(key)).join(","));
      const response = await fetchOdooRoute(`/api/odoo/sales-report?${params}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) { const body = await response.json() as { message?: string }; throw new Error(body.message || "CSV export failed."); }
      await csvDownload(response, `sales-report-${report.from}-${report.to}.csv`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "CSV export failed."); }
  }
  async function printAll() {
    if (!report || loading) return;
    try {
      const params = new URLSearchParams({ from: report.from, to: report.to, group: report.group, export: "print" });
      const response = await fetchOdooRoute(`/api/odoo/sales-report?${params}`, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json() as SalesReport & { message?: string };
      if (!response.ok || !Array.isArray(body.rows)) throw new Error(body.message || "Could not prepare all report rows for printing.");
      window.addEventListener("afterprint", () => setPrintRows(null), { once: true });
      setPrintRows(body.rows);
      window.setTimeout(() => window.print(), 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare the report for printing."); }
  }

  return <main className="h-full overflow-y-auto bg-[var(--oh-surface)] p-3 lg:p-5"><div className="mx-auto flex max-w-[1400px] flex-col gap-4">
    <header><p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Odoo · {report?.company ?? "Store"}</p><h1 className="oh-type-title mt-1">Sales report</h1><p className="mt-1 text-sm text-[var(--oh-muted)]">Completed POS orders with positive order totals. Product and category amounts are grouped from sale lines; mixed-order returns may remain included.</p></header>
    <section aria-label="Sales report filters" className="print:hidden flex flex-wrap items-end gap-3 border-y border-[var(--oh-border)] py-3">
      <ReportDateControls value={draftDates} onChange={setDraftDates} comparison={comparison} onComparisonChange={selectComparison} timezone={report?.timezone} />
      <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">From<input type="date" value={draftDates.from} onChange={(event) => setDraftDates((value) => ({ ...value, from: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm" /></label>
      <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">To<input type="date" value={draftDates.to} onChange={(event) => setDraftDates((value) => ({ ...value, to: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm" /></label>
      <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">Group by<select value={draftGroup} onChange={(event) => setDraftGroup(event.target.value as Group)} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm"><option value="day">Date</option><option value="product">Product</option><option value="category">Category</option></select></label>
      <button type="button" onClick={() => void apply()} disabled={loading || !draftDates.from || !draftDates.to || draftDates.from > draftDates.to} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}Apply</button>
      <button type="button" onClick={() => void exportAll()} disabled={!report || loading} title="Export all matching groups" aria-label="Export all matching sales groups to CSV" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white disabled:opacity-50"><Download size={16} /></button>
      <button type="button" onClick={() => void printAll()} disabled={!report || loading} title="Print all matching groups" aria-label="Print all matching sales groups" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white disabled:opacity-50"><Printer size={16} /></button>
      <ReportColumnChooser columns={[...REPORT_COLUMNS]} selected={selectedColumns} onChange={toggleColumn} />
    </section>
    <p className="text-xs text-[var(--oh-muted)]">Company scope: {report?.company ?? "—"} · Period: {dates.from} to {dates.to} · Timezone: {report?.timezone ?? "—"} · Source: {report?.source ?? "Odoo completed POS sales"} · Shopfront archive sync (separate; excluded from Odoo totals): {report?.shopfrontSync ? `${report.shopfrontSync.status}, through ${report.shopfrontSync.toDay}, updated ${formatStoreEpoch(Date.parse(report.shopfrontSync.updatedAt), report.timezone)}` : "unknown (no sync coverage evidence)"} · Report prepared {report?.generatedAt ? formatStoreEpoch(Date.parse(report.generatedAt), report.timezone) : "—"}</p>
    {report?.shopfrontSync && <ShopfrontSalesSummary from={dates.from} to={dates.to} />}
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    <section aria-label="Sales report totals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div className="border-l-2 border-[var(--oh-primary)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">{group === "day" ? "Positive-order amount · incl. tax" : "Grouped line amount · incl. tax"}</p><p className="mt-1 text-xl font-semibold tabular-nums">{report ? new Intl.NumberFormat("en-AU", { style: "currency", currency: report.currency }).format(report.totalAmount) : "—"}</p></div>
      <div className="border-l-2 border-[var(--oh-border)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">Negative-total refund orders</p><p className="mt-1 text-xl font-semibold tabular-nums">{report ? new Intl.NumberFormat("en-AU", { style: "currency", currency: report.currency }).format(report.refundAmount) : "—"}</p><p className="text-xs text-[var(--oh-muted)]">{report?.refundOrderCount.toLocaleString("en-AU") ?? "—"} orders</p></div>
      <div className="border-l-2 border-[var(--oh-primary)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">Net sales after refund orders</p><p className="mt-1 text-xl font-semibold tabular-nums">{report ? new Intl.NumberFormat("en-AU", { style: "currency", currency: report.currency }).format(report.netSalesAmount) : "—"}</p><p className="text-xs text-[var(--oh-muted)]">Same order scope as Overview</p></div>
      <div className="border-l-2 border-[var(--oh-border)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">Positive-total POS orders</p><p className="mt-1 text-xl font-semibold tabular-nums">{report?.orderCount.toLocaleString("en-AU") ?? "—"}</p></div>
      <div className="border-l-2 border-[var(--oh-border)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">{group === "day" ? "Transactions" : "Sale lines"}</p><p className="mt-1 text-xl font-semibold tabular-nums">{report?.totalCount.toLocaleString("en-AU") ?? "—"}</p></div>
      <div className="border-l-2 border-[var(--oh-border)] bg-white px-4 py-3"><p className="text-sm text-[var(--oh-muted)]">Items sold</p><p className="mt-1 text-xl font-semibold tabular-nums">{report?.totalQuantity?.toLocaleString("en-AU", { maximumFractionDigits: 2 }) ?? "—"}</p></div>
    </section>
    {comparison !== "none" && <p className="border-l-2 border-[var(--oh-border)] px-3 py-2 text-sm text-[var(--oh-muted)]">{comparisonError ? `Comparison unavailable: ${comparisonError}` : comparisonReport ? `Compared with ${comparison === "previous_period" ? `${comparisonReport.from} to ${comparisonReport.to}` : `same period last year (${comparisonReport.from} to ${comparisonReport.to})`}: ${new Intl.NumberFormat("en-AU", { style: "currency", currency: report?.currency ?? "AUD" }).format(report!.netSalesAmount - comparisonReport.netSalesAmount)} net sales change after negative-total refund orders; ${report!.orderCount - comparisonReport.orderCount} positive-total orders change.` : "Loading comparison…"}</p>}
    {report && <p role="status" className={`text-sm ${report.reconcilesToCent ? "text-emerald-800" : "text-amber-900"}`}>{report.reconcilesToCent ? group === "day" ? "Date groups reconcile to the order total." : "Grouped line amount reconciles to the order total." : `Grouped amount minus order gross: ${new Intl.NumberFormat("en-AU", { style: "currency", currency: report.currency }).format(report.reconciliationDifference)} (grouped amount ${new Intl.NumberFormat("en-AU", { style: "currency", currency: report.currency }).format(report.totalAmount)}; order amount ${new Intl.NumberFormat("en-AU", { style: "currency", currency: report.currency }).format(report.orderGrossAmount)}).`}</p>}
    <div className="overflow-x-auto border-y border-[var(--oh-border)] bg-white">
      <table className="w-full min-w-[620px] border-collapse text-left text-sm">
        <thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]">
          <tr>
            {selectedColumns.includes("label") && <th className="px-4 py-3">{groupLabel}</th>}
            {selectedColumns.includes("count") && <th className="px-4 py-3 text-right">{group === "day" ? "Transactions" : "Sale lines"}</th>}
            {selectedColumns.includes("quantity") && <th className="px-4 py-3 text-right">Quantity</th>}
            {selectedColumns.includes("amount") && <th className="px-4 py-3 text-right">Grouped amount</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--oh-border)]">
          {(printRows ?? report?.rows ?? []).map((row) => (
            <tr key={row.label}>
              {selectedColumns.includes("label") && <th scope="row" className="px-4 py-3 font-medium">{printRows ? row.label : <button type="button" onClick={() => setSourceDetails({ key: row.key, title: row.label, amount: row.amount })} className="inline-flex min-h-8 items-center gap-1.5 text-left text-[var(--oh-primary)] hover:underline" title={`View source records for ${row.label}`}><Eye size={14} aria-hidden="true" />{row.label}</button>}</th>}
              {selectedColumns.includes("count") && <td className="px-4 py-3 text-right tabular-nums">{row.count.toLocaleString("en-AU")}</td>}
              {selectedColumns.includes("quantity") && <td className="px-4 py-3 text-right tabular-nums">{row.quantity?.toLocaleString("en-AU", { maximumFractionDigits: 2 }) ?? "—"}</td>}
              {selectedColumns.includes("amount") && <td className="px-4 py-3 text-right tabular-nums">{new Intl.NumberFormat("en-AU", { style: "currency", currency: report?.currency ?? "AUD" }).format(row.amount)}</td>}
            </tr>
          ))}
          {!loading && !report?.rows.length && <tr><td colSpan={Math.max(selectedColumns.length, 1)} className="px-4 py-10 text-center text-[var(--oh-muted)]">No completed sales in this period.</td></tr>}
        </tbody>
      </table>
    </div>
    <footer className="print:hidden flex flex-wrap items-center justify-between gap-3 border-t border-[var(--oh-border)] py-3 text-sm"><span role="status" aria-live="polite" className="text-[var(--oh-muted)]">Loaded {report?.rows.length.toLocaleString("en-AU") ?? 0} of {report?.totalRows.toLocaleString("en-AU") ?? 0} groups</span>{report?.hasNext && <button type="button" onClick={() => void load(report.rows.length)} disabled={loadingMore} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 font-semibold disabled:opacity-50">{loadingMore ? <LoaderCircle size={15} className="animate-spin" /> : null}Load more</button>}</footer>
    {sourceDetails && report && <ReportSourceDetails kind={group === "day" ? "sales-orders" : "sales-lines"} title={sourceDetails.title} from={dates.from} to={dates.to} group={group} detailKey={sourceDetails.key} expectedAmount={sourceDetails.amount} currency={report.currency} timezone={report.timezone} onClose={() => setSourceDetails(null)} />}
  </div></main>;
}
