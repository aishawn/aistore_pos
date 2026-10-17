"use client";

import { useState } from "react";
import { ListTable } from "@/components/admin/ListTable";
import { RestoreIcon, DeleteIcon, SearchIcon, XIcon } from "@/components/icons";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";

const PAGE_SIZE = 20;

interface TrashedItem {
  id: number;
  itemType: string;
  itemId: string;
  name: string;
  deletedAt: string;
}

function Actions() {
  return (
    <div className="flex items-center justify-end gap-6 text-[16px] font-semibold">
      <span className="flex items-center gap-1.5 text-[#3cb44b]"><RestoreIcon size={18} /> Restore</span>
      <span className="flex items-center gap-1.5 text-[#e2231a]"><DeleteIcon size={18} /> Delete</span>
    </div>
  );
}

export default function TrashedItemsPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebouncedValue(query, 300);
  const { items, total, loading, error, reload } = useApiList<TrashedItem>("/api/trashed-items", {
    type: type || undefined,
    q: debouncedQuery || undefined,
    page,
    size: PAGE_SIZE,
  });

  return (
    <div className="min-h-full overflow-auto bg-[var(--oh-surface)] p-4 font-sans text-[var(--oh-text)] sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--oh-muted)]">Utilities</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Trashed items</h1>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Review archived records before restoring or removing them.</p>
          </div>
          <div className="rounded-lg border border-[var(--oh-border)] bg-white px-4 py-2 text-right shadow-sm">
            <div className="text-xl font-semibold tabular-nums text-[var(--oh-text)]">{total}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Results</div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--oh-muted)]">Search</span>
            <SearchIcon aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-[2.35rem] text-[var(--oh-muted)]" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search trashed items..."
              aria-label="Search trashed items"
              className="h-11 w-full rounded-lg border border-[var(--oh-border)] bg-white pl-10 pr-10 text-sm outline-none transition focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20 placeholder:text-[var(--oh-muted)]"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setPage(1);
                }}
                className="absolute right-1 top-[2.1rem] inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--oh-primary)]"
              >
                <XIcon aria-hidden="true" size={16} />
              </button>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-[var(--oh-muted)]">Item type</span>
            <select
              value={type}
              aria-label="Filter by item type"
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              className="h-11 w-full rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] outline-none transition focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/20"
            >
              <option value="">All types</option>
              <option value="PRODUCT">Product</option>
              <option value="CUSTOMER">Customer</option>
              <option value="SUPPLIER">Supplier</option>
              <option value="PROMOTION">Promotion</option>
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--oh-border)] bg-white p-3 shadow-sm sm:p-4">
          <AsyncState
            loading={loading}
            error={error}
            empty={items.length === 0}
            emptyText={debouncedQuery || type ? "No trashed items match the current filters." : "No trashed items yet."}
            onRetry={reload}
          >
            <ListTable
              ariaLabel="Trashed items"
              columns={[{ label: "Item" }, { label: "Type", width: "w-[160px]" }, { label: "Deleted", width: "w-[180px]" }, { label: "Actions", align: "right", width: "w-[300px]" }]}
              rows={items.map((it) => [it.name ?? "", it.itemType ?? "", it.deletedAt ?? "", <Actions key="a" />])}
            />
          </AsyncState>
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}
