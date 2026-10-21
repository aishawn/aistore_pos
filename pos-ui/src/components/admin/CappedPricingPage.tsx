"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AsyncState } from "@/components/admin/AsyncState";
import { getOdooPriceRules, updateOdooProduct } from "@/lib/odoo-api";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Pagination } from "@/components/admin/Pagination";
import { useDebouncedValue } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

type SourceTab = "PROVIDED";
const PAGE_SIZE = DEFAULT_PAGE_SIZE;

interface CappedPriceRow {
  id: string;
  productId: string;
  priceId?: string | null;
  productName: string;
  priceSetName?: string | null;
  source: string;
  sourceType: string;
  startDate?: string | null;
  endDate?: string | null;
  quantity?: number | null;
  cappedPrice?: number | null;
  currentPrice?: number | null;
  cost?: number | null;
}

const TAB_LABELS: Record<SourceTab, string> = { PROVIDED: "Odoo price rules" };

function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function money(v?: number | null) {
  if (v == null) return "";
  return `$${Number(v).toFixed(2)}`;
}

function marginPct(cost?: number | null, price?: number | null) {
  if (cost == null || price == null || price <= 0) return "";
  return `${(((price - cost) / price) * 100).toFixed(2)}%`;
}

function cellInput(className?: string) {
  return cn(
    "h-11 w-full rounded border border-neutral-300 bg-white px-2 text-[13px] outline-none focus:border-[#6eb5e0]",
    className,
  );
}

