"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminSecondaryButton,
  AdminSearchInput,
  AdminRowActions,
} from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { FilterSelect, SelectOption } from "@/components/admin/FilterSelect";
import { FilterMultiSelect } from "@/components/admin/FilterMultiSelect";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { useApi, useApiList, useDebouncedValue } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { CreateProductWizard } from "@/components/admin/CreateProductWizard";
import { ImportProductsModal } from "@/components/admin/ImportProductsModal";
import { PlusIcon, ImportIcon, MergeIcon, ActiveIcon, MenuIcon, XIcon } from "@/components/icons";
import { isZeroPrice } from "@/lib/quantity";
import { isLiquorProduct } from "@/lib/au";

interface Product {
  id: string;
  name: string;
  categoryName?: string;
  brandName?: string;
  cost?: number | null;
  price?: number | null;
  status?: string;
  stockQuantity?: number | null;
  caseQuantity?: number | null;
  abv?: number | null;
  volumeMl?: number | null;
  region?: string | null;
  vintage?: string | null;
}
interface Named {
  id: string;
  name: string;
  productCount?: number;
}

interface ProductFilterOptions {
  brands: Named[];
  categories: Named[];
  families: Named[];
  tags: Named[];
  suppliers: Named[];
  types: Named[];
  taxRates: Named[];
  costTaxRates: Named[];
}

const PAGE_SIZE = 10;

const STATUS_OPTIONS: SelectOption[] = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Archived", value: "ARCHIVED" },
];

function Status({ status }: { status?: string }) {
  const normalized = status?.toUpperCase() ?? "ACTIVE";
  if (normalized === "INACTIVE") {
    return (
      <div className="flex flex-col items-center gap-0.5 text-[13px] leading-none text-[var(--oh-muted)]">
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--oh-muted)]" />
        Inactive
      </div>
    );
  }
  if (normalized === "ARCHIVED") {
    return (
      <div className="flex flex-col items-center gap-0.5 text-[13px] leading-none text-[var(--oh-muted)]">
        <span className="inline-block h-2 w-2 rounded-full bg-[var(--oh-muted)]" />
        Archived
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-0.5 text-[13px] leading-none text-[var(--oh-success)]">
      <ActiveIcon size={16} strokeWidth={1.75} />
      Active
    </div>
  );
}

function isInactive(status?: string) {
  return status?.toUpperCase() === "INACTIVE";
}

function singleDeleteMessage(product: Product) {
  if (isInactive(product.status)) {
    return `Are you sure you want to permanently delete "${product.name}"? This action cannot be undone.`;
  }
  return `Are you sure you want to set "${product.name}" to Inactive? To delete permanently, delete the product again after it has been deactivated.`;
}

function batchDeleteMessage(selectedProducts: Product[]) {
  const inactiveCount = selectedProducts.filter((p) => isInactive(p.status)).length;
  const deactivateCount = selectedProducts.length - inactiveCount;
  if (inactiveCount > 0 && deactivateCount > 0) {
    return `Of the ${selectedProducts.length} selected products, ${deactivateCount} will be set to Inactive and ${inactiveCount} will be permanently deleted. Continue?`;
  }
  if (inactiveCount > 0) {
    return `Are you sure you want to permanently delete ${inactiveCount} inactive product${inactiveCount === 1 ? "" : "s"}? This action cannot be undone.`;
  }
  return `Are you sure you want to set ${deactivateCount} selected product${deactivateCount === 1 ? "" : "s"} to Inactive? To delete permanently, delete them again after they have been deactivated.`;
}

const money = (x?: number | null) => (x === null || x === undefined ? "" : `$${Number(x).toFixed(2)}`);

