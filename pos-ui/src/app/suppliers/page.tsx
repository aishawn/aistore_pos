"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminSearchInput,
} from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { PlusIcon, EditIcon, AssignIcon, DeleteIcon } from "@/components/icons";

interface Supplier {
  id: string;
  name: string;
  status?: string;
  productCount?: number;
}

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

function Actions({
  supplierId,
  onEdit,
  onAssign,
  onDelete,
}: {
  supplierId: string;
  onEdit: (id: string) => void;
  onAssign: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-14 text-[12px] font-medium">
      <button
        type="button"
        onClick={() => onEdit(supplierId)}
        className="flex items-center gap-1 text-[var(--oh-success)] hover:underline"
      >
        <EditIcon size={14} /> Edit
      </button>
      <button
        type="button"
        onClick={() => onAssign(supplierId)}
        className="flex items-center gap-1 text-[var(--oh-warning)] hover:underline"
      >
        <AssignIcon size={14} /> Assign
      </button>
      <button
        type="button"
        onClick={() => onDelete(supplierId)}
        className="flex items-center gap-1 text-[var(--oh-danger)] hover:underline"
      >
        <DeleteIcon size={14} /> Delete
      </button>
    </div>
  );
}

export default function SuppliersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteBusy, setBatchDeleteBusy] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);

  const { items, total, loading, error, reload } = useApiList<Supplier>("/api/suppliers", {
    name: debouncedSearch || undefined,
    page,
    size: PAGE_SIZE,
  });

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.del(`/api/suppliers/${deleting.id}`);
      setDeleting(null);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete supplier");
    } finally {
      setDeleteBusy(false);
    }
  }

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page]);

  const allPageSelected = items.length > 0 && items.every((s) => selectedIds.has(s.id));
  const hasSelection = selectedIds.size > 0;

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        items.forEach((s) => next.add(s.id));
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

  async function confirmBatchDelete() {
    if (selectedIds.size === 0) return;
    setBatchDeleteBusy(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) => api.del(`/api/suppliers/${id}`)));
      setBatchDeleting(false);
      setSelectedIds(new Set());
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete suppliers");
    } finally {
      setBatchDeleteBusy(false);
    }
  }

  return (
    <AdminPageLayout
      title="Suppliers"
      count={total}
      compact
      actions={
        <AdminPrimaryButton onClick={() => router.push("/suppliers/new")}>
          <PlusIcon size={16} /> Add Supplier
        </AdminPrimaryButton>
      }
      search={
        <AdminSearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search for Suppliers"
        />
      }
    >
      <AsyncState loading={loading} error={error} empty={items.length === 0}>
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
          compact
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
            { label: "No.", align: "center" },
            { label: "Name" },
            { label: "Product Count", align: "center" },
            { label: "Actions", align: "center" },
          ]}
          rows={items.map((s, i) => [
            <input
              key="sel"
              type="checkbox"
              checked={selectedIds.has(s.id)}
              onChange={() => toggleSelect(s.id)}
              aria-label={`Select ${s.name}`}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--oh-orange)]"
            />,
            (page - 1) * PAGE_SIZE + i + 1,
            s.name,
            s.productCount ?? 0,
            <Actions
              key="a"
              supplierId={s.id}
              onEdit={(id) => router.push(`/suppliers/${id}/edit`)}
              onAssign={(id) => router.push(`/suppliers/${id}/assign`)}
              onDelete={(id) => {
                const supplier = items.find((s) => s.id === id);
                if (supplier) setDeleting(supplier);
              }}
            />,
          ])}
        />
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </AsyncState>
      <ConfirmDialog
        open={!!deleting}
        title="Delete Supplier"
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
            ? `Are you sure you want to delete ${selectedIds.size} selected supplier${selectedIds.size === 1 ? "" : "s"}? This action cannot be undone.`
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
    </AdminPageLayout>
  );
}
