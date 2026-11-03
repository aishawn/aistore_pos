"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExportIcon } from "@/components/icons";
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, X } from "lucide-react";
import { AdminPrimaryButton } from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
import { FilterSelect, SelectOption } from "@/components/admin/FilterSelect";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { friendlyProductName } from "@/lib/product-display-name";
import { useDebouncedValue } from "@/hooks/useApi";
import { exportOdooProductsCsv, searchOdooRecords, updateOdooProduct, type OdooProductCategoryRecord, type OdooProductRecord } from "@/lib/odoo-api";
import { validateNonNegativeMoney, validatePositiveMoney } from "@/lib/quantity";
import { cn } from "@/lib/utils";

interface StockListRow {
  id: string;
  productId: number;
  name: string;
  categoryName?: string | null;
  priceSetName?: string | null;
  caseQuantity?: number | null;
  casesOnHand?: number | null;
  itemsOnHand?: number | null;
  priceQuantity?: number | null;
  priceId?: string | null;
  cost?: number | null;
  price?: number | null;
}

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

function profitPct(cost?: number | null, price?: number | null) {
  if (cost == null || price == null || price <= 0) return "";
  return (((price - cost) / price) * 100).toFixed(2);
}

function num(v?: number | null) {
  if (v == null) return "";
  return String(v);
}

function cellInput(className?: string) {
  return cn(
    "h-10 w-full rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2.5 text-sm text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-1 focus:ring-[var(--oh-primary)]/20",
    className,
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2.5 text-[13px] text-[var(--oh-text-secondary)]">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`flex h-11 w-12 shrink-0 items-center rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] ${
          checked ? "bg-[var(--oh-primary)]" : "bg-[var(--oh-border-strong)]"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-[var(--oh-surface-elevated)] shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span>{label}</span>
    </div>
  );
}