function CappedPriceRowEditor({
  row,
  onDirty,
  onSaved,
}: {
  row: CappedPriceRow;
  onDirty: () => void;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState(row.currentPrice != null ? String(row.currentPrice) : "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    setCurrent(row.currentPrice != null ? String(row.currentPrice) : "");
    setDirty(false);
    setSaveError(null);
  }, [row]);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    const priceNum = current === "" ? null : Number(current);
    if (priceNum === row.currentPrice || !row.priceId || priceNum == null || Number.isNaN(priceNum)) {
      setDirty(false);
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setSaveError("Enter a valid price of zero or more.");
      return;
    }
    setSaveError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      await updateOdooProduct(Number(row.productId), {
        list_price: priceNum,
        expectedListPrice: row.currentPrice ?? undefined,
      });
      setDirty(false);
      onSaved();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Could not save the current price.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [current, onSaved, row.currentPrice, row.productId, row.priceId]);

  const currentNum = current === "" ? null : Number(current);
  const overCap =
    currentNum != null &&
    row.cappedPrice != null &&
    !Number.isNaN(currentNum) &&
    currentNum > row.cappedPrice;

  return (
    <div data-testid="capped-pricing-card" className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded border border-neutral-200 bg-white p-3 text-[13px] text-black xl:mb-0 xl:flex xl:items-start xl:gap-x-0 xl:gap-y-0 xl:rounded-none xl:border-0 xl:border-b xl:px-0 xl:py-2">
      <div className="col-span-2 min-w-0 xl:w-[24%] xl:shrink-0 xl:px-3">
        <div className="text-[13px] text-neutral-500">{row.priceSetName ?? "Default Price Set"}</div>
        <div className="mt-0.5 font-semibold leading-snug">{row.productName}</div>
      </div>
      <div className="min-w-0 xl:w-[18%] xl:shrink-0 xl:px-3 xl:leading-snug">
        <div className="mb-1 text-[11px] text-neutral-500 xl:hidden">Source</div>
        <span data-testid="capped-price-source">{row.source}</span>
      </div>
      <div className="min-w-0 xl:w-[9%] xl:shrink-0 xl:px-3">
        <div className="mb-1 text-[11px] text-neutral-500 xl:hidden">Start Date</div>{formatDate(row.startDate)}
      </div>
      <div className="min-w-0 xl:w-[9%] xl:shrink-0 xl:px-3">
        <div className="mb-1 text-[11px] text-neutral-500 xl:hidden">End Date</div>{formatDate(row.endDate)}
      </div>
      <div className="min-w-0 xl:w-[10%] xl:shrink-0 xl:px-3 xl:text-center">
        <div className="mb-1 text-[11px] text-neutral-500 xl:hidden">Quantity</div>{row.quantity ?? ""}
      </div>
      <div className="min-w-0 xl:w-[9%] xl:shrink-0 xl:px-3">
        <div className="mb-1 text-[11px] text-neutral-500 xl:hidden">Capped Price</div>{money(row.cappedPrice)}
      </div>
      <div className="min-w-0 xl:w-[11%] xl:shrink-0 xl:px-3">
        <div className="mb-1 text-[11px] text-neutral-500 xl:hidden">Current Price</div>
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={cellInput(cn("pl-5", overCap && "text-[#e2231a]"))}
            aria-label={`Current price for ${row.productName}`}
            value={current}
            aria-busy={saving}
            aria-invalid={saveError ? true : undefined}
            title={saveError ?? undefined}
            disabled={saving}
            onChange={(e) => {
              setCurrent(e.target.value);
              setSaveError(null);
              setDirty(true);
              onDirty();
            }}
            onBlur={() => void save()}
          />
          {saveError ? (
            <span role="alert" className="absolute left-1 top-full z-20 mt-1 w-48 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] leading-4 text-red-800 shadow-sm">
              {saveError}
            </span>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 xl:flex-1 xl:px-3 xl:pt-1.5">
        <div className="mb-1 text-[11px] text-neutral-500 xl:hidden">Margin</div>{marginPct(row.cost, currentNum)}
      </div>
      {dirty ? <span className="sr-only">unsaved</span> : null}
    </div>
  );
}

/** Compare current prices against provided or imported capped price lists. */
export function CappedPricingPage() {
  const [tab] = useState<SourceTab>("PROVIDED");
  const [hasChanges, setHasChanges] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [items, setItems] = useState<CappedPriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const reload = useCallback(() => {
    setLoading(true); setError(null);
    void getOdooPriceRules(debouncedSearch, (page - 1) * PAGE_SIZE, PAGE_SIZE).then((result) => {
      setItems(result.items.map((item) => ({ ...item, id: item.id, productId: String(item.productId), priceId: String(item.productId) })));
      setHasNext(result.hasNext);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load Odoo price rules.")).finally(() => setLoading(false));
  }, [debouncedSearch, page]);
  // Data fetching is intentionally tied to the debounced query and page.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);
  const total = (page - 1) * PAGE_SIZE + items.length + (hasNext ? 1 : 0);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <h1 className="text-xl font-bold text-black sm:text-[28px]">Capped Pricing</h1>
        <div className="ml-auto flex items-center gap-2 text-xs text-neutral-600 sm:text-[14px]">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              hasChanges ? "bg-[#f5a623]" : "bg-[#6cc04a]",
            )}
          />
          {hasChanges ? "Unsaved changes" : "No changes made"}
        </div>
      </div>

      <div className="shrink-0 px-4 pt-3 sm:px-6 sm:pt-4">
        <div className="flex flex-wrap items-center gap-3">
          {(["PROVIDED"] as SourceTab[]).map((key) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setHasChanges(false); setPage(1); }}
                aria-pressed={active}
                className={cn(
                  "flex min-h-11 items-center gap-2 px-4 py-2.5 text-[14px] font-medium transition-colors sm:px-5",
                  active ? "bg-[#b8d9eb] text-black" : "bg-white text-neutral-600 hover:bg-neutral-50",
                )}
              >
                {TAB_LABELS[key]}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="odoo-price-rule-search">Search Odoo price rules</label>
          <input id="odoo-price-rule-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search product" className="h-11 w-full max-w-md rounded border border-neutral-300 px-3 text-sm" />
          <button type="button" onClick={reload} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded border border-neutral-300 px-3 text-sm font-medium disabled:opacity-60"><RefreshCw size={15} /> Refresh</button>
        </div>
        <p className="mt-3 text-sm text-neutral-600">Read-only Odoo price rules. Edit a product&apos;s current list price below; supplier caps and price-list rule changes stay in Odoo.</p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-6 pt-3 sm:px-6">
        <div data-testid="capped-pricing-table" className="min-w-0 xl:min-w-[1050px]">
          <div className="sticky top-0 z-10 hidden items-center rounded-md bg-black py-2 text-[13px] font-bold text-white xl:flex">
            <div className="w-[24%] shrink-0 px-3">Product</div>
            <div className="w-[18%] shrink-0 px-3">Capped Pricing</div>
            <div className="w-[9%] shrink-0 px-3">Start Date</div>
            <div className="w-[9%] shrink-0 px-3">End Date</div>
            <div className="w-[10%] shrink-0 px-3 text-center">Quantity</div>
            <div className="w-[9%] shrink-0 px-3">Capped Price</div>
            <div className="w-[11%] shrink-0 px-3">Current Price</div>
            <div className="min-w-0 flex-1 px-3">%</div>
          </div>

          <AsyncState loading={loading} error={error} empty={items.length === 0} onRetry={reload}>
            {items.map((row) => (
              <CappedPriceRowEditor
                key={row.id}
                row={row}
                onDirty={() => setHasChanges(true)}
                onSaved={() => {
                  setHasChanges(false);
                  reload();
                }}
              />
            ))}
          </AsyncState>
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}
