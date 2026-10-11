"use client";

import { useState } from "react";
import { PlusIcon, SelectChevronIcon, BanIcon } from "@/components/icons";
import { ListTable } from "@/components/admin/ListTable";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList } from "@/hooks/useApi";

const PAGE_SIZE = 20;

interface FutureCost {
  id: string;
  productId: string;
  supplierId: string;
  quantity: number;
  cost: number;
  costEx: number;
  userId: string;
  effectiveTime: string;
}

export default function FutureCostsPage() {
  const [page, setPage] = useState(1);
  const { items, total, loading, error } = useApiList<FutureCost>("/api/future-costs", { page, size: PAGE_SIZE });
  const showTable = !loading && !error && items.length > 0;

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-center gap-5">
        <h1 className="text-[34px] font-bold text-black">Future Costs</h1>
        <button className="flex items-center gap-2 rounded-md bg-[#3cb44b] px-5 py-3 text-[16px] font-bold text-white"><PlusIcon size={18} /> New</button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
        <span className="flex h-[52px] items-center justify-between rounded-lg border border-neutral-300 px-4 text-neutral-400">Select Supplier... <SelectChevronIcon size={18} /></span>
        <span className="flex h-[52px] items-center rounded-lg border border-neutral-300 px-4 text-neutral-400">Select Start Date...</span>
        <span className="flex h-[52px] items-center rounded-lg border border-neutral-300 px-4 text-neutral-400">Select End Date...</span>
      </div>
      <button className="mt-4 rounded-lg bg-[var(--oh-orange)] px-8 py-3 text-[16px] font-bold text-white transition-colors hover:bg-[var(--oh-orange-hover)]">Filter</button>

      {showTable ? (
        <div className="mt-6">
          <ListTable
            columns={[{ label: "Product" }, { label: "Cost", width: "w-[200px]" }, { label: "Effective", width: "w-[260px]" }]}
            rows={items.map((c) => [c.productId ?? "", `$${Number(c.cost).toFixed(2)}`, c.effectiveTime ?? ""])}
          />
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      ) : (
        <div className="mt-10 flex items-center justify-center gap-10">
          <BanIcon size={150} strokeWidth={1.5} className="text-black" />
          <div>
            <h2 className="text-[28px] font-bold text-black">No Future Costs</h2>
            <p className="mt-2 text-[18px] text-black">There are no costs set to be activated in the future.</p>
          </div>
        </div>
      )}
    </div>
  );
}
