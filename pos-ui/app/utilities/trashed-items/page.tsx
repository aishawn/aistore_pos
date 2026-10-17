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
        <div role="status" aria-label="Loading trashed items" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white"><div className="grid grid-cols-4 gap-3 bg-[var(--oh-surface)] px-4 py-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}</div>{Array.from({ length: 5 }, (_, row) => <div key={row} className="grid grid-cols-4 gap-3 border-t border-[var(--oh-border)] px-4 py-4">{Array.from({ length: 4 }, (_, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}</div>)}</div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={15} /> Retry</button></div>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--oh-border-strong)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">No trashed items match the selected type.</p>
      ) : (
        <ListTable
          columns={[
            { label: "Item" },
            { label: "Type", width: "w-[160px]" },
            { label: "Deleted", width: "w-[180px]" },
          ]}
          rows={items.map((it) => [
            it.name ?? "",
            it.itemType ?? "",
            it.deletedAt ?? "",
          ])}
        />
      )}
      <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
    </AdminPageLayout>
  );
}
