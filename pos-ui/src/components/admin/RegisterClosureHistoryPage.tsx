"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, LoaderCircle, Printer, RefreshCw } from "lucide-react";
import { api, listRetailRegisters, type Page, type RetailRegister } from "@/lib/api";
import { formatOdooDateTime, formatStoreEpoch } from "@/lib/odoo-date";
import { salesDate, shiftDay } from "@/lib/replenishment-safety";
import { FilterDateRangePicker } from "@/components/admin/FilterDateRangePicker";
import { ReportColumnChooser } from "@/components/admin/ReportColumnChooser";
import { ReportDateControls } from "@/components/admin/ReportDateControls";
import { comparisonDateRange, type ReportComparison } from "@/lib/report-date-selection";
import { summarizeRegisterClosures } from "@/lib/register-closure-summary";

type Closure = {
  id: number;
  register: string;
  name: string;
  openedAt: string | false | null;
  closedAt: string | false | null;
  expected: number | null;
  received: number | null;
  difference: number | null;
};

type NativeClosure = {
  id: number;
  registerId: number;
  totalExpected?: number | null;
  totalReceived?: number | null;
  movement?: number | null;
  openedAt?: string | null;
  closedAt?: string | null;
};

const REPORT_COLUMNS = [
  { key: "register", label: "Register" },
  { key: "opened", label: "Opened" },
  { key: "closed", label: "Closed" },
  { key: "expected", label: "Expected cash" },
  { key: "received", label: "Received cash" },
  { key: "difference", label: "Received less expected" },
] as const;

type ClosureSummary = ReturnType<typeof summarizeRegisterClosures>;
const STORE_TIMEZONE = "Australia/Adelaide";
const PAGE_SIZE = 50;

function initialDates() {
  const to = salesDate(new Date().toISOString(), STORE_TIMEZONE);
  return { from: shiftDay(to, -29), to };
}

function dayKey(value: string | null | undefined, timezone: string): string | null {
  if (!value) return null;
  try {
    return salesDate(value, timezone);
  } catch {
    return value.slice(0, 10);
  }
}

function mapClosure(row: NativeClosure, registers: Map<number, string>): Closure {
  const expected = row.totalExpected == null ? null : Number(row.totalExpected);
  const received = row.totalReceived == null ? null : Number(row.totalReceived);
  const difference =
    expected !== null && received !== null
      ? Math.round((received - expected) * 100) / 100
      : row.movement == null
        ? null
        : Number(row.movement);
  return {
    id: Number(row.id),
    register: registers.get(Number(row.registerId)) || `Register #${row.registerId}`,
    name: `Closure #${row.id}`,
    openedAt: row.openedAt || null,
    closedAt: row.closedAt || null,
    expected,
    received,
    difference,
  };
}

async function loadAllClosures(registers: Map<number, string>): Promise<Closure[]> {
  const items: Closure[] = [];
  let page = 1;
  for (;;) {
    const result = await api.get<Page<NativeClosure>>("/api/register-closures", { page, size: 100 });
    items.push(...result.items.map((row) => mapClosure(row, registers)));
    if (page * 100 >= result.total || !result.items.length) break;
    page += 1;
    if (page > 100) break;
  }
  return items;
}

