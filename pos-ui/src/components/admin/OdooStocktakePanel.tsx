"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useDebouncedValue } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { parseStocktakeDraft, stocktakeDraftKey } from "@/lib/stocktake-draft";

type StocktakeLocation = { id: number; name: string };
type StocktakeProduct = {
  id: number;
  name: string;
  sku: string;
  barcode: string;
  uom: string;
  expectedQty: number;
  eligible: boolean;
  ineligibleReason: string | null;
};
type StocktakeResponse = {
  locations: StocktakeLocation[];
  defaultLocationId: number | null;
  selectedLocation?: StocktakeLocation;
  locationSource?: "tenant-binding" | "single-warehouse-fallback";
  writeEnabled: boolean;
  products: StocktakeProduct[];
};
type CountLine = StocktakeProduct & { countedQty: string };
const MAX_COUNT_LINES = 40;
const MAX_COUNTED_QUANTITY = 1_000_000;

function quantity(value: number) {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(value);
}

function delta(expected: number, counted: string) {
  if (!counted.trim() || !Number.isFinite(Number(counted))) return null;
  return Number(counted) - expected;
}

/** Count / adjust Orithos on-hand qty. Used inside Products (tab), not a Stock sidebar item. */
export function OdooStocktakePanel({ onBusyChange, onApplied }: { onBusyChange?: (busy: boolean) => void; onApplied?: () => void }) {
  const { user, ready } = useAuth();
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [draftRetry, setDraftRetry] = useState(0);
  const applyLock = useRef(false);
  const hydratedDraft = useRef<string | null>(null);
  const [locations, setLocations] = useState<StocktakeLocation[]>([]);
  const [locationId, setLocationId] = useState("");
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSource, setLocationSource] = useState<StocktakeResponse["locationSource"]>();
  const [locationRetryKey, setLocationRetryKey] = useState(0);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<StocktakeProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [countLines, setCountLines] = useState<CountLine[]>([]);
  const [clearCountOpen, setClearCountOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [countUnconfirmed, setCountUnconfirmed] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 250);
  const searchTerm = query.trim();
  const searchRevision = useRef(0);

  const draftKey = ready && user && locationId && typeof window !== "undefined"
    ? stocktakeDraftKey(window.location.host, user.vendorId ?? user.subdomain ?? window.location.host, user.id, locationId) : null;

  useEffect(() => {
    onBusyChange?.(applying);
    const preventLeave = (event: BeforeUnloadEvent) => { if (applyLock.current) event.preventDefault(); };
    window.addEventListener("beforeunload", preventLeave);
    return () => window.removeEventListener("beforeunload", preventLeave);
  }, [applying, onBusyChange]);

  useEffect(() => {
    if (!draftKey) return;
    let cancelled = false;
    hydratedDraft.current = null;
    setDraftReady(false);
    setDraftError(null);
    setCountLines([]);
    setCountUnconfirmed(false);
    async function restore() {
      try {
        const raw = localStorage.getItem(draftKey!);
        const draft = parseStocktakeDraft(raw);
        if (raw && !draft) throw new Error("The saved draft could not be read. Discard this draft to start again.");
        if (draft?.lines.length) {
          const response = await api.get<StocktakeResponse>("/api/odoo/stocktake", { locationId, ids: draft.lines.map((line) => line.id).join(",") });
          if (cancelled) return;
          if (response.products.length !== draft.lines.length) throw new Error("Some draft products are no longer available. Retry or discard this draft before counting.");
          const changed = draft.lines.some((line) => response.products.find((product) => product.id === line.id)?.expectedQty !== line.expectedQty);
          setCountLines(draft.lines.map((line) => ({ ...response.products.find((product) => product.id === line.id)!, countedQty: line.countedQty })));
          setCountUnconfirmed(draft.uncertain);
          setDraftNotice(changed ? "Stock has changed since this draft was saved. Review the refreshed expected quantities before applying." : "Saved count restored. Check physical quantities before applying.");
        }
        if (!cancelled) { hydratedDraft.current = draftKey; setDraftReady(true); }
      } catch (error) { if (!cancelled) setDraftError(error instanceof Error ? error.message : "Could not restore this draft."); }
    }
    void restore();
    return () => { cancelled = true; };
  }, [draftKey, locationId, draftRetry]);

  function persistDraft(uncertain = countUnconfirmed) {
    if (!draftKey) throw new Error("Sign in before saving a stocktake draft.");
    localStorage.setItem(draftKey, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), uncertain, lines: countLines.map(({ id, countedQty, expectedQty }) => ({ id, countedQty, expectedQty })) }));
  }

  useEffect(() => {
    if (!draftKey || hydratedDraft.current !== draftKey || !draftReady || applyLock.current) return;
    try {
      if (!countLines.length && !countUnconfirmed) localStorage.removeItem(draftKey);
      else persistDraft();
    } catch { setDraftError("Browser storage is unavailable. Enable storage before applying this count."); }
    // Persist only the current identity/location's restored count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countLines, countUnconfirmed, draftKey, draftReady]);

  useEffect(() => {
    let cancelled = false;
    setLocationLoading(true);
    setLocationError(null);
    api.get<StocktakeResponse>("/api/odoo/stocktake")
      .then((data) => {
        if (cancelled) return;
        setLocations(data.locations);
        setLocationSource(data.locationSource);
        setWriteEnabled(data.writeEnabled);
        setLocationId(data.defaultLocationId ? String(data.defaultLocationId) : "");
      })
      .catch((error) => {
        if (!cancelled) setLocationError(error instanceof Error ? error.message : "Could not load stock locations.");
      })
      .finally(() => {
        if (!cancelled) setLocationLoading(false);
      });
    return () => { cancelled = true; };
  }, [locationRetryKey]);

  useEffect(() => {
    const term = debouncedQuery.trim();
    if (!locationId || !term || term !== searchTerm) {
      setProducts([]);
      setProductsError(null);
      setProductsLoading(Boolean(locationId && searchTerm));
      return;
    }
    const revision = ++searchRevision.current;
    setProductsLoading(true);
    setProductsError(null);
    api.get<StocktakeResponse>("/api/odoo/stocktake", { locationId, q: term })
      .then((data) => {
        if (revision === searchRevision.current) setProducts(data.products);
      })
      .catch((error) => {
        if (revision === searchRevision.current) {
          setProducts([]);
          setProductsError(error instanceof Error ? error.message : "Could not search Orithos products.");
        }
      })
      .finally(() => {
        if (revision === searchRevision.current) setProductsLoading(false);
      });
    return () => { searchRevision.current += 1; };
  }, [debouncedQuery, searchTerm, locationId, retryKey]);

  const selectedLocation = locations.find((location) => String(location.id) === locationId);
  const searchPending = Boolean(searchTerm) && (productsLoading || searchTerm !== debouncedQuery.trim());
  const resultsVisible = Boolean(searchTerm) && !searchPending && !productsError;
  const eligibleProducts = products.filter((product) => product.eligible);
  const invalidCount = countLines.filter((line) => !line.countedQty.trim()
    || !Number.isFinite(Number(line.countedQty))
    || Number(line.countedQty) < 0
    || Number(line.countedQty) > MAX_COUNTED_QUANTITY).length;
  const changedLines = countLines.filter((line) => {
    const amount = delta(line.expectedQty, line.countedQty);
    return amount !== null && Math.abs(amount) > 0.000001;
  });
  const canReview = writeEnabled && countLines.length > 0 && invalidCount === 0 && changedLines.length > 0 && !applying && !countUnconfirmed && draftReady && !draftError && countLines.every((line) => line.eligible);
  const totalIncrease = changedLines.reduce((sum, line) => sum + Math.max(0, Number(line.countedQty) - line.expectedQty), 0);
  const totalDecrease = changedLines.reduce((sum, line) => sum + Math.max(0, line.expectedQty - Number(line.countedQty)), 0);

  function changeLocation(value: string) {
    setLocationId(value);
    setCountLines([]);
    setQuery("");
    setProducts([]);
    setSuccess(null);
    setApplyError(null);
  }

  function addProduct(product: StocktakeProduct) {
    setCountLines((current) => !draftReady || !!draftError || countUnconfirmed || !product.eligible || current.length >= MAX_COUNT_LINES || current.some((line) => line.id === product.id)
      ? current
      : [...current, { ...product, countedQty: "" }]);
    setSuccess(null);
  }

  function changeSearch(value: string) {
    if (value.trim() !== searchTerm) {
      // Retire the old result immediately, including requests completing during debounce.
      searchRevision.current += 1;
      setProducts([]);
      setProductsError(null);
      setProductsLoading(Boolean(value.trim()));
    }
    setQuery(value);
  }

  async function applyCount() {
    if (!canReview || !selectedLocation || countUnconfirmed || applyLock.current) return;
    try { persistDraft(true); } catch { setDraftError("Could not save the count before submitting. No adjustment was sent."); return; }
    applyLock.current = true;
    onBusyChange?.(true);
    setApplying(true);
    setApplyError(null);
    try {
      const result = await api.post<{ applied: number; locationName: string; adjustmentReferenceIds?: number[] }>("/api/odoo/stocktake", {
        confirm: true,
        locationId: Number(locationId),
        lines: changedLines.map((line) => ({
          productId: line.id,
          expectedQty: line.expectedQty,
          countedQty: Number(line.countedQty),
        })),
      });
      setReviewOpen(false);
      const references = result.adjustmentReferenceIds?.filter((id) => Number.isSafeInteger(id) && id > 0) ?? [];
      setSuccess(`Applied ${result.applied} stock ${result.applied === 1 ? "adjustment" : "adjustments"} at ${result.locationName}${references.length ? ` (Orithos quant ${references.join(", ")})` : ""}.`);
      setCountLines([]);
      setQuery("");
      try { if (draftKey) localStorage.removeItem(draftKey); } catch { setDraftError("Adjustment confirmed. Browser storage could not be cleared; discard the old draft before starting again."); }
      onApplied?.();
    } catch (error) {
      if ((error instanceof ApiError && (error.code >= 50000 || error.status >= 500)) || !(error instanceof ApiError)) { setCountUnconfirmed(true); setReviewOpen(false); }
      else { try { persistDraft(false); } catch { setDraftError("Could not save this draft."); } }
      setApplyError(error instanceof Error ? error.message : "Could not apply the stocktake.");
    } finally {
      applyLock.current = false;
      onBusyChange?.(false);
      setApplying(false);
    }
  }

  return (
    <>
        <fieldset disabled={applying} className="min-w-0 space-y-5" aria-busy={applying}>
          {draftNotice && <p role="status" className="rounded-md border border-[var(--oh-tile-orange-border)] bg-[var(--oh-tile-orange-bg)] p-3 text-sm text-[var(--oh-tile-orange-text)]">{draftNotice}</p>}
          {draftError && <div role="alert" className="rounded-md border border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] p-3 text-sm text-[var(--oh-tile-red-text)]">{draftError}<button type="button" onClick={() => setDraftRetry((value) => value + 1)} className="ml-3 underline">Retry draft</button><button type="button" onClick={() => setClearCountOpen(true)} className="ml-3 underline">Discard draft</button></div>}
          {!draftReady && !draftError && locationId && <p role="status">Restoring count…</p>}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[min(100%,280px)] flex-1">
              <label htmlFor="stocktake-location" className="mb-1.5 block text-sm font-medium text-[var(--oh-text)]">Stock location</label>
              <select
                id="stocktake-location"
                value={locationId}
                onChange={(event) => changeLocation(event.target.value)}
                disabled={locationLoading || countLines.length > 0 || locations.length < 2}
                className="h-11 w-full rounded-md border border-[var(--oh-border-strong)] bg-[var(--oh-surface)] px-3 text-sm text-[var(--oh-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] disabled:bg-[var(--oh-surface-muted)]"
              >
                <option value="">{locationLoading ? "Loading locations…" : "Choose a location"}</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
              {locationSource === "single-warehouse-fallback" && (
                <p role="status" className="mt-1.5 text-xs text-[var(--oh-muted)]">Location derived from the store&apos;s only Orithos warehouse. Ask an administrator to save an explicit store binding before enabling stock adjustments.</p>
              )}
              {countUnconfirmed && <p role="alert" className="mt-3 rounded border border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] p-3 text-sm text-[var(--oh-tile-red-text)]">{applyError} This count is preserved. Reconcile it in Orithos, then clear it and start a fresh count.</p>}
            </div>
            {countLines.length > 0 && (
              <button type="button" onClick={() => setClearCountOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
                <Trash2 size={16} aria-hidden="true" /> Clear count
              </button>
            )}
          </div>

          {locationError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--oh-tile-orange-border)] bg-[var(--oh-tile-orange-bg)] p-4 text-sm text-[var(--oh-tile-orange-text)]">
              <span>{locationError}</span>
              <button type="button" onClick={() => setLocationRetryKey((value) => value + 1)} disabled={locationLoading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-tile-orange-border)] bg-[var(--oh-surface-elevated)] px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60"><RefreshCw size={15} /> Retry</button>
            </div>
          ) : locationLoading ? (
        <div role="status" aria-live="polite" aria-busy="true" aria-label="Loading stock locations" className="h-12 animate-pulse rounded-md bg-[var(--oh-border)]" />
          ) : null}

          {locations.length > 1 && !locationId && !locationLoading && (
            <p role="status" className="text-sm text-[var(--oh-muted)]">Choose a stock location to begin counting.</p>
          )}

          {locationId && (
            <section aria-label="Find products" className="space-y-3">
              <label htmlFor="stocktake-search" className="block text-sm font-medium text-[var(--oh-text)]">Search or scan a product</label>
              <div className="relative">
                <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
                <input
                  id="stocktake-search"
                  value={query}
                  onChange={(event) => changeSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || !resultsVisible) return;
                    const term = query.trim().toLowerCase();
                    const exactBarcode = products.find((product) => product.barcode.toLowerCase() === term);
                    if (exactBarcode?.eligible) {
                      event.preventDefault();
                      addProduct(exactBarcode);
                    }
                  }}
                  placeholder="Name, SKU or barcode"
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls="stocktake-search-results"
                  aria-expanded={resultsVisible}
                  aria-busy={searchPending}
                  className="h-12 w-full rounded-md border border-[var(--oh-border-strong)] bg-[var(--oh-surface)] pl-10 pr-3 text-base text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
                />
                {searchPending && <LoaderCircle size={17} role="status" aria-label="Searching products" className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--oh-primary)]" />}
              </div>
              {productsError && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--oh-tile-orange-border)] bg-[var(--oh-tile-orange-bg)] p-3 text-sm text-[var(--oh-tile-orange-text)]">
                  <span>{productsError}</span>
                  <button type="button" onClick={() => setRetryKey((value) => value + 1)} disabled={productsLoading} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-tile-orange-border)] bg-[var(--oh-surface-elevated)] px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60"><RefreshCw size={15} /> Retry</button>
                </div>
              )}
              {resultsVisible && (
                <div id="stocktake-search-results" role="listbox" aria-label="Stocktake product results" className="divide-y divide-[var(--oh-border)] overflow-hidden rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]">
                  {products.length === 0 ? (
                    <p role="status" className="px-4 py-6 text-center text-sm text-[var(--oh-muted)]">No matching products.</p>
                  ) : products.map((product) => (
                    <div
                      key={product.id}
                      role="option"
                      tabIndex={product.eligible && !countLines.some((line) => line.id === product.id) ? 0 : -1}
                      aria-selected={countLines.some((line) => line.id === product.id)}
                      aria-disabled={!product.eligible || countLines.some((line) => line.id === product.id) || countLines.length >= MAX_COUNT_LINES}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || !product.eligible || countLines.some((line) => line.id === product.id) || countLines.length >= MAX_COUNT_LINES) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          addProduct(product);
                        }
                      }}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oh-primary)]"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-[var(--oh-text)]">{product.name}</p>
                        <p className="mt-1 text-xs text-[var(--oh-muted)]">{product.sku || product.barcode || product.uom} · On hand {quantity(product.expectedQty)} {product.uom}</p>
                        {!product.eligible && <p className="mt-1 flex items-center gap-1 text-xs text-[var(--oh-tile-orange-text)]"><AlertTriangle size={13} />{product.ineligibleReason}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => addProduct(product)}
                        disabled={!product.eligible || countLines.some((line) => line.id === product.id) || countLines.length >= MAX_COUNT_LINES}
                        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Plus size={15} aria-hidden="true" />{countLines.some((line) => line.id === product.id) ? "Added" : countLines.length >= MAX_COUNT_LINES ? "Limit reached" : "Add to count"}
                      </button>
                    </div>
                  ))}
                  {eligibleProducts.length >= 60 && <p className="px-4 py-2 text-xs text-[var(--oh-muted)]">Refine the search to see more products.</p>}
                </div>
              )}
              {countLines.length >= MAX_COUNT_LINES && (
                <p role="status" className="text-sm text-[var(--oh-muted)]">This count has {MAX_COUNT_LINES} products. Remove a product or finish this count before adding more.</p>
              )}
            </section>
          )}

          {success && <p role="status" className="rounded-md border border-[var(--oh-tile-green-border)] bg-[var(--oh-tile-green-bg)] px-4 py-3 text-sm font-medium text-[var(--oh-tile-green-text)]">{success}</p>}

          <section aria-label="Counted products" className="overflow-hidden rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oh-border)] px-4 py-3">
              <div><h2 className="text-sm font-semibold text-[var(--oh-text)]">Count review</h2><p className="mt-1 text-xs text-[var(--oh-muted)]">{selectedLocation?.name ?? "No location selected"}</p></div>
              <span className="text-sm tabular-nums text-[var(--oh-muted)]">{countLines.length} {countLines.length === 1 ? "product" : "products"}</span>
            </header>
            {countLines.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[var(--oh-muted)]">Search or scan products to add them to this count.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto xl:block">
                  <table aria-label="Stocktake count lines" className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-[var(--oh-surface)] text-xs text-[var(--oh-muted)]"><tr><th scope="col" className="px-4 py-3 font-medium">Product</th><th scope="col" className="px-4 py-3 font-medium">Expected</th><th scope="col" className="px-4 py-3 font-medium">Counted</th><th scope="col" className="px-4 py-3 font-medium">Variance</th><th scope="col" className="px-2 py-3"><span className="sr-only">Remove</span></th></tr></thead>
                    <tbody className="divide-y divide-[var(--oh-border)]">
                      {countLines.map((line) => {
                        const variance = delta(line.expectedQty, line.countedQty);
                        return <tr key={line.id}>
                          <td className="max-w-[320px] px-4 py-3"><p className="break-words font-medium text-[var(--oh-text)]">{line.name}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">{line.sku || line.barcode || line.uom}</p></td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{quantity(line.expectedQty)} {line.uom}</td>
                          <td className="px-4 py-2"><label><span className="sr-only">Counted quantity for {line.name}</span><input aria-label={`Counted quantity for ${line.name}`} type="number" min="0" max="1000000" step="any" inputMode="decimal" value={line.countedQty} onChange={(event) => setCountLines((current) => current.map((item) => item.id === line.id ? { ...item, countedQty: event.target.value } : item))} className="h-11 w-32 rounded-md border border-[var(--oh-border-strong)] px-3 text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]" /></label></td>
                          <td className={`whitespace-nowrap px-4 py-3 tabular-nums ${variance == null ? "text-[var(--oh-muted)]" : variance < 0 ? "text-[var(--oh-danger)]" : variance > 0 ? "text-[var(--oh-success)]" : "text-[var(--oh-text-secondary)]"}`}>{variance == null ? "—" : `${variance > 0 ? "+" : ""}${quantity(variance)}`}</td>
                          <td className="px-2 py-2"><button type="button" onClick={() => setCountLines((current) => current.filter((item) => item.id !== line.id))} aria-label={`Remove ${line.name}`} className="grid h-11 w-11 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-tile-red-bg)] hover:text-[var(--oh-danger)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"><Trash2 size={17} /></button></td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-[var(--oh-border)] xl:hidden">
                  {countLines.map((line) => {
                    const variance = delta(line.expectedQty, line.countedQty);
                    return <article key={line.id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-[var(--oh-text)]">{line.name}</h3><p className="mt-1 text-xs text-[var(--oh-muted)]">{line.sku || line.barcode || line.uom}</p></div><button type="button" onClick={() => setCountLines((current) => current.filter((item) => item.id !== line.id))} aria-label={`Remove ${line.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-tile-red-bg)] hover:text-[var(--oh-danger)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"><Trash2 size={17} /></button></div>
                      <div className="grid grid-cols-2 gap-3"><p className="text-xs text-[var(--oh-muted)]">Expected<span className="mt-1 block text-sm font-medium tabular-nums text-[var(--oh-text)]">{quantity(line.expectedQty)} {line.uom}</span></p><label className="text-xs text-[var(--oh-muted)]">Counted<span className="sr-only"> quantity for {line.name}</span><input aria-label={`Counted quantity for ${line.name}`} type="number" min="0" max="1000000" step="any" inputMode="decimal" value={line.countedQty} onChange={(event) => setCountLines((current) => current.map((item) => item.id === line.id ? { ...item, countedQty: event.target.value } : item))} className="mt-1 h-11 w-full rounded-md border border-[var(--oh-border-strong)] px-3 text-base tabular-nums text-[var(--oh-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]" /></label></div>
                      <p className="text-xs text-[var(--oh-muted)]">Variance <span className="font-semibold tabular-nums text-[var(--oh-text)]">{variance == null ? "—" : `${variance > 0 ? "+" : ""}${quantity(variance)}`}</span></p>
                    </article>;
                  })}
                </div>
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3">
                  <p className="text-xs text-[var(--oh-muted)]">{!writeEnabled ? "Stock adjustments are not enabled for this store." : invalidCount ? `Enter quantities from 0 to ${MAX_COUNTED_QUANTITY.toLocaleString("en-AU")} for every product.` : changedLines.length ? `${changedLines.length} variance${changedLines.length === 1 ? "" : "s"} to apply.` : "No stock differences to apply."}</p>
                  <button type="button" onClick={() => { setApplyError(null); setReviewOpen(true); }} disabled={!canReview} className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50">Review and apply</button>
                </footer>
              </>
            )}
          </section>
        </fieldset>

      <ConfirmDialog
        open={clearCountOpen}
        title="Clear this count?"
        message={`Discard all ${countLines.length} products and their counted quantities? Orithos stock will not change.`}
        confirmLabel="Discard draft"
        busy={applying}
        onConfirm={() => {
          if (applyLock.current) return;
          try { if (draftKey) localStorage.removeItem(draftKey); } catch { setDraftError("Could not discard the saved draft."); return; }
          setCountLines([]); setApplyError(null); setCountUnconfirmed(false); setDraftError(null); setDraftNotice(null); hydratedDraft.current = draftKey; setDraftReady(true); setClearCountOpen(false);
        }}
        onCancel={() => { if (!applyLock.current) setClearCountOpen(false); }}
      />

      <ConfirmDialog
        open={reviewOpen}
        title="Apply stock adjustments?"
        message={`Apply ${changedLines.length} inventory adjustment${changedLines.length === 1 ? "" : "s"} at ${selectedLocation?.name ?? "this location"}? This updates Orithos on-hand quantities. Increase ${quantity(totalIncrease)}; decrease ${quantity(totalDecrease)}.`}
        confirmLabel="Apply adjustments"
        busy={applying}
        busyLabel="Applying…"
        error={applyError}
        variant="default"
        onConfirm={() => { void applyCount(); }}
        onCancel={() => { if (!applying) setReviewOpen(false); }}
      />
    </>
  );
}
