"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, LoaderCircle, Printer, RefreshCw } from "lucide-react";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { formatOdooDateTime, formatStoreEpoch } from "@/lib/odoo-date";
import { salesDate, shiftDay } from "@/lib/replenishment-safety";
import { ReportColumnChooser } from "@/components/admin/ReportColumnChooser";
import { ReportDateControls } from "@/components/admin/ReportDateControls";
import { comparisonDateRange, type ReportComparison } from "@/lib/report-date-selection";
import { summarizeRegisterClosures } from "@/lib/register-closure-summary";

type Closure = { id: number; register: string; name: string; openedAt: string | false | null; closedAt: string | false | null; expected: number | null; received: number | null; difference: number | null };
const REPORT_COLUMNS = [{ key: "register", label: "Register" }, { key: "opened", label: "Opened" }, { key: "closed", label: "Closed" }, { key: "expected", label: "Expected cash" }, { key: "received", label: "Received cash" }, { key: "difference", label: "Received less expected" }] as const;
type Page = { company: string; currency: string; timezone: string; source: string; from: string; to: string; generatedAt: string; total: number; offset: number; hasNext: boolean; items: Closure[] };
type ClosureSummary = ReturnType<typeof summarizeRegisterClosures>;
const STORE_TIMEZONE = "Australia/Adelaide";

function initialDates() {
  const to = salesDate(new Date().toISOString(), STORE_TIMEZONE);
  return { from: shiftDay(to, -29), to };
}

