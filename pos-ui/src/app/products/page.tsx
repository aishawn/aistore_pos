"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ListTable } from "@/components/admin/ListTable";
import { RowActions } from "@/components/admin/RowActions";
import { FilterSelect, SelectOption } from "@/components/admin/FilterSelect";
import { FilterMultiSelect } from "@/components/admin/FilterMultiSelect";
import { Pagination } from "@/components/admin/Pagination";
import { useApi, useApiList, useDebouncedValue } from "@/hooks/useApi";
import { useAiCreateOpen } from "@/hooks/useAiCreateOpen";
import { api } from "@/lib/api";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { CreateProductWizard } from "@/components/admin/CreateProductWizard";
import {
  PlusIcon,
  MinusIcon,
  ImportIcon,
  MergeIcon,
  ActiveIcon,
} from "@/components/icons";
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

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

const STATUS_OPTIONS: SelectOption[] = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Archived", value: "ARCHIVED" },
];

function Status({ status }: { status?: string }) {
  const normalized = status?.toUpperCase() ?? "ACTIVE";
  if (normalized === "INACTIVE") {
    return (
      <div className="flex flex-col items-center text-[13px] text-neutral-500">
        <span className="mb-1 inline-block h-2.5 w-2.5 rounded-full bg-neutral-400" />
        Inactive
      </div>
    );
  }
  if (normalized === "ARCHIVED") {
    return (
      <div className="flex flex-col items-center text-[13px] text-neutral-500">
        <span className="mb-1 inline-block h-2.5 w-2.5 rounded-full bg-neutral-400" />
        Archived
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center text-[13px] text-black">
      <ActiveIcon size={26} strokeWidth={1.75} />
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
      className="inline-flex flex-col items-end leading-tight text-[#e2231a]"
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
    <span className="leading-tight">
      {cases} Cases
      <br />
      {items} Items
    </span>
  );
}
const toOptions = (rows?: Named[] | null): SelectOption[] =>
  (rows ?? []).map((r) => ({
    label: r.productCount != null ? `${r.name} (${r.productCount})` : r.name,
    value: String(r.id),
  }));

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[14px] text-neutral-500">Loading products…</div>}>
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
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [page, setPage] = useState(1);
  const {
    creating,
    setCreating,
    initial: productPrefill,
    clearInitial: clearProductPrefill,
  } = useAiCreateOpen<{
    barcode: string;
    name: string;
    categoryId: string;
    familyId: string;
    tagId: string;
    caseQuantity: string;
    priceQuantity: string;
    price: string;
  }>("product");
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteBusy, setBatchDeleteBusy] = useState(false);

  useEffect(() => {
    const q = searchParams.get("q")?.trim() ?? "";
    setSearch(q);
    setPage(1);
  }, [searchParams]);

  const debouncedSearch = useDebouncedValue(search, 300);

  // Filter option sources — values actually used by products (includes soft-deleted masters still linked)
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

  // Changing any filter resets to page 1.
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
      await api.del(`/api/products/${deleting.id}`);
      setDeleting(null);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete product");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmBatchDelete() {
    if (selectedIds.size === 0) return;
    setBatchDeleteBusy(true);
    try {
      await api.post(
        "/api/products/bulk-delete",
        Array.from(selectedIds).map((id) => Number(id)),
      );
      setBatchDeleting(false);
      setSelectedIds(new Set());
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete products");
    } finally {
      setBatchDeleteBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      {/* Toolbar */}
      <div className="flex items-center gap-4">
        <h1 className="text-[34px] font-bold text-black">Products</h1>
        <button className="flex items-center gap-2 rounded-md border border-neutral-300 px-5 py-3 text-[16px] font-medium text-black">
          <ImportIcon size={18} /> Import Products
        </button>
        <button className="flex items-center gap-2 rounded-md border border-neutral-300 px-5 py-3 text-[16px] font-medium text-black">
          <MergeIcon size={18} /> Merge Products
        </button>
        <div className="ml-auto text-center leading-none">
          <div className="text-[32px] font-bold text-black">{total}</div>
          <div className="text-[14px] text-black">Results</div>
        </div>
      </div>

      {/* Search */}
      <label className="mt-5 block">
        <span className="text-[16px] text-black">Search</span>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search Products..."
          className="mt-1 h-[56px] w-full rounded-xl border-2 border-black px-4 text-[16px] outline-none placeholder:text-neutral-400"
        />
      </label>

      {/* Filters */}
      <div className="mt-4">
        <div className="flex gap-4">
          <FilterSelect label="Brand" options={toOptions(brands)} value={brandId} onChange={filter(setBrandId)} />
          <FilterSelect label="Category" options={toOptions(categories)} value={categoryId} onChange={filter(setCategoryId)} />
          <FilterSelect label="Family" options={toOptions(families)} value={familyId} onChange={filter(setFamilyId)} />
          <FilterSelect label="Tag" options={toOptions(tags)} value={tagId} onChange={filter(setTagId)} />
          <FilterSelect label="Supplier" options={toOptions(suppliers)} value={supplierId} onChange={filter(setSupplierId)} />
        </div>

        {showMoreFilters && (
          <div className="mt-4 flex gap-4">
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
        )}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={() => setShowMoreFilters((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-[#5cb3e0] px-6 py-3 text-[16px] font-bold text-white"
        >
          {showMoreFilters ? <MinusIcon size={18} /> : <PlusIcon size={18} />}
          {showMoreFilters ? "Less Filters" : "More Filters"}
        </button>
        <button
          type="button"
          onClick={() => {
            clearProductPrefill();
            setCreating(true);
          }}
          className="flex items-center gap-2 rounded-md bg-[#3aa0e3] px-5 py-3 text-[16px] font-bold text-white"
        >
          <PlusIcon size={18} /> Add Product
        </button>
      </div>

      {/* Table */}
      <div className="mt-5">
        <div className="mb-2.5 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setBatchDeleting(true)}
            disabled={!hasSelection}
            className="rounded-md bg-[#e2231a] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#c62828] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Batch Delete{hasSelection ? ` (${selectedIds.size})` : ""}
          </button>
        </div>

        {items.some((p) => isZeroPrice(p.price)) && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-[#e2231a] bg-[#fdecea] px-3 py-2 text-[14px] text-[#e2231a]"
          >
            Some products on this page are priced at $0.00 and can be sold for free. Set a price greater than zero before selling them.
          </div>
        )}
        {loading ? (
          <div role="status" aria-label="Loading products" className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <div className="grid grid-cols-8 gap-3 bg-neutral-100 px-3 py-3">
              {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-neutral-300" />)}
            </div>
            {Array.from({ length: 6 }, (_, row) => (
              <div key={row} className="grid grid-cols-8 gap-3 border-t border-neutral-200 px-3 py-4">
                {Array.from({ length: 8 }, (_, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-neutral-100" />)}
              </div>
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <span>{error}</span>
            <button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100">
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-12 text-center text-sm text-neutral-500">No products match the current filters.</p>
        ) : (
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
              { label: "No.", align: "center", width: "w-[52px]" },
              { label: "Status", align: "center" },
              { label: "Product" },
              { label: "Category" },
              { label: "ABV", align: "right", width: "w-[72px]" },
              { label: "Volume", align: "right", width: "w-[88px]" },
              { label: "Region" },
              { label: "Vintage", align: "center", width: "w-[80px]" },
              { label: "Cost", align: "right" },
              { label: "Inventory", align: "center" },
              { label: "Price", align: "right" },
              { label: "Actions", align: "center" },
            ]}
            rows={items.map((p, i) => [
              <input
                key="sel"
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={() => toggleSelect(p.id)}
                aria-label={`Select ${p.name}`}
                className="h-3.5 w-3.5 cursor-pointer accent-[#3aa0e3]"
              />,
              (page - 1) * PAGE_SIZE + i + 1,
              <Status key="s" status={p.status} />,
              p.name,
              p.categoryName ?? "",
              formatAbv(p),
              formatVolume(p),
              formatLiquorText(p, p.region),
              formatLiquorText(p, p.vintage),
              money(p.cost),
              formatInventory(p),
              <PriceCell key="price" price={p.price} />,
              <RowActions
                key="a"
                view
                justify="center"
                onView={() => router.push(`/products/${p.id}/view`)}
                onEdit={() => router.push(`/products/${p.id}/edit`)}
                onDelete={() => setDeleting(p)}
              />,
            ])}
          />
        )}
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </div>

      {creating && (
        <CreateProductWizard
          open={creating}
          initial={productPrefill}
          onClose={() => {
            clearProductPrefill();
            setCreating(false);
          }}
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
        onConfirm={() => void confirmBatchDelete()}
        onCancel={() => {
          if (!batchDeleteBusy) setBatchDeleting(false);
        }}
      />
    </div>
  );
}