function filterClosures(items: Closure[], from: string, to: string, exceptionsOnly: boolean, timezone: string): Closure[] {
  return items.filter((item) => {
    const closedDay = dayKey(item.closedAt ? String(item.closedAt) : null, timezone);
    if (!closedDay || closedDay < from || closedDay > to) return false;
    if (exceptionsOnly && (item.difference === null || Math.abs(item.difference) < 0.005)) return false;
    return true;
  });
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function RegisterClosureHistoryPage() {
  const [draftDates, setDraftDates] = useState(initialDates);
  const [dates, setDates] = useState(() => draftDates);
  const [allRows, setAllRows] = useState<Closure[]>([]);
  const [printRows, setPrintRows] = useState<Closure[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [comparison, setComparison] = useState<ReportComparison>("none");
  const [comparisonSummary, setComparisonSummary] = useState<ClosureSummary | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(REPORT_COLUMNS.map((column) => column.key));
  const [company] = useState("Orithos store");
  const [currency] = useState("AUD");
  const [timezone] = useState(STORE_TIMEZONE);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const requestRevision = useRef(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const from = params.get("from");
    const to = params.get("to");
    const selectedColumnsParam = params.get("columns");
    if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      setDates({ from, to });
      setDraftDates({ from, to });
    }
    const selectedComparison = params.get("compare");
    if (selectedComparison === "none" || selectedComparison === "previous_period" || selectedComparison === "last_year") {
      setComparison(selectedComparison);
    }
    if (selectedColumnsParam) {
      const columns = selectedColumnsParam.split(",").filter((key) => REPORT_COLUMNS.some((column) => column.key === key));
      if (columns.length) setSelectedColumns(columns);
    }
    setExceptionsOnly(params.get("exceptions") === "true");
    setUrlReady(true);
    const onPopState = () => {
      const next = new URLSearchParams(location.search);
      const nextFrom = next.get("from");
      const nextTo = next.get("to");
      const nextColumns = next.get("columns");
      if (nextFrom && nextTo && /^\d{4}-\d{2}-\d{2}$/.test(nextFrom) && /^\d{4}-\d{2}-\d{2}$/.test(nextTo)) {
        setDates({ from: nextFrom, to: nextTo });
        setDraftDates({ from: nextFrom, to: nextTo });
      }
      if (nextColumns) {
        const columns = nextColumns.split(",").filter((key) => REPORT_COLUMNS.some((column) => column.key === key));
        if (columns.length) setSelectedColumns(columns);
      }
      setExceptionsOnly(next.get("exceptions") === "true");
      const nextComparison = next.get("compare");
      if (nextComparison === "none" || nextComparison === "previous_period" || nextComparison === "last_year") {
        setComparison(nextComparison);
      }
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
    try {
      return new Intl.NumberFormat("en-AU", { style: "currency", currency });
    } catch {
      return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
    }
  }, [currency]);

  const filtered = useMemo(
    () => filterClosures(allRows, dates.from, dates.to, exceptionsOnly, timezone),
    [allRows, dates.from, dates.to, exceptionsOnly, timezone],
  );
  const rows = filtered.slice(0, offset + PAGE_SIZE);
  const hasNext = rows.length < filtered.length;
  const total = filtered.length;

  async function exportCsv() {
    try {
      const summary = summarizeRegisterClosures(filtered);
      const exportColumns = REPORT_COLUMNS.map((column) => column.key).filter((key) => selectedColumns.includes(key));
      const headers: Record<string, string> = {
        register: "Register",
        opened: "Opened",
        closed: "Closed",
        expected: "Expected cash",
        received: "Received cash",
        difference: "Received minus expected",
      };
      const fields: Record<string, (item: Closure) => string | number> = {
        register: (item) => item.register,
        opened: (item) => String(item.openedAt ?? ""),
        closed: (item) => String(item.closedAt ?? ""),
        expected: (item) => item.expected ?? "",
        received: (item) => item.received ?? "",
        difference: (item) => item.difference ?? "",
      };
      const values: Array<Array<string | number>> = [
        exportColumns.map((column) => headers[column]),
        ...filtered.map((item) => exportColumns.map((column) => fields[column](item))),
        exportColumns.map((column) => {
          if (column === "register") return "Total";
          if (column === "expected") return summary.expectedCash;
          if (column === "received") return summary.receivedCash;
          if (column === "difference") return summary.cashDifference;
          return "";
        }),
      ];
      const csv = `\uFEFF${values.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `register-closures-${dates.from}-${dates.to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CSV export failed.");
    }
  }

  async function printAll() {
    try {
      window.addEventListener("afterprint", () => setPrintRows(null), { once: true });
      setPrintRows(filtered);
      window.setTimeout(() => window.print(), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare the report for printing.");
    }
  }

  const load = useCallback(async (append = false) => {
    const revision = ++requestRevision.current;
    if (append) {
      setLoadingMore(true);
      setOffset((current) => current + PAGE_SIZE);
      setLoadingMore(false);
      return;
    }
    setLoading(true);
    setError(null);
    setComparisonSummary(null);
    setComparisonError(null);
    setOffset(0);
    try {
      const registers = await listRetailRegisters().catch(() => [] as RetailRegister[]);
      const registerNames = new Map(registers.map((register) => [Number(register.id), register.name]));
      const items = await loadAllClosures(registerNames);
      if (revision !== requestRevision.current) return;
      setAllRows(items);
      setGeneratedAt(new Date().toISOString());
      if (comparison !== "none") {
        const range = comparisonDateRange(dates.from, dates.to, comparison);
        if (range) {
          try {
            const compared = filterClosures(items, range.from, range.to, exceptionsOnly, timezone);
            if (revision === requestRevision.current) setComparisonSummary(summarizeRegisterClosures(compared));
          } catch (cause) {
            if (revision === requestRevision.current) {
              setComparisonError(cause instanceof Error ? cause.message : "Comparison period is unavailable.");
            }
          }
        }
      }
    } catch (cause) {
      if (revision === requestRevision.current) {
        setError(cause instanceof Error ? cause.message : "Register closure history is unavailable.");
      }
    } finally {
      if (revision === requestRevision.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [comparison, dates.from, dates.to, exceptionsOnly, timezone]);

  useEffect(() => {
    void load(false);
  }, [load]);
  useEffect(() => () => {
    requestRevision.current++;
  }, []);

  const visible = printRows ?? rows;

  function toggleColumn(key: string) {
    setSelectedColumns((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      return next.length ? next : current;
    });
  }

  return (
    <main className="h-full overflow-y-auto bg-[var(--oh-surface)] p-3 lg:p-5">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
        <header>
          <p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Orithos · {company}</p>
          <h1 className="oh-type-title mt-1">Register closure history</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Closed register sessions. Difference = received cash less expected cash.</p>
        </header>
        <section aria-label="Closure history filters" className="print:hidden flex flex-wrap items-end gap-3 border-y border-[var(--oh-border)] py-3">
          <ReportDateControls
            value={draftDates}
            onChange={(range) => {
              setDraftDates(range);
              if (range.from && range.to && range.from <= range.to) setDates(range);
            }}
            comparison={comparison}
            onComparisonChange={setComparison}
            timezone={timezone}
          />
          <FilterDateRangePicker
            label="Date range"
            start={draftDates.from}
            end={draftDates.to}
            onChange={(range) => {
              const next = { from: range.start, to: range.end };
              setDraftDates(next);
              if (next.from && next.to && next.from <= next.to) setDates(next);
            }}
          />
          <button type="button" aria-pressed={exceptionsOnly} onClick={() => setExceptionsOnly((value) => !value)} className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${exceptionsOnly ? "border-amber-400 bg-amber-50 text-amber-950" : "border-[var(--oh-border)] bg-white text-[var(--oh-text)]"}`}><AlertTriangle size={15} className="mr-2 inline" />Differences only</button>
          <button type="button" onClick={() => void exportCsv()} aria-label="Export all matching closure rows to CSV" title="Export CSV" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white"><Download size={16} /></button>
          <button type="button" onClick={() => void printAll()} aria-label="Print all matching register closure rows" title="Print all matching rows" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white"><Printer size={16} /></button>
          <button type="button" onClick={() => void load(false)} disabled={loading} aria-label="Refresh closure history" title="Refresh" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[var(--oh-border)] bg-white disabled:opacity-50">{loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}</button>
          <ReportColumnChooser columns={[...REPORT_COLUMNS]} selected={selectedColumns} onChange={toggleColumn} />
        </section>
        <p className="text-xs text-[var(--oh-muted)]">Company scope: {company} · Period: {dates.from} to {dates.to} · Timezone: {timezone} · Source: Orithos register closures · Report prepared {generatedAt ? formatStoreEpoch(Date.parse(generatedAt), timezone) : "—"}</p>
        {comparison !== "none" && (
          <p role="status" className="border-l-2 border-[var(--oh-border)] px-3 py-2 text-sm text-[var(--oh-muted)]">
            {comparisonError
              ? `Comparison unavailable: ${comparisonError}`
              : comparisonSummary
                ? `Compared ${comparison === "previous_period" ? "the previous period" : "the same period last year"}: ${comparisonSummary.sessionCount} ${exceptionsOnly ? "cash differences" : "sessions"}; ${money.format(comparisonSummary.cashDifference)} cash difference from ${comparisonSummary.comparableSessionCount} comparable sessions; ${comparisonSummary.missingCashCount} sessions have incomplete cash values.`
                : "Loading comparison…"}
          </p>
        )}
        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
        <div className="overflow-x-auto border-y border-[var(--oh-border)] bg-white">
          <table aria-label="Register closure history" className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]">
              <tr>
                {selectedColumns.includes("register") && <th scope="col" className="px-4 py-3">Register</th>}
                {selectedColumns.includes("opened") && <th scope="col" className="px-4 py-3">Opened</th>}
                {selectedColumns.includes("closed") && <th scope="col" className="px-4 py-3">Closed</th>}
                {selectedColumns.includes("expected") && <th scope="col" className="px-4 py-3 text-right">Expected cash</th>}
                {selectedColumns.includes("received") && <th scope="col" className="px-4 py-3 text-right">Received cash</th>}
                {selectedColumns.includes("difference") && <th scope="col" className="px-4 py-3 text-right">Received less expected</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--oh-border)]">
              {visible.map((row) => (
                <tr key={row.id}>
                  {selectedColumns.includes("register") && <th scope="row" className="px-4 py-3 font-medium">{row.register}<span className="ml-2 text-xs font-normal text-[var(--oh-muted)]">{row.name}</span></th>}
                  {selectedColumns.includes("opened") && <td className="px-4 py-3 tabular-nums">{row.openedAt ? formatOdooDateTime(String(row.openedAt), timezone) : "—"}</td>}
                  {selectedColumns.includes("closed") && <td className="px-4 py-3 tabular-nums">{row.closedAt ? formatOdooDateTime(String(row.closedAt), timezone) : "—"}</td>}
                  {selectedColumns.includes("expected") && <td className="px-4 py-3 text-right tabular-nums">{row.expected === null ? "—" : money.format(row.expected)}</td>}
                  {selectedColumns.includes("received") && <td className="px-4 py-3 text-right tabular-nums">{row.received === null ? "—" : money.format(row.received)}</td>}
                  {selectedColumns.includes("difference") && <td className={`px-4 py-3 text-right tabular-nums ${row.difference !== null && Math.abs(row.difference) >= 0.005 ? "font-semibold text-amber-800" : ""}`}>{row.difference === null ? "—" : money.format(row.difference)}</td>}
                </tr>
              ))}
              {!loading && visible.length === 0 && <tr><td colSpan={selectedColumns.length} className="px-4 py-10 text-center text-[var(--oh-muted)]">No register closures match this period.</td></tr>}
              {loading && visible.length === 0 && <tr><td colSpan={selectedColumns.length} className="px-4 py-10 text-center text-[var(--oh-muted)]">Loading register closures…</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="print:hidden flex flex-wrap items-center justify-between gap-3 border-t border-[var(--oh-border)] py-3 text-sm">
          <span role="status" aria-live="polite" className="text-[var(--oh-muted)]">Loaded {rows.length.toLocaleString("en-AU")} of {total.toLocaleString("en-AU")} {exceptionsOnly ? "cash differences" : "sessions"}</span>
          {hasNext && <button type="button" onClick={() => void load(true)} disabled={loadingMore} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 font-semibold disabled:opacity-50">{loadingMore ? <LoaderCircle size={15} className="animate-spin" /> : null}Load more</button>}
        </footer>
      </div>
    </main>
  );
}
