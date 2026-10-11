"use client";

import { useState } from "react";
import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminSearchInput,
} from "@/components/admin/AdminPageLayout";
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

  const { items, total, loading, error } = useApiList<Promotion>("/api/promotions", {
    name: debouncedSearch || undefined,
    page,
    size: PAGE_SIZE,
  });

  return (
    <AdminPageLayout
      title="Promotions"
      subtitle="Create and manage promotional campaigns"
      count={total}
      actions={
        <AdminPrimaryButton>
          <PlusIcon size={16} /> Add Promotion
        </AdminPrimaryButton>
      }
      search={
        <AdminSearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search promotions…"
        />
      }
      filters={
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col">
            <span className="mb-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)]">Show Inactive</span>
            <span className="flex items-center gap-3">
              <span className="flex h-7 w-12 items-center rounded-full bg-[var(--oh-border)] p-1">
                <span className="h-5 w-5 rounded-full bg-white" />
              </span>
              <span className="text-[13px] text-[var(--oh-muted)]">Inactive promotions are hidden</span>
            </span>
          </div>
          <FilterSelect label="Promotion Categories" />
          <FilterSelect label="Products" />
          <FilterSelect label="Brands" />
          <FilterSelect label="Categories" />
          <AdminSecondaryButton>
            <PlusIcon size={16} /> More Filters
          </AdminSecondaryButton>
        </div>
      }
    >
      <AsyncState loading={loading} error={error} empty={false}>
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
    </AdminPageLayout>
  );
}