export function RegisterClosureHistoryPage() {
  const [draftDates, setDraftDates] = useState(initialDates);
  const [dates, setDates] = useState(() => draftDates);
  const [rows, setRows] = useState<Closure[]>([]);
  const [printRows, setPrintRows] = useState<Closure[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [comparison, setComparison] = useState<ReportComparison>("none");
  const [comparisonSummary, setComparisonSummary] = useState<ClosureSummary | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(REPORT_COLUMNS.map((column) => column.key));
  const [company, setCompany] = useState("Store");
  const [currency, setCurrency] = useState("AUD");
  const [timezone, setTimezone] = useState(STORE_TIMEZONE);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const loadedCount = useRef(0);
  const requestRevision = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search); const from = params.get("from"); const to = params.get("to"); const selectedColumns = params.get("columns");
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) { setDates({ from, to }); setDraftDates({ from, to }); }
    const selectedComparison = params.get("compare");
    if (selectedComparison === "none" || selectedComparison === "previous_period" || selectedComparison === "last_year") setComparison(selectedComparison);
    if (selectedColumns) {
      const columns = selectedColumns.split(",").filter((key) => REPORT_COLUMNS.some((column) => column.key === key));
      if (columns.length) setSelectedColumns(columns);
    }
    setExceptionsOnly(params.get("exceptions") === "true");
    setUrlReady(true);
    const onPopState = () => {
      const next = new URLSearchParams(location.search); const nextFrom = next.get("from"); const nextTo = next.get("to"); const nextColumns = next.get("columns");
      if (nextFrom && nextTo && /^\d{4}-\d{2}-\d{2}$/.test(nextFrom) && /^\d{4}-\d{2}-\d{2}$/.test(nextTo)) { setDates({ from: nextFrom, to: nextTo }); setDraftDates({ from: nextFrom, to: nextTo }); }
      if (nextColumns) {
        const columns = nextColumns.split(",").filter((key) => REPORT_COLUMNS.some((column) => column.key === key));
        if (columns.length) setSelectedColumns(columns);
      }
      setExceptionsOnly(next.get("exceptions") === "true");
      const nextComparison = next.get("compare");
      if (nextComparison === "none" || nextComparison === "previous_period" || nextComparison === "last_year") setComparison(nextComparison);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams({ from: dates.from, to: dates.to });
    if (exceptionsOnly) params.set("exceptions", "true");
    params.set("compare", comparison);
    params.set("columns", selectedColumns.join(","));
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, [dates, exceptionsOnly, comparison, selectedColumns, urlReady]);
  const money = useMemo(() => {
    try { return new Intl.NumberFormat("en-AU", { style: "currency", currency }); }
    catch { return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }); }
  }, [currency]);
  async function exportCsv() {
    try {
      const params = new URLSearchParams({ from: dates.from, to: dates.to, export: "csv" });
      params.set("columns", REPORT_COLUMNS.map((column) => column.key).filter((key) => selectedColumns.includes(key)).join(","));
      if (exceptionsOnly) params.set("exceptions", "true");
      const response = await fetchOdooRoute(`/api/odoo/register-closures?${params}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) { const body = await response.json() as { message?: string }; throw new Error(body.message || "CSV export failed."); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `register-closures-${dates.from}-${dates.to}.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "CSV export failed."); }
  }
  async function printAll() {
    try {
      const params = new URLSearchParams({ from: dates.from, to: dates.to, export: "print" });
      params.set("columns", REPORT_COLUMNS.map((column) => column.key).filter((key) => selectedColumns.includes(key)).join(","));
      if (exceptionsOnly) params.set("exceptions", "true");
      const response = await fetchOdooRoute(`/api/odoo/register-closures?${params}`, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json() as Page & { message?: string };
      if (!response.ok || !Array.isArray(body.items)) throw new Error(body.message || "Could not prepare all sessions for printing.");
      window.addEventListener("afterprint", () => setPrintRows(null), { once: true });
      setPrintRows(body.items);
      window.setTimeout(() => window.print(), 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare the report for printing."); }
  }
  const load = useCallback(async (append = false) => {
    const revision = ++requestRevision.current;
    const offset = append ? loadedCount.current : 0;
    setLoading(!append); setLoadingMore(append); setError(null);
    if (!append) { setComparisonSummary(null); setComparisonError(null); }
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
      setTotal(body.total); setHasNext(body.hasNext); setCompany(body.company); setCurrency(body.currency); setTimezone(body.timezone); setGeneratedAt(body.generatedAt);
      if (!append && comparison !== "none") {
        const range = comparisonDateRange(dates.from, dates.to, comparison);
        if (range) {
          try {
            const compareParams = new URLSearchParams({ from: range.from, to: range.to, export: "summary" });
            if (exceptionsOnly) compareParams.set("exceptions", "true");
            const compareResponse = await fetchOdooRoute(`/api/odoo/register-closures?${compareParams}`, { credentials: "same-origin", cache: "no-store" });
            const compareBody = await compareResponse.json() as { summary?: ClosureSummary; message?: string };
            if (!compareResponse.ok || !compareBody.summary) throw new Error(compareBody.message || "Comparison period is unavailable.");
            if (revision === requestRevision.current) setComparisonSummary(compareBody.summary);
          } catch (cause) {
            if (revision === requestRevision.current) setComparisonError(cause instanceof Error ? cause.message : "Comparison period is unavailable.");
          }
        }
      }
    } catch (cause) { if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Register closure history is unavailable."); }
    finally { if (revision === requestRevision.current) { setLoading(false); setLoadingMore(false); } }
  }, [dates.from, dates.to, exceptionsOnly, comparison]);
  useEffect(() => { void load(false); }, [load]);
  useEffect(() => () => { requestRevision.current++; }, []);
  const visible = printRows ?? rows;
  function toggleColumn(key: string) {
    setSelectedColumns((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      return next.length ? next : current;
    });
  }

  return <main className="h-full overflow-y-auto bg-[var(--oh-surface)] p-3 lg:p-5"><div className="mx-auto flex max-w-[1500px] flex-col gap-4">
    <header><p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Odoo · {company}</p><h1 className="oh-type-title mt-1">Register closure history</h1><p className="mt-1 text-sm text-[var(--oh-muted)]">Closed register sessions. Difference = received cash less expected cash.</p></header>
    <section aria-label="Closure history filters" className="print:hidden flex flex-wrap items-end gap-3 border-y border-[var(--oh-border)] py-3">
      <ReportDateControls value={draftDates} onChange={setDraftDates} comparison={comparison} onComparisonChange={setComparison} timezone={timezone} />
      <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">From<input type="date" value={draftDates.from} onChange={(event) => setDraftDates((value) => ({ ...value, from: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm" /></label>
      <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">To<input type="date" value={draftDates.to} onChange={(event) => setDraftDates((value) => ({ ...value, to: event.target.value }))} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm" /></label>
      <button type="button" onClick={() => setDates({ ...draftDates })} disabled={loading || !draftDates.from || !draftDates.to || draftDates.from > draftDates.to} className="min-h-11 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50">Apply</button>
      <button type="button" aria-pressed={exceptionsOnly} onClick={() => setExceptionsOnly((value) => !value)} className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${exceptionsOnly ? "border-amber-400 bg-amber-50 text-amber-950" : "border-[var(--oh-border)] bg-white text-[var(--oh-text)]"}`}><AlertTriangle size={15} className="mr-2 inline" />Differences only</button>
      <button type="button" onClick={() => void exportCsv()} aria-label="Export all matching closure rows to CSV" title="Export CSV" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white"><Download size={16} /></button>
      <button type="button" onClick={() => void printAll()} aria-label="Print all matching register closure rows" title="Print all matching rows" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white"><Printer size={16} /></button>
      <button type="button" onClick={() => void load(false)} disabled={loading} aria-label="Refresh closure history" title="Refresh" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white disabled:opacity-50">{loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}</button>
      <ReportColumnChooser columns={[...REPORT_COLUMNS]} selected={selectedColumns} onChange={toggleColumn} />
    </section>
    <p className="text-xs text-[var(--oh-muted)]">Company scope: {company} · Period: {dates.from} to {dates.to} · Timezone: {timezone} · Source: closed Odoo register sessions · Shopfront archive: separate source, not included in this Odoo report · Report prepared {generatedAt ? formatStoreEpoch(Date.parse(generatedAt), timezone) : "—"}</p>
    {comparison !== "none" && <p role="status" className="border-l-2 border-[var(--oh-border)] px-3 py-2 text-sm text-[var(--oh-muted)]">{comparisonError ? `Comparison unavailable: ${comparisonError}` : comparisonSummary ? `Compared ${comparison === "previous_period" ? "the previous period" : "the same period last year"}: ${comparisonSummary.sessionCount} ${exceptionsOnly ? "cash differences" : "sessions"}; ${money.format(comparisonSummary.cashDifference)} cash difference from ${comparisonSummary.comparableSessionCount} comparable sessions; ${comparisonSummary.missingCashCount} sessions have incomplete cash values.` : "Loading comparison…"}</p>}
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    <div className="overflow-x-auto border-y border-[var(--oh-border)] bg-white">
      <table aria-label="Register closure history" className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr>
          {selectedColumns.includes("register") && <th scope="col" className="px-4 py-3">Register</th>}
          {selectedColumns.includes("opened") && <th scope="col" className="px-4 py-3">Opened</th>}
          {selectedColumns.includes("closed") && <th scope="col" className="px-4 py-3">Closed</th>}
          {selectedColumns.includes("expected") && <th scope="col" className="px-4 py-3 text-right">Expected cash</th>}
          {selectedColumns.includes("received") && <th scope="col" className="px-4 py-3 text-right">Received cash</th>}
          {selectedColumns.includes("difference") && <th scope="col" className="px-4 py-3 text-right">Received less expected</th>}
        </tr></thead>
        <tbody className="divide-y divide-[var(--oh-border)]">
          {visible.map((row) => <tr key={row.id}>
            {selectedColumns.includes("register") && <th scope="row" className="px-4 py-3 font-medium">{row.register}<span className="ml-2 text-xs font-normal text-[var(--oh-muted)]">{row.name}</span></th>}
            {selectedColumns.includes("opened") && <td className="px-4 py-3 tabular-nums">{row.openedAt ? formatOdooDateTime(String(row.openedAt), timezone) : "—"}</td>}
            {selectedColumns.includes("closed") && <td className="px-4 py-3 tabular-nums">{row.closedAt ? formatOdooDateTime(String(row.closedAt), timezone) : "—"}</td>}
            {selectedColumns.includes("expected") && <td className="px-4 py-3 text-right tabular-nums">{row.expected === null ? "—" : money.format(row.expected)}</td>}
            {selectedColumns.includes("received") && <td className="px-4 py-3 text-right tabular-nums">{row.received === null ? "—" : money.format(row.received)}</td>}
            {selectedColumns.includes("difference") && <td className={`px-4 py-3 text-right tabular-nums ${row.difference !== null && Math.abs(row.difference) >= 0.005 ? "font-semibold text-amber-800" : ""}`}>{row.difference === null ? "—" : money.format(row.difference)}</td>}
          </tr>)}
          {!loading && visible.length === 0 && <tr><td colSpan={selectedColumns.length} className="px-4 py-10 text-center text-[var(--oh-muted)]">No register closures match this period.</td></tr>}
          {loading && visible.length === 0 && <tr><td colSpan={selectedColumns.length} className="px-4 py-10 text-center text-[var(--oh-muted)]">Loading register closures…</td></tr>}
        </tbody>
      </table>
    </div>
    <footer className="print:hidden flex flex-wrap items-center justify-between gap-3 border-t border-[var(--oh-border)] py-3 text-sm"><span role="status" aria-live="polite" className="text-[var(--oh-muted)]">Loaded {rows.length.toLocaleString("en-AU")} of {total.toLocaleString("en-AU")} {exceptionsOnly ? "cash differences" : "sessions"}</span>{hasNext && <button type="button" onClick={() => void load(true)} disabled={loadingMore} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 font-semibold disabled:opacity-50">{loadingMore ? <LoaderCircle size={15} className="animate-spin" /> : null}Load more</button>}</footer>
  </div></main>;
}
