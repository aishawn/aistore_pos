"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Download, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { formatStoreEpoch } from "@/lib/retail-date";
import { friendlyProductName } from "@/lib/product-display-name";
import {
  fetchPriceSuggestions,
  type PriceSuggestionData,
  type PriceSuggestionProduct,
  type SuggestionStatus,
} from "@/lib/price-suggestions-native";
import { loadStoreCompanyProfile } from "@/lib/store-company-settings";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const MARGIN_OPTIONS = [0.2, 0.25, 0.3, 0.35, 0.4];

function statusLabel(status: SuggestionStatus) {
  if (status === "raise") return "Raise price";
  if (status === "review_cost") return "Review";
  if (status === "review_tax") return "Review tax";
  if (status === "fixed_price") return "Fixed denomination";
  if (status === "missing_cost") return "Missing cost";
  if (status === "unsaleable") return "No shelf price";
  return "On target";
}

function csvCell(value: string | number | null) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadSuggestions(products: PriceSuggestionProduct[]) {
  const headers = ["Product", "SKU", "Status", "Standard cost (AUD)", "Current shelf incl tax (AUD)", "Suggested shelf incl tax (AUD)", "Current net margin", "Suggested net margin", "Sold units (28d)", "On hand", "Reason", "Current net", "Current tax", "Suggested net", "Suggested tax"];
  const rows = products.map((product) => [
    product.name,
    product.sku,
    statusLabel(product.status),
    product.cost == null ? "" : product.cost.toFixed(2),
    product.currentPrice == null ? "" : product.currentPrice.toFixed(2),
    product.suggestedPrice == null ? "" : product.suggestedPrice.toFixed(2),
    product.currentMargin == null ? "" : `${(product.currentMargin * 100).toFixed(1)}%`,
    product.suggestedMargin == null ? "" : `${(product.suggestedMargin * 100).toFixed(1)}%`,
    product.soldUnits,
    product.onHand,
    product.reason,
    product.currentNetPrice ?? null, product.currentGst ?? null, product.suggestedNetPrice ?? null, product.suggestedGst ?? null,
  ]);
  const csv = [headers, ...rows].map((row) => row.map((value) => csvCell(value)).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}\r\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `orithos-price-suggestions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function OdooPriceSuggestionsPage() {
  const [data, setData] = useState<PriceSuggestionData | null>(null);
  const [marginTarget, setMarginTarget] = useState(0.3);
  const nextOffset = useRef<number | null>(0);
  const requestBusy = useRef(false);
  const failedAppend = useRef(false);
  const scrollRoot = useRef<HTMLElement>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SuggestionStatus>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [storeTimezone, setStoreTimezone] = useState("Australia/Adelaide");
  const requestRevision = useRef(0);

  const load = useCallback(async (refresh = false, append = false) => {
    if (append && (requestBusy.current || nextOffset.current === null)) return;
    requestBusy.current = true;
    const offset = append ? nextOffset.current! : 0;
    if (!append) { nextOffset.current = 0; setLoadingMore(false); scrollRoot.current?.scrollTo({ top: 0 }); }
    const revision = ++requestRevision.current;
    if (refresh) setRefreshing(true);
    if (append) setLoadingMore(true);
    else if (!refresh) setLoading(true);
    setError(null);
    setRequestId(null);
    try {
      const correlationId = crypto.randomUUID();
      setRequestId(correlationId);
      const payload = await fetchPriceSuggestions(marginTarget, offset);
      if (revision !== requestRevision.current) return;
      setNeedsConnection(false);
      if (payload.nextOffset != null && payload.nextOffset <= offset) throw new Error("Suggestions did not advance. Retry to continue.");
      nextOffset.current = payload.nextOffset ?? null;
      setData((previous) => append && previous ? { ...payload, products: [...previous.products, ...payload.products.filter(row => !previous.products.some(item => item.id === row.id))] } : payload);
      void loadStoreCompanyProfile().then((profile) => {
        if (revision !== requestRevision.current) return;
        if (profile.timezone) setStoreTimezone(profile.timezone);
      }).catch(() => undefined);
      setLastLoadedAt(payload.generatedAt ? Date.parse(payload.generatedAt) : Date.now());
    } catch (cause) {
      if (revision !== requestRevision.current) return;
      failedAppend.current = append;
      if (cause && typeof cause === "object" && "needsConnection" in cause && cause.needsConnection) setNeedsConnection(true);
      setError(cause instanceof Error ? cause.message : "Could not load price suggestions.");
    } finally {
      if (revision === requestRevision.current) {
        requestBusy.current = false;
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [marginTarget]);

  useEffect(() => {
    setData(null);
    void load(false);
    return () => { requestRevision.current += 1; requestBusy.current = false; };
  }, [load]);
  useEffect(() => {
    const node = sentinel.current, root = scrollRoot.current;
    if (!node || !root || data?.nextOffset == null || loading || refreshing || loadingMore || error) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void load(false, true);
    }, { root, rootMargin: "240px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [data?.nextOffset, loading, loadingMore, refreshing, error, load]);

  const actionItems = useMemo(
    () => data?.products.filter((product) => product.status === "raise" || product.status === "review_cost" || product.status === "review_tax" || product.status === "missing_cost" || product.status === "fixed_price") ?? [],
    [data],
  );
  const baseItems = useMemo(
    () => (showAll ? data?.products ?? [] : actionItems),
    [showAll, data?.products, actionItems],
  );
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return baseItems.filter((product) => {
      const matchesQuery = !normalizedQuery
        || product.name.toLowerCase().includes(normalizedQuery)
        || product.sku.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || product.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [baseItems, query, statusFilter]);

  if (loading && !data) {
    return (
      <main className="mx-auto flex h-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="h-8 w-56 animate-pulse rounded bg-[var(--oh-border)]" />
        <div className="h-24 animate-pulse rounded-xl bg-[var(--oh-border)]" />
        <div className="h-64 animate-pulse rounded-xl bg-[var(--oh-border)]" />
      </main>
    );
  }

  if (needsConnection && !data) {
    return (
      <main className="mx-auto flex h-full max-w-lg flex-col items-start justify-center gap-3 px-4 py-10">
        <h1 className="text-xl font-semibold text-[var(--oh-text)]">Connect Orithos to review price suggestions</h1>
        <p className="text-sm text-[var(--oh-muted)]">Suggestions use this store&apos;s Orithos costs and shelf prices. Nothing is written from this page.</p>
        <Link href="/settings/integrations" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
          Open Integrations
        </Link>
      </main>
    );
  }

  return (
    <main ref={scrollRoot} data-testid="price-suggestions-scroll" className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4 overflow-y-auto px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-7">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">AI Workspace</p>
          <h1 className="mt-1 text-xl font-semibold text-[var(--oh-text)]">Price Suggestions</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--oh-muted)]">
            Shelf suggestions use each product&apos;s Orithos tax rate and a target margin on net sales excluding tax.
            You apply any change in Products or Bulk Price Edit — this page never writes prices.
            {lastLoadedAt !== null && (
              <span className="ml-2">Last refreshed {formatStoreEpoch(lastLoadedAt, storeTimezone)}.</span>
            )}
          </p>
        </div>
          <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]">
            Target margin
            <select
              value={String(marginTarget)}
              onChange={(event) => { setMarginTarget(Number(event.target.value)); }}
              className="rounded bg-transparent font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
            >
              {MARGIN_OPTIONS.map((value) => (
                <option key={value} value={value}>{(value * 100).toFixed(0)}%</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60"
          >
            {refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>
      </header>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-950">
        Suggestions only. Orithos does not update Orithos list prices from this screen. Missing costs stay without a suggestion — costs are never invented.
      </p>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          <span className="flex min-w-0 items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" /><span>{error}{requestId ? <span className="mt-1 block break-all font-mono text-xs text-red-800/80">Request ID: {requestId}</span> : null}</span></span>
          <button type="button" onClick={() => void load(true, failedAppend.current)} disabled={refreshing || loadingMore} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 font-semibold underline-offset-2 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60">
            {refreshing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry
          </button>
        </div>
      )}

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard title="Products to review" value={String(actionItems.length)} detail={`of ${number.format(data.products.length)} POS products`} />
          <SummaryCard title="Target margin" value={`${(data.marginTarget * 100).toFixed(0)}%`} detail="On net sales excluding GST" />
          <SummaryCard title="Sales lookback" value={`${data.historyDays}d`} detail={data.company} />
        </div>
      )}

      <section aria-busy={refreshing} className="rounded-xl border border-[var(--oh-border)] bg-white">
        <div className="flex flex-col gap-2 border-b border-[var(--oh-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--oh-text)]">{showAll ? "All POS products" : "Items to review"}</h2>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">Suggestions are read-only. Costs and taxes require review.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => data && downloadSuggestions(visibleItems)}
              disabled={!data || visibleItems.length === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              Export CSV
            </button>
            <Link href="/stock/bulk-price-edit" className="inline-flex min-h-11 items-center rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
              Bulk price edit
            </Link>
            <Link href="/products" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
              Open products
            </Link>
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="min-h-11 rounded-md px-2 text-sm font-semibold text-[var(--oh-orange-dark)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
            >
              {showAll ? "Show suggestions only" : "Show all products"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search products or SKU</span>
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product or SKU"
              className="h-11 w-full rounded-md border border-[var(--oh-border)] bg-white pl-9 pr-9 text-sm text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear product search" className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[var(--oh-muted)] hover:text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--oh-primary)]">
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <label className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]">
            <span className="text-[var(--oh-muted)]">Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | SuggestionStatus)} className="rounded bg-transparent font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]">
              <option value="all">All</option>
              <option value="raise">Raise price</option>
              <option value="review_cost">Review</option>
              <option value="review_tax">Review tax</option>
              <option value="missing_cost">Missing cost</option>
              <option value="fixed_price">Fixed denomination</option>
              <option value="unsaleable">No shelf price</option>
              <option value="ok">On target</option>
            </select>
          </label>
          {(query || statusFilter !== "all") ? (
            <span className="text-xs text-[var(--oh-muted)]" aria-live="polite">{visibleItems.length} shown</span>
          ) : null}
        </div>

        {visibleItems.length === 0 ? (
          <p className="px-4 py-8 text-sm text-[var(--oh-muted)]">
            {data?.products.length ? "No products match the current filters." : "No POS products found."}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--oh-border)]">
            {visibleItems.map((product) => (
              <li key={product.id} className="px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--oh-text)]" title={product.name}>{friendlyProductName(product.name)}</p>
                    <p className="mt-0.5 text-xs text-[var(--oh-muted)]">
                      {product.sku || "No SKU"} · Sold {product.soldUnits == null ? "—" : number.format(product.soldUnits)} · On hand {number.format(product.onHand)}
                    </p>
                    {product.currentNetPrice != null && <p className="mt-1 text-xs text-[var(--oh-muted)]">
                      Current net {money.format(product.currentNetPrice)} · Tax {money.format(product.currentGst ?? 0)}
                      {product.suggestedNetPrice != null && product.suggestedPrice != null ? ` · Suggested net ${money.format(product.suggestedNetPrice)} · Tax ${money.format(product.suggestedGst ?? 0)}` : ""}
                    </p>}
                    <p className="mt-2 text-sm text-[var(--oh-text-secondary)]">
                      Cost {product.cost == null ? "—" : money.format(product.cost)}
                      {" · "}Current {product.currentPrice == null ? "—" : money.format(product.currentPrice)}
                      {product.currentMargin != null ? ` (${(product.currentMargin * 100).toFixed(1)}%)` : ""}
                      {product.suggestedPrice != null ? ` · Suggested ${money.format(product.suggestedPrice)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                    <span className="inline-flex justify-center rounded-full bg-[var(--oh-orange-light)] px-2.5 py-1 text-xs font-bold text-[var(--oh-orange-dark)]">
                      {statusLabel(product.status)}
                    </span>
                    <Link
                      href={`/products?q=${encodeURIComponent(product.sku || product.name)}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
                    >
                      Open product
                    </Link>
                    <Link
                      href={`/stock/bulk-price-edit?search=${encodeURIComponent(product.sku || product.name)}${product.status === "raise" && product.suggestedListPrice != null ? `&productId=${product.id}&suggestedPrice=${product.suggestedListPrice}&expectedPrice=${product.currentListPrice}` : ""}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
                    >
                      Bulk edit this product
                    </Link>
                    <button
                      type="button"
                      onClick={() => setExpandedId((current) => (current === product.id ? null : product.id))}
                      aria-expanded={expandedId === product.id}
                      aria-controls={`price-suggestion-explanation-${product.id}`}
                      className="min-h-11 rounded-md px-2 text-sm font-semibold text-[var(--oh-orange-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
                    >
                      {expandedId === product.id ? "Hide explanation" : "Explain suggestion"}
                    </button>
                  </div>
                </div>
                {expandedId === product.id && (
                  <p id={`price-suggestion-explanation-${product.id}`} className="mt-2 rounded-md bg-[var(--oh-surface)] px-3 py-2 text-sm leading-5 text-[var(--oh-text-secondary)]">
                    {product.reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {data && <div ref={sentinel} className="flex shrink-0 flex-wrap items-center justify-center gap-3 py-3 text-sm text-[var(--oh-muted)]" aria-live="polite">
        <span>{loadingMore ? "Loading more price suggestions…" : data.nextOffset != null ? `Loaded ${data.products.length} suggestions` : "All suggestions loaded"}</span>
        {data.nextOffset != null && <button type="button" disabled={loading || refreshing || loadingMore} onClick={() => void load(Boolean(error), true)} className="min-h-11 rounded-md border border-[var(--oh-border)] px-3 font-semibold text-[var(--oh-primary)] disabled:opacity-60">{error ? "Retry loading" : "Load more"}</button>}
      </div>}
    </main>
  );
}

function SummaryCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[var(--oh-border)] bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">{title}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--oh-text)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--oh-muted)]">{detail}</p>
    </div>
  );
}
