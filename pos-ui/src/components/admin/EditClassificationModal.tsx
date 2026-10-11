"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EditIcon } from "@/components/icons";
import { ClassificationFormSelect } from "@/components/admin/ClassificationFormSelect";

const TYPE_LABELS: Record<string, string> = {
  brand: "Brand",
  category: "Category",
  family: "Family",
  tag: "Tag",
};

interface MdbReference {
  id: number;
  name: string;
}

export interface EditClassificationItem {
  id: string;
  name: string;
  mdbId?: number;
}

/** Edit-classification dialog with name and optional MDB reference. */
export function EditClassificationModal({
  open,
  type,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  type: string;
  item: EditClassificationItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [mdbId, setMdbId] = useState("");
  const [mdbOptions, setMdbOptions] = useState<{ label: string; value: string }[]>([]);
  const [mdbLoading, setMdbLoading] = useState(false);
  const [mdbError, setMdbError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeLabel = TYPE_LABELS[type] ?? type;

  const loadMdbReferences = useCallback(async () => {
    setMdbLoading(true);
    setMdbError(null);
    try {
      const items = await api.get<MdbReference[]>(`/api/classifications/${type}/mdb-references`);
      const seen = new Set<string>();
      setMdbOptions(
        items
          .filter((item) => {
            const value = String(item.id);
            if (seen.has(value)) return false;
            seen.add(value);
            return true;
          })
          .map((ref) => ({ label: ref.name, value: String(ref.id) })),
      );
    } catch (e) {
      setMdbOptions([]);
      setMdbError(e instanceof Error ? e.message : "Failed to load references");
    } finally {
      setMdbLoading(false);
    }
  }, [type]);

  useEffect(() => {
    if (!open) return;
    setName(item.name);
    setMdbId(item.mdbId != null ? String(item.mdbId) : "");
    setMdbError(null);
    setError(null);
    void loadMdbReferences();
  }, [open, item, loadMdbReferences]);

  if (!open) return null;

  function close() {
    if (busy) return;
    onClose();
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const body: { name: string; mdbId?: number } = { name: trimmed };
      if (mdbId) body.mdbId = Number(mdbId);
      await api.put(`/api/classifications/${type}/${item.id}`, body);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save classification");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 font-sans"
      onClick={close}
    >
      <div
        className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-white shadow-[var(--oh-shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 bg-[var(--oh-tile-green-bg)] px-5 py-3.5">
          <EditIcon size={18} className="shrink-0 text-[var(--oh-tile-green-text)]" strokeWidth={2} />
          <h2 className="text-[16px] font-semibold text-[var(--oh-tile-green-text)]">Modify {typeLabel}</h2>
        </div>

        <div className="px-5 py-5">
          <div className="flex flex-col gap-2">
            <label className="block text-[14px] font-medium text-[var(--oh-text)]">
              Name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-9 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border-strong)] px-3 text-[14px] text-[var(--oh-text)] outline-none focus:border-[var(--oh-info)] focus:ring-1 focus:ring-[var(--oh-info)]"
              />
            </label>

            <label className="block text-[14px] font-medium text-[var(--oh-text)]">
              Master Database Reference
              <ClassificationFormSelect
                value={mdbId}
                options={mdbOptions}
                loading={mdbLoading}
                onChange={setMdbId}
                onOpen={() => void loadMdbReferences()}
                placeholder="Select..."
              />
            </label>
          </div>

          {(error || mdbError) && (
            <p className="mt-2 text-[13px] text-[var(--oh-danger)]">{error ?? mdbError}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--oh-border)] px-5 py-3.5">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[#d8d8d8] px-4 py-1.5 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[#ccc] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[var(--oh-success)] px-4 py-1.5 text-[14px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
