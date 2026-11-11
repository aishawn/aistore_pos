"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Boxes, Download, Printer, Save, Search } from "lucide-react";
import { ReportColumnChooser } from "@/components/admin/ReportColumnChooser";
import { useDebouncedValue } from "@/hooks/useApi";
import { api, ApiError, type Page } from "@/lib/api";
import {
  ON_HAND_COLUMNS,
  groupOnHandRows,
  sortOnHandRows,
  toOnHandRow,
  type OnHandColumnKey,
  type OnHandGroupBy,
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
const PREFS_KEY = "orithos.inventory-on-hand.v1";
const DEFAULT_COLUMNS: OnHandColumnKey[] = ["name", "caseQuantity", "caseLevel", "itemLevel", "valueIncLast"];

type SavedPrefs = {
  columns?: string[];
  groupBy?: OnHandGroupBy;
  includeDeleted?: boolean;
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
    const raw = window.localStorage.getItem(PREFS_KEY);
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

export function NativeInventoryReportPage() {
  const initialPrefs = useMemo(() => loadPrefs(), []);
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query.trim(), 250);
  const [includeDeleted, setIncludeDeleted] = useState(Boolean(initialPrefs.includeDeleted));
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
    const payload: SavedPrefs = { columns, groupBy, includeDeleted };
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
      const allRows = sortOnHandRows(await ensureAllLoaded(), sortBy, sortDirection);
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
    if (sortBy !== column) return <ArrowUpDown size={12} className="opacity-40" aria-hidden="true" />;
    return sortDirection === "asc" ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />;
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="flex flex-wrap items-end gap-3 border-b border-[var(--oh-border)] bg-[var(--oh-text)] px-4 py-3 text-white md:px-6">
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-white/70">
          Report Type
          <select
            value="inventory-on-hand"
            disabled
            className="h-10 min-w-[12rem] rounded-md border border-white/20 bg-white/10 px-2 text-sm font-medium text-white"
          >
            <option value="inventory-on-hand">Inventory On Hand</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-white/70">
          Group By
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as OnHandGroupBy)}
            className="h-10 min-w-[10rem] rounded-md border border-white/20 bg-white/10 px-2 text-sm font-medium text-white"
          >
            <option value="none">None</option>
            <option value="category">Category</option>
            <option value="brand">Brand</option>
          </select>
        </label>
        <p className="ml-auto self-center text-xs text-white/70">Source: Orithos ledger · continuous scroll</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
        <label className="flex min-h-11 min-w-[16rem] flex-1 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3">
          <Search size={16} className="text-[var(--oh-muted)]" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for anything"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <div className="flex min-h-11 items-center gap-2.5 text-sm text-[var(--oh-text-secondary)]">
          <button
            type="button"
            role="switch"
            aria-checked={includeDeleted}
            aria-label="Include Deleted"
            onClick={() => setIncludeDeleted((value) => !value)}
            className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] ${includeDeleted ? "bg-[var(--oh-primary)]" : "bg-[var(--oh-border-strong)]"}`}
          >
            <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${includeDeleted ? "translate-x-5" : "translate-x-0"}`} />
          </button>
          <span>Include Deleted</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--oh-border)] bg-white px-4 py-2 md:px-6 print:hidden">
        <button type="button" disabled={exportBusy || loading} onClick={() => void exportCsv()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium disabled:opacity-50">
          <Download size={15} aria-hidden="true" /> Export
        </button>
        <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium">
          <Printer size={15} aria-hidden="true" /> Print
        </button>
        <button type="button" onClick={savePrefs} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium">
          <Save size={15} aria-hidden="true" /> Save
        </button>
        <div className="ml-auto">
          <ReportColumnChooser columns={[...ON_HAND_COLUMNS]} selected={columns} required={["name"]} onChange={toggleColumn} />
        </div>
      </div>

      {(saveNotice || error) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oh-border)] bg-white px-4 py-2 text-sm md:px-6">
          {saveNotice && <p className="text-emerald-800">{saveNotice}</p>}
          {error && (
            <div role="alert" className="flex items-center gap-3 text-red-800">
              <span>{error}</span>
              <button type="button" onClick={reload} className="min-h-9 rounded border border-red-300 px-3 font-semibold">Retry</button>
            </div>
          )}
        </div>
      )}

      <div ref={scrollRoot} className="min-h-0 flex-1 overflow-auto">
        {loading && items.length === 0 ? (
          <p role="status" className="py-16 text-center text-sm text-[var(--oh-muted)]">Loading inventory…</p>
        ) : error && items.length === 0 ? null : items.length === 0 ? (
          <div className="grid place-items-center py-16 text-center text-[var(--oh-muted)]">
            <Boxes size={24} aria-hidden="true" />
            <p className="mt-2 text-sm">No inventory rows found.</p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#5b9bb8] text-xs font-semibold uppercase tracking-wide text-white">
              <tr>
                {visibleColumns.map((column) => {
                  const sortable = ON_HAND_COLUMNS.some((entry) => entry.key === column.key);
                  return (
                    <th key={column.key} scope="col" className={`whitespace-nowrap px-3 py-2 ${column.key === "valueIncLast" ? "text-right" : column.key === "name" ? "text-left" : "text-center"}`}>
                      {sortable ? (
                        <button type="button" onClick={() => toggleSort(column.key as OnHandSort)} className="inline-flex items-center gap-1 uppercase">
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
                    <tr className="bg-[var(--oh-surface)]">
                      <td colSpan={visibleColumns.length} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">{group.label}</td>
                    </tr>
                  ) : null}
                  {group.rows.map((row, index) => (
                    <tr key={row.id} className={`border-b border-[var(--oh-border)] ${index % 2 === 0 ? "bg-white" : "bg-[var(--oh-surface)]"} ${row.deleted ? "opacity-70" : ""}`}>
                      {visibleColumns.map((column) => {
                        if (column.key === "name") {
                          return (
                            <td key={column.key} className="px-3 py-2 font-semibold text-[var(--oh-text)]">
                              <Link href={`/products/${row.id}/view`} className="hover:text-[var(--oh-primary)] hover:underline">
                                {friendlyProductName(row.name)}
                              </Link>
                              {row.deleted ? <span className="ml-2 text-[11px] font-medium uppercase text-red-700">{row.status}</span> : null}
                            </td>
                          );
                        }
                        if (column.key === "caseQuantity") return <td key={column.key} className="px-3 py-2 text-center tabular-nums">{quantity(row.caseQuantity)}</td>;
                        if (column.key === "caseLevel") {
                          return (
                            <td key={column.key} className={`px-3 py-2 text-center tabular-nums ${Number(row.caseLevel) < 0 ? "text-red-700" : "text-[var(--oh-primary)]"}`}>
                              {quantity(row.caseLevel)}
                            </td>
                          );
                        }
                        if (column.key === "itemLevel") {
                          return (
                            <td key={column.key} className={`px-3 py-2 text-center tabular-nums ${Number(row.itemLevel) < 0 ? "text-red-700" : "text-[var(--oh-primary)]"}`}>
                              {quantity(row.itemLevel)}
                            </td>
                          );
                        }
                        if (column.key === "valueIncLast") return <td key={column.key} className="px-3 py-2 text-right tabular-nums">{money(row.valueIncLast)}</td>;
                        if (column.key === "category") return <td key={column.key} className="px-3 py-2 text-[var(--oh-muted)]">{row.categoryName}</td>;
                        if (column.key === "brand") return <td key={column.key} className="px-3 py-2 text-[var(--oh-muted)]">{row.brandName}</td>;
                        return <td key={column.key} className="px-3 py-2 text-center text-[var(--oh-muted)]">{row.status}</td>;
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        <div ref={sentinel} className="h-8" aria-hidden="true" />
        <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-[var(--oh-muted)] md:px-6 print:hidden">
          <span>
            Showing {displayed.length.toLocaleString("en-AU")}
            {total ? ` of ${total.toLocaleString("en-AU")}` : ""} products
            {loadingMore ? " · Loading more…" : hasNext ? " · Scroll for more" : ""}
          </span>
          {loadMoreError ? (
            <button type="button" onClick={() => void loadPage(false)} className="font-semibold text-[var(--oh-primary)] underline">
              Retry loading more
            </button>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