function StockListRowEditor({
  row,
  onSaved,
}: {
  row: StockListRow;
  onSaved: () => void;
}) {
  const productLabel = friendlyProductName(row.name);
  const [name, setName] = useState(productLabel);
  const [nameEdited, setNameEdited] = useState(false);
  const [quantity, setQuantity] = useState(num(row.priceQuantity));
  const [cost, setCost] = useState(num(row.cost));
  const [price, setPrice] = useState(num(row.price));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    setName(friendlyProductName(row.name));
    setNameEdited(false);
    setQuantity(num(row.priceQuantity));
    setCost(num(row.cost));
    setPrice(num(row.price));
    setSaveError(null);
  }, [row]);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    setSaveError(null);
    const body: Record<string, unknown> = {};
    if (nameEdited && name.trim() !== row.name) body.name = name.trim();
    const costNum = cost === "" ? null : Number(cost);
    const priceNum = price === "" ? null : Number(price);
    const costError = validateNonNegativeMoney(costNum, "Cost");
    if (costError) {
      setSaveError(costError);
      return;
    }
    if (costNum !== row.cost) {
      setSaveError("Cost is managed by Orithos purchasing and cannot be edited here.");
      return;
    }
    if (
      row.priceId &&
      priceNum !== row.price
    ) {
      const priceError = validatePositiveMoney(priceNum, "Price");
      if (priceError) {
        setSaveError(priceError);
        return;
      }
      body.list_price = priceNum;
    }
    if (Object.keys(body).length === 0) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await updateOdooProduct(row.productId, {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.list_price !== undefined ? { list_price: Number(body.list_price), expectedListPrice: row.price ?? undefined } : {}),
      });
      onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save row");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [cost, name, nameEdited, onSaved, price, row]);

  const profit = profitPct(cost === "" ? null : Number(cost), price === "" ? null : Number(price));
  const hasStock = Number(row.casesOnHand ?? 0) > 0 || Number(row.itemsOnHand ?? 0) > 0;

  return (
    <>
    <div className="hidden items-center border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] py-1.5 text-[13px] text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface-muted)] xl:flex">
      <div className="w-[22%] shrink-0 px-2">
        <input
          className={cellInput()}
          aria-label={`Product name for ${productLabel}`}
          title={row.name !== productLabel ? row.name : undefined}
          aria-busy={saving}
          aria-invalid={saveError ? true : undefined}
          disabled={saving}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameEdited(true);
            if (saveError) setSaveError(null);
          }}
          onBlur={() => void save()}
        />
      </div>
      <div className="w-[10%] shrink-0 px-2">{row.categoryName ?? ""}</div>
      <div className="w-[8%] shrink-0 px-2">{row.priceSetName ?? ""}</div>
      <div className="w-[7%] shrink-0 px-2 text-center">{num(row.caseQuantity)}</div>
      <div className={`w-[7%] shrink-0 px-2 text-center tabular-nums ${hasStock ? "text-[var(--oh-text)]" : "font-semibold text-[var(--oh-danger)]"}`}>{num(row.casesOnHand)}</div>
      <div className={`w-[7%] shrink-0 px-2 text-center tabular-nums ${hasStock ? "text-[var(--oh-text)]" : "font-semibold text-[var(--oh-danger)]"}`}>{num(row.itemsOnHand)}</div>
      <div className="w-[8%] shrink-0 px-2">
        <input
          type="number"
          min="1"
          step="1"
          className={cellInput("text-center")}
          aria-label={`Price quantity for ${productLabel}`}
          aria-busy={saving}
          aria-invalid={saveError ? true : undefined}
          disabled
          readOnly
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            if (saveError) setSaveError(null);
          }}
          onBlur={() => void save()}
          title={saveError ?? undefined}
        />
      </div>
      <div className="w-[8%] shrink-0 px-2">
        <div className="relative">
          {row.cost != null ? <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500">$</span> : null}
          <input
            className={cellInput(row.cost != null ? "pl-5" : "px-1")}
            aria-label={`Cost for ${productLabel}`}
            aria-describedby={row.cost == null ? `stock-cost-managed-desktop-${row.id}` : undefined}
            aria-busy={saving}
            aria-invalid={saveError ? true : undefined}
            disabled={saving || row.cost == null}
            readOnly={row.cost == null}
            placeholder={row.cost == null ? "Managed" : undefined}
            title={row.cost == null ? "Managed in purchasing" : saveError ?? undefined}
            value={cost}
            onChange={(e) => {
              setCost(e.target.value);
              if (saveError) setSaveError(null);
            }}
            onBlur={() => void save()}
          />
          {row.cost == null ? <span id={`stock-cost-managed-desktop-${row.id}`} className="sr-only">Cost is managed in purchasing.</span> : null}
        </div>
      </div>
      <div className="w-[10%] shrink-0 px-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
          <input
            className={cellInput("pl-5")}
            aria-label={`Price for ${productLabel}`}
            aria-busy={saving}
            aria-invalid={saveError ? true : undefined}
            disabled={saving}
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              if (saveError) setSaveError(null);
            }}
            onBlur={() => void save()}
          />
        </div>
      </div>
      <div className="min-w-0 flex-1 px-2">
        <div className="relative">
          <input
            className={cn(
              cellInput("pr-6 text-right"),
              Number(profit) < 0
                ? "border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] font-semibold text-[var(--oh-danger)]"
                : "bg-[var(--oh-surface)] text-[var(--oh-text-secondary)]",
            )}
            aria-label={`Profit margin for ${productLabel}`}
            value={profit}
            readOnly
            tabIndex={-1}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500">%</span>
        </div>
      </div>
    </div>
    <article className="grid gap-3 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-3 text-[13px] text-[var(--oh-text)] xl:hidden">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]" htmlFor={`stock-name-${row.id}`}>Product</label>
        <input
          id={`stock-name-${row.id}`}
          className={cellInput()}
          aria-label={`Product name for ${productLabel}`}
          title={row.name !== productLabel ? row.name : undefined}
          aria-busy={saving}
          aria-invalid={saveError ? true : undefined}
          disabled={saving}
          value={name}
          onChange={(e) => { setName(e.target.value); setNameEdited(true); if (saveError) setSaveError(null); }}
          onBlur={() => void save()}
        />
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-md bg-[var(--oh-surface)] p-3">
        <div><dt className="text-xs text-[var(--oh-muted)]">Category</dt><dd className="mt-1 break-words font-medium">{row.categoryName ?? "—"}</dd></div>
        <div><dt className="text-xs text-[var(--oh-muted)]">Price set</dt><dd className="mt-1 break-words font-medium">{row.priceSetName ?? "—"}</dd></div>
        <div><dt className="text-xs text-[var(--oh-muted)]">Case quantity</dt><dd className="mt-1 tabular-nums font-medium">{num(row.caseQuantity) || "—"}</dd></div>
        <div><dt className="text-xs text-[var(--oh-muted)]">Stock on hand</dt><dd className={`mt-1 tabular-nums font-medium ${hasStock ? "text-[var(--oh-text)]" : "text-[var(--oh-danger)]"}`}>{num(row.casesOnHand) || "0"} cases · {num(row.itemsOnHand) || "0"} items</dd></div>
      </dl>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-1 block text-xs font-semibold text-[var(--oh-muted)]" htmlFor={`stock-quantity-${row.id}`}>Price quantity</label><input id={`stock-quantity-${row.id}`} type="number" min="1" step="1" className={cellInput("text-center")} aria-label={`Price quantity for ${productLabel}`} aria-busy={saving} aria-invalid={saveError ? true : undefined} disabled value={quantity} readOnly /></div>
        <div><label className="mb-1 block text-xs font-semibold text-[var(--oh-muted)]" htmlFor={`stock-cost-${row.id}`}>Cost</label><div className="relative">{row.cost != null ? <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500">$</span> : null}<input id={`stock-cost-${row.id}`} className={cellInput(row.cost != null ? "pl-5" : "px-1")} aria-label={`Cost for ${productLabel}`} aria-describedby={row.cost == null ? `stock-cost-managed-mobile-${row.id}` : undefined} aria-busy={saving} aria-invalid={saveError ? true : undefined} disabled={saving || row.cost == null} readOnly={row.cost == null} placeholder={row.cost == null ? "Managed" : undefined} title={row.cost == null ? "Managed in purchasing" : saveError ?? undefined} value={cost} onChange={(e) => { setCost(e.target.value); if (saveError) setSaveError(null); }} onBlur={() => void save()} /></div>{row.cost == null ? <span id={`stock-cost-managed-mobile-${row.id}`} className="sr-only">Cost is managed in purchasing.</span> : null}</div>
        <div><label className="mb-1 block text-xs font-semibold text-[var(--oh-muted)]" htmlFor={`stock-price-${row.id}`}>Price</label><div className="relative"><span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500">$</span><input id={`stock-price-${row.id}`} className={cellInput("pl-5")} aria-label={`Price for ${productLabel}`} aria-busy={saving} aria-invalid={saveError ? true : undefined} disabled={saving} value={price} onChange={(e) => { setPrice(e.target.value); if (saveError) setSaveError(null); }} onBlur={() => void save()} /></div></div>
        <div><label className="mb-1 block text-xs font-semibold text-[var(--oh-muted)]" htmlFor={`stock-profit-${row.id}`}>Profit %</label><div className="relative"><input id={`stock-profit-${row.id}`} className={cn(cellInput("pr-6 text-right"), Number(profit) < 0 ? "border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] font-semibold text-[var(--oh-danger)]" : "bg-[var(--oh-surface)] text-[var(--oh-text-secondary)]")} aria-label={`Profit margin for ${productLabel}`} value={profit} readOnly /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]">%</span></div></div>
      </div>
    </article>
    {saveError && <p role="alert" className="border-b border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] px-4 py-2 text-xs font-medium text-[var(--oh-tile-red-text)]">{saveError}</p>}
    </>
  );
}

