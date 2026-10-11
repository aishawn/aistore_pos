"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useDebouncedValue } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

interface StocktakeProductLine {
  id: string;
  productId: string;
  productName: string;
  price?: number | null;
  actualCount?: number | null;
}

interface ExpressStocktakeDetail {
  id: string;
  name: string;
  outletId: string;
  outletName: string;
  status: string;
  products: StocktakeProductLine[];
}

interface ProductSearchHit {
  id: string;
  name: string;
  price?: number | null;
  barcode?: string | null;
}

interface Outlet {
  id: string;
  name: string;
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
        checked ? "justify-end bg-[var(--oh-info)]" : "bg-[var(--oh-border-strong)]",
      )}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

function formatMoney(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toFixed(2)}`;
}

/** Express stocktake scanning page — search, scan, and counted product list. */
export function ExpressStocktakePage({ stocktakeId: initialStocktakeId }: { stocktakeId?: string }) {
  const searchParams = useSearchParams();
  const outlets = useApi<Outlet[]>("/api/outlets");
  const [stocktakeId, setStocktakeId] = useState(initialStocktakeId ?? "");
  const [session, setSession] = useState<ExpressStocktakeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showPrices, setShowPrices] = useState(false);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query, 250);
  const bootedRef = useRef(false);

  const loadSession = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ExpressStocktakeDetail>(`/api/stocktakes/${id}/express`);
      setSession(data);
      setStocktakeId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stocktake");
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialStocktakeId) {
      void loadSession(initialStocktakeId);
      return;
    }

    if (bootedRef.current || outlets.loading) return;

    const outletId = searchParams.get("outletId") ?? outlets.data?.[0]?.id;
    if (!outletId) {
      if (outlets.data && outlets.data.length === 0) {
        setError("No outlets available");
        setLoading(false);
      }
      return;
    }

    bootedRef.current = true;
    setLoading(true);
    setError(null);
    api
      .post<ExpressStocktakeDetail>("/api/stocktakes/express", { outletId: Number(outletId) })
      .then((data) => {
        setSession(data);
        setStocktakeId(data.id);
      })
      .catch((e) => {
        bootedRef.current = false;
        setError(e instanceof Error ? e.message : "Failed to start express stocktake");
      })
      .finally(() => setLoading(false));
  }, [initialStocktakeId, loadSession, outlets.data, outlets.loading, searchParams]);

  useEffect(() => {
    if (!loading && stocktakeId) {
      inputRef.current?.focus();
    }
  }, [loading, stocktakeId]);

  useEffect(() => {
    const term = debouncedQuery.trim();
    if (!term || !stocktakeId) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    api
      .get<ProductSearchHit[]>(`/api/stocktakes/${stocktakeId}/product-search`, { q: term })
      .then((items) => {
        if (!cancelled) setSearchResults(items);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, stocktakeId]);

  async function scan(body: { query?: string; productId?: number }) {
    if (!stocktakeId) return;
    setScanning(true);
    setScanError(null);
    try {
      const data = await api.post<ExpressStocktakeDetail>(`/api/stocktakes/${stocktakeId}/scan`, body);
      setSession(data);
      setQuery("");
      setSearchOpen(false);
      setSearchResults([]);
      inputRef.current?.focus();
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Failed to add product");
    } finally {
      setScanning(false);
    }
  }

  function handleSubmitSearch() {
    const term = query.trim();
    if (!term || scanning || !stocktakeId) return;
    void scan({ query: term });
  }

  function handleSelectProduct(productId: string) {
    if (scanning || !stocktakeId) return;
    void scan({ productId: Number(productId) });
  }

  const products = session?.products ?? [];
  const hasResults = query.trim().length > 0;
  const outletLabel = session?.outletName ?? outlets.data?.[0]?.name ?? "…";
  const ready = Boolean(stocktakeId && session);

  if (error && !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-white px-6 font-sans">
        <p className="text-[14px] text-[var(--oh-danger)]">{error}</p>
        <Link href="/stocktake" className="text-[14px] font-medium text-[var(--oh-info)] hover:underline">
          Back to Stocktakes
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-white px-6 py-6 font-sans md:px-10 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-bold leading-tight text-black">Express Stocktake</h1>
          <p className="mt-1 text-[16px] text-neutral-500">Scanning {outletLabel}</p>
        </div>
        <label className="flex items-center gap-3 pt-2">
          <ToggleSwitch checked={showPrices} onChange={setShowPrices} />
          <span className="text-[14px] font-medium text-[var(--oh-text)]">Show Prices</span>
        </label>
      </div>

      <div className="mt-8">
        <input
          ref={inputRef}
          value={query}
          disabled={!ready || loading}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
            setScanError(null);
          }}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmitSearch();
            }
          }}
          placeholder="Search for a product or scan a barcode"
          className="h-[52px] w-full rounded-lg border border-black px-4 text-[16px] text-black outline-none placeholder:text-neutral-400 focus:ring-1 focus:ring-black disabled:cursor-not-allowed disabled:opacity-60"
        />
        {scanError && <p className="mt-2 text-[13px] text-[var(--oh-danger)]">{scanError}</p>}
      </div>

      <div className="mt-8">
        <div className="text-center text-[13px] font-medium tracking-[0.08em] text-neutral-400">
          SELECT A PRODUCT
        </div>
        <div className="mt-3 border-t border-neutral-200" />

        {loading ? (
          <div className="py-16 text-center text-[13px] font-medium tracking-[0.08em] text-neutral-400">
            NO PRODUCTS HAVE BEEN STOCKTAKED YET
          </div>
        ) : hasResults && searchOpen ? (
          <div className="mt-2 border border-neutral-200 bg-white">
            {searchLoading ? (
              <div className="px-4 py-6 text-center text-[14px] text-neutral-500">Searching…</div>
            ) : searchResults.length === 0 ? (
              <div className="px-4 py-6 text-center text-[14px] text-neutral-500">No products found</div>
            ) : (
              searchResults.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  disabled={scanning}
                  onClick={() => handleSelectProduct(product.id)}
                  className="flex w-full items-center justify-between border-b border-neutral-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-neutral-50 disabled:opacity-60"
                >
                  <span className="text-[15px] text-black">{product.name}</span>
                  {showPrices && (
                    <span className="text-[14px] text-neutral-500">{formatMoney(product.price)}</span>
                  )}
                </button>
              ))
            )}
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center text-[13px] font-medium tracking-[0.08em] text-neutral-400">
            NO PRODUCTS HAVE BEEN STOCKTAKED YET
          </div>
        ) : (
          <div className="mt-2">
            {products.map((line) => (
              <div
                key={line.id}
                className="flex items-center justify-between border-b border-neutral-100 py-4 last:border-b-0"
              >
                <div>
                  <div className="text-[16px] font-medium text-black">{line.productName}</div>
                  <div className="mt-1 text-[13px] text-neutral-500">
                    Count: {line.actualCount ?? 0}
                  </div>
                </div>
                {showPrices && (
                  <div className="text-[14px] text-neutral-600">{formatMoney(line.price)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
