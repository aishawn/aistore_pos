"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusIcon } from "@/components/icons";
import { AsyncState } from "@/components/admin/AsyncState";
import { FilterSelect, SelectOption } from "@/components/admin/FilterSelect";
import { Pagination } from "@/components/admin/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useApi, useApiList, useDebouncedValue } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { validatePositiveMoney } from "@/lib/quantity";
import { cn } from "@/lib/utils";

interface Named {
  id: string;
  name: string;
}

interface PriceBreak {
  priceId?: string | null;
  quantity?: number | null;
  price?: number | null;
}

interface BulkPriceRow {
  productId: string;
  productName: string;
  caseQuantity?: number | null;
  priceSetName?: string | null;
  prices?: PriceBreak[];
}

const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const DEFAULT_QUANTITIES = [1, 2, 4, 6, 10, 12, 16, 18, 24];

function num(v?: number | null) {
  if (v == null) return "";
  return String(v);
}

function qtyKey(q: number) {
  return String(q);
}

function cellInput(className?: string) {
  return cn(
    "h-[34px] w-full min-w-[72px] rounded border border-neutral-300 bg-white px-2 text-[13px] text-black outline-none focus:border-[#6eb5e0]",
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
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-neutral-700">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "flex h-11 w-12 shrink-0 items-center rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]",
          checked ? "bg-[#6eb5e0]" : "bg-neutral-300",
        )}
      >
        <span
          className={cn(
            "h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-4" : "translate-x-0",
          )}
        />
      </button>
      {label}
    </label>
  );
}

function PriceCell({
  productId,
  quantity,
  priceBreak,
  onSaved,
}: {
  productId: string;
  quantity: number;
  priceBreak?: PriceBreak;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(num(priceBreak?.price));

  useEffect(() => {
    setValue(num(priceBreak?.price));
  }, [priceBreak]);

  const save = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed === "") return;
    const priceNum = Number(trimmed);
    if (Number.isNaN(priceNum) || priceNum === priceBreak?.price) return;
    const priceError = validatePositiveMoney(priceNum, "Price");
    if (priceError) {
      setValue(num(priceBreak?.price));
      return;
    }
    await api.patch("/api/bulk-price-edit/prices", {
      productId,
      priceId: priceBreak?.priceId ?? null,
      quantity,
      price: priceNum,
    });
    onSaved();
  }, [onSaved, priceBreak?.price, priceBreak?.priceId, productId, quantity, value]);

  return (
    <div className="relative w-[88px] shrink-0 px-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
      <input
        type="number"
        min="0"
        step="0.01"
        className={cellInput("pl-5")}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "" || raw === "-") {
            if (raw === "-") return;
            setValue("");
            return;
          }
          const num = Number(raw);
          if (Number.isFinite(num) && num < 0) return;
          setValue(raw);
        }}
        onBlur={() => void save()}
      />
    </div>
  );
}

function BulkPriceRowLine({
  row,
  quantities,
  onSaved,
}: {
  row: BulkPriceRow;
  quantities: number[];
  onSaved: () => void;
}) {
  const priceByQty = useMemo(() => {
    const map = new Map<string, PriceBreak>();
    for (const p of row.prices ?? []) {
      if (p.quantity != null) map.set(qtyKey(Number(p.quantity)), p);
    }
    return map;
  }, [row.prices]);

  return (
    <div className="flex items-center border-b border-neutral-200 bg-white py-1.5 text-[13px] text-black">
      <div className="w-[220px] shrink-0 px-2 font-medium">{row.productName}</div>
      <div className="w-[72px] shrink-0 px-2 text-center">{num(row.caseQuantity)}</div>
      <div className="w-[88px] shrink-0 px-2">{row.priceSetName ?? "Default"}</div>
      {quantities.map((q) => (
        <PriceCell
          key={`${row.productId}-${q}`}
          productId={row.productId}
          quantity={q}
          priceBreak={priceByQty.get(qtyKey(q))}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}

/** Bulk edit product prices across quantity breaks. */
export function BulkPriceEditPage() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [quantities, setQuantities] = useState<number[]>(DEFAULT_QUANTITIES);
  const [newQuantity, setNewQuantity] = useState("");

  const debouncedSearch = useDebouncedValue(search, 300);
  const categories = useApi<Named[]>("/api/classifications/category");

  const { items, total, loading, error, reload } = useApiList<BulkPriceRow>("/api/bulk-price-edit", {
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

  function addQuantity() {
    const q = Number(newQuantity.trim());
    if (!Number.isFinite(q) || q <= 0 || quantities.includes(q)) return;
    setQuantities((prev) => [...prev, q].sort((a, b) => a - b));
    setNewQuantity("");
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      <div className="flex shrink-0 items-center gap-4 border-b border-neutral-200 px-6 py-4">
        <h1 className="text-[28px] font-normal text-black">Bulk Price Edit</h1>
        <div className="ml-auto text-[15px] text-neutral-700">
          <span className="font-semibold text-black">{total.toLocaleString()}</span> Products
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-b border-neutral-200 px-6 py-4">
        <div className="flex gap-3">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search for Product or Classification..."
            className="h-[38px] min-w-0 flex-1 rounded border border-neutral-300 px-3 text-[14px] outline-none focus:border-[#6eb5e0]"
          />
          <div className="w-[220px] shrink-0">
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Toggle
            checked={inStockOnly}
            onChange={(v) => {
              setInStockOnly(v);
              setPage(1);
            }}
            label="Only display products that have stock (when editing a classification or all products)"
          />
          <div className="flex items-center gap-2">
            <input
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              placeholder="New Quantity"
              className="h-[36px] w-[140px] rounded border border-neutral-300 px-3 text-[14px] outline-none focus:border-[#6eb5e0]"
              onKeyDown={(e) => {
                if (e.key === "Enter") addQuantity();
              }}
            />
            <button
              type="button"
              onClick={addQuantity}
              className="flex cursor-pointer items-center gap-1.5 rounded border border-neutral-300 bg-neutral-100 px-4 py-2 text-[14px] text-neutral-700 transition-colors hover:bg-neutral-200"
            >
              <PlusIcon size={14} />
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
        <div className="inline-block min-w-full">
          <div className="sticky top-0 z-10 flex items-center rounded-md bg-black px-3 py-2 text-[13px] font-bold text-white">
            <div className="w-[220px] shrink-0 px-2">Product</div>
            <div className="w-[72px] shrink-0 px-2 text-center">Case Qty</div>
            <div className="w-[88px] shrink-0 px-2">Price Set</div>
            {quantities.map((q) => (
              <div key={q} className="w-[88px] shrink-0 px-1 text-center">
                {q}
              </div>
            ))}
          </div>

          <AsyncState loading={loading} error={error} empty={items.length === 0} onRetry={reload}>
            {items.map((row) => (
              <BulkPriceRowLine key={row.productId} row={row} quantities={quantities} onSaved={reload} />
            ))}
            <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
          </AsyncState>
        </div>
      </div>
    </div>
  );
}
