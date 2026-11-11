"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Boxes, ChevronDown, Download, Printer, Save, Search } from "lucide-react";
import { ReportColumnChooser } from "@/components/admin/ReportColumnChooser";
import { useDebouncedValue } from "@/hooks/useApi";
import { api, ApiError, type Page } from "@/lib/api";
import {
  ON_HAND_COLUMNS,
  ON_HAND_REPORT_TYPES,
  filterOnHandRows,
  groupOnHandRows,
  onHandFooterTotals,
  sortOnHandRows,
  toOnHandRow,
  type OnHandColumnKey,
  type OnHandGroupBy,
  type OnHandReportType,
  type OnHandRow,
  type OnHandSort,
  type InventoryDirection,
} from "@/lib/inventory-report";
import { friendlyProductName } from "@/lib/product-display-name";

type ProductRow = {
  id: number | string;
  name: string;
  categoryName?: string | null;
  brandName?: string | null;
  status?: string | null;
  caseQuantity?: number | null;
  stockQuantity?: number | null;
  cost?: number | null;
  deletedAt?: string | null;
};

const PAGE_SIZE = 100;
const PREFS_KEY = "orithos.inventory-on-hand.v2";
const DEFAULT_COLUMNS: OnHandColumnKey[] = ["name", "caseQuantity", "caseLevel", "itemLevel", "valueIncLast"];
const TABLE_ACCENT = "#5bc0de";
const FILTER_BAR = "#545b62";

type SavedPrefs = {
  columns?: string[];
  groupBy?: OnHandGroupBy;
  includeDeleted?: boolean;
  reportType?: OnHandReportType;
};

