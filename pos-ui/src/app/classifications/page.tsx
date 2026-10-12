"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminSearchInput,
} from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { AsyncState } from "@/components/admin/AsyncState";
import { CreateClassificationModal } from "@/components/admin/CreateClassificationModal";
import { EditClassificationModal } from "@/components/admin/EditClassificationModal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { AlertDialog } from "@/components/admin/AlertDialog";
import { Pagination } from "@/components/admin/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import {
  ClassificationTypeMultiSelect,
  type ClassificationTypeValue,
} from "@/components/admin/ClassificationTypeMultiSelect";
import { useAiCreateOpen } from "@/hooks/useAiCreateOpen";
import { api } from "@/lib/api";
import { PlusIcon, EditIcon, AssignIcon, DeleteIcon, MenuIcon, XIcon } from "@/components/icons";

interface Classification {
  id: string;
  name: string;
  mdbId?: number;
  productCount?: number;
}

interface ClassificationRow extends Classification {
  type: ClassificationTypeValue;
}

const TYPE_LABELS: Record<ClassificationTypeValue, string> = {
  brand: "Brand",
  category: "Category",
  family: "Family",
  tag: "Tag",
};

const DEFAULT_TYPES: ClassificationTypeValue[] = ["brand", "category", "family", "tag"];
const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const CREATE_TYPE_PRIORITY: ClassificationTypeValue[] = ["category", "family", "brand", "tag"];

function createDefaultType(
  selectedTypes: ClassificationTypeValue[],
  rows: ClassificationRow[],
): ClassificationTypeValue {
  if (selectedTypes.length === 1) return selectedTypes[0];
  for (const type of CREATE_TYPE_PRIORITY) {
    if (selectedTypes.includes(type) && rows.some((row) => row.type === type)) return type;
  }
  return selectedTypes[0] ?? "brand";
}

function rowKey(row: ClassificationRow) {
  return `${row.type}:${row.id}`;
}

function hasLinkedProducts(row: ClassificationRow) {
  return (row.productCount ?? 0) > 0;
}

function deleteBlockedMessage(row: ClassificationRow) {
  const count = row.productCount ?? 0;
  return `"${row.name}" is linked to ${count} product${count === 1 ? "" : "s"} and cannot be deleted. Remove the product associations first.`;
}

function batchDeleteBlockedMessage(rows: ClassificationRow[]) {
  const blocked = rows.filter(hasLinkedProducts);
  if (blocked.length === 0) return null;
  const names = blocked.map((row) => `"${row.name}" (${row.productCount ?? 0})`).join(", ");
  return `The following classifications are linked to products and cannot be deleted: ${names}. Remove the product associations first.`;
}

function Actions({
  onEdit,
  onAssign,
  onDelete,
}: {
  onEdit: () => void;
  onAssign: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-14 text-[12px] font-medium">
      <button type="button" onClick={onEdit} className="flex items-center gap-1 text-[var(--oh-success)]">
        <EditIcon size={14} /> Edit
      </button>
      <button type="button" onClick={onAssign} className="flex items-center gap-1 text-[var(--oh-warning)]">
        <AssignIcon size={14} /> Assign
      </button>
      <button type="button" onClick={onDelete} className="flex items-center gap-1 text-[var(--oh-danger)]">
        <DeleteIcon size={14} /> Delete
      </button>
    </div>
  );
}

export default function ClassificationsPage() {
  return (
    <Suspense fallback={null}>
      <ClassificationsPageInner />
    </Suspense>
  );
}