function PriceCell({ price }: { price?: number | null }) {
  if (!isZeroPrice(price)) return <>{money(price)}</>;
  return (
    <span
      className="inline-flex flex-col items-end leading-tight text-[var(--oh-danger)]"
      title="This product is priced at $0.00 and can be sold for free. Set a price greater than zero before selling it."
    >
      <span className="font-semibold">$0.00</span>
      <span className="text-[13px] font-medium">Zero price</span>
    </span>
  );
}

function splitCasesItems(total?: number | null, caseQuantity?: number | null) {
  const value = Number(total ?? 0);
  const caseQty = Number(caseQuantity ?? 0);
  if (Number.isFinite(caseQty) && caseQty > 0 && Number.isFinite(value)) {
    const cases = Math.floor(value / caseQty);
    return { cases, items: value - cases * caseQty };
  }
  return { cases: 0, items: Number.isFinite(value) ? value : 0 };
}

function formatAbv(p: Product) {
  if (!isLiquorProduct(p.name, p.categoryName)) return "—";
  return p.abv != null && !Number.isNaN(Number(p.abv)) ? `${Number(p.abv).toFixed(1)}%` : "—";
}

function formatVolume(p: Product) {
  if (!isLiquorProduct(p.name, p.categoryName)) return "—";
  return p.volumeMl != null ? `${p.volumeMl} ml` : "—";
}

function formatLiquorText(p: Product, value?: string | null) {
  if (!isLiquorProduct(p.name, p.categoryName)) return "—";
  const text = value?.trim();
  return text ? text : "—";
}

function formatInventory(p: Product) {
  const { cases, items } = splitCasesItems(p.stockQuantity, p.caseQuantity);
  return (
    <span className="text-[13px] leading-tight text-[var(--oh-muted)]">
      {cases} Cases
      <br />
      {items} Items
    </span>
  );
}

function ProductDetails({ product }: { product: Product }) {
  const details = [
    product.categoryName?.trim(),
    formatAbv(product),
    formatVolume(product),
    formatLiquorText(product, product.region),
    formatLiquorText(product, product.vintage),
  ].filter((value): value is string => Boolean(value && value !== "—"));

  return (
    <div className="min-w-0" title={product.name}>
      <div className="truncate text-[13px] font-medium text-[var(--oh-text)]">{product.name}</div>
      {details.length > 0 && (
        <div className="mt-1 truncate text-xs leading-4 text-[var(--oh-muted)]" title={details.join(" · ")}>
          {details.join(" · ")}
        </div>
      )}
    </div>
  );
}
const toOptions = (rows?: Named[] | null): SelectOption[] =>
  (rows ?? []).map((r) => ({
    label: r.productCount != null ? `${r.name} (${r.productCount})` : r.name,
    value: String(r.id),
  }));

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[14px] text-[var(--oh-muted)]">Loading products…</div>}>
      <ProductsPageInner />
    </Suspense>
  );
}

function ProductsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q")?.trim() ?? "";
  const [search, setSearch] = useState(initialQ);
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [tagId, setTagId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [type, setType] = useState("");
  const [taxRateId, setTaxRateId] = useState("");
  const [costTaxRateId, setCostTaxRateId] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [batchDeleteBusy, setBatchDeleteBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = searchParams.get("q")?.trim() ?? "";
    setSearch(q);
    setPage(1);
  }, [searchParams]);

  const debouncedSearch = useDebouncedValue(search, 300);

  const filterOptions = useApi<ProductFilterOptions>("/api/products/filter-options");
  const brands = filterOptions.data?.brands;
  const categories = filterOptions.data?.categories;
  const families = filterOptions.data?.families;
  const tags = filterOptions.data?.tags;
  const suppliers = filterOptions.data?.suppliers;
  const types = filterOptions.data?.types;
  const taxRates = filterOptions.data?.taxRates;
  const costTaxRates = filterOptions.data?.costTaxRates;

  const { items, total, loading, error, reload } = useApiList<Product>("/api/products", {
    name: debouncedSearch.trim() || undefined,
    brandId: brandId || undefined,
    categoryId: categoryId || undefined,
    familyId: familyId || undefined,
    tagId: tagId || undefined,
    supplierId: supplierId || undefined,
    statuses: statuses.length > 0 ? statuses.join(",") : undefined,
    type: type || undefined,
    taxRateId: taxRateId || undefined,
    costTaxRateId: costTaxRateId || undefined,
    page,
    size: PAGE_SIZE,
  });

  const filter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const filterMulti = (setter: (v: string[]) => void) => (v: string[]) => {
    setter(v);
    setPage(1);
  };

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const active = document.activeElement;
        const openListbox = menuRef.current?.querySelector('[role="listbox"]');
        if (openListbox?.contains(active)) return;
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const allPageSelected = items.length > 0 && items.every((p) => selectedIds.has(p.id));
  const hasSelection = selectedIds.size > 0;
  const hasActiveFilters =
    !!brandId ||
    !!categoryId ||
    !!familyId ||
    !!tagId ||
    !!supplierId ||
    statuses.length > 0 ||
    !!type ||
    !!taxRateId ||
    !!costTaxRateId;

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
    setActionError(null);
    try {
      await api.del(`/api/products/${deleting.id}`);
      setDeleting(null);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete product");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmBatchDelete() {
    if (selectedIds.size === 0) return;
    setBatchDeleteBusy(true);
    setActionError(null);
    try {
      await api.post(
        "/api/products/bulk-delete",
        Array.from(selectedIds).map((id) => Number(id)),
      );
      setBatchDeleting(false);
      setSelectedIds(new Set());
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete products");
    } finally {
      setBatchDeleteBusy(false);
    }
  }

  return (
    <AdminPageLayout
      title="Products"
      subtitle="Manage your product catalogue and inventory"
      search={
        <AdminSearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search products by name, SKU, or barcode…"
        />
      }
      actions={
        <>
          <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-4 py-2 text-center shadow-[var(--oh-shadow-card)]">
            <div className="text-[22px] font-bold leading-none text-[var(--oh-text)]">{total}</div>
            <div className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
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
              className="relative flex h-10 items-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-orange)] px-3 text-[13px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[var(--oh-orange-hover)]"
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
                aria-label="Products menu"
                className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(960px,calc(100vw-2.5rem))] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-6 py-5 shadow-[var(--oh-shadow-card)]"
              >
                <div className="flex flex-wrap gap-2">
                  <AdminPrimaryButton
                    onClick={() => {
                      setMenuOpen(false);
                      setCreating(true);
                    }}
                  >
                    <PlusIcon size={16} /> Add Product
                  </AdminPrimaryButton>
                  <AdminSecondaryButton
                    onClick={() => {
                      setMenuOpen(false);
                      setImporting(true);
                    }}
                  >
                    <ImportIcon size={16} /> Import
                  </AdminSecondaryButton>
                  <AdminSecondaryButton
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/products/merge");
                    }}
                  >
                    <MergeIcon size={16} /> Merge
                  </AdminSecondaryButton>
                </div>

                <div className="mt-5 border-t border-[var(--oh-border)] pt-5">
                  <div className="grid grid-cols-3 gap-x-5 gap-y-4">
                    <FilterSelect label="Brand" options={toOptions(brands)} value={brandId} onChange={filter(setBrandId)} />
                    <FilterSelect label="Category" options={toOptions(categories)} value={categoryId} onChange={filter(setCategoryId)} />
                    <FilterSelect label="Family" options={toOptions(families)} value={familyId} onChange={filter(setFamilyId)} />
                    <FilterSelect label="Tag" options={toOptions(tags)} value={tagId} onChange={filter(setTagId)} />
                    <FilterSelect label="Supplier" options={toOptions(suppliers)} value={supplierId} onChange={filter(setSupplierId)} />
                    <FilterMultiSelect
                      label="Status"
                      options={STATUS_OPTIONS}
                      values={statuses}
                      onChange={filterMulti(setStatuses)}
                    />
                    <FilterSelect label="Type" options={toOptions(types)} value={type} onChange={filter(setType)} />
                    <FilterSelect label="Retail Tax Rate" options={toOptions(taxRates)} value={taxRateId} onChange={filter(setTaxRateId)} />
                    <FilterSelect label="Purchase Tax Rate" options={toOptions(costTaxRates)} value={costTaxRateId} onChange={filter(setCostTaxRateId)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      }
    >
      {items.some((p) => isZeroPrice(p.price)) && (
        <div
          role="alert"
          className="mb-2.5 rounded-[var(--oh-radius)] border border-[var(--oh-danger)] bg-[#fdecea] px-3 py-2 text-[13px] text-[var(--oh-danger)]"
        >
          Some products on this page are priced at $0.00 and can be sold for free. Set a price greater than zero before selling them.
        </div>
      )}

      <div className="mb-2.5 flex items-center justify-end">
        <button
          type="button"
          onClick={() => { setActionError(null); setBatchDeleting(true); }}
          disabled={!hasSelection}
          className="rounded-[var(--oh-radius)] bg-[var(--oh-danger)] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#c62828] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Batch Delete{hasSelection ? ` (${selectedIds.size})` : ""}
        </button>
      </div>

      <AsyncState loading={loading} loadingLabel="Loading products" error={error} onRetry={reload} empty={items.length === 0}>
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
            { label: "No.", align: "center", width: "w-[48px]" },
            { label: "Status", align: "center", width: "w-[80px]" },
            { label: "Product" },
            { label: "Cost", align: "right", width: "w-[84px]" },
            { label: "Inventory", align: "center", width: "w-[96px]" },
            { label: "Price", align: "right", width: "w-[88px]" },
            { label: "Actions", align: "center", width: "w-[176px]" },
          ]}
          rows={items.map((p, i) => [
            <input
              key="sel"
              type="checkbox"
              checked={selectedIds.has(p.id)}
              onChange={() => toggleSelect(p.id)}
              aria-label={`Select ${p.name}`}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--oh-orange)]"
            />,
            (page - 1) * PAGE_SIZE + i + 1,
            <Status key="s" status={p.status} />,
            <ProductDetails key="n" product={p} />,
            money(p.cost),
            formatInventory(p),
            <PriceCell key="price" price={p.price} />,
            <div key="a" className="[&_button]:min-h-9 [&_button]:rounded [&_button]:px-1.5 [&_button]:py-2">
              <AdminRowActions
                onView={() => router.push(`/products/${p.id}/view`)}
                onEdit={() => router.push(`/products/${p.id}/edit`)}
                onDelete={() => { setActionError(null); setDeleting(p); }}
              />
            </div>,
          ])}
        />
      </AsyncState>
      <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />

      <ImportProductsModal
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() => {
          setPage(1);
          reload();
        }}
      />

      {creating && (
        <CreateProductWizard
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setPage(1);
            reload();
          }}
          categories={categories}
          families={families}
          tags={tags}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title={deleting && isInactive(deleting.status) ? "Delete Product" : "Deactivate Product"}
        message={deleting ? singleDeleteMessage(deleting) : ""}
        confirmLabel={deleting && isInactive(deleting.status) ? "Delete" : "Deactivate"}
        cancelLabel="Cancel"
        busy={deleteBusy}
        error={actionError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleteBusy) setDeleting(null);
        }}
      />
      <ConfirmDialog
        open={batchDeleting}
        title="Batch Delete"
        message={batchDeleteMessage(items.filter((p) => selectedIds.has(p.id)))}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        busy={batchDeleteBusy}
        error={actionError}
        onConfirm={() => void confirmBatchDelete()}
        onCancel={() => {
          if (!batchDeleteBusy) setBatchDeleting(false);
        }}
      />
    </AdminPageLayout>
  );
}