function money(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function quantity(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-AU");
}

function loadPrefs(): SavedPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PREFS_KEY) ?? window.localStorage.getItem("orithos.inventory-on-hand.v1");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedPrefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function csvEscape(value: string) {
  return /["\n,]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function isReportType(value: string | null | undefined): value is OnHandReportType {
  return ON_HAND_REPORT_TYPES.some((entry) => entry.value === value);
}

function reportTypeLabel(value: OnHandReportType) {
  return ON_HAND_REPORT_TYPES.find((entry) => entry.value === value)?.label ?? "Inventory on Hand";
}

function groupByLabel(value: OnHandGroupBy) {
  if (value === "category") return "Category";
  if (value === "brand") return "Brand";
  return "None";
}

export function NativeInventoryReportPage() {
  const initialPrefs = useMemo(() => loadPrefs(), []);
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query.trim(), 250);
  const [includeDeleted, setIncludeDeleted] = useState(Boolean(initialPrefs.includeDeleted));
  const [reportType, setReportType] = useState<OnHandReportType>(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("negative") === "1") {
      return "not-zero";
    }
    return isReportType(initialPrefs.reportType) ? initialPrefs.reportType : "on-hand";
  });
  const [groupBy, setGroupBy] = useState<OnHandGroupBy>(initialPrefs.groupBy === "category" || initialPrefs.groupBy === "brand" ? initialPrefs.groupBy : "none");
  const [columns, setColumns] = useState<OnHandColumnKey[]>(() => {
    const saved = initialPrefs.columns?.filter((key): key is OnHandColumnKey => ON_HAND_COLUMNS.some((column) => column.key === key));
    return saved?.length ? Array.from(new Set<OnHandColumnKey>(["name", ...saved])) : DEFAULT_COLUMNS;
  });
  const [sortBy, setSortBy] = useState<OnHandSort>("name");
  const [sortDirection, setSortDirection] = useState<InventoryDirection>("asc");
  const [items, setItems] = useState<OnHandRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const pageRef = useRef(1);
  const requestRef = useRef(0);
  const busyRef = useRef(false);
  const scrollRoot = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (reset: boolean) => {
    if (!reset && busyRef.current) return;
    busyRef.current = true;
    const sequence = ++requestRef.current;
    const page = reset ? 1 : pageRef.current;
    if (reset) {
      scrollRoot.current?.scrollTo({ top: 0 });
      setLoading(true);
      setLoadingMore(false);
      setItems([]);
      setTotal(0);
      setHasNext(false);
      pageRef.current = 1;
      setLoadMoreError(null);
    } else {
      setLoadingMore(true);
      setLoadMoreError(null);
    }
    setError(null);
    try {
      const result = await api.get<Page<ProductRow>>("/api/products", {
        name: search || undefined,
        page,
        size: PAGE_SIZE,
        // Shopfront "Include Deleted" ≈ Orithos inactive/archived rows (soft-deleted stay hidden).
        status: includeDeleted ? undefined : "ACTIVE",
      });
      if (sequence !== requestRef.current) return;
      const rows = (result.items ?? []).map(toOnHandRow);
      setItems((previous) => {
        if (reset) return rows;
        const seen = new Set(previous.map((row) => row.id));
        return [...previous, ...rows.filter((row) => !seen.has(row.id))];
      });
      setTotal(result.total ?? rows.length);
      const loaded = (reset ? 0 : (page - 1) * PAGE_SIZE) + rows.length;
      const next = loaded < (result.total ?? 0) && rows.length > 0;
      setHasNext(next);
      pageRef.current = page + 1;
    } catch (cause) {
      if (sequence !== requestRef.current) return;
      const message = cause instanceof ApiError ? cause.message : "Could not load inventory.";
      if (reset) setError(message);
      else setLoadMoreError(message);
    } finally {
      if (sequence === requestRef.current) {
        busyRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [includeDeleted, search]);

  const reload = useCallback(() => { void loadPage(true); }, [loadPage]);
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasNext || loadMoreError) return;
    void loadPage(false);
  }, [hasNext, loadMoreError, loadPage, loading, loadingMore]);

  useEffect(() => {
    void loadPage(true);
    return () => { requestRef.current += 1; busyRef.current = false; };
  }, [loadPage]);

  useEffect(() => {
    const node = sentinel.current;
    const root = scrollRoot.current;
    if (!node || !root || loadMoreError) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { root, rootMargin: "640px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, loadMoreError]);

  const filteredItems = useMemo(() => filterOnHandRows(items, reportType), [items, reportType]);
  const displayed = useMemo(() => sortOnHandRows(filteredItems, sortBy, sortDirection), [filteredItems, sortBy, sortDirection]);
  const groups = useMemo(() => groupOnHandRows(displayed, groupBy), [displayed, groupBy]);
  const footerTotals = useMemo(() => onHandFooterTotals(displayed), [displayed]);
  const visibleColumns = ON_HAND_COLUMNS.filter((column) => columns.includes(column.key));

  function toggleSort(next: OnHandSort) {
    if (next === sortBy) setSortDirection((value) => (value === "asc" ? "desc" : "asc"));
    else {
      setSortBy(next);
      setSortDirection(next === "name" || next === "category" || next === "brand" || next === "status" ? "asc" : "desc");
    }
  }

  function toggleColumn(key: string) {
    setColumns((current) => {
      if (current.includes(key as OnHandColumnKey)) {
        if (key === "name" || current.length <= 1) return current;
        return current.filter((column) => column !== key);
      }
      return ON_HAND_COLUMNS.map((column) => column.key).filter((column) => current.includes(column) || column === key);
    });
  }

  function savePrefs() {
    const payload: SavedPrefs = { columns, groupBy, includeDeleted, reportType };
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(payload));
    setSaveNotice("Report layout saved on this device.");
    window.setTimeout(() => setSaveNotice(null), 2400);
  }

  async function ensureAllLoaded(): Promise<OnHandRow[]> {
    let rows = items;
    let page = pageRef.current;
    let next = hasNext;
    while (next) {
      const result = await api.get<Page<ProductRow>>("/api/products", {
        name: search || undefined,
        page,
        size: PAGE_SIZE,
        status: includeDeleted ? undefined : "ACTIVE",
      });
      const batch = (result.items ?? []).map(toOnHandRow);
      const seen = new Set(rows.map((row) => row.id));
      rows = [...rows, ...batch.filter((row) => !seen.has(row.id))];
      const loaded = (page - 1) * PAGE_SIZE + batch.length;
      next = loaded < (result.total ?? 0) && batch.length > 0;
      page += 1;
    }
    setItems(rows);
    setHasNext(false);
    pageRef.current = page;
    setTotal(rows.length);
    return rows;
  }

  async function exportCsv() {
    setExportBusy(true);
    try {
      const loaded = await ensureAllLoaded();
      const scoped = filterOnHandRows(loaded, reportType);
      const allRows = sortOnHandRows(scoped, sortBy, sortDirection);
      const header = visibleColumns.map((column) => column.label).join(",");
      const body = allRows.map((row) => visibleColumns.map((column) => {
        switch (column.key) {
          case "name": return csvEscape(friendlyProductName(row.name));
          case "caseQuantity": return row.caseQuantity == null ? "" : String(row.caseQuantity);
          case "caseLevel": return row.caseLevel == null ? "" : String(row.caseLevel);
          case "itemLevel": return row.itemLevel == null ? "" : String(row.itemLevel);
          case "valueIncLast": return row.valueIncLast == null ? "" : row.valueIncLast.toFixed(2);
          case "category": return csvEscape(row.categoryName);
          case "brand": return csvEscape(row.brandName);
          case "status": return csvEscape(row.status);
          default: return "";
        }
      }).join(",")).join("\n");
      const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `inventory-on-hand-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Export failed.");
    } finally {
      setExportBusy(false);
    }
  }

  function sortIcon(column: OnHandSort) {
    if (sortBy !== column) return <ArrowUpDown size={12} className="opacity-60" aria-hidden="true" />;
    return sortDirection === "asc"
      ? <ArrowUp size={12} aria-hidden="true" />
      : <ArrowDown size={12} aria-hidden="true" />;
  }

  function cellAlign(key: OnHandColumnKey) {
    return key === "name" || key === "category" || key === "brand" ? "text-left" : "text-right";
  }

  const toolBtn =
    "inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50";

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]">
        <div className="grid gap-px sm:grid-cols-2" style={{ backgroundColor: FILTER_BAR }}>
          <label className="relative flex min-h-[4.25rem] cursor-pointer flex-col justify-center px-4 py-2 text-white">
            <span className="text-[11px] font-medium uppercase tracking-wide text-white/75">Report Type</span>
            <span className="mt-0.5 flex items-center justify-between gap-2 text-lg font-semibold leading-tight">
              {reportTypeLabel(reportType)}
              <ChevronDown size={16} className="shrink-0 opacity-80" aria-hidden="true" />
            </span>
            <select
              aria-label="Report Type"
              value={reportType}
              onChange={(event) => setReportType(event.target.value as OnHandReportType)}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {ON_HAND_REPORT_TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
          </label>
          <label className="relative flex min-h-[4.25rem] cursor-pointer flex-col justify-center px-4 py-2 text-white">
            <span className="text-[11px] font-medium uppercase tracking-wide text-white/75">Group By</span>
            <span className="mt-0.5 flex items-center justify-between gap-2 text-lg font-semibold leading-tight">
              {groupByLabel(groupBy)}
              <ChevronDown size={16} className="shrink-0 opacity-80" aria-hidden="true" />
            </span>
            <select
              aria-label="Group By"
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as OnHandGroupBy)}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              <option value="none">None</option>
              <optgroup label="Classifications">
                <option value="brand">Brand</option>
                <option value="category">Category</option>
              </optgroup>
            </select>
          </label>
        </div>

        <div className="space-y-3 px-4 py-3 md:px-6">
          <label className="flex min-h-11 w-full items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 focus-within:border-[var(--oh-primary)] focus-within:ring-1 focus-within:ring-[var(--oh-primary)]/25">
            <Search size={16} className="shrink-0 text-[var(--oh-muted)]" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for anything"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={exportBusy || loading} onClick={() => void exportCsv()} className={toolBtn}>
              <Download size={15} aria-hidden="true" /> Export
            </button>
            <button type="button" onClick={() => window.print()} className={toolBtn}>
              <Printer size={15} aria-hidden="true" /> Print
            </button>
            <button type="button" onClick={savePrefs} className={toolBtn}>
              <Save size={15} aria-hidden="true" /> Save
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <div className="flex min-h-11 items-center gap-2 text-sm text-[var(--oh-text-secondary)]">
                <button
                  type="button"
                  role="switch"
                  aria-checked={includeDeleted}
                  aria-label="Include Deleted"
                  onClick={() => setIncludeDeleted((value) => !value)}
                  className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] ${includeDeleted ? "bg-[var(--oh-primary)]" : "bg-[var(--oh-border-strong)]"}`}
                >
                  <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${includeDeleted ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <span>Include Deleted</span>
              </div>
              <ReportColumnChooser columns={[...ON_HAND_COLUMNS]} selected={columns} required={["name"]} onChange={toggleColumn} />
            </div>
          </div>
        </div>
      </header>

      {(saveNotice || error) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-2.5 text-sm md:px-6">
          {saveNotice && <p className="text-emerald-800">{saveNotice}</p>}
          {error && (
            <div role="alert" className="flex items-center gap-3 text-red-800">
              <span>{error}</span>
              <button type="button" onClick={reload} className="min-h-9 rounded-md border border-red-300 px-3 font-semibold">Retry</button>
            </div>
          )}
        </div>
      )}

      <div ref={scrollRoot} className="min-h-0 flex-1 overflow-auto bg-white">
        {loading && items.length === 0 ? (
          <p role="status" className="py-16 text-center text-sm text-[var(--oh-muted)]">Loading inventory…</p>
        ) : error && items.length === 0 ? null : displayed.length === 0 ? (
          <div className="grid place-items-center py-16 text-center text-[var(--oh-muted)]">
            <Boxes size={24} aria-hidden="true" />
            <p className="mt-2 text-sm">No inventory rows found for this filter.</p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: TABLE_ACCENT }}>
              <tr>
                {visibleColumns.map((column) => {
                  const sortable = ON_HAND_COLUMNS.some((entry) => entry.key === column.key);
                  return (
                    <th key={column.key} scope="col" className={`whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white ${cellAlign(column.key)}`}>
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key as OnHandSort)}
                          className="inline-flex items-center gap-1.5 uppercase tracking-wide text-white hover:text-white/90"
                        >
                          {column.label}
                          {sortIcon(column.key as OnHandSort)}
                        </button>
                      ) : column.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.key}>
                  {group.label ? (
                    <tr style={{ backgroundColor: `${TABLE_ACCENT}22` }}>
                      <td colSpan={visibleColumns.length} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--oh-text-secondary)]">{group.label}</td>
                    </tr>
                  ) : null}
                  {group.rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`transition-colors hover:bg-sky-50 ${row.deleted ? "opacity-65" : ""} ${index % 2 === 1 ? "bg-slate-50" : "bg-white"}`}
                    >
                      {visibleColumns.map((column) => {
                        if (column.key === "name") {
                          return (
                            <td key={column.key} className="px-4 py-2.5 font-medium text-[var(--oh-text)]">
                              <Link href={`/products/${row.id}/view`} className="hover:text-[var(--oh-primary)] hover:underline">
                                {friendlyProductName(row.name)}
                              </Link>
                              {row.deleted ? <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-red-700">{row.status}</span> : null}
                            </td>
                          );
                        }
                        if (column.key === "caseQuantity") {
                          return <td key={column.key} className="px-4 py-2.5 text-right tabular-nums text-[var(--oh-text-secondary)]">{quantity(row.caseQuantity)}</td>;
                        }
                        if (column.key === "caseLevel") {
                          return (
                            <td key={column.key} className={`px-4 py-2.5 text-right tabular-nums ${Number(row.caseLevel) < 0 ? "font-medium text-red-700" : "text-[var(--oh-text)]"}`}>
                              {quantity(row.caseLevel)}
                            </td>
                          );
                        }
                        if (column.key === "itemLevel") {
                          return (
                            <td key={column.key} className={`px-4 py-2.5 text-right tabular-nums ${Number(row.itemLevel) < 0 ? "font-medium text-red-700" : "text-[var(--oh-text)]"}`}>
                              {quantity(row.itemLevel)}
                            </td>
                          );
                        }
                        if (column.key === "valueIncLast") {
                          return <td key={column.key} className="px-4 py-2.5 text-right tabular-nums text-[var(--oh-text)]">{money(row.valueIncLast)}</td>;
                        }
                        if (column.key === "category") return <td key={column.key} className="px-4 py-2.5 text-[var(--oh-text-secondary)]">{row.categoryName}</td>;
                        if (column.key === "brand") return <td key={column.key} className="px-4 py-2.5 text-[var(--oh-text-secondary)]">{row.brandName}</td>;
                        return <td key={column.key} className="px-4 py-2.5 text-right text-[var(--oh-text-secondary)]">{row.status}</td>;
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10" style={{ backgroundColor: TABLE_ACCENT }}>
              <tr>
                {visibleColumns.map((column) => {
                  if (column.key === "caseLevel") {
                    return (
                      <td key={column.key} className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-white">
                        {quantity(footerTotals.caseLevel)}
                      </td>
                    );
                  }
                  if (column.key === "itemLevel") {
                    return (
                      <td key={column.key} className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-white">
                        {quantity(footerTotals.itemLevel)}
                      </td>
                    );
                  }
                  if (column.key === "valueIncLast") {
                    return (
                      <td key={column.key} className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-white">
                        {money(footerTotals.valueIncLast)}
                      </td>
                    );
                  }
                  if (column.key === "name") {
                    return (
                      <td key={column.key} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white/90">
                        Total
                      </td>
                    );
                  }
                  return <td key={column.key} className="px-4 py-2.5" />;
                })}
              </tr>
            </tfoot>
          </table>
        )}
        <div ref={sentinel} className="h-8" aria-hidden="true" />
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-2.5 text-xs text-[var(--oh-muted)] md:px-6 print:hidden">
        <span>
          Showing {displayed.length.toLocaleString("en-AU")}
          {total ? ` of ${total.toLocaleString("en-AU")}` : ""} products
          {loadingMore ? " · Loading more…" : hasNext ? " · Scroll for more" : ""}
          {reportType !== "on-hand" && reportType !== "all" ? ` · ${reportTypeLabel(reportType)}` : ""}
        </span>
        {loadMoreError ? (
          <button type="button" onClick={() => void loadPage(false)} className="font-semibold text-[var(--oh-primary)] underline underline-offset-2">
            Retry loading more
          </button>
        ) : null}
      </footer>
    </main>
  );
}
