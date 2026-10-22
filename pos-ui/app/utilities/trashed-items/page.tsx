"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { AdminPageLayout, AdminSearchInput } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { Pagination } from "@/components/admin/Pagination";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { useApiList } from "@/hooks/useApi";

const PAGE_SIZE = 20;

interface TrashedItem {
  id: number;
  itemType: string;
  itemId: string;
  name: string;
  deletedAt: string;
}

export default function TrashedItemsPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const { items, total, loading, error, reload } = useApiList<TrashedItem>("/api/trashed-items", {
    type: type || undefined,
    q: search.trim() || undefined,
    page,
    size: PAGE_SIZE,
  });

  return (
    <AdminPageLayout
      title="Trashed Items"
      count={total}
      search={
        <AdminSearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search trashed items…"
        />
      }
      filters={
        <FilterSelect
          label="Item Type"
          placeholder="All Types"
          options={[
            { label: "Product", value: "PRODUCT" },
            { label: "Customer", value: "CUSTOMER" },
            { label: "Supplier", value: "SUPPLIER" },
            { label: "Promotion", value: "PROMOTION" },
          ]}
          value={type}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
        />
      }
    >
      {loading ? (
        <div role="status" aria-busy="true" aria-label="Loading trashed items" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white"><div className="grid grid-cols-4 gap-3 bg-[var(--oh-surface)] px-4 py-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}</div>{Array.from({ length: 5 }, (_, row) => <div key={row} className="grid grid-cols-4 gap-3 border-t border-[var(--oh-border)] px-4 py-4">{Array.from({ length: 4 }, (_, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}</div>)}</div>
      ) : error ? (
<div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><RefreshCw size={15} /> Retry</button></div>
      ) : items.length === 0 ? (
        <section role="status" className="rounded-lg border border-dashed border-[var(--oh-border-strong)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">
          <p>{search.trim() || type ? "No trashed items match the current filters." : "No trashed items yet."}</p>
          {(search.trim() || type) && <button type="button" onClick={() => { setSearch(""); setType(""); setPage(1); }} className="mt-4 inline-flex min-h-11 items-center rounded-md border border-[var(--oh-border)] bg-white px-3 font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Clear filters</button>}
        </section>
      ) : (
        <>
          <div className="hidden md:block">
            <ListTable columns={[{ label: "Item" }, { label: "Type", width: "w-[160px]" }, { label: "Deleted", width: "w-[180px]" }]} rows={items.map((it) => [it.name ?? "", it.itemType ?? "", it.deletedAt ?? ""])} />
          </div>
          <div role="list" aria-label="Trashed items list" className="divide-y divide-[var(--oh-border)] overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white md:hidden">
            {items.map((item) => <article role="listitem" key={item.id} className="space-y-2 px-4 py-3.5"><div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-sm font-semibold text-[var(--oh-text)]">{item.name || "Unnamed item"}</p><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{item.itemType || "Unknown"}</span></div><dl className="grid grid-cols-2 gap-3 border-t border-[var(--oh-border)] pt-2 text-xs"><div><dt className="text-[var(--oh-muted)]">Item ID</dt><dd className="mt-0.5 break-all text-[var(--oh-text-secondary)]">{item.itemId || "—"}</dd></div><div><dt className="text-[var(--oh-muted)]">Deleted</dt><dd className="mt-0.5 break-words text-[var(--oh-text-secondary)]">{item.deletedAt || "—"}</dd></div></dl></article>)}
          </div>
        </>
      )}
      <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
    </AdminPageLayout>
  );
}
