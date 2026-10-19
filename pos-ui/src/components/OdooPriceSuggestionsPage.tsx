"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Download, LoaderCircle, RefreshCw } from "lucide-react";
import { fetchOdooRoute, getOdooPosBootstrap } from "@/lib/odoo-api";
import { formatStoreEpoch } from "@/lib/odoo-date";

type SuggestionStatus = "ok" | "raise" | "review_cost" | "missing_cost" | "unsaleable";

type PriceSuggestionProduct = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  soldUnits: number;
  onHand: number;
  cost: number | null;
  currentPrice: number | null;
  currentMargin: number | null;
  suggestedPrice: number | null;
  suggestedMargin: number | null;
  status: SuggestionStatus;
  reason: string;
  reasonParts?: string[];
  method?: string;
};

type PriceSuggestionData = {
  company: string;
  historyDays: number;
  marginTarget: number;
  products: PriceSuggestionProduct[];
  truncated: boolean;
  generatedAt: string;
  writeEnabled: false;
};

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const MARGIN_OPTIONS = [0.2, 0.25, 0.3, 0.35, 0.4];

function statusLabel(status: SuggestionStatus) {
  if (status === "raise") return "Raise price";
  if (status === "review_cost") return "Review";
  if (status === "missing_cost") return "Missing cost";
  if (status === "unsaleable") return "No shelf price";
  return "On target";
}

function csvCell(value: string | number | null) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadSuggestions(products: PriceSuggestionProduct[]) {
  const headers = ["Product", "SKU", "Status", "Cost (AUD)", "Current price (AUD)", "Suggested price (AUD)", "Current margin", "Suggested margin", "Sold units (28d)", "On hand", "Reason"];
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
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [storeTimezone, setStoreTimezone] = useState("Australia/Adelaide");
  const requestRevision = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const revision = ++requestRevision.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetchOdooRoute(
        `/api/odoo/price-suggestions?marginTarget=${marginTarget}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const payload = await response.json().catch(() => null) as PriceSuggestionData | { message?: string } | null;
      if (revision !== requestRevision.current) return;
      if (!response.ok) {
        const message = payload && "message" in payload ? payload.message : undefined;
        setNeedsConnection(response.status === 401 || response.status === 503);
        throw new Error(message || `Could not load price suggestions (${response.status}).`);
      }
      if (!payload || !("products" in payload) || !Array.isArray(payload.products)) {
        throw new Error("Odoo returned an incomplete price suggestion list.");
      }
      setNeedsConnection(false);
      setData(payload);
      try {
        const bootstrap = await getOdooPosBootstrap();
        if (revision !== requestRevision.current) return;
        const activeConfig = bootstrap.configs.find((config) => config.session) ?? bootstrap.configs[0];
        if (activeConfig?.timezone) setStoreTimezone(activeConfig.timezone);
      } catch {
        // Suggestions remain useful without register metadata.
      }
      setLastLoadedAt(Date.now());
    } catch (cause) {
      if (revision !== requestRevision.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load price suggestions.");
    } finally {
      if (revision === requestRevision.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [marginTarget]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const actionItems = useMemo(
    () => data?.products.filter((product) => product.status === "raise" || product.status === "review_cost") ?? [],
    [data],
  );
  const visibleItems = showAll ? data?.products ?? [] : actionItems;

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
        <h1 className="text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to review price suggestions</h1>
        <p className="text-sm text-[var(--oh-muted)]">Suggestions use this store&apos;s Odoo costs and shelf prices. Nothing is written from this page.</p>
        <Link href="/settings/integrations" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">
          Open Integrations
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock · Pricing</p>
          <h1 className="mt-1 text-xl font-semibold text-[var(--oh-text)]">Price suggestions</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--oh-muted)]">
            Rule-based GST-inclusive shelf suggestions from Odoo cost and a target margin on sell.
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
              onChange={(event) => setMarginTarget(Number(event.target.value))}
              className="bg-transparent font-semibold outline-none"
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
            className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] disabled:opacity-60"
          >
            {refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>
      </header>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-950">
        Suggestions only. Orithos does not update Odoo list prices from this screen. Missing costs stay without a suggestion — costs are never invented.
      </p>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          <span className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</span>
          <button type="button" onClick={() => void load(true)} className="font-semibold underline">Retry</button>
        </div>
      )}

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard title="Products to review" value={String(actionItems.length)} detail={`of ${number.format(data.products.length)} POS products`} />
          <SummaryCard title="Target margin" value={`${(data.marginTarget * 100).toFixed(0)}%`} detail="On GST-inclusive shelf price" />
          <SummaryCard title="Sales lookback" value={`${data.historyDays}d`} detail={data.company} />
        </div>
      )}

      <section className="rounded-xl border border-[var(--oh-border)] bg-white">
        <div className="flex flex-col gap-2 border-b border-[var(--oh-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--oh-text)]">{showAll ? "All POS products" : "Suggested price changes"}</h2>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">Method: rules_v1_margin_on_sell · writeEnabled=false</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => data && downloadSuggestions(visibleItems)}
              disabled={!data || visibleItems.length === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold text-[var(--oh-text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              Export CSV
            </button>
            <Link href="/stock/bulk-price-edit" className="inline-flex min-h-11 items-center rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold text-[var(--oh-text)]">
              Bulk price edit
            </Link>
            <Link href="/products/odoo" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white">
              Open products
            </Link>
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="min-h-11 rounded-md px-2 text-sm font-semibold text-[var(--oh-orange-dark)] hover:underline"
            >
              {showAll ? "Show suggestions only" : "Show all products"}
            </button>
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <p className="px-4 py-8 text-sm text-[var(--oh-muted)]">
            {data?.products.length ? "No price raises suggested at this margin target." : "No POS products found."}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--oh-border)]">
            {visibleItems.map((product) => (
              <li key={product.id} className="px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--oh-text)]">{product.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--oh-muted)]">
                      {product.sku || "No SKU"} · Sold {number.format(product.soldUnits)} · On hand {number.format(product.onHand)}
                    </p>
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
                      href={`/products/odoo?q=${encodeURIComponent(product.sku || product.name)}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold"
                    >
                      Open product
                    </Link>
                    <button
                      type="button"
                      onClick={() => setExpandedId((current) => (current === product.id ? null : product.id))}
                      className="min-h-11 text-sm font-semibold text-[var(--oh-orange-dark)]"
                    >
                      {expandedId === product.id ? "Hide explanation" : "Explain suggestion"}
                    </button>
                  </div>
                </div>
                {expandedId === product.id && (
                  <p className="mt-2 rounded-md bg-[var(--oh-surface)] px-3 py-2 text-sm leading-5 text-[var(--oh-text-secondary)]">
                    {product.reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
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
