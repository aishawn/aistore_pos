"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, LoaderCircle, RefreshCw } from "lucide-react";
import { parseShopfrontSalesReport } from "@/lib/shopfront-dashboard-metrics";
import { formatStoreEpoch } from "@/lib/odoo-date";
import type { InventoryShopfrontCoverage } from "@/lib/inventory-snapshot";

type SourceRow = Record<string, unknown>;
type SourceResponse = {
  data?: SourceRow[];
  pagination?: { total?: number };
  totals?: SourceRow;
  coverage?: {
    catalog?: { active_records?: number; current_records?: number };
    inventory?: {
      complete?: boolean;
      snapshot_at?: string;
      positive_quantity_total?: number | string;
      negative_records?: number;
    };
  };
  fetched_at?: string;
  source?: string;
  source_version?: string;
  message?: string;
};

function useSourceSection(resource: string, extra = "", initiallyExpanded = false) {
  const [expanded, setExpandedState] = useState(initiallyExpanded);
  const [requestId, setRequestId] = useState(0);
  const [resolvedId, setResolvedId] = useState(-1);
  const [data, setData] = useState<SourceResponse | null>(null);
  const [requestError, setRequestError] = useState<{ id: number; message: string } | null>(null);
  const error = requestError?.id === requestId ? requestError.message : "";
  const loading = expanded && resolvedId !== requestId && !error;

  function setExpanded(open: boolean) {
    setExpandedState(open);
    if (open) {
      setRequestError(null);
      setRequestId((value) => value + 1);
    }
  }

  function refresh() {
    setRequestError(null);
    setRequestId((value) => value + 1);
  }

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    const activeRequest = requestId;
    const query = new URLSearchParams({ resource, page: "1", size: resource === "report-products" ? "25" : resource === "report-sales" ? "600" : "1" });
    new URLSearchParams(extra).forEach((value, key) => query.set(key, value));
    void fetch(`/api/shopfront-source?${query}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as SourceResponse | null;
        if (!response.ok || !body || !Array.isArray(body.data)) throw new Error(body?.message || "Shopfront source data is unavailable.");
        if (resource === "report-inventory") {
          const coverageResponse = await fetch("/api/shopfront-source?resource=coverage", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
          const coverageBody = await coverageResponse.json().catch(() => null) as { data?: SourceResponse["coverage"] } | null;
          if (coverageResponse.ok && coverageBody?.data) body.coverage = coverageBody.data;
        }
        if (!controller.signal.aborted) { setData(body); setResolvedId(activeRequest); }
      })
      .catch((cause) => { if (!controller.signal.aborted) setRequestError({ id: activeRequest, message: cause instanceof Error ? cause.message : "Shopfront source data is unavailable." }); });
    return () => controller.abort();
  }, [expanded, extra, requestId, resource]);

  return { expanded, setExpanded, refresh, data, loading, error };
}

const buttonClass = "inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]";
const number = (value: unknown) => Number.isFinite(Number(value)) ? new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(Number(value)) : "—";
const money = (value: unknown) => Number.isFinite(Number(value)) ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value)) : "—";

function SectionFrame({ title, expanded, setExpanded, children }: { title: string; expanded: boolean; setExpanded: (value: boolean) => void; children: ReactNode }) {
  return <section className="shrink-0 overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div><h2 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h2><p className="mt-0.5 text-xs text-[var(--oh-muted)]">Shopfront · read-only source records</p></div>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className={buttonClass}>{expanded ? "Hide history" : "View history"} <ChevronDown size={15} aria-hidden="true" /></button>
    </header>
    {expanded && <div className="border-t border-[var(--oh-border)] p-4">{children}</div>}
  </section>;
}

function SourceState({ loading, error, onRetry, children }: { loading: boolean; error: string; onRetry: () => void; children: ReactNode }) {
  if (loading) return <p role="status" className="flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" /> Loading Shopfront source data…</p>;
  if (error) return <div role="status" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-[var(--oh-muted)]">{error}</span><button type="button" onClick={onRetry} className={buttonClass}><RefreshCw size={15} /> Retry</button></div>;
  return <>{children}</>;
}

export function ShopfrontInventorySummary({ odooProductCount, coverage }: { odooProductCount?: number; coverage?: InventoryShopfrontCoverage | null }) {
  const [expanded, setExpanded] = useState(false);
  const sourceCoverage = coverage ?? null;
  return <SectionFrame title="Shopfront inventory snapshot" expanded={expanded} setExpanded={setExpanded}>
    {sourceCoverage && <div className="flex flex-wrap gap-x-8 gap-y-3 p-4 text-sm">
      <p><span className="block text-xs text-[var(--oh-muted)]">Shopfront active products</span><strong>{number(sourceCoverage.activeProducts)}</strong></p>
      {typeof odooProductCount === "number" && <p><span className="block text-xs text-[var(--oh-muted)]">Odoo saleable variants</span><strong>{number(odooProductCount)}</strong></p>}
      <p><span className="block text-xs text-[var(--oh-muted)]">Shopfront positive units</span><strong>{number(sourceCoverage.positiveInventoryUnits)}</strong></p>
      <p><span className="block text-xs text-[var(--oh-muted)]">Inventory-covered products</span><strong>{number(sourceCoverage.inventoryProductRows)} / {number(sourceCoverage.activeProducts)}</strong></p>
      {typeof sourceCoverage.productsWithCost === "number" && <p><span className="block text-xs text-[var(--oh-muted)]">Products with source cost</span><strong>{number(sourceCoverage.productsWithCost)}</strong></p>}
      {typeof sourceCoverage.zeroCostProducts === "number" && sourceCoverage.zeroCostProducts > 0 && <p><span className="block text-xs text-[var(--oh-muted)]">Source-reported $0 cost</span><strong>{number(sourceCoverage.zeroCostProducts)}</strong></p>}
      {expanded && <p className="basis-full text-xs text-[var(--oh-muted)]">Shopfront source mirror · read-only · {sourceCoverage.inventorySnapshotAt ? `snapshot ${formatStoreEpoch(Date.parse(sourceCoverage.inventorySnapshotAt), "Australia/Adelaide")}` : "snapshot time unavailable"}. The report rows and totals above use the same canonical Shopfront-linked products. Positive source stock is shown separately from signed Odoo on-hand balances.</p>}
    </div>}
    {!sourceCoverage && <p role="status" className="px-4 pb-4 text-sm text-amber-800">Shopfront coverage is unavailable; the rows remain marked by source status.</p>}
  </SectionFrame>;
}

export function ShopfrontProductHistorySection() {
  const state = useSourceSection("report-products", "status=ACTIVE");
  const rows = state.data?.data ?? [];
  return <SectionFrame title="Shopfront product history" expanded={state.expanded} setExpanded={state.setExpanded}>
    <SourceState loading={state.loading} error={state.error} onRetry={state.refresh}>
      {state.data && <>
        <p className="mb-3 text-xs text-[var(--oh-muted)]">{number(state.data.pagination?.total)} active Shopfront products · archived catalog snapshots · {state.data.fetched_at || "source timestamp unavailable"}. This catalog count is not directly comparable to Odoo saleable product variants.</p>
        {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="text-xs text-[var(--oh-muted)]"><th className="border-b px-2 py-2">Product</th><th className="border-b px-2 py-2">Category</th><th className="border-b px-2 py-2">Status</th><th className="border-b px-2 py-2 text-right">Source price</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${String(row.shopfront_product_id ?? row.id ?? "source")}-${index}`}><td className="border-b px-2 py-2">{String(row.name ?? "Unnamed product")}</td><td className="border-b px-2 py-2">{String(row.category ?? "—")}</td><td className="border-b px-2 py-2">{String(row.status ?? "Unknown")}</td><td className="border-b px-2 py-2 text-right">{money(row.price)}</td></tr>)}</tbody></table></div> : <p role="status" className="text-sm text-[var(--oh-muted)]">No matching Shopfront product records are available.</p>}
      </>}
    </SourceState>
  </SectionFrame>;
}

