"use client";

import { Suspense, useEffect, useState } from "react";
import { SadEmptyState } from "@/components/admin/SadEmptyState";
import { AsyncState } from "@/components/admin/AsyncState";
import { ListTable } from "@/components/admin/ListTable";
import { CreatePriceListModal } from "@/components/admin/CreatePriceListModal";
import { EntityFormModal, FormField } from "@/components/admin/EntityFormModal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { RowActions } from "@/components/admin/RowActions";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { useAiCreateOpen } from "@/hooks/useAiCreateOpen";
import { api } from "@/lib/api";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { PlusIcon } from "@/components/icons";

interface PriceList {
  id: string;
  name: string;
  allowHigherPrice?: boolean;
  allowDiscountingPromotions?: boolean;
}

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

const EDIT_FIELDS: FormField[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "allowHigherPrice", label: "Allow Higher Price", type: "checkbox" },
  { name: "allowDiscountingPromotions", label: "Allow Discounts & Promotions", type: "checkbox" },
];

function PriceListsPageInner() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { creating, setCreating, initial, clearInitial } = useAiCreateOpen<{ name: string }>(
    "price_list",
  );
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [deleting, setDeleting] = useState<PriceList | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteBusy, setBatchDeleteBusy] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);
  const { items, total, loading, error, reload } = useApiList<PriceList>("/api/price-lists", {
    name: debouncedSearch || undefined,
    page,
    size: PAGE_SIZE,
  });

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page]);

  const allPageSelected = items.length > 0 && items.every((p) => selectedIds.has(p.id));
  const hasSelection = selectedIds.size > 0;

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((p) => next.add(p.id));
        return next;
      });
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.del(`/api/price-lists/${deleting.id}`);
      setDeleting(null);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete price list");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmBatchDelete() {
    if (selectedIds.size === 0) return;
    setBatchDeleteBusy(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => api.del(`/api/price-lists/${id}`)));
      setBatchDeleting(false);
      setSelectedIds(new Set());
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete price lists");
    } finally {
      setBatchDeleteBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => {
            clearInitial();
            setCreating(true);
          }}
          className="flex items-center gap-2 rounded bg-[var(--oh-orange)] px-6 py-3 text-[16px] font-bold text-white transition-colors hover:bg-[var(--oh-orange-hover)]"
        >
          <PlusIcon size={18} /> Add Price List
        </button>
        <div className="ml-auto text-center leading-none">
          <div className="text-[28px] font-bold text-black">{total}</div>
          <div className="text-[14px] text-black">Results</div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-neutral-300 p-3">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search for Price List"
          className="w-full text-[16px] outline-none placeholder:text-neutral-400"
        />
      </div>

      <AsyncState loading={loading} error={error} empty={items.length === 0}>
        {items.length === 0 ? (
          <SadEmptyState message="We probably shouldn't start a private investigation company" />
        ) : (
          <div className="mt-4">
            <div className="mb-2.5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setBatchDeleting(true)}
                disabled={!hasSelection}
                className="rounded-md bg-[var(--oh-danger)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Batch Delete{hasSelection ? ` (${selectedIds.size})` : ""}
              </button>
            </div>
            <ListTable
              headerClassName="bg-black"
              columns={[
                {
                  label: (
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all on page"
                      className="h-3.5 w-3.5 cursor-pointer accent-white"
                    />
                  ),
                  align: "center",
                  width: "w-[44px]",
                },
                { label: "Price List" },
                { label: "Allow Higher Price" },
                { label: "Allow Discounts & Promotions" },
                { label: "Actions", align: "center", width: "w-[200px]" },
              ]}
              rows={items.map((p) => [
                <input
                  key="sel"
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  aria-label={`Select ${p.name}`}
                  className="h-3.5 w-3.5 cursor-pointer accent-[var(--oh-orange)]"
                />,
                p.name,
                <span key="higher" className="text-[var(--sf-tab-blue)]">
                  {p.allowHigherPrice ? "Yes" : "No"}
                </span>,
                <span key="discount" className="text-[var(--sf-tab-blue)]">
                  {p.allowDiscountingPromotions ? "Yes" : "No"}
                </span>,
                <RowActions
                  key="a"
                  justify="center"
                  onEdit={() => setEditing(p)}
                  onDelete={() => setDeleting(p)}
                />,
              ])}
            />
            <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
          </div>
        )}
      </AsyncState>

      <CreatePriceListModal
        open={creating}
        initialName={initial?.name}
        onClose={() => {
          clearInitial();
          setCreating(false);
        }}
        onCreated={reload}
      />

      {editing && (
        <EntityFormModal
          key={editing.id}
          title="Edit Price List"
          fields={EDIT_FIELDS}
          initial={{
            name: editing.name,
            allowHigherPrice: editing.allowHigherPrice ?? false,
            allowDiscountingPromotions: editing.allowDiscountingPromotions ?? false,
          }}
          onClose={() => setEditing(null)}
          onSubmit={async (v) => {
            const name = String(v.name).trim();
            if (!name) throw new Error("Name is required.");
            await api.put(`/api/price-lists/${editing.id}`, {
              name,
              allowHigherPrice: Boolean(v.allowHigherPrice),
              allowDiscountingPromotions: Boolean(v.allowDiscountingPromotions),
            });
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete Price List"
        message={
          deleting
            ? `Are you sure you want to delete "${deleting.name}"? This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleteBusy) setDeleting(null);
        }}
      />

      <ConfirmDialog
        open={batchDeleting}
        title="Batch Delete"
        message={
          hasSelection
            ? `Are you sure you want to delete ${selectedIds.size} selected price list${selectedIds.size === 1 ? "" : "s"}? This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        busy={batchDeleteBusy}
        onConfirm={() => void confirmBatchDelete()}
        onCancel={() => {
          if (!batchDeleteBusy) setBatchDeleting(false);
        }}
      />
    </div>
  );
}

export default function PriceListsPage() {
  return (
    <Suspense fallback={null}>
      <PriceListsPageInner />
    </Suspense>
  );
}
