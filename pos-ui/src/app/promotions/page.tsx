"use client";

import { useState } from "react";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { EmptyState } from "@/components/admin/EmptyState";
import { ListTable } from "@/components/admin/ListTable";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { PlusIcon } from "@/components/icons";

interface Promotion {
  id: string;
  name: string;
  active: boolean;
  start: string | null;
  end: string | null;
}

const PAGE_SIZE = 20;

export default function PromotionsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 300);

  const { items, total, loading, error, reload } = useApiList<Promotion>("/api/promotions", {
    name: debouncedSearch || undefined,
    page,
    size: PAGE_SIZE,
  });

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-center gap-5">
        <h1 className="text-[34px] font-bold text-black">Promotions</h1>
        <button className="flex items-center gap-2 rounded-full bg-[#5cb3e0] px-6 py-3 text-[16px] font-bold text-white">
          <PlusIcon size={18} /> Add Promotion
        </button>
        <div className="ml-auto text-center leading-none">
          <div className="text-[32px] font-bold text-black">{total}</div>
          <div className="text-[14px] text-black">Results</div>
        </div>
      </div>

      <label className="mt-5 block">
        <span className="text-[16px] text-black">Search</span>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="mt-1 h-[56px] w-full rounded-xl border-2 border-black px-4 text-[16px] outline-none"
        />
      </label>

      <div className="mt-4 flex items-end gap-6">
        <div className="flex flex-col">
          <span className="mb-1 text-[16px] text-black">Show Inactive</span>
          <span className="flex items-center gap-3">
            <span className="flex h-7 w-12 items-center rounded-full bg-neutral-300 p-1">
              <span className="h-5 w-5 rounded-full bg-white" />
            </span>
            <span className="text-[15px] text-neutral-600">Inactive promotions are hidden</span>
          </span>
        </div>
        <FilterSelect label="Promotion Categories" />
        <FilterSelect label="Products" />
        <FilterSelect label="Brands" />
        <FilterSelect label="Categories" />
      </div>

      <button className="mt-4 flex items-center gap-2 rounded-lg bg-[#5cb3e0] px-6 py-3 text-[16px] font-bold text-white">
        <PlusIcon size={18} /> More Filters
      </button>

      <div className="mt-6">
        <AsyncState loading={loading} error={error} empty={false} onRetry={reload}>
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <ListTable
              columns={[{ label: "Name" }, { label: "Status" }, { label: "Start" }, { label: "End" }]}
              rows={items.map((p) => [
                p.name,
                p.active ? "Active" : "Inactive",
                p.start ?? "",
                p.end ?? "",
              ])}
            />
          )}
        </AsyncState>
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
