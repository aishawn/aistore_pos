"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExportIcon } from "@/components/icons";
import { AdminPrimaryButton } from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
import { FilterSelect, SelectOption } from "@/components/admin/FilterSelect";
import { Pagination } from "@/components/admin/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useApi, useApiList, useDebouncedValue } from "@/hooks/useApi";
import { api, exportStockListCsv } from "@/lib/api";
import { validateNonNegativeMoney, validatePositiveMoney, validatePositiveQuantity } from "@/lib/quantity";

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
  return `h-[34px] w-full rounded border border-neutral-300 bg-white px-2 text-[13px] text-black outline-none focus:border-[#6eb5e0] ${className ?? ""}`;
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
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-neutral-700">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-[#6eb5e0]" : "bg-neutral-300"
        }`}
      >
        <span
          className={`h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
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

  return (
    <div className="flex items-center border-b border-neutral-200 bg-white py-1.5 text-[13px] text-black">
      <div className="w-[22%] shrink-0 px-2">
        <input
          className={cellInput()}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()}
        />
      </div>
      <div className="w-[10%] shrink-0 px-2">{row.categoryName ?? ""}</div>
      <div className="w-[8%] shrink-0 px-2">{row.priceSetName ?? ""}</div>
      <div className="w-[7%] shrink-0 px-2 text-center">{num(row.caseQuantity)}</div>
      <div className="w-[7%] shrink-0 px-2 text-center">{num(row.casesOnHand)}</div>
      <div className="w-[7%] shrink-0 px-2 text-center">{num(row.itemsOnHand)}</div>
      <div className="w-[6%] shrink-0 px-2">
        <input
          type="number"
          min="1"
          step="1"
          className={cellInput("text-center")}
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
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => void save()}
          />
        </div>
      </div>
      <div className="min-w-0 flex-1 px-2">
        <div className="relative">
          <input
            className={cellInput("pr-6 text-right")}
            value={profit}
            readOnly
            tabIndex={-1}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500">%</span>
        </div>
      </div>
    </div>
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

  useEffect(() => {
    const q = searchParams.get("q")?.trim() ?? "";
    setSearch(q);
    setPage(1);
  }, [searchParams]);

  const debouncedSearch = useDebouncedValue(search, 300);
  const categories = useApi<Named[]>("/api/classifications/category");

  const { items, total, loading, error, reload } = useApiList<StockListRow>("/api/stock-list", {
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    inStockOnly: inStockOnly || undefined,
    page,
    size: PAGE_SIZE,
  });

  const categoryOptions: SelectOption[] = (categories.data ?? []).map((c) => ({
    label: c.name,
    value: c.id,
  }));

  async function onExport() {
    setExporting(true);
    try {
      await exportStockListCsv({
        search: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        inStockOnly: inStockOnly || undefined,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-neutral-200 px-6 py-4">
        <h1 className="text-[28px] font-normal text-black">Stock List</h1>
        <AdminPrimaryButton onClick={() => void onExport()} disabled={exporting}>
          <ExportIcon size={16} />
          Export to CSV
        </AdminPrimaryButton>
        <div className="ml-auto text-[15px] text-neutral-700">
          <span className="font-semibold text-black">{total.toLocaleString()}</span> Products
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-b border-neutral-200 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search for Product or Classification..."
            className="h-[38px] w-full max-w-md rounded border border-neutral-300 px-3 text-[14px] outline-none focus:border-[#6eb5e0]"
          />
          <div className="w-[240px] shrink-0">
            <FilterSelect
              label=""
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

      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
        <div className="sticky top-0 z-10 flex items-center rounded-md bg-black px-3 py-2 text-[13px] font-bold text-white">
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

        <AsyncState loading={loading} error={error} empty={items.length === 0}>
          {items.map((row) => (
            <StockListRowEditor key={row.id} row={row} onSaved={reload} />
          ))}
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </AsyncState>
      </div>
    </div>
  );
}
