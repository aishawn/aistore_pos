"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useDebouncedValue } from "@/hooks/useApi";
import { AdminSearchInput } from "@/components/admin/AdminPageLayout";
import { FilterSelect, SelectOption } from "@/components/admin/FilterSelect";
import { AsyncDependencyNotice, AsyncState } from "@/components/admin/AsyncState";
import { ArrowLeftIcon, MinusIcon, PlusIcon } from "@/components/icons";

interface Product {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Page<T> {
  items: T[];
  total: number;
}

const PAGE_SIZE = 500;

function ProductRow({
  product,
  action,
  onAction,
}: {
  product: Product;
  action: "add" | "remove";
  onAction: (product: Product) => void;
}) {
  const isAdd = action === "add";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-2.5 last:border-b-0 odd:bg-white even:bg-[var(--oh-surface)]">
      <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--oh-text)]">{product.name}</span>
      <button
        type="button"
        onClick={() => onAction(product)}
        aria-label={isAdd ? "Assign product" : "Unassign product"}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] ${
          isAdd
            ? "bg-[var(--oh-info)] text-white hover:opacity-90"
            : "bg-[var(--oh-danger)] text-white hover:opacity-90"
        }`}
      >
        {isAdd ? <PlusIcon size={16} /> : <MinusIcon size={16} />}
      </button>
    </div>
  );
}

function ProductPane({
  products,
  action,
  onAction,
  emptyText,
}: {
  products: Product[];
  action: "add" | "remove";
  onAction: (product: Product) => void;
  emptyText: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {products.length === 0 ? (
          <p className="px-4 py-8 text-center text-[14px] text-[var(--oh-muted)]">{emptyText}</p>
        ) : (
          products.map((product) => (
            <ProductRow key={product.id} product={product} action={action} onAction={onAction} />
          ))
        )}
      </div>
    </div>
  );
}

/** Dual-pane product assignment screen for a supplier. */
export function AssignSupplierPage({ id }: { id: string }) {
  const router = useRouter();

  const supplier = useApi<Supplier>(`/api/suppliers/${id}`);
  const categories = useApi<{ id: string; name: string }[]>("/api/classifications/category");

  const [assigned, setAssigned] = useState<Product[]>([]);
  const [available, setAvailable] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loadingLists, setLoadingLists] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const availableRequestRef = useRef(0);

  const debouncedSearch = useDebouncedValue(search, 300);

  const categoryOptions: SelectOption[] = useMemo(
    () => (categories.data ?? []).map((c) => ({ label: c.name, value: c.id })),
    [categories.data],
  );

  const loadAssigned = useCallback(async () => {
    const assignedPage = await api.get<Page<Product>>("/api/products", {
      page: 1,
      size: PAGE_SIZE,
      supplierId: id,
    });
    setAssigned(assignedPage.items);
    return assignedPage.items;
  }, [id]);

  const loadAvailable = useCallback(
    async (assignedItems: Product[]) => {
      const requestId = ++availableRequestRef.current;
      const availableQuery: Record<string, string | number> = {
        page: 1,
        size: PAGE_SIZE,
        excludeSupplierId: id,
      };
      if (debouncedSearch) availableQuery.name = debouncedSearch;
      if (categoryId) availableQuery.categoryId = categoryId;

      const availablePage = await api.get<Page<Product>>("/api/products", availableQuery);
      const assignedIds = new Set(assignedItems.map((p) => p.id));
      if (requestId === availableRequestRef.current) {
        setAvailable(availablePage.items.filter((p) => !assignedIds.has(p.id)));
      }
    },
    [id, debouncedSearch, categoryId],
  );

  const loadLists = useCallback(async () => {
    setLoadingLists(true);
    setListError(null);
    try {
      const assignedItems = await loadAssigned();
      await loadAvailable(assignedItems);
      setDirty(false);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoadingLists(false);
    }
  }, [loadAssigned, loadAvailable]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (loadingLists) return;
    void loadAvailable(assigned).catch((e) => {
      setListError(e instanceof Error ? e.message : "Failed to load products");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, categoryId]);

  function assignProduct(product: Product) {
    setAssigned((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
    setAvailable((prev) => prev.filter((p) => p.id !== product.id));
    setDirty(true);
  }

  function unassignProduct(product: Product) {
    setAvailable((prev) => [...prev, product].sort((a, b) => a.name.localeCompare(b.name)));
    setAssigned((prev) => prev.filter((p) => p.id !== product.id));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      await api.put(`/api/suppliers/${id}/products`, {
        productIds: assigned.map((p) => Number(p.id)),
      });
      router.push("/suppliers");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save assignments");
    } finally {
      setBusy(false);
    }
  }

  const title = supplier.data?.name ?? "…";

  return (
    <div className="flex h-full flex-col bg-[var(--oh-surface)] font-sans">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/suppliers")}
            aria-label="Go back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--oh-radius)] text-[var(--oh-muted)] transition-colors hover:bg-white hover:text-[var(--oh-text)]"
          >
            <ArrowLeftIcon size={20} />
          </button>
          <h1 className="text-[26px] font-bold text-[var(--oh-text)]">{title}</h1>
        </div>
      </div>

      <div className="grid gap-3 px-5 pb-4 md:grid-cols-2 md:px-6">
        <AdminSearchInput value={search} onChange={setSearch} placeholder="Search for Products…" />
        <FilterSelect
          label="Classification"
          placeholder="Filter by Classification…"
          options={categoryOptions}
          value={categoryId}
          onChange={setCategoryId}
        />
      </div>

      <div className="px-5 md:px-6">
        <AsyncDependencyNotice dependencies={[{ label: "Classifications", error: categories.error, onRetry: categories.reload }]} />
      </div>

      <div className="min-h-0 flex-1 px-5 pb-4 md:px-6">
        <AsyncState
          loading={loadingLists || supplier.loading}
          error={listError ?? supplier.error}
          empty={false}
          onRetry={() => {
            supplier.reload();
            void loadLists();
          }}
        >
          <div className="flex h-full min-h-[360px] gap-3">
            <ProductPane
              products={assigned}
              action="remove"
              onAction={unassignProduct}
              emptyText="No products assigned yet."
            />
            <ProductPane
              products={available}
              action="add"
              onAction={assignProduct}
              emptyText="No products available to assign."
            />
          </div>
        </AsyncState>
      </div>

      <div className="flex items-center justify-between gap-4 bg-[var(--oh-primary)] px-5 py-3 md:px-6">
        <div className="text-[13px] text-white/70">
          {assigned.length} product{assigned.length === 1 ? "" : "s"} assigned
          {dirty && " · unsaved changes"}
        </div>
        <div className="flex items-center gap-3">
          {saveError && <span className="text-[13px] text-red-300">{saveError}</span>}
          <button
            type="button"
            onClick={() => router.push("/suppliers")}
            disabled={busy}
            className="rounded-[var(--oh-radius)] px-4 py-2 text-[14px] font-medium text-white/80 transition-colors hover:text-white disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[var(--oh-info)] px-6 py-2 text-[14px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
