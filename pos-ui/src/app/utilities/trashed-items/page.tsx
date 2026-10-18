"use client";

import { useState } from "react";
import { ListTable } from "@/components/admin/ListTable";
import { RestoreIcon, DeleteIcon } from "@/components/icons";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList } from "@/hooks/useApi";

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
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const { items, total, loading, error, reload } = useApiList<TrashedItem>("/api/trashed-items", {
    type: type || undefined,
    page,
    size: PAGE_SIZE,
  });

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <h1 className="text-[34px] font-bold text-black">Trashed Items</h1>

      <div className="mt-4 flex gap-6">
        <input placeholder="Search trashed items..." className="h-[52px] flex-1 rounded-xl border-2 border-black px-4 text-[16px] outline-none placeholder:text-neutral-400" />
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="h-[52px] w-[260px] rounded-lg border border-neutral-300 px-4 text-black outline-none"
        >
          <option value="">All Types</option>
          <option value="PRODUCT">PRODUCT</option>
          <option value="CUSTOMER">CUSTOMER</option>
          <option value="SUPPLIER">SUPPLIER</option>
          <option value="PROMOTION">PROMOTION</option>
        </select>
      </div>

      <div className="mt-6">
        <AsyncState loading={loading} error={error} empty={items.length === 0} onRetry={reload}>
          <ListTable
            columns={[{ label: "Item" }, { label: "Type", width: "w-[160px]" }, { label: "Deleted", width: "w-[180px]" }, { label: "Actions", align: "right", width: "w-[300px]" }]}
            rows={items.map((it) => [it.name ?? "", it.itemType ?? "", it.deletedAt ?? "", <Actions key="a" />])}
          />
        </AsyncState>
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
