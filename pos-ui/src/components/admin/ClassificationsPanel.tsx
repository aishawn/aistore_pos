"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useApi";
import { Sparkline } from "@/components/admin/Sparkline";
import { CreateClassificationModal } from "@/components/admin/CreateClassificationModal";
import { EditClassificationModal, type EditClassificationItem } from "@/components/admin/EditClassificationModal";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  CLASSIFICATION_TYPE_OPTIONS,
  ClassificationTypeMultiSelect,
  type ClassificationTypeValue,
} from "@/components/admin/ClassificationTypeMultiSelect";
import { AssignIcon, DeleteIcon, EditIcon, PlusIcon, ViewIcon } from "@/components/icons";
import { AssignClassificationDialog } from "@/components/admin/AssignClassificationDialog";
import { ClassificationViewDialog } from "@/components/admin/ClassificationViewDialog";

type ClassificationRow = {
  id: number;
  name: string;
  type: ClassificationTypeValue;
  mdbId?: number | null;
  productCount: number;
  performance30d: number[];
};

type ApiClassification = {
  id: number | string;
  name: string;
  type?: string;
  mdbId?: number | null;
  productCount?: number | null;
  performance30d?: Array<number | string> | null;
};

const TYPE_LABELS: Record<ClassificationTypeValue, string> = {
  brand: "Brand",
  category: "Category",
  family: "Family",
  tag: "Tag",
};

function mapRow(item: ApiClassification, fallbackType: ClassificationTypeValue): ClassificationRow {
  const type = (CLASSIFICATION_TYPE_OPTIONS.some((option) => option.value === item.type)
    ? item.type
    : fallbackType) as ClassificationTypeValue;
  return {
    id: Number(item.id),
    name: item.name,
    type,
    mdbId: item.mdbId ?? null,
    productCount: Number(item.productCount ?? 0),
    performance30d: Array.isArray(item.performance30d)
      ? item.performance30d.map((point) => Number(point) || 0)
      : [],
  };
}

/** Shopfront-style classifications table for the products workspace dialog. */
export function ClassificationsPanel({
  onBusyChange,
  onChanged,
}: {
  onBusyChange?: (busy: boolean) => void;
  onChanged?: () => void;
}) {
  const [types, setTypes] = useState<ClassificationTypeValue[]>(["category"]);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [rows, setRows] = useState<ClassificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<{ type: ClassificationTypeValue; item: EditClassificationItem } | null>(null);
  const [viewing, setViewing] = useState<ClassificationRow | null>(null);
  const [assigning, setAssigning] = useState<ClassificationRow | null>(null);
  const [deleting, setDeleting] = useState<ClassificationRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const selected = types.length ? types : (["brand", "category", "family", "tag"] as ClassificationTypeValue[]);
    setLoading(true);
    setError(null);
    onBusyChange?.(true);
    try {
      const pages = await Promise.all(
        selected.map(async (type) => {
          const items = await api.get<ApiClassification[]>(`/api/classifications/${type}`, {
            name: debouncedQuery.trim() || undefined,
          });
          return (items || []).map((item) => mapRow(item, type));
        }),
      );
      const merged = pages.flat().sort((a, b) => a.name.localeCompare(b.name, "en-AU"));
      setRows(merged);
    } catch (cause) {
      setRows([]);
      setError(cause instanceof Error ? cause.message : "Could not load classifications.");
    } finally {
      setLoading(false);
      onBusyChange?.(false);
    }
  }, [debouncedQuery, onBusyChange, types]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => rows, [rows]);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.del(`/api/classifications/${deleting.type}/${deleting.id}`);
      setDeleting(null);
      await load();
      onChanged?.();
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Could not delete classification.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-[var(--oh-text)]">Classifications</h3>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[#5cb3e0] px-3 text-sm font-semibold text-white hover:bg-[#4aa3d0]"
          >
            <PlusIcon size={16} /> Add Category
          </button>
        </div>
        <p className="text-sm text-[var(--oh-muted)]">
          {loading ? "Loading…" : `${filtered.length.toLocaleString("en-AU")} Results`}
        </p>
      </div>

      <label className="block text-sm font-medium text-[var(--oh-text)]">
        Search
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search classifications…"
          className="mt-1 min-h-11 w-full rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
        />
      </label>

      <ClassificationTypeMultiSelect values={types} onChange={setTypes} defaultOpen />

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
          <button type="button" onClick={() => void load()} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--oh-border)] bg-white">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#5cb3e0] text-white">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Product Count</th>
              <th className="px-4 py-3 font-semibold">Performance</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={`${row.type}-${row.id}`} className="odd:bg-white even:bg-[var(--oh-surface)] border-b border-[var(--oh-border)]">
                <td className="px-4 py-3 font-medium uppercase tracking-wide text-[var(--oh-text)]">{row.name}</td>
                <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{TYPE_LABELS[row.type]}</td>
                <td className="px-4 py-3 tabular-nums text-[var(--oh-text)]">{row.productCount.toLocaleString("en-AU")}</td>
                <td className="px-4 py-3">
                  <Sparkline points={row.performance30d} width={120} height={36} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => setViewing(row)} className="inline-flex items-center gap-1 text-sm font-semibold text-[#3b82f6]">
                      <ViewIcon size={15} /> View
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing({ type: row.type, item: { id: String(row.id), name: row.name, mdbId: row.mdbId ?? undefined } })}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-[#16a34a]"
                    >
                      <EditIcon size={15} /> Edit
                    </button>
                    <button type="button" onClick={() => setAssigning(row)} className="inline-flex items-center gap-1 text-sm font-semibold text-[#f59e0b]">
                      <AssignIcon size={15} /> Assign
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(row);
                      }}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-[#dc2626]"
                    >
                      <DeleteIcon size={15} /> Delete Category
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !filtered.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--oh-muted)]">
                  No classifications match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreateClassificationModal
        open={createOpen}
        defaultType={types[0] ?? "category"}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          await load();
          onChanged?.();
        }}
      />

      {editing && (
        <EditClassificationModal
          open
          type={editing.type}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
            onChanged?.();
          }}
        />
      )}

      {viewing && (
        <ClassificationViewDialog
          row={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing({ type: viewing.type, item: { id: String(viewing.id), name: viewing.name, mdbId: viewing.mdbId ?? undefined } });
            setViewing(null);
          }}
          onAssign={() => {
            setAssigning(viewing);
            setViewing(null);
          }}
        />
      )}

      {assigning && (
        <AssignClassificationDialog
          type={assigning.type}
          id={String(assigning.id)}
          name={assigning.name}
          onClose={() => setAssigning(null)}
          onSaved={async () => {
            setAssigning(null);
            await load();
            onChanged?.();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Category"
        message={deleting ? `Delete “${deleting.name}”? Products must be unassigned first.` : ""}
        confirmLabel="Delete Category"
        variant="danger"
        busy={deleteBusy}
        error={deleteError}
        onCancel={() => {
          if (!deleteBusy) setDeleting(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
