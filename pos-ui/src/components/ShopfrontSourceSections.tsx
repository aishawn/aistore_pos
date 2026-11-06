"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, LoaderCircle, RefreshCw } from "lucide-react";
import { parseShopfrontSalesReport } from "@/lib/shopfront-dashboard-metrics";

type SourceRow = Record<string, unknown>;
type SourceResponse = {
  data?: SourceRow[];
  pagination?: { total?: number };
  totals?: SourceRow;
  coverage?: { inventory?: { complete?: boolean; snapshot_at?: string } };
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

export function ShopfrontInventorySummary() {
  const state = useSourceSection("report-inventory");
  const inventory = state.data?.coverage?.inventory;
  const totals = state.data?.totals ?? {};
  return <SectionFrame title="Shopfront inventory snapshot" expanded={state.expanded} setExpanded={state.setExpanded}>
    <SourceState loading={state.loading} error={state.error} onRetry={state.refresh}>
      {state.data && <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <p><span className="block text-xs text-[var(--oh-muted)]">Source rows</span><strong>{number(state.data.pagination?.total)}</strong></p>
        <p><span className="block text-xs text-[var(--oh-muted)]">Item level</span><strong>{number(totals.item_level)}</strong></p>
        <p><span className="block text-xs text-[var(--oh-muted)]">Case level</span><strong>{number(totals.case_level)}</strong></p>
        <p><span className="block text-xs text-[var(--oh-muted)]">Last cost value</span><strong>{totals.value_last_cost_complete === 1 ? money(totals.value_last_cost) : "—"}</strong></p>
        <p className="basis-full text-xs text-[var(--oh-muted)]">Snapshot {inventory?.complete === true ? "complete" : "coverage unverified"} · {inventory?.snapshot_at || state.data.fetched_at || "timestamp unavailable"} · excluded from Odoo inventory balances.</p>
      </div>}
      {state.data?.pagination?.total === 0 && <p role="status" className="mt-2 text-sm text-[var(--oh-muted)]">No Shopfront inventory records are available for this store.</p>}
    </SourceState>
  </SectionFrame>;
}

export function ShopfrontProductHistorySection() {
  const state = useSourceSection("report-products", "status=ACTIVE");
  const rows = state.data?.data ?? [];
  return <SectionFrame title="Shopfront product history" expanded={state.expanded} setExpanded={state.setExpanded}>
    <SourceState loading={state.loading} error={state.error} onRetry={state.refresh}>
      {state.data && <>
        <p className="mb-3 text-xs text-[var(--oh-muted)]">{number(state.data.pagination?.total)} source records · archived catalog snapshots · {state.data.fetched_at || "source timestamp unavailable"}</p>
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