function ClassificationsPageInner() {
  const router = useRouter();
  const [selectedTypes, setSelectedTypes] = useState<ClassificationTypeValue[]>(DEFAULT_TYPES);
  const [rows, setRows] = useState<ClassificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    creating,
    setCreating,
    initial: classificationPrefill,
    clearInitial: clearClassificationPrefill,
  } = useAiCreateOpen<{ name: string; type: string }>("classification");
  const [editing, setEditing] = useState<ClassificationRow | null>(null);
  const [deleting, setDeleting] = useState<ClassificationRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteBusy, setBatchDeleteBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [alertDialog, setAlertDialog] = useState<{ title: string; message: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function showAlert(message: string, title = "Cannot Delete") {
    setAlertDialog({ title, message });
  }

  const load = useCallback(async () => {
    if (selectedTypes.length === 0) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        selectedTypes.map(async (type) => {
          const items = await api.get<Classification[]>(`/api/classifications/${type}`);
          return items.map((item) => ({ ...item, type }));
        }),
      );
      setRows(results.flat().sort((a, b) => Number(b.id) - Number(a.id)));
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Failed to load classifications");
    } finally {
      setLoading(false);
    }
  }, [selectedTypes]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedTypes]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [page]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.del(`/api/classifications/${deleting.type}/${deleting.id}`);
      setDeleting(null);
      void load();
    } catch (e) {
      showAlert(e instanceof Error ? e.message : "Failed to delete", "Delete Failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  function requestDelete(row: ClassificationRow) {
    if (hasLinkedProducts(row)) {
      showAlert(deleteBlockedMessage(row));
      return;
    }
    setDeleting(row);
  }

  function requestBatchDelete() {
    const targets = rows.filter((row) => selectedKeys.has(rowKey(row)));
    const blockedMessage = batchDeleteBlockedMessage(targets);
    if (blockedMessage) {
      showAlert(blockedMessage);
      return;
    }
    setBatchDeleting(true);
  }

  async function confirmBatchDelete() {
    if (selectedKeys.size === 0) return;
    const targets = rows.filter((row) => selectedKeys.has(rowKey(row)));
    const blockedMessage = batchDeleteBlockedMessage(targets);
    if (blockedMessage) {
      showAlert(blockedMessage);
      return;
    }
    setBatchDeleteBusy(true);
    try {
      await Promise.all(
        targets.map((row) => api.del(`/api/classifications/${row.type}/${row.id}`)),
      );
      setBatchDeleting(false);
      setSelectedKeys(new Set());
      void load();
    } catch (e) {
      showAlert(
        e instanceof Error ? e.message : "Failed to delete classifications",
        "Delete Failed",
      );
    } finally {
      setBatchDeleteBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(q));
  }, [rows, search]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const createDefaultClassificationType = useMemo(
    () => createDefaultType(selectedTypes, rows),
    [selectedTypes, rows],
  );

  const allPageSelected = paged.length > 0 && paged.every((row) => selectedKeys.has(rowKey(row)));
  const hasSelection = selectedKeys.size > 0;
  const hasActiveFilters =
    selectedTypes.length !== DEFAULT_TYPES.length ||
    DEFAULT_TYPES.some((type) => !selectedTypes.includes(type));

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        paged.forEach((row) => next.delete(rowKey(row)));
        return next;
      });
    } else {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        paged.forEach((row) => next.add(rowKey(row)));
        return next;
      });
    }
  }

  function toggleSelect(row: ClassificationRow) {
    const key = rowKey(row);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <AdminPageLayout
      title="Classifications"
      subtitle="Manage brands, categories, families, and tags"
      search={
        <AdminSearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search classifications…"
        />
      }
      actions={
        <>
          <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-4 py-2 text-center shadow-[var(--oh-shadow-card)]">
            <div className="text-[22px] font-bold leading-none text-[var(--oh-text)]">{filtered.length}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
              Results
            </div>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              aria-label="Menu"
              className="relative flex h-10 items-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-3 text-[13px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[var(--oh-primary-hover)]"
            >
              {menuOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
              Menu
              {hasActiveFilters && !menuOpen && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--oh-danger)] ring-2 ring-[var(--oh-surface)]" />
              )}
            </button>

            {menuOpen && (
              <div
                role="dialog"
                aria-label="Classifications menu"
                className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(420px,calc(100vw-2.5rem))] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-6 py-5 shadow-[var(--oh-shadow-card)]"
              >
                <div className="flex flex-wrap gap-2">
                  <AdminPrimaryButton
                    onClick={() => {
                      setMenuOpen(false);
                      clearClassificationPrefill();
                      setCreating(true);
                    }}
                  >
                    <PlusIcon size={16} /> Add Classification
                  </AdminPrimaryButton>
                </div>

                <div className="mt-5 border-t border-[var(--oh-border)] pt-5">
                  <ClassificationTypeMultiSelect
                    embedded
                    values={selectedTypes}
                    onChange={(values) => {
                      setSelectedTypes(values);
                      setPage(1);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      }
    >
      <div className="mb-2.5 flex items-center justify-end">
        <button
          type="button"
          onClick={requestBatchDelete}
          disabled={!hasSelection}
          className="rounded-[var(--oh-radius)] bg-[var(--oh-danger)] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#c62828] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Batch Delete{hasSelection ? ` (${selectedKeys.size})` : ""}
        </button>
      </div>

      <AsyncState loading={loading} error={error} empty={filtered.length === 0}>
        <ListTable
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
            { label: "Type" },
            { label: "Product Count", align: "center" },
            { label: "Actions", align: "center" },
          ]}
          rows={paged.map((row, i) => [
            <input
              key="sel"
              type="checkbox"
              checked={selectedKeys.has(rowKey(row))}
              onChange={() => toggleSelect(row)}
              aria-label={`Select ${row.name}`}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--oh-orange)]"
            />,
            (page - 1) * PAGE_SIZE + i + 1,
            row.name,
            TYPE_LABELS[row.type],
            row.productCount ?? 0,
            <Actions
              key="a"
              onEdit={() => setEditing(row)}
              onAssign={() => router.push(`/classifications/${row.type}/${row.id}/assign`)}
              onDelete={() => requestDelete(row)}
            />,
          ])}
        />
      </AsyncState>
      <Pagination page={page} size={PAGE_SIZE} total={filtered.length} onPage={setPage} />

      {creating && (
        <CreateClassificationModal
          open={creating}
          defaultType={
            (classificationPrefill?.type as ClassificationTypeValue) ||
            createDefaultClassificationType
          }
          initialName={classificationPrefill?.name}
          onClose={() => {
            clearClassificationPrefill();
            setCreating(false);
          }}
          onCreated={load}
        />
      )}
      {editing && (
        <EditClassificationModal
          open={!!editing}
          type={editing.type}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Delete Classification"
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
            ? `Are you sure you want to delete ${selectedKeys.size} selected classification${selectedKeys.size === 1 ? "" : "s"}? This action cannot be undone.`
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
        open={!!alertDialog}
        title={alertDialog?.title ?? ""}
        message={alertDialog?.message ?? ""}
        onClose={() => setAlertDialog(null)}
      />
    </AdminPageLayout>
  );
}
