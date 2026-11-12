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
  groupOnHandRows,
  inventoryLevelParam,
  onHandSummaryToTotals,
  sortOnHandRows,
  toOnHandRow,
  type OnHandColumnKey,
  type OnHandFooterTotals,
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

type OnHandSummaryResponse = {
  productCount?: number | null;
  caseLevelTotal?: number | string | null;
  itemLevelTotal?: number | string | null;
  valueIncLastTotal?: number | string | null;
};

const PAGE_SIZE = 100;
const PREFS_KEY = "orithos.inventory-on-hand.v2";
const DEFAULT_COLUMNS: OnHandColumnKey[] = ["name", "caseQuantity", "caseLevel", "itemLevel", "valueIncLast"];
const EMPTY_TOTALS: OnHandFooterTotals = { caseLevel: 0, itemLevel: 0, valueIncLast: 0 };

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
  const [footerTotals, setFooterTotals] = useState<OnHandFooterTotals>(EMPTY_TOTALS);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const pageRef = useRef(1);
  const requestRef = useRef(0);
  const summaryRequestRef = useRef(0);
  const busyRef = useRef(false);
  const scrollRoot = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const productQueryParams = useCallback((page: number) => ({
    name: search || undefined,
    page,
    size: PAGE_SIZE,
    status: includeDeleted ? undefined : "ACTIVE",
    inventoryLevel: inventoryLevelParam(reportType),
  }), [includeDeleted, reportType, search]);

  const loadSummary = useCallback(async () => {
    const sequence = ++summaryRequestRef.current;
    setSummaryBusy(true);
    try {
      const summary = await api.get<OnHandSummaryResponse>("/api/products/on-hand-summary", {
        name: search || undefined,
        status: includeDeleted ? undefined : "ACTIVE",
        inventoryLevel: inventoryLevelParam(reportType),
      });
      if (sequence !== summaryRequestRef.current) return;
      setFooterTotals(onHandSummaryToTotals(summary));
      if (typeof summary?.productCount === "number" && Number.isFinite(summary.productCount)) {
        setTotal(summary.productCount);
      }
    } catch {
      if (sequence !== summaryRequestRef.current) return;
    } finally {
      if (sequence === summaryRequestRef.current) setSummaryBusy(false);
    }
  }, [includeDeleted, reportType, search]);

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
      setHasNext(false);
      pageRef.current = 1;
      setLoadMoreError(null);
    } else {
      setLoadingMore(true);
      setLoadMoreError(null);
    }
    setError(null);
    try {
      const result = await api.get<Page<ProductRow>>("/api/products", productQueryParams(page));
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
  }, [productQueryParams]);

  const reload = useCallback(() => {
    void loadSummary();
    void loadPage(true);
  }, [loadPage, loadSummary]);
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasNext || loadMoreError) return;
    void loadPage(false);
  }, [hasNext, loadMoreError, loadPage, loading, loadingMore]);

  useEffect(() => {
    void loadSummary();
    void loadPage(true);
    return () => {
      requestRef.current += 1;
      summaryRequestRef.current += 1;
      busyRef.current = false;
    };
  }, [loadPage, loadSummary]);

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

  const displayed = useMemo(() => sortOnHandRows(items, sortBy, sortDirection), [items, sortBy, sortDirection]);
  const groups = useMemo(() => groupOnHandRows(displayed, groupBy), [displayed, groupBy]);
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
      const result = await api.get<Page<ProductRow>>("/api/products", productQueryParams(page));
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
      const allRows = sortOnHandRows(loaded, sortBy, sortDirection);
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
    "inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50";
  const filterBtn =
    "relative flex min-h-10 min-w-[10.5rem] flex-1 cursor-pointer items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] transition-colors hover:border-[var(--oh-primary)]/40 focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15 sm:flex-none";
  const summaryBusyEmpty = summaryBusy && items.length === 0;

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3 md:px-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--oh-text)]">Inventory on hand</h1>
            <p className="mt-0.5 text-sm text-[var(--oh-muted)]">
              Case, item, and value totals for the full matching catalog.
            </p>
          </div>
          <dl className="flex flex-wrap items-stretch gap-2 text-sm">
            <div className="min-w-[6.5rem] rounded-lg border border-[var(--oh-border)] bg-white px-3 py-1.5">
              <dt className="text-[11px] font-medium text-[var(--oh-muted)]">Products</dt>
              <dd className="tabular-nums font-semibold text-[var(--oh-text)]">
                {summaryBusyEmpty ? "…" : (total || displayed.length).toLocaleString("en-AU")}
              </dd>
            </div>
            <div className="min-w-[6.5rem] rounded-lg border border-[var(--oh-border)] bg-white px-3 py-1.5">
              <dt className="text-[11px] font-medium text-[var(--oh-muted)]">Case level</dt>
              <dd className="tabular-nums font-semibold text-[var(--oh-text)]">
                {summaryBusyEmpty ? "…" : quantity(footerTotals.caseLevel)}
              </dd>
            </div>
            <div className="min-w-[6.5rem] rounded-lg border border-[var(--oh-border)] bg-white px-3 py-1.5">
              <dt className="text-[11px] font-medium text-[var(--oh-muted)]">Item level</dt>
              <dd className="tabular-nums font-semibold text-[var(--oh-text)]">
                {summaryBusyEmpty ? "…" : quantity(footerTotals.itemLevel)}
              </dd>
            </div>
            <div className="min-w-[7.5rem] rounded-lg border border-[var(--oh-border)] bg-[var(--oh-orange-light)] px-3 py-1.5">
              <dt className="text-[11px] font-medium text-[var(--oh-muted)]">Value (inc)</dt>
              <dd className="tabular-nums font-semibold text-[var(--oh-text)]">
                {summaryBusyEmpty ? "…" : money(footerTotals.valueIncLast)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:px-6">
          <label className={filterBtn}>
            <span className="shrink-0 text-[11px] font-medium text-[var(--oh-muted)]">Type</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{reportTypeLabel(reportType)}</span>
            <ChevronDown size={15} className="shrink-0 text-[var(--oh-primary)]" aria-hidden="true" />
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
          <label className={filterBtn}>
            <span className="shrink-0 text-[11px] font-medium text-[var(--oh-muted)]">Group</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{groupByLabel(groupBy)}</span>
            <ChevronDown size={15} className="shrink-0 text-[var(--oh-primary)]" aria-hidden="true" />
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

          <label className="flex min-h-10 min-w-[12rem] flex-1 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 transition-colors focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
            <Search size={16} className="shrink-0 text-[var(--oh-muted)]" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={exportBusy || loading} onClick={() => void exportCsv()} className={toolBtn}>
              <Download size={15} aria-hidden="true" /> Export
            </button>
            <button type="button" onClick={() => window.print()} className={toolBtn} aria-label="Print">
              <Printer size={15} aria-hidden="true" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button type="button" onClick={savePrefs} className={toolBtn} aria-label="Save layout">
              <Save size={15} aria-hidden="true" />
              <span className="hidden sm:inline">Save</span>
            </button>
            <div className="flex min-h-10 items-center gap-2 text-sm text-[var(--oh-text-secondary)]">
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
              <span className="hidden md:inline">Include deleted</span>
            </div>
            <ReportColumnChooser columns={[...ON_HAND_COLUMNS]} selected={columns} required={["name"]} onChange={toggleColumn} />
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

      <div ref={scrollRoot} className="min-h-0 flex-1 overflow-auto bg-[var(--oh-surface-elevated)]">
        {loading && items.length === 0 ? (
          <p role="status" className="py-16 text-center text-sm text-[var(--oh-muted)]">Loading inventory…</p>
        ) : error && items.length === 0 ? null : displayed.length === 0 ? (
          <div className="grid place-items-center py-16 text-center text-[var(--oh-muted)]">
            <Boxes size={24} aria-hidden="true" />
            <p className="mt-2 text-sm">No inventory rows found for this filter.</p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)]/95 backdrop-blur-sm">
              <tr>
                {visibleColumns.map((column) => {
                  const sortable = ON_HAND_COLUMNS.some((entry) => entry.key === column.key);
                  const active = sortable && sortBy === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      className={`whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-[var(--oh-muted)] ${cellAlign(column.key)}`}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key as OnHandSort)}
                          className={`inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:text-[var(--oh-text)] ${
                            active ? "text-[var(--oh-primary)]" : "text-[var(--oh-muted)]"
                          }`}
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
                    <tr className="bg-[var(--oh-surface-muted)]">
                      <td colSpan={visibleColumns.length} className="px-4 py-2 text-[13px] font-semibold text-[var(--oh-text-secondary)]">{group.label}</td>
                    </tr>
                  ) : null}
                  {group.rows.map((row) => {
                    const negativeStock = Number(row.caseLevel) < 0 || Number(row.itemLevel) < 0;
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-[var(--oh-border)] transition-colors hover:bg-[var(--oh-surface-muted)] ${
                          row.deleted ? "opacity-65" : ""
                        } ${negativeStock ? "border-l-[3px] border-l-[var(--oh-danger)]" : ""}`}
                      >
                        {visibleColumns.map((column) => {
                          if (column.key === "name") {
                            return (
                              <td key={column.key} className="px-4 py-2.5 font-medium text-[var(--oh-text)]">
                                <Link href={`/products/${row.id}/view`} className="hover:text-[var(--oh-primary)] hover:underline">
                                  {friendlyProductName(row.name)}
                                </Link>
                                {row.deleted ? (
                                  <span className="ml-2 rounded bg-[var(--oh-tile-red-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--oh-danger-text)]">
                                    {row.status}
                                  </span>
                                ) : null}
                              </td>
                            );
                          }
                          if (column.key === "caseQuantity") {
                            return <td key={column.key} className="px-4 py-2.5 text-right tabular-nums text-[var(--oh-text-secondary)]">{quantity(row.caseQuantity)}</td>;
                          }
                          if (column.key === "caseLevel") {
                            return (
                              <td key={column.key} className={`px-4 py-2.5 text-right tabular-nums ${Number(row.caseLevel) < 0 ? "font-semibold text-[var(--oh-danger-text)]" : "text-[var(--oh-text)]"}`}>
                                {quantity(row.caseLevel)}
                              </td>
                            );
                          }
                          if (column.key === "itemLevel") {
                            return (
                              <td key={column.key} className={`px-4 py-2.5 text-right tabular-nums ${Number(row.itemLevel) < 0 ? "font-semibold text-[var(--oh-danger-text)]" : "text-[var(--oh-text)]"}`}>
                                {quantity(row.itemLevel)}
                              </td>
                            );
                          }
                          if (column.key === "valueIncLast") {
                            return <td key={column.key} className="px-4 py-2.5 text-right font-medium tabular-nums text-[var(--oh-text)]">{money(row.valueIncLast)}</td>;
                          }
                          if (column.key === "category") return <td key={column.key} className="px-4 py-2.5 text-[var(--oh-text-secondary)]">{row.categoryName}</td>;
                          if (column.key === "brand") return <td key={column.key} className="px-4 py-2.5 text-[var(--oh-text-secondary)]">{row.brandName}</td>;
                          return <td key={column.key} className="px-4 py-2.5 text-right text-[var(--oh-text-secondary)]">{row.status}</td>;
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 border-t-2 border-[var(--oh-border-strong)] bg-[var(--oh-surface-muted)]" aria-label="Full catalog inventory totals">
              <tr>
                {visibleColumns.map((column) => {
                  if (column.key === "caseLevel") {
                    return (
                      <td key={column.key} className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-[var(--oh-text)]">
                        {summaryBusyEmpty ? "…" : quantity(footerTotals.caseLevel)}
                      </td>
                    );
                  }
                  if (column.key === "itemLevel") {
                    return (
                      <td key={column.key} className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-[var(--oh-text)]">
                        {summaryBusyEmpty ? "…" : quantity(footerTotals.itemLevel)}
                      </td>
                    );
                  }
                  if (column.key === "valueIncLast") {
                    return (
                      <td key={column.key} className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-[var(--oh-text)]">
                        {summaryBusyEmpty ? "…" : money(footerTotals.valueIncLast)}
                      </td>
                    );
                  }
                  if (column.key === "name") {
                    return (
                      <td key={column.key} className="px-4 py-3 text-sm font-semibold text-[var(--oh-text)]">
                        Total
                      </td>
                    );
                  }
                  return <td key={column.key} className="px-4 py-3" />;
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
