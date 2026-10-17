"use client";

import { Suspense, useEffect, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { AdminPageLayout, AdminPrimaryButton } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { CreatePriceListModal } from "@/components/admin/CreatePriceListModal";
import { EntityFormModal, FormField } from "@/components/admin/EntityFormModal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { AlertDialog } from "@/components/admin/AlertDialog";
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
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      setDeleteError(e instanceof Error ? e.message : "Failed to delete price list");
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
      setDeleteError(e instanceof Error ? e.message : "Failed to delete price lists");
    } finally {
      setBatchDeleteBusy(false);
    }
  }

  return (
      <AdminPageLayout
        title="Price Lists"
        subtitle="Manage reusable pricing groups and discount rules"
        count={loading || error ? undefined : total}
        countLabel="Price lists"
        actions={<AdminPrimaryButton className="min-h-11" onClick={() => { clearInitial(); setCreating(true); }}><PlusIcon size={18} />Add price list</AdminPrimaryButton>}
      >
      <label className="flex min-h-11 items-center gap-2.5 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-muted)] shadow-[var(--oh-shadow-card)] focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
        <Search size={17} aria-hidden="true" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search price lists"
          placeholder="Search price lists"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)]"
        />
      </label>

      {loading ? (
        <div role="status" className="flex flex-col items-center gap-2 py-16 text-sm text-[var(--oh-muted)]">
          <LoaderCircle size={20} className="animate-spin text-[var(--oh-primary)]" aria-hidden="true" />
          Loading price lists…
        </div>
      ) : error ? (
        <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{error}</div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-white px-5 py-12 text-center">
          <h2 className="text-base font-semibold text-[var(--oh-text)]">{search.trim() ? "No matching price lists" : "No price lists yet"}</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[var(--oh-muted)]">
            {search.trim() ? "Try another search term." : "Create a price list to organise reusable pricing and discount rules."}
          </p>
        </div>
      ) : (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--oh-muted)]">Select one or more lists to remove them together.</p>
              <button
                type="button"
                onClick={() => setBatchDeleting(true)}
                disabled={!hasSelection}
                className="min-h-11 rounded-md bg-[var(--oh-danger)] px-4 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Batch Delete{hasSelection ? ` (${selectedIds.size})` : ""}
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg">
            <div className="min-w-[760px]">
            <ListTable
              headerClassName="bg-[var(--oh-surface)] text-[var(--oh-text-secondary)] ring-1 ring-inset ring-[var(--oh-border)]"
              columns={[
                {
                  label: (
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all on page"
                      className="h-4 w-4 cursor-pointer accent-[var(--oh-primary)]"
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
                  className="h-4 w-4 cursor-pointer accent-[var(--oh-primary)]"
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
            </div>
            </div>
            <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
          </div>
        )}
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
      <AlertDialog
        open={deleteError !== null}
        title="Delete Price List Failed"
        message={deleteError ?? "Unable to delete price list."}
        variant="danger"
        onClose={() => setDeleteError(null)}
      />
      </AdminPageLayout>
  );
}

export default function PriceListsPage() {
  return (
    <Suspense fallback={null}>
      <PriceListsPageInner />
    </Suspense>
  );
}
