"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { QuestionIcon } from "@/components/icons";
import { ClassificationFormSelect } from "@/components/admin/ClassificationFormSelect";

const TYPES = [
  { label: "Brand", value: "brand" },
  { label: "Category", value: "category" },
  { label: "Family", value: "family" },
  { label: "Tag", value: "tag" },
] as const;

type ClassificationType = (typeof TYPES)[number]["value"];

interface MdbReference {
  id: number;
  name: string;
}

function mapMdbOptions(items: MdbReference[]) {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const value = String(item.id);
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .map((item) => ({ label: item.name, value: String(item.id) }));
}

/** Create-classification dialog with type tabs, name, and optional MDB reference. */
export function CreateClassificationModal({
  open,
  defaultType = "brand",
  initialName,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultType?: ClassificationType;
  initialName?: string | null;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [type, setType] = useState<ClassificationType>(defaultType);
  const [name, setName] = useState("");
  const [mdbId, setMdbId] = useState("");
  const [mdbOptions, setMdbOptions] = useState<{ label: string; value: string }[]>([]);
  const [mdbLoading, setMdbLoading] = useState(false);
  const [mdbError, setMdbError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mdbRequestTypeRef = useRef<ClassificationType>(defaultType);

  const loadMdbReferences = useCallback(async (classificationType: ClassificationType) => {
    mdbRequestTypeRef.current = classificationType;
    setMdbLoading(true);
    setMdbError(null);
    try {
      const items = await api.get<MdbReference[]>(`/api/classifications/${classificationType}/mdb-references`);
      if (mdbRequestTypeRef.current !== classificationType) return;
      setMdbOptions(mapMdbOptions(items));
    } catch (e) {
      if (mdbRequestTypeRef.current !== classificationType) return;
      setMdbOptions([]);
      setMdbError(e instanceof Error ? e.message : "Failed to load references");
    } finally {
      if (mdbRequestTypeRef.current === classificationType) {
        setMdbLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setType(defaultType);
    setName(initialName?.trim() ?? "");
    setMdbId("");
    setMdbError(null);
    setError(null);
    void loadMdbReferences(defaultType);
  }, [open, defaultType, initialName, loadMdbReferences]);

  function selectType(next: ClassificationType) {
    if (next === type) return;
    setType(next);
    setMdbId("");
    setMdbOptions([]);
    setMdbError(null);
    void loadMdbReferences(next);
  }

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
      await api.post(`/api/classifications/${type}`, body);
      onClose();
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create classification");
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
        {/* Header */}
        <div className="flex items-center gap-2 bg-[var(--oh-tile-blue-bg)] px-5 py-3.5">
          <QuestionIcon size={18} className="shrink-0 text-[var(--oh-tile-blue-text)]" strokeWidth={2} />
          <h2 className="text-[16px] font-semibold text-[var(--oh-tile-blue-text)]">Create New Classification</h2>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {/* Type tabs */}
          <div className="flex rounded-full bg-[var(--oh-surface)] p-0.5">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => selectType(t.value)}
                className={`flex-1 rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                  type === t.value
                    ? "bg-[#00a3ee] text-white shadow-sm"
                    : "text-[var(--oh-text-secondary)] hover:text-[var(--oh-text)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="mt-2.5 flex flex-col gap-2">
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
                onOpen={() => void loadMdbReferences(type)}
                placeholder="Select..."
              />
            </label>
          </div>

          {(error || mdbError) && (
            <p className="mt-2 text-[13px] text-[var(--oh-danger)]">
              {error ?? mdbError}
            </p>
          )}
        </div>

        {/* Footer */}
        <form
          className="flex justify-end gap-2 border-t border-[var(--oh-border)] px-5 py-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[#d8d8d8] px-4 py-1.5 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[#ccc] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[#00a3ee] px-4 py-1.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#0090d4] disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </form>
      </div>
    </div>
  );
}
