"use client";

import { useState } from "react";
import { AdminPageLayout, AdminSearchInput } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { RestoreIcon, DeleteIcon } from "@/components/icons";
import { AsyncState } from "@/components/admin/AsyncState";
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

function Actions() {
  return (
    <div className="flex items-center justify-end gap-4 text-[13px] font-medium">
      <span className="flex items-center gap-1.5 text-[var(--oh-success)]"><RestoreIcon size={16} /> Restore</span>
      <span className="flex items-center gap-1.5 text-[var(--oh-danger)]"><DeleteIcon size={16} /> Delete</span>
    </div>
  );
}

export default function TrashedItemsPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const { items, total, loading, error } = useApiList<TrashedItem>("/api/trashed-items", {
    type: type || undefined,
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
          onChange={setSearch}
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
      <AsyncState loading={loading} error={error} empty={items.length === 0}>
        <ListTable
          columns={[
            { label: "Item" },
            { label: "Type", width: "w-[160px]" },
            { label: "Deleted", width: "w-[180px]" },
            { label: "Actions", align: "right", width: "w-[280px]" },
          ]}
          rows={items.map((it) => [
            it.name ?? "",
            it.itemType ?? "",
            it.deletedAt ?? "",
            <Actions key="a" />,
          ])}
        />
      </AsyncState>
      <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
    </AdminPageLayout>
  );
}
