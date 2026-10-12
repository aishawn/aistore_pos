"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AsyncState } from "@/components/admin/AsyncState";
import { api, searchProducts, type SellProductHit } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import {
  BG_PRESETS,
  createBlankKey,
  parseSaleKeys,
} from "@/lib/sale-keys-data";
import type { SaleKey } from "@/types/orithos";
import { SaleKeyGrid } from "@/components/SaleKeyGrid";
import {
  DeleteIcon,
  PlusIcon,
  SaveIcon,
  SelectChevronIcon,
  XIcon,
} from "@/components/icons";
interface SaleKeysSet {
  id: number;
  name: string;
  saleKeys?: string | SaleKey[] | null;
}

const BASE = "/api/sale-keys";

export function EditSaleKeysPage({ setId }: { setId: string }) {
  const router = useRouter();
  const id = Number(setId);
  const { data, loading, error } = useApi<SaleKeysSet>(`${BASE}/${id}`);
  const { data: allSets } = useApi<SaleKeysSet[]>(BASE);

  const [name, setName] = useState("");
  const [keys, setKeys] = useState<SaleKey[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<SellProductHit[]>([]);

  useEffect(() => {
    if (!data) return;
    setName(data.name ?? "");
    setKeys(parseSaleKeys(data.saleKeys));
    setSelectedId(null);
    setDirty(false);
  }, [data]);

  const selectedKey = useMemo(
    () => keys.find((k) => k.id === selectedId) ?? null,
    [keys, selectedId],
  );

  function updateKey(id: string, patch: Partial<SaleKey>) {
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
    setDirty(true);
  }

  function addKey() {
    const blank = createBlankKey(keys);
    if (!blank) {
      window.alert("No empty space left on the grid.");
      return;
    }
    setKeys((prev) => [...prev, blank]);
    setSelectedId(blank.id);
    setDirty(true);
  }

  function removeSelected() {
    if (!selectedId) return;
    setKeys((prev) => prev.filter((k) => k.id !== selectedId));
    setSelectedId(null);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await api.put(`${BASE}/${id}`, {
        name,
        saleKeys: JSON.stringify(keys),
      });
      setDirty(false);
      router.push("/settings/keys");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    router.push("/settings/keys");
  }

  function switchSet(nextId: string) {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    router.push(`/settings/keys/${nextId}/edit`);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      <div className="shrink-0 border-b border-neutral-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-bold text-black">Modify Sale Key —</h1>
          <div className="relative min-w-[220px]">
            <select
              value={String(id)}
              onChange={(e) => switchSet(e.target.value)}
              className="h-[44px] w-full appearance-none rounded-lg border border-neutral-300 bg-white pl-4 pr-10 text-[16px] text-black outline-none focus:border-[#5cb3e0]"
            >
              {(allSets ?? []).map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
            <SelectChevronIcon
              size={18}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
            />
          </div>
        </div>
      </div>

      <AsyncState loading={loading} error={error} empty={false}>
        <div className="flex min-h-0 flex-1">
          <div
            className="relative min-w-0 flex-1 bg-[var(--sf-pad-bg)] p-4"
            onClick={() => setSelectedId(null)}
          >
            <div className="relative mx-auto aspect-square h-full w-full max-w-[960px]">
              <SaleKeyGrid
                keys={keys}
                selectedId={selectedId}
                onSelect={setSelectedId}
                className="h-full"
              />
            </div>
          </div>

          <aside className="flex w-[300px] shrink-0 flex-col border-l border-neutral-200 bg-white">
            <div className="space-y-3 border-b border-neutral-200 p-4">
              <button
                type="button"
                onClick={addKey}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[#3cb44b] px-4 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#35a042]"
              >
                <PlusIcon size={18} /> Add Sale Key
              </button>
              <button
                type="button"
                onClick={removeSelected}
                disabled={!selectedKey}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 px-4 py-2.5 text-[15px] font-semibold text-neutral-500 transition-colors enabled:hover:border-neutral-400 enabled:hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                <DeleteIcon size={18} /> Remove Sale Key
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selectedKey ? (
                <div className="space-y-4">
                  <h2 className="text-[16px] font-bold text-black">Key Properties</h2>
                  <label className="block">
                    <span className="mb-1 block text-[14px] font-medium text-neutral-600">Set name</span>
                    <input
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setDirty(true);
                      }}
                      className="h-[44px] w-full rounded-lg border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[14px] font-medium text-neutral-600">Label</span>
                    <input
                      value={selectedKey.label ?? ""}
                      onChange={(e) => updateKey(selectedKey.id, { label: e.target.value })}
                      className="h-[44px] w-full rounded-lg border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[14px] font-medium text-neutral-600">Background</span>
                    <select
                      value={selectedKey.bg}
                      onChange={(e) => updateKey(selectedKey.id, { bg: e.target.value })}
                      className="h-[44px] w-full rounded-lg border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
                    >
                      {BG_PRESETS.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-[14px] font-medium text-neutral-600">Column</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={selectedKey.colStart}
                        onChange={(e) =>
                          updateKey(selectedKey.id, { colStart: Number(e.target.value) || 1 })
                        }
                        className="h-[44px] w-full rounded-lg border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[14px] font-medium text-neutral-600">Row</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={selectedKey.rowStart}
                        onChange={(e) =>
                          updateKey(selectedKey.id, { rowStart: Number(e.target.value) || 1 })
                        }
                        className="h-[44px] w-full rounded-lg border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[14px] font-medium text-neutral-600">Width</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={selectedKey.colSpan}
                        onChange={(e) =>
                          updateKey(selectedKey.id, { colSpan: Number(e.target.value) || 1 })
                        }
                        className="h-[44px] w-full rounded-lg border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[14px] font-medium text-neutral-600">Height</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={selectedKey.rowSpan}
                        onChange={(e) =>
                          updateKey(selectedKey.id, { rowSpan: Number(e.target.value) || 1 })
                        }
                        className="h-[44px] w-full rounded-lg border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
                      />
                    </label>
                  </div>
                  <p className="text-[12px] leading-relaxed text-neutral-500">
                    Row 1 (columns 1–5) is reserved for Beer, Wines, Spirits, Products, and Promotions.
                    Custom keys start from row 2. Width and Height are grid cells (1–10).
                  </p>
                </div>
              ) : (
                <div className="flex h-full min-h-[200px] items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 px-4 text-center text-[14px] text-neutral-500">
                  Select a sale key on the grid to edit its properties, or add a new key.
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-neutral-200 p-4">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#2c8fe0] px-4 py-3 text-[16px] font-medium text-white transition-colors hover:bg-[#2680cc] disabled:opacity-60"
              >
                <SaveIcon size={18} /> Save
              </button>
              <button
                type="button"
                onClick={cancel}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-3 text-[16px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
              >
                <XIcon size={18} /> Cancel
              </button>
            </div>
          </aside>
        </div>
      </AsyncState>
    </div>
  );
}