/** Stock list grid — exportable product cost, inventory and prices. */
export function StockListPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[14px] text-neutral-500">Loading stock list…</div>}>
      <StockListPageInner />
    </Suspense>
  );
}

function StockListPageInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q")?.trim() ?? "";
  const [search, setSearch] = useState(initialQ);
  const [categoryId, setCategoryId] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("q")?.trim() ?? "";
    setSearch(q);
  }, [searchParams]);

  const debouncedSearch = useDebouncedValue(search, 300);
  const [categoryData, setCategoryData] = useState<OdooProductCategoryRecord[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [items, setItems] = useState<StockListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "category" | "stock" | "price">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const nextOffset = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const scrollRoot = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const requestBusy = useRef(false);

  const loadPage = useCallback((reset = false) => {
    if (!reset && requestBusy.current) return;
    requestBusy.current = true;
    const current = ++request.current;
    const offset = reset ? 0 : nextOffset.current;
    if (reset) {
      scrollRoot.current?.scrollTo({ top: 0 });
      setLoading(true);
      setLoadingMore(false);
      setItems([]);
      setTotal(0);
      setHasNext(false);
      nextOffset.current = 0;
      setLoadMoreError(null);
    } else {
      setLoadingMore(true);
      setLoadMoreError(null);
    }
    setError(null);
    void searchOdooRecords<OdooProductRecord>("products", {
      query: debouncedSearch || undefined,
      categoryIds: categoryId ? categoryId.split(",").map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : undefined,
      stockOnly: inStockOnly,
      limit: PAGE_SIZE,
      offset,
    }).then((result) => {
      if (current !== request.current) return;
      if (result.hasNext && !result.items.length) throw new Error("Stock returned an empty batch. Retry to continue.");
      const rows = result.items.map((product) => ({
        id: String(product.id),
        productId: product.id,
        name: product.display_name || product.name,
        categoryName: product.pos_categ_ids?.map((id) => categoryData.find((category) => category.id === id)?.name).filter(Boolean).join(", ") || null,
        priceSetName: "Orithos list price",
        caseQuantity: null,
        casesOnHand: null,
        itemsOnHand: product.free_qty ?? product.qty_available ?? 0,
        priceQuantity: 1,
        priceId: String(product.id),
        cost: null,
        price: product.list_price,
      }));
      setItems((previous) => reset ? rows : [...previous, ...rows.filter(row => !previous.some(item => item.id === row.id))]);
      setHasNext(Boolean(result.hasNext));
      setTotal(typeof result.total === "number" ? result.total : offset + rows.length + (result.hasNext ? 1 : 0));
      nextOffset.current = offset + rows.length;
    }).catch((cause) => {
      if (current !== request.current) return;
      const message = cause instanceof Error ? cause.message : "Could not load Orithos stock.";
      if (reset) setError(message); else setLoadMoreError(message);
    }).finally(() => {
      if (current === request.current) { requestBusy.current = false; setLoading(false); setLoadingMore(false); }
    });
  }, [categoryData, categoryId, debouncedSearch, inStockOnly]);

  const reload = useCallback(() => { loadPage(true); }, [loadPage]);
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasNext) return;
    loadPage(false);
  }, [hasNext, loadPage, loading, loadingMore]);

  const reloadCategories = useCallback(() => {
    setCategoriesLoading(true);
    setCategoryError(null);
    void searchOdooRecords<OdooProductCategoryRecord>("posCategories", { limit: 100 }).then((result) => setCategoryData(result.items)).catch((cause) => setCategoryError(cause instanceof Error ? cause.message : "Could not load Orithos categories.")).finally(() => setCategoriesLoading(false));
  }, []);

  useEffect(() => { reloadCategories(); }, [reloadCategories]);
  useEffect(() => { reload(); return () => { request.current += 1; requestBusy.current = false; }; }, [reload]);

  useEffect(() => {
    const node = sentinel.current;
    const root = scrollRoot.current;
    if (!node || !root || loadMoreError) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { root, rootMargin: "480px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, loadMoreError]);

  const displayedItems = useMemo(() => [...items].sort((a, b) => {
    const left = sortBy === "name" ? friendlyProductName(a.name) : sortBy === "category" ? (a.categoryName ?? "") : sortBy === "price" ? (a.price ?? -Infinity) : (a.itemsOnHand ?? 0);
    const right = sortBy === "name" ? friendlyProductName(b.name) : sortBy === "category" ? (b.categoryName ?? "") : sortBy === "price" ? (b.price ?? -Infinity) : (b.itemsOnHand ?? 0);
    const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), "en-AU", { numeric: true, sensitivity: "base" });
    return (sortDirection === "desc" ? -order : order) || a.productId - b.productId;
  }), [items, sortBy, sortDirection]);

  function toggleSort(next: typeof sortBy) {
    if (next === sortBy) setSortDirection((value) => value === "asc" ? "desc" : "asc");
    else { setSortBy(next); setSortDirection("asc"); }
  }

  const categoryOptions: SelectOption[] = (() => {
    const groups = new Map<string, { label: string; ids: number[] }>();
    for (const category of categoryData ?? []) {
      const parent = category.parent_id && category.parent_id[1] ? `${category.parent_id[1]} / ` : "";
      const label = `${parent}${category.name.trim()}`;
      const key = label.toLocaleLowerCase();
      const existing = groups.get(key);
      if (existing) existing.ids.push(category.id);
      else groups.set(key, { label, ids: [category.id] });
    }
    return [...groups.values()].map(({ label, ids }) => ({ label, value: ids.join(",") }));
  })();
  const hasActiveFilters = Boolean(search.trim() || categoryId || inStockOnly);

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      await exportOdooProductsCsv();
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Could not export the stock list.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 md:px-6">
        <h1 className="oh-type-title text-[var(--oh-text)]">Stock List</h1>
        <AdminPrimaryButton onClick={() => void onExport()} disabled={exporting} className="min-h-11">
          <ExportIcon size={16} />
          {exporting ? "Exporting…" : "Export to CSV"}
        </AdminPrimaryButton>
        <div data-testid="stock-list-product-count" className="oh-type-meta ml-auto rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-[var(--oh-text-secondary)]">
            <span className="font-semibold tabular-nums text-[var(--oh-text)]">{items.length.toLocaleString()} / {total.toLocaleString()}</span> {total === 1 ? "Product" : "Products"}
        </div>
      </div>

      {exportError && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] px-4 py-2.5 text-sm text-[var(--oh-tile-red-text)] md:px-6">
          <span>{exportError}</span>
          <button type="button" onClick={() => void onExport()} disabled={exporting} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-tile-red-border)] bg-[var(--oh-surface-elevated)] px-3 font-semibold text-[var(--oh-tile-red-text)] hover:bg-[var(--oh-tile-red-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60">
            <ExportIcon size={15} /> Retry export
          </button>
        </div>
      )}

      {categoryError && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--oh-tile-orange-border)] bg-[var(--oh-tile-orange-bg)] px-4 py-2.5 text-sm text-[var(--oh-tile-orange-text)] md:px-6">
          <span>Could not load categories: {categoryError}</span>
          <button type="button" onClick={reloadCategories} disabled={categoriesLoading} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-tile-orange-border)] bg-[var(--oh-surface-elevated)] px-3 font-semibold hover:bg-[var(--oh-tile-orange-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60">
            <RefreshCw size={15} /> Retry categories
          </button>
        </div>
      )}

      <div className="shrink-0 space-y-2 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Search stock products"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder="Search name, SKU or barcode"
            className="h-11 w-full max-w-md rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-base text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-1 focus:ring-[var(--oh-primary)]/20"
          />
          <div className="w-full shrink-0 sm:w-[240px]">
            <FilterSelect
              label="Category"
              value={categoryId}
              onChange={(v) => {
                setCategoryId(v);
              }}
              options={categoryOptions}
              placeholder="All categories"
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--oh-text-secondary)] xl:hidden">
            <span className="sr-only">Sort stock list</span>
            <select
              value={`${sortBy}:${sortDirection}`}
              onChange={(event) => {
                const [field, direction] = event.target.value.split(":") as [typeof sortBy, typeof sortDirection];
                setSortBy(field);
                setSortDirection(direction);
              }}
              className="h-11 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-sm text-[var(--oh-text)]"
            >
              <option value="name:asc">Product A–Z</option>
              <option value="name:desc">Product Z–A</option>
              <option value="category:asc">Category A–Z</option>
              <option value="stock:desc">Stock high to low</option>
              <option value="stock:asc">Stock low to high</option>
              <option value="price:desc">Price high to low</option>
              <option value="price:asc">Price low to high</option>
            </select>
          </label>
          {hasActiveFilters ? (
            <button
              type="button"
              aria-label="Clear stock list filters"
              onClick={() => {
                setSearch("");
                setCategoryId("");
                setInStockOnly(false);
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-sm font-semibold text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
            >
              <X size={15} aria-hidden="true" />
              Clear filters
            </button>
          ) : null}
        </div>
        <Toggle
          checked={inStockOnly}
            onChange={(v) => {
            setInStockOnly(v);
          }}
          label="In-stock products only"
        />
      </div>

      <div ref={scrollRoot} data-testid="stock-results-scroll" className="min-h-0 flex-1 overflow-auto pl-3 pr-3 pb-4 sm:px-4 md:px-6">
        <div data-testid="stock-list-table" className="xl:min-w-[1100px]">
          <div className="sticky top-0 z-10 hidden items-center rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] py-2 text-xs font-semibold uppercase tracking-wide text-[var(--oh-text-secondary)] xl:flex">
            {([['name', 'Product', 'w-[22%]'], ['category', 'Category', 'w-[10%]']] as const).map(([field, label, width]) => {
              const active = sortBy === field;
              return <button key={field} type="button" onClick={() => toggleSort(field)} aria-sort={active ? sortDirection === "asc" ? "ascending" : "descending" : "none"} className={`${width} shrink-0 px-2 text-left hover:text-[var(--oh-text)]`}><span className="inline-flex items-center gap-1">{label}{active ? sortDirection === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} />}</span></button>;
            })}
            <div className="w-[8%] shrink-0 px-2">Price Set</div>
            <div className="w-[7%] shrink-0 px-2 text-center">Case Quantity</div>
            <div className="w-[7%] shrink-0 px-2 text-center">Cases on Hand</div>
            <button type="button" onClick={() => toggleSort("stock")} aria-sort={sortBy === "stock" ? sortDirection === "asc" ? "ascending" : "descending" : "none"} className="w-[7%] shrink-0 px-2 text-center hover:text-[var(--oh-text)]"><span className="inline-flex items-center gap-1">Items on Hand{sortBy === "stock" ? sortDirection === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} />}</span></button>
            <div className="w-[8%] shrink-0 px-2 text-center">Quantity</div>
            <div className="w-[8%] shrink-0 px-2">Cost</div>
            <button type="button" onClick={() => toggleSort("price")} aria-sort={sortBy === "price" ? sortDirection === "asc" ? "ascending" : "descending" : "none"} className="w-[10%] shrink-0 px-2 text-left hover:text-[var(--oh-text)]"><span className="inline-flex items-center gap-1">Price{sortBy === "price" ? sortDirection === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} />}</span></button>
            <div className="min-w-0 flex-1 px-2">Profit %</div>
          </div>

          <AsyncState loading={loading} error={error} empty={items.length === 0} onRetry={reload}>
            {displayedItems.map((row) => (
              <StockListRowEditor key={row.id} row={row} onSaved={reload} />
            ))}
            <div ref={sentinel} aria-hidden="true" className="h-2" />
            {loadMoreError ? <div role="alert" className="flex items-center justify-center gap-3 py-3 text-xs text-[var(--oh-danger-text)]"><span>{loadMoreError}</span><button type="button" onClick={() => loadMore()} className="font-semibold underline underline-offset-2">Retry</button></div> : null}
            <div className="py-3 text-center text-xs text-[var(--oh-muted)]" aria-live="polite">
              {loadingMore ? "Loading more products…" : hasNext ? `Loaded ${items.length.toLocaleString()} of ${total.toLocaleString()}` : `All ${total.toLocaleString()} products loaded`}
              {hasNext && !loadMoreError && <button type="button" disabled={loading || loadingMore} onClick={loadMore} className="ml-3 min-h-11 rounded-md border border-[var(--oh-border)] px-3 font-semibold text-[var(--oh-primary)] disabled:opacity-60">Load more</button>}
            </div>
          </AsyncState>
        </div>
      </div>
    </div>
  );
}
