"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useDebouncedValue } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { LoaderCircle, PackageOpen, Search } from "lucide-react";

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
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-12 shrink-0 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
    >
      <span className={cn("flex h-6 w-11 items-center rounded-full p-0.5 transition-colors", checked ? "justify-end bg-[var(--oh-primary)]" : "bg-[var(--oh-border-strong)]")}>
        <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
      </span>
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
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-4 sm:p-6">
        <section role="alert" className="w-full max-w-lg rounded-xl border border-rose-200 bg-white p-5 shadow-[var(--oh-shadow-card)] sm:p-6">
          <p className="text-sm leading-6 text-rose-800">{error}</p>
          <Link href="/stocktake" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Back to stocktakes</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="h-full overflow-y-auto bg-[var(--oh-surface)] p-4 font-sans sm:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Inventory · Express mode</p>
            <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">Express stocktake</h1>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Scan a barcode or search products to record this count at {outletLabel}.</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-2">
              <ToggleSwitch checked={showPrices} onChange={setShowPrices} label="Show prices" />
              <span className="pr-2 text-sm font-medium text-[var(--oh-text-secondary)]">Show prices</span>
            </div>
            <Link href="/stocktake" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-paper)]">All counts</Link>
          </div>
        </header>

        <section aria-label="Search and scan products" className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
          <div className="relative">
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
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
              placeholder="Search by product name or scan a barcode"
              className="h-12 w-full rounded-lg border border-[var(--oh-border-strong)] bg-white pl-10 pr-3 text-base text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--oh-surface)] disabled:opacity-60"
            />
            {searchLoading && <LoaderCircle size={17} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--oh-primary)]" />}
          </div>
          <p className="mt-2 text-xs text-[var(--oh-muted)]">Scan a barcode and press Enter, or choose a matching product below.</p>
          {scanError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">{scanError}</p>}
        </section>

        <section aria-label="Stocktake products" className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oh-border)] px-4 py-3 sm:px-5">
            <div><h2 className="text-sm font-semibold text-[var(--oh-text)]">Counted products</h2><p className="mt-0.5 text-xs text-[var(--oh-muted)]">Products already scanned in this stocktake.</p></div>
            <span className="rounded-full bg-[var(--oh-orange-light)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--oh-primary)]">{products.length} {products.length === 1 ? "product" : "products"}</span>
          </header>

          {hasResults && searchOpen ? (
            <div className="max-h-[min(50dvh,420px)] overflow-y-auto divide-y divide-[var(--oh-border)]">
              {searchLoading || query.trim() !== debouncedQuery.trim() ? (
                <div role="status" className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-[var(--oh-muted)]"><LoaderCircle size={17} className="animate-spin" />Searching products…</div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">No products found. Check the barcode or try another name.</div>
              ) : (
                searchResults.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    disabled={scanning}
                    onClick={() => handleSelectProduct(product.id)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--oh-primary)] disabled:opacity-60"
                  >
                    <span className="min-w-0 break-words font-medium text-[var(--oh-text)]">{product.name}</span>
                    {showPrices && <span className="shrink-0 tabular-nums text-[var(--oh-text-secondary)]">{formatMoney(product.price)}</span>}
                  </button>
                ))
              )}
            </div>
          ) : loading ? (
            <div role="status" aria-label="Loading stocktake" className="space-y-4 p-4 sm:p-5">
              <div className="h-5 w-44 animate-pulse rounded bg-[var(--oh-surface)]" />
              {Array.from({ length: 3 }, (_, index) => <div key={index} className="flex items-center justify-between gap-4 border-t border-[var(--oh-border)] pt-4"><div className="h-4 w-2/3 animate-pulse rounded bg-[var(--oh-surface)]" /><div className="h-9 w-14 animate-pulse rounded-lg bg-[var(--oh-surface)]" /></div>)}
            </div>
          ) : products.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"><PackageOpen size={23} aria-hidden="true" /></span>
              <p className="mt-3 text-sm font-semibold text-[var(--oh-text)]">Ready to scan</p>
              <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--oh-muted)]">Scanned products will appear here. Start with a barcode or search by name.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--oh-border)]">
              {products.map((line) => (
                <article key={line.id} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0"><h3 className="break-words text-sm font-medium text-[var(--oh-text)]">{line.productName}</h3><p className="mt-1 text-xs text-[var(--oh-muted)]">Counted quantity</p></div>
                  <div className="flex shrink-0 items-center gap-4 text-right">
                    <span className="rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm font-semibold tabular-nums text-[var(--oh-text)]">{line.actualCount ?? 0}</span>
                    {showPrices && <span className="min-w-16 text-sm tabular-nums text-[var(--oh-text-secondary)]">{formatMoney(line.price)}</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {scanning && <p role="status" className="text-center text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="mr-2 inline animate-spin" />Adding product to this count…</p>}
      </div>
    </main>
  );
}
