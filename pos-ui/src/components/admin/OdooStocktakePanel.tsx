"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useDebouncedValue } from "@/hooks/useApi";
import { api, ApiError, type Page } from "@/lib/api";
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
type CountLine = StocktakeProduct & { countedQty: string };
type NativeProduct = {
  id: number;
  name: string;
  stockQuantity?: number | null;
  barcodes?: Array<{ code?: string | null }> | null;
  trackInventory?: boolean | null;
};

const MAX_COUNT_LINES = 40;
const MAX_COUNTED_QUANTITY = 1_000_000;

function quantity(value: number) {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(value);
}

function delta(expected: number, counted: string) {
  if (!counted.trim() || !Number.isFinite(Number(counted))) return null;
  return Number(counted) - expected;
}

function mapProduct(product: NativeProduct): StocktakeProduct {
  const track = product.trackInventory !== false;
  return {
    id: Number(product.id),
    name: product.name,
    sku: "",
    barcode: product.barcodes?.find((row) => row.code)?.code || "",
    uom: "Units",
    expectedQty: Number(product.stockQuantity ?? 0),
    eligible: track,
    ineligibleReason: track ? null : "This product does not track inventory.",
  };
}

/** Count / adjust Orithos on-hand qty. Used inside Products (tab), not a Stock sidebar item. */
export function OdooStocktakePanel({ onBusyChange, onApplied }: { onBusyChange?: (busy: boolean) => void; onApplied?: () => void }) {
  const { user, ready } = useAuth();
  const outletId = user?.outletId ?? null;
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
    setDraftNotice(null);
    setCountLines([]);
    setCountUnconfirmed(false);
    async function restore() {
      try {
        const raw = localStorage.getItem(draftKey!);
        const draft = parseStocktakeDraft(raw);
        if (raw && !draft) throw new Error("The saved draft could not be read. Discard this draft to start again.");
        if (draft?.lines.length) {
          const page = await api.get<Page<NativeProduct>>("/api/products", {
            page: 1,
            size: Math.max(draft.lines.length, 40),
            ids: draft.lines.map((line) => line.id).join(","),
          }).catch(async () => {
            const rows = await Promise.all(draft.lines.map((line) => api.get<NativeProduct>(`/api/products/${line.id}`)));
            return { items: rows, total: rows.length, page: 1, size: rows.length };
          });
          if (cancelled) return;
          const mapped = page.items.map(mapProduct);
          if (mapped.length !== draft.lines.length) throw new Error("Some draft products are no longer available. Retry or discard this draft before counting.");
          const changed = draft.lines.some((line) => mapped.find((product) => product.id === line.id)?.expectedQty !== line.expectedQty);
          setCountLines(draft.lines.map((line) => ({ ...mapped.find((product) => product.id === line.id)!, countedQty: line.countedQty })));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countLines, countUnconfirmed, draftKey, draftReady]);

  useEffect(() => {
    let cancelled = false;
    setLocationLoading(true);
    setLocationError(null);
    void (async () => {
      try {
        if (!outletId) throw new Error("Sign in with an outlet before counting stock.");
        const outlets = await api.get<Array<{ id: number; name: string }>>("/api/outlets");
        if (cancelled) return;
        const rows = (Array.isArray(outlets) ? outlets : []).map((outlet) => ({ id: Number(outlet.id), name: outlet.name }));
        const selected = rows.find((row) => row.id === outletId) ?? rows[0];
        setLocations(selected ? [selected] : []);
        setWriteEnabled(Boolean(selected));
        setLocationId(selected ? String(selected.id) : "");
      } catch (error) {
        if (!cancelled) setLocationError(error instanceof Error ? error.message : "Could not load Orithos outlets.");
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [locationRetryKey, outletId]);

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
    void api.get<Page<NativeProduct>>("/api/products", { name: term, page: 1, size: 40, status: "ACTIVE" })
      .then((page) => {
        if (revision === searchRevision.current) setProducts(page.items.map(mapProduct));
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

  function changeLocation(value: string) {
    setLocationId(value);
    setCountLines([]);
    setQuery("");
    setProducts([]);
    setSuccess(null);
    setApplyError(null);
    setDraftNotice(null);
  }

  function addProduct(product: StocktakeProduct) {
    setCountLines((current) => !draftReady || !!draftError || countUnconfirmed || !product.eligible || current.length >= MAX_COUNT_LINES || current.some((line) => line.id === product.id)
      ? current
      : [...current, { ...product, countedQty: "" }]);
    setSuccess(null);
  }

  function changeSearch(value: string) {
    if (value.trim() !== searchTerm) {
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
      for (const line of changedLines) {
        await api.put(`/api/products/${line.id}/inventory`, {
          rows: [{ outletId: selectedLocation.id, quantity: Number(line.countedQty) }],
        });
      }
      setReviewOpen(false);
      setSuccess(`Applied ${changedLines.length} stock ${changedLines.length === 1 ? "adjustment" : "adjustments"} at ${selectedLocation.name}.`);
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
            {locationLoading ? <p role="status" className="text-sm text-[var(--oh-muted)]">Loading outlets…</p> : locationError ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-amber-900"><span>{locationError}</span><button type="button" onClick={() => setLocationRetryKey((value) => value + 1)} className="underline">Retry</button></div>
            ) : (
              <select id="stocktake-location" value={locationId} onChange={(event) => changeLocation(event.target.value)} className="h-11 w-full rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm">
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            )}
          </div>
          <p className="text-xs text-[var(--oh-muted)]">Orithos outlet on-hand · write {writeEnabled ? "enabled" : "disabled"}</p>
        </div>

        <label className="flex h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3">
          <Search size={16} className="text-[var(--oh-muted)]" />
          <input value={query} onChange={(event) => changeSearch(event.target.value)} placeholder="Search products to count" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>

        {productsError && <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"><span>{productsError}</span><button type="button" onClick={() => setRetryKey((value) => value + 1)} className="underline">Retry</button></div>}
        {searchPending && <p role="status" className="flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={14} className="animate-spin" /> Searching…</p>}
        {resultsVisible && (
          <ul className="divide-y rounded-lg border border-[var(--oh-border)] bg-white">
            {eligibleProducts.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div><p className="font-medium">{product.name}</p><p className="text-xs text-[var(--oh-muted)]">On hand {quantity(product.expectedQty)} · {product.barcode || "No barcode"}</p></div>
                <button type="button" onClick={() => addProduct(product)} className="inline-flex h-10 items-center gap-1 rounded-md border px-3 text-xs font-semibold"><Plus size={14} /> Add</button>
              </li>
            ))}
            {!eligibleProducts.length && <li className="px-3 py-4 text-sm text-[var(--oh-muted)]">No matching Orithos products.</li>}
          </ul>
        )}

        {countLines.length > 0 && (
          <section className="space-y-3 rounded-lg border border-[var(--oh-border)] bg-white p-3">
            <header className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Count sheet</h3><button type="button" onClick={() => setClearCountOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700"><Trash2 size={14} /> Clear</button></header>
            <ul className="space-y-2">
              {countLines.map((line) => (
                <li key={line.id} className="grid gap-2 sm:grid-cols-[1fr_120px]">
                  <div><p className="text-sm font-medium">{line.name}</p><p className="text-xs text-[var(--oh-muted)]">Expected {quantity(line.expectedQty)}</p></div>
                  <input aria-label={`Counted quantity for ${line.name}`} value={line.countedQty} onChange={(event) => setCountLines((current) => current.map((row) => row.id === line.id ? { ...row, countedQty: event.target.value } : row))} className="h-11 rounded-md border px-3 text-sm" inputMode="decimal" />
                </li>
              ))}
            </ul>
            <button type="button" disabled={!canReview} onClick={() => setReviewOpen(true)} className="inline-flex h-11 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50">Review adjustments</button>
          </section>
        )}

        {success && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{success}</p>}
        {applyError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{applyError}</p>}
        {countUnconfirmed && <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"><AlertTriangle size={16} className="mt-0.5" /> Last submit may have succeeded. Refresh on-hand quantities before applying again.</p>}
      </fieldset>

      <ConfirmDialog
        open={reviewOpen}
        title="Apply Orithos stock adjustments?"
        message={`${changedLines.length} product${changedLines.length === 1 ? "" : "s"} will be updated to the counted on-hand quantity for ${selectedLocation?.name ?? "this outlet"}.`}
        confirmLabel={applying ? "Applying…" : "Apply counts"}
        busy={applying}
        onCancel={() => setReviewOpen(false)}
        onConfirm={() => void applyCount()}
      />
      <ConfirmDialog
        open={clearCountOpen}
        title="Clear count sheet?"
        message="Discard the current counted quantities on this device."
        confirmLabel="Clear"
        onCancel={() => setClearCountOpen(false)}
        onConfirm={() => { setCountLines([]); setClearCountOpen(false); setSuccess(null); }}
      />
    </>
  );
}
