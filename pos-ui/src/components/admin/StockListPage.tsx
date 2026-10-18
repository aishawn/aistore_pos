"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExportIcon } from "@/components/icons";
import { RefreshCw } from "lucide-react";
import { AdminPrimaryButton } from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
import { FilterSelect, SelectOption } from "@/components/admin/FilterSelect";
import { Pagination } from "@/components/admin/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useApi, useApiList, useDebouncedValue } from "@/hooks/useApi";
import { api, exportStockListCsv } from "@/lib/api";
import { validateNonNegativeMoney, validatePositiveMoney, validatePositiveQuantity } from "@/lib/quantity";
import { cn } from "@/lib/utils";

interface Named {
  id: string;
  name: string;
}

interface StockListRow {
  id: string;
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
  return `h-10 w-full rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-sm text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-1 focus:ring-[var(--oh-primary)]/20 ${className ?? ""}`;
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
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] text-[var(--oh-text-secondary)]">
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
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      {label}
    </label>
  );
}

function StockListRowEditor({
  row,
  onSaved,
}: {
  row: StockListRow;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [quantity, setQuantity] = useState(num(row.priceQuantity));
  const [cost, setCost] = useState(num(row.cost));
  const [price, setPrice] = useState(num(row.price));
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setName(row.name);
    setQuantity(num(row.priceQuantity));
    setCost(num(row.cost));
    setPrice(num(row.price));
  }, [row]);

  const save = useCallback(async () => {
    setSaveError(null);
    const body: Record<string, unknown> = {};
    if (name.trim() !== row.name) body.name = name.trim();
    const costNum = cost === "" ? null : Number(cost);
    const priceNum = price === "" ? null : Number(price);
    const qtyNum = quantity === "" ? null : Number(quantity);
    const costError = validateNonNegativeMoney(costNum, "Cost");
    if (costError) {
      setSaveError(costError);
      return;
    }
    if (costNum !== row.cost) body.cost = costNum;
    if (
      row.priceId &&
      (priceNum !== row.price || qtyNum !== row.priceQuantity)
    ) {
      const priceQtyError = validatePositiveQuantity(quantity, "Price quantity");
      if (priceQtyError) {
        setSaveError(priceQtyError);
        return;
      }
      const priceError = validatePositiveMoney(priceNum, "Price");
      if (priceError) {
        setSaveError(priceError);
        return;
      }
      body.priceId = row.priceId;
      body.price = priceNum;
      body.priceQuantity = qtyNum ?? row.priceQuantity ?? 1;
    }
    if (Object.keys(body).length === 0) return;
    try {
      await api.patch(`/api/stock-list/${row.id}`, body);
      onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save row");
    }
  }, [cost, name, onSaved, price, quantity, row]);

  const profit = profitPct(cost === "" ? null : Number(cost), price === "" ? null : Number(price));
  const hasStock = Number(row.casesOnHand ?? 0) > 0 || Number(row.itemsOnHand ?? 0) > 0;

  return (
    <>
    <div className="flex items-center border-b border-[var(--oh-border)] bg-white py-1.5 text-[13px] text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)]/60">
      <div className="w-[22%] shrink-0 px-2">
        <input
          className={cellInput()}
          aria-label={`Product name for ${row.name}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()}
        />
      </div>
      <div className="w-[10%] shrink-0 px-2">{row.categoryName ?? ""}</div>
      <div className="w-[8%] shrink-0 px-2">{row.priceSetName ?? ""}</div>
      <div className="w-[7%] shrink-0 px-2 text-center">{num(row.caseQuantity)}</div>
      <div className={`w-[7%] shrink-0 px-2 text-center tabular-nums ${hasStock ? "text-[var(--oh-text)]" : "font-semibold text-[var(--oh-danger)]"}`}>{num(row.casesOnHand)}</div>
      <div className={`w-[7%] shrink-0 px-2 text-center tabular-nums ${hasStock ? "text-[var(--oh-text)]" : "font-semibold text-[var(--oh-danger)]"}`}>{num(row.itemsOnHand)}</div>
      <div className="w-[6%] shrink-0 px-2">
        <input
          type="number"
          min="1"
          step="1"
          className={cellInput("text-center")}
          aria-label={`Price quantity for ${row.name}`}
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
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
          <input
            className={cellInput("pl-5")}
            aria-label={`Cost for ${row.name}`}
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            onBlur={() => void save()}
          />
        </div>
      </div>
      <div className="w-[8%] shrink-0 px-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
          <input
            className={cellInput("pl-5")}
            aria-label={`Price for ${row.name}`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
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
                ? "border-red-200 bg-red-50 font-semibold text-[var(--oh-danger)]"
                : "bg-[var(--oh-surface)] text-[var(--oh-text-secondary)]",
            )}
            aria-label={`Profit margin for ${row.name}`}
            value={profit}
            readOnly
            tabIndex={-1}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500">%</span>
        </div>
      </div>
    </div>
    {saveError && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-800">{saveError}</p>}
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
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get("q")?.trim() ?? "";
    setSearch(q);
    setPage(1);
  }, [searchParams]);

  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: categoryData, error: categoryError, loading: categoriesLoading, reload: reloadCategories } = useApi<Named[]>("/api/classifications/category");

  const { items, total, loading, error, reload } = useApiList<StockListRow>("/api/stock-list", {
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    inStockOnly: inStockOnly || undefined,
    page,
    size: PAGE_SIZE,
  });

  const categoryOptions: SelectOption[] = (categoryData ?? []).map((c) => ({
    label: c.name,
    value: c.id,
  }));

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      await exportStockListCsv({
        search: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        inStockOnly: inStockOnly || undefined,
      });
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Could not export the stock list.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
        <h1 className="oh-type-title text-[var(--oh-text)]">Stock List</h1>
        <AdminPrimaryButton onClick={() => void onExport()} disabled={exporting} className="min-h-11">
          <ExportIcon size={16} />
          {exporting ? "Exporting…" : "Export to CSV"}
        </AdminPrimaryButton>
        <div className="oh-type-meta ml-auto rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-[var(--oh-text-secondary)]">
          <span className="font-semibold tabular-nums text-[var(--oh-text)]">{total.toLocaleString()}</span> Products
        </div>
      </div>

      {exportError && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800 md:px-6">
          <span>{exportError}</span>
          <button type="button" onClick={() => void onExport()} disabled={exporting} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-60">
            <ExportIcon size={15} /> Retry export
          </button>
        </div>
      )}

      {categoryError && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 md:px-6">
          <span>Could not load categories: {categoryError}</span>
          <button type="button" onClick={reloadCategories} disabled={categoriesLoading} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100 disabled:opacity-60">
            <RefreshCw size={15} /> Retry categories
          </button>
        </div>
      )}

      <div className="shrink-0 space-y-2 border-b border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Search stock products"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search for Product or Classification..."
            className="h-11 w-full max-w-md rounded-md border border-[var(--oh-border)] bg-white px-3 text-base text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-1 focus:ring-[var(--oh-primary)]/20"
          />
          <div className="w-full shrink-0 sm:w-[240px]">
            <FilterSelect
              label="Category"
              value={categoryId}
              onChange={(v) => {
                setCategoryId(v);
                setPage(1);
              }}
              options={categoryOptions}
              placeholder="All Classifications"
            />
          </div>
        </div>
        <Toggle
          checked={inStockOnly}
          onChange={(v) => {
            setInStockOnly(v);
            setPage(1);
          }}
          label="Only display products that have stock (when editing a classification or all products)"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-5 sm:px-4 md:px-6">
        <div className="sticky top-0 z-10 flex items-center rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--oh-text-secondary)]">
          <div className="w-[22%] shrink-0 px-2">Product</div>
          <div className="w-[10%] shrink-0 px-2">Category</div>
          <div className="w-[8%] shrink-0 px-2">Price Set</div>
          <div className="w-[7%] shrink-0 px-2 text-center">Case Quantity</div>
          <div className="w-[7%] shrink-0 px-2 text-center">Cases on Hand</div>
          <div className="w-[7%] shrink-0 px-2 text-center">Items on Hand</div>
          <div className="w-[6%] shrink-0 px-2 text-center">Quantity</div>
          <div className="w-[8%] shrink-0 px-2">Cost</div>
          <div className="w-[8%] shrink-0 px-2">Price</div>
          <div className="min-w-0 flex-1 px-2">Profit %</div>
        </div>

        <AsyncState loading={loading} error={error} empty={items.length === 0} onRetry={reload}>
          {items.map((row) => (
            <StockListRowEditor key={row.id} row={row} onSaved={reload} />
          ))}
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </AsyncState>
      </div>
    </div>
  );
}