export function ShopfrontSalesSummary({ from, to }: { from: string; to: string }) {
  const state = useSourceSection("report-sales", `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, true);
  const metrics = state.data ? parseShopfrontSalesReport(state.data) : null;
  const coverage = state.data?.coverage as { missing_dates?: unknown[] } | undefined;
  const missingDays = Array.isArray(coverage?.missing_dates) ? coverage.missing_dates.length : null;
  return <section className="rounded-lg border border-[var(--oh-border)] bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div><h2 className="text-sm font-semibold text-[var(--oh-text)]">Shopfront source sales</h2><p className="mt-0.5 text-xs text-[var(--oh-muted)]">{from} to {to} · read-only · separate from Odoo totals</p></div>
      <button type="button" onClick={state.refresh} disabled={state.loading} className={buttonClass}><RefreshCw size={15} /> Refresh</button>
    </header>
    <div className="border-t border-[var(--oh-border)] px-4 py-3">
      <SourceState loading={state.loading} error={state.error} onRetry={state.refresh}>
        {metrics ? <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <p><span className="block text-xs text-[var(--oh-muted)]">Source revenue</span><strong>{money(metrics.revenue)}</strong></p>
          <p><span className="block text-xs text-[var(--oh-muted)]">Source gross margin</span><strong>{metrics.grossMargin === null ? "—" : `${(metrics.grossMargin * 100).toFixed(1)}%`}</strong></p>
          <p><span className="block text-xs text-[var(--oh-muted)]">Transactions</span><strong>{number(metrics.transactionCount)}</strong></p>
          <p className="basis-full text-xs text-[var(--oh-muted)]">{missingDays === null ? "Source sync coverage unknown" : missingDays ? `Partial source coverage · ${missingDays} date(s) missing` : "Source report rows reconciled"} · not ledger-audited{metrics.fetchedAt ? ` · fetched ${metrics.fetchedAt}` : ""}</p>
        </div> : state.data ? <p role="status" className="text-sm text-amber-900">Shopfront returned incomplete or inconsistent source rows. No totals are shown.</p> : !state.loading && !state.error ? <p role="status" className="text-sm text-[var(--oh-muted)]">Shopfront source data is unavailable.</p> : null}
      </SourceState>
    </div>
  </section>;
}
