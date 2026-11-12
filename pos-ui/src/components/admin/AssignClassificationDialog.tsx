"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useApi, useDebouncedValue } from "@/hooks/useApi";
import { AdminSearchInput } from "@/components/admin/AdminPageLayout";
import { FilterSelect, type SelectOption } from "@/components/admin/FilterSelect";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { useDialogFocus } from "@/hooks/useDialogFocus";

type Product = { id: string; name: string };
type Page<T> = { items: T[]; total: number };

const PAGE_SIZE = 500;

/** Nested assign dialog kept inside the classifications modal. */
export function AssignClassificationDialog({
  type,
  id,
  name,
  onClose,
  onSaved,
}: {
  type: string;
  id: string;
  name: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const titleId = useId();
  const categories = useApi<{ id: string; name: string }[]>("/api/classifications/category");
  const [assigned, setAssigned] = useState<Product[]>([]);
  const [available, setAvailable] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const availableRequestRef = useRef(0);
  const debouncedSearch = useDebouncedValue(search, 300);

  useDialogFocus(true, () => {
    if (!busy) onClose();
  }, "classification-assign");

  const categoryOptions: SelectOption[] = useMemo(
    () => (categories.data ?? []).map((item) => ({ label: item.name, value: item.id })),
    [categories.data],
  );

  const loadAssigned = useCallback(async () => {
    const query: Record<string, string | number | boolean> = { page: 1, size: PAGE_SIZE };
    if (type === "brand") query.brandId = id;
    else if (type === "category") query.categoryId = id;
    else if (type === "family") query.familyId = id;
    else if (type === "tag") query.tagId = id;
    const page = await api.get<Page<Product>>("/api/products", query);
    setAssigned(page.items);
    return page.items;
  }, [type, id]);

  const loadAvailable = useCallback(
    async (assignedItems: Product[]) => {
      const requestId = ++availableRequestRef.current;
      const query: Record<string, string | number | boolean> = { page: 1, size: PAGE_SIZE };
      if (debouncedSearch) query.name = debouncedSearch;
      if (categoryId) query.categoryId = categoryId;
      if (type === "brand") {
        if (onlyUnassigned) query.withoutBrand = true;
        else query.excludeBrandId = id;
      }
      const page = await api.get<Page<Product>>("/api/products", query);
      const assignedIds = new Set(assignedItems.map((item) => item.id));
      if (requestId === availableRequestRef.current) {
        setAvailable(page.items.filter((item) => !assignedIds.has(item.id)));
      }
    },
    [type, id, debouncedSearch, categoryId, onlyUnassigned],
  );

  const loadLists = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const assignedItems = await loadAssigned();
      await loadAvailable(assignedItems);
      setDirty(false);
    } catch (cause) {
      setListError(cause instanceof Error ? cause.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [loadAssigned, loadAvailable]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (loading) return;
    void loadAvailable(assigned).catch((cause) => {
      setListError(cause instanceof Error ? cause.message : "Failed to load products");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, categoryId, onlyUnassigned]);

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      await api.put(`/api/classifications/${type}/${id}/products`, {
        productIds: assigned.map((item) => Number(item.id)),
      });
      await onSaved();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Failed to save assignments");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!busy) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-[min(90dvh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--oh-border)] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-xl font-semibold text-[var(--oh-text)]">Assign · {name}</h2>
            <p className="text-sm text-[var(--oh-muted)]">Choose which products use this classification.</p>
          </div>
          <button type="button" disabled={busy} onClick={onClose} className="min-h-10 rounded-lg border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-60">
            Close
          </button>
        </div>

        <div className="grid gap-3 border-b border-[var(--oh-border)] px-5 py-3 md:grid-cols-2">
          <AdminSearchInput value={search} onChange={setSearch} placeholder="Search for Products…" />
          <FilterSelect
            label="Classification"
            placeholder="Filter by Classification…"
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
          />
          {type === "brand" && (
            <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--oh-text-secondary)] md:col-span-2">
              <input type="checkbox" checked={onlyUnassigned} onChange={(event) => setOnlyUnassigned(event.target.checked)} />
              Only show products without a Brand
            </label>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-5 py-3">
          {loading && <p className="text-sm text-[var(--oh-muted)]">Loading products…</p>}
          {listError && <p className="text-sm text-red-700">{listError}</p>}
          {!loading && !listError && (
            <div className="grid h-full min-h-[320px] gap-3 md:grid-cols-2">
              <ProductPane
                title={`Assigned (${assigned.length})`}
                products={assigned}
                action="remove"
                onAction={(product) => {
                  setAssigned((prev) => prev.filter((item) => item.id !== product.id));
                  setAvailable((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
                  setDirty(true);
                }}
                emptyText="No products assigned yet."
              />
              <ProductPane
                title={`Available (${available.length})`}
                products={available}
                action="add"
                onAction={(product) => {
                  setAvailable((prev) => prev.filter((item) => item.id !== product.id));
                  setAssigned((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
                  setDirty(true);
                }}
                emptyText="No products available to assign."
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--oh-primary)] px-5 py-3 text-white">
          <p className="text-sm text-white/80">
            {assigned.length} product{assigned.length === 1 ? "" : "s"} assigned
            {dirty ? " · unsaved changes" : ""}
          </p>
          <div className="flex items-center gap-3">
            {saveError && <span className="text-sm text-red-200">{saveError}</span>}
            <button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-white/80 hover:text-white disabled:opacity-60">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-lg bg-[var(--oh-info)] px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductPane({
  title,
  products,
  action,
  onAction,
  emptyText,
}: {
  title: string;
  products: Product[];
  action: "add" | "remove";
  onAction: (product: Product) => void;
  emptyText: string;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--oh-border)]">
      <div className="border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-sm font-semibold text-[var(--oh-text)]">{title}</div>
      <ul className="min-h-0 flex-1 overflow-auto">
        {products.map((product) => (
          <li key={product.id} className="flex items-center justify-between gap-2 border-b border-[var(--oh-border)] px-3 py-2 text-sm last:border-b-0">
            <span className="min-w-0 flex-1 truncate text-[var(--oh-text)]">{product.name}</span>
            <button
              type="button"
              onClick={() => onAction(product)}
              className={`inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold ${
                action === "add" ? "text-[#16a34a]" : "text-[#dc2626]"
              }`}
            >
              {action === "add" ? <PlusIcon size={14} /> : <MinusIcon size={14} />}
              {action === "add" ? "Add" : "Remove"}
            </button>
          </li>
        ))}
        {!products.length && <li className="px-3 py-6 text-sm text-[var(--oh-muted)]">{emptyText}</li>}
      </ul>
    </div>
  );
}
