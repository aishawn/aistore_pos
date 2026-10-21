"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarRange, Check, Clock3, ExternalLink, LoaderCircle, RefreshCw, ShoppingCart, Store, X } from "lucide-react";
import { createOdooDraftRfq, fetchOdooRoute, getOdooSuppliers, type OdooDraftRfq, type OdooSupplierOption } from "@/lib/odoo-api";
import { appendReplenishmentAudit, readReplenishmentAudit, type ReplenishmentAuditEntry } from "@/lib/replenishment-audit";
import { getOdooPosBootstrap } from "@/lib/odoo-api";
import { formatOdooDateTime, formatStoreEpoch } from "@/lib/odoo-date";
import { useDialogFocus } from "@/hooks/useDialogFocus";

type ReplenishmentProduct = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  soldUnits: number;
  recentUnits: number;
  previousUnits: number;
  unitsPerDay: number;
  trendPercent: number | null;
  trend: "new" | "up" | "down" | "steady" | null;
  onHand: number;
  forecastStock: number;
  daysOfStock: number | null;
  suggestedQuantity: number;
  reason?: string;
  reasonParts?: string[];
  method?: string;
};

type ReplenishmentData = {
  company: string;
  historyDays: number;
  periodDays: number;
  coverageDays: number;
  products: ReplenishmentProduct[];
  truncated: boolean;
  generatedAt: string;
};

const coverageOptions = [7, 14, 21, 28, 42];
const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const MAX_RFQ_LINES = 100;
const MAX_RFQ_QUANTITY = 100_000;

type DraftRfqLine = { productId: number; name: string; unit: string; suggestedQuantity: number; quantity: number; reason: string };

export function OdooReplenishmentPage() {
  const [data, setData] = useState<ReplenishmentData | null>(null);
  const [coverageDays, setCoverageDays] = useState(21);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [rfqOpen, setRfqOpen] = useState(false);
  const [rfqLoadingSuppliers, setRfqLoadingSuppliers] = useState(false);
  const [rfqSubmitting, setRfqSubmitting] = useState(false);
  const [rfqSuppliers, setRfqSuppliers] = useState<OdooSupplierOption[]>([]);
  const [rfqSupplierId, setRfqSupplierId] = useState("");
  const [rfqSupplierError, setRfqSupplierError] = useState<string | null>(null);
  const [rfqLines, setRfqLines] = useState<DraftRfqLine[]>([]);
  const [rfqError, setRfqError] = useState<string | null>(null);
  const [createdRfq, setCreatedRfq] = useState<OdooDraftRfq | null>(null);
  const [auditEntries, setAuditEntries] = useState<ReplenishmentAuditEntry[]>([]);
  const [expandedReasonId, setExpandedReasonId] = useState<number | null>(null);
  const [storeTimezone, setStoreTimezone] = useState("Australia/Adelaide");
  const requestRevision = useRef(0);
  const rfqSupplierRevision = useRef(0);
  const rfqSupplierRef = useRef<HTMLSelectElement>(null);

  useDialogFocus(rfqOpen, () => {
    if (!rfqSubmitting) setRfqOpen(false);
  }, rfqLoadingSuppliers ? "rfq-loading" : "rfq-ready", rfqSupplierRef);

  useEffect(() => {
    setAuditEntries(readReplenishmentAudit());
  }, []);

  const load = useCallback(async (refresh = false) => {
    const revision = ++requestRevision.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetchOdooRoute(`/api/odoo/replenishment?coverageDays=${coverageDays}`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => null) as ReplenishmentData | { message?: string } | null;
      if (revision !== requestRevision.current) return;
      if (!response.ok) {
        const message = payload && "message" in payload ? payload.message : undefined;
        setNeedsConnection(response.status === 401 || response.status === 503);
        throw new Error(message || `Could not load the replenishment plan (${response.status}).`);
      }
      if (!payload || !("products" in payload) || !Array.isArray(payload.products)) throw new Error("Odoo returned an incomplete replenishment plan.");
      setNeedsConnection(false);
      setData(payload);
      try {
        const bootstrap = await getOdooPosBootstrap();
        if (revision !== requestRevision.current) return;
        const activeConfig = bootstrap.configs.find((config) => config.session) ?? bootstrap.configs[0];
        if (activeConfig?.timezone) setStoreTimezone(activeConfig.timezone);
      } catch {
        // The replenishment response remains useful when register metadata is unavailable.
      }
      setLastLoadedAt(Date.now());
    } catch (cause) {
      if (revision === requestRevision.current) {
        setError(cause instanceof Error ? cause.message : "Could not load the replenishment plan.");
      }
    } finally {
      if (revision === requestRevision.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [coverageDays]);

  useEffect(() => { void load(); }, [load]);

  const suggestedItems = useMemo(() => data?.products.filter((product) => product.suggestedQuantity > 0) ?? [], [data]);
  const visibleItems = showAll ? data?.products ?? [] : suggestedItems;
  const totalSuggestedUnits = suggestedItems.reduce((sum, product) => sum + product.suggestedQuantity, 0);
  const outOfStockWithDemand = suggestedItems.filter((product) => product.onHand <= 0 && product.soldUnits > 0).length;
  const hasRecentSales = data?.products.some((product) => product.soldUnits > 0) ?? false;
  const selectedRfqLines = rfqLines.filter((line) => line.quantity > 0);
  const planCoverageDays = data?.coverageDays ?? coverageDays;
  const canCreateRfq = suggestedItems.length > 0 && !loading && !refreshing && !error && data?.coverageDays === coverageDays;

  function openRfqDialog() {
    if (!canCreateRfq) return;
    setRfqLines(suggestedItems.slice(0, MAX_RFQ_LINES).map((product) => ({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      suggestedQuantity: product.suggestedQuantity,
      quantity: product.suggestedQuantity,
      reason: product.reason || product.reasonParts?.join(" ") || "",
    })));
    setRfqSupplierId("");
    setRfqError(null);
    setCreatedRfq(null);
    setRfqOpen(true);
    void loadRfqSuppliers();
  }

  async function loadRfqSuppliers() {
    const revision = ++rfqSupplierRevision.current;
    setRfqLoadingSuppliers(true);
    setRfqSupplierError(null);
    setRfqSuppliers([]);
    setRfqSupplierId("");
    try {
      const suppliers = await getOdooSuppliers();
      if (revision !== rfqSupplierRevision.current) return;
      setRfqSuppliers(suppliers);
      if (suppliers.length === 1) setRfqSupplierId(String(suppliers[0].id));
    } catch (cause) {
      if (revision === rfqSupplierRevision.current) {
        setRfqSupplierError(cause instanceof Error ? cause.message : "Could not load Odoo suppliers.");
      }
    } finally {
      if (revision === rfqSupplierRevision.current) setRfqLoadingSuppliers(false);
    }
  }

  async function submitRfq(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rfqSubmitting) return;
    const supplierId = Number(rfqSupplierId);
    if (!Number.isSafeInteger(supplierId) || supplierId < 1) {
      setRfqError("Choose a supplier for this draft RFQ.");
      return;
    }
    if (!selectedRfqLines.length) {
      setRfqError("Keep at least one product with a quantity above zero.");
      return;
    }
    if (rfqLines.some((line) => !Number.isFinite(line.quantity) || line.quantity < 0 || line.quantity > MAX_RFQ_QUANTITY)) {
      setRfqError(`Enter quantities from 0 to ${MAX_RFQ_QUANTITY.toLocaleString("en-AU")} for every product.`);
      return;
    }
    setRfqSubmitting(true);
    setRfqError(null);
    try {
      const result = await createOdooDraftRfq({
        supplierId,
        coverageDays,
        method: data?.products.find((product) => product.method)?.method ?? "rules_v1_weighted_velocity",
        lines: rfqLines.map(({ productId, quantity, suggestedQuantity, reason }) => ({ productId, quantity, suggestedQuantity, reason })),
      });
      const supplier = rfqSuppliers.find((item) => item.id === supplierId);
      const audit = appendReplenishmentAudit({
        company: data?.company ?? "Current company",
        coverageDays,
        method: data?.products.find((product) => product.method)?.method ?? "rules_v1_weighted_velocity",
        supplierId,
        supplierName: supplier?.name ?? result.supplier,
        rfqName: result.name,
        rfqUrl: result.url,
        lines: rfqLines.map((line) => ({
          productId: line.productId,
          name: line.name,
          suggestedQuantity: line.suggestedQuantity,
          orderedQuantity: line.quantity,
          reason: line.reason,
        })),
      });
      setAuditEntries((current) => [audit, ...current].slice(0, 40));
      setCreatedRfq(result);
      setRfqOpen(false);
    } catch (cause) {
      setRfqError(cause instanceof Error ? cause.message : "Could not create the draft RFQ.");
    } finally {
      setRfqSubmitting(false);
    }
  }

  if (loading && !data) return <ReplenishmentSkeleton />;

  if (needsConnection && !data) return (
    <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
      <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
        <Store className="mx-auto text-amber-600" size={30} />
        <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to plan replenishment</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">This view uses Odoo POS sales and on-hand stock for your current company.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]"><RefreshCw size={16} /> Retry</button><Link href="/settings/integrations" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link></div>
      </section>
    </main>
  );

  if (error && !data) return (
    <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
      <section role="alert" className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
        <AlertCircle className="mx-auto text-red-700" size={30} />
        <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Could not load the replenishment plan</h1>
        <p className="mt-2 text-sm leading-6 text-red-800">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"><RefreshCw size={16} /> Retry</button>
      </section>
    </main>
  );

  return (
    <main className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock planning · {data?.company}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Replenishment plan</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Explainable reorder suggestions from Odoo sales and stock velocity rules — not the chat model. Draft RFQs require human approval — nothing auto-orders.{lastLoadedAt !== null && <span className="ml-2">Last refreshed {formatStoreEpoch(lastLoadedAt, storeTimezone)}.</span>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="coverage-days" className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white pl-3 pr-2 text-sm font-medium text-[var(--oh-muted)]">
            <CalendarRange size={16} aria-hidden="true" />
            <span>Coverage</span>
            <select id="coverage-days" value={coverageDays} onChange={(event) => setCoverageDays(Number(event.target.value))} aria-label="Coverage target" className="h-full min-w-24 border-0 bg-transparent pl-1 pr-2 text-sm font-semibold text-[var(--oh-text)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--oh-primary)]">
              {coverageOptions.map((days) => <option key={days} value={days}>{days} days</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void load(true)} disabled={loading || refreshing} className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] outline-none hover:bg-[var(--oh-paper)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] disabled:opacity-60">{refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh</button>
        </div>
      </header>

      {data && (loading || refreshing) && <p role="status" aria-live="polite" className="inline-flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={16} className="animate-spin" /> Updating replenishment plan…</p>}

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"><span className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error} The plan below is the last successful result and may be out of date.</span><button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-white px-3 font-semibold text-red-900 disabled:opacity-60">{refreshing ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry</button></div>}

      {data && data.products.length > 0 && !hasRecentSales && <div role="status" className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><div className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" /><p><strong>No recent sales found.</strong> There are no completed POS sales in the last {data.historyDays} days, so this plan cannot forecast demand. Zero suggested orders does not mean stock is sufficient.</p></div><Link href="/history/odoo" className="shrink-0 font-semibold text-amber-950 underline underline-offset-2">Review Odoo sales history</Link></div>}

      {createdRfq && <div role={createdRfq.auditSaved ? "status" : "alert"} className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm ${createdRfq.auditSaved ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}><span><strong>{createdRfq.name}</strong> created as a draft RFQ for {createdRfq.supplier}. It has not been sent or confirmed. {createdRfq.warning || (createdRfq.auditSaved ? "Internal approval audit saved to Odoo chatter." : "")}</span><a href={createdRfq.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 font-semibold text-emerald-900 hover:bg-emerald-100">Open in Odoo <ExternalLink size={14} /></a></div>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard title="Products to replenish" value={number.format(suggestedItems.length)} detail={`of ${number.format(data?.products.length ?? 0)} POS products`} />
        <SummaryCard title="Suggested units" value={number.format(totalSuggestedUnits)} detail={`Across a ${planCoverageDays}-day target`} />
        <div className="col-span-2 sm:col-span-1"><SummaryCard title="Out of stock with demand" value={number.format(outOfStockWithDemand)} detail={`Sold in the last ${data?.historyDays ?? 56} days`} /></div>
      </section>

      <section className="flex shrink-0 flex-col rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] xl:min-h-0 xl:flex-1 xl:overflow-hidden">
        <header className="flex flex-col items-stretch gap-3 border-b border-[var(--oh-border)] px-4 py-3 md:px-5 xl:flex-row xl:items-center xl:justify-between">
          <div><h2 className="text-sm font-semibold text-[var(--oh-text)]">{showAll ? "All POS products" : "Replenishment suggestions"}</h2><p className="mt-1 text-xs text-[var(--oh-muted)]">Demand trend compares the latest {data?.periodDays ?? 28} days with the previous period.</p></div>
          <div className="flex flex-col items-stretch gap-2 xl:flex-row xl:items-center"><button type="button" onClick={openRfqDialog} disabled={!canCreateRfq} className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white outline-none hover:bg-[var(--oh-primary-hover)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"><ShoppingCart size={16} /> Create draft RFQ <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-xs">{Math.min(suggestedItems.length, MAX_RFQ_LINES)}</span></button>
            <button type="button" onClick={() => setShowAll((value) => !value)} aria-pressed={showAll} className="min-h-11 rounded-md px-2 text-sm font-semibold text-[var(--oh-orange-dark)] outline-none hover:bg-[var(--oh-orange-light)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]">{showAll ? "Show suggestions only" : "Show all products"}</button></div>
        </header>
        <div className="divide-y divide-[var(--oh-border)] xl:hidden">
          {loading && !data ? <div className="px-4 py-12 text-center text-sm text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Calculating demand…</span></div>
            : !visibleItems.length ? <p className="px-4 py-12 text-center text-sm text-[var(--oh-muted)]">{data?.products.length ? "No products need replenishment for this coverage target." : "No POS products were returned by Odoo."}</p>
              : visibleItems.map((product) => <article key={product.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="break-words font-semibold leading-5 text-[var(--oh-text)]">{product.name}</h3><p className="mt-1 text-xs text-[var(--oh-muted)]">{product.sku ? `SKU ${product.sku} · ` : ""}{product.unit}</p></div>
                  {product.suggestedQuantity > 0 ? <span className="shrink-0 rounded-full bg-[var(--oh-orange-light)] px-2.5 py-1 text-xs font-bold tabular-nums text-[var(--oh-orange-dark)]">Order {number.format(product.suggestedQuantity)} {product.unit}</span> : <span className="shrink-0 rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium text-[var(--oh-muted)]">No order</span>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-md bg-[var(--oh-surface)] p-3 text-sm">
                  <Metric label={`Sold · ${data?.historyDays}d`} value={number.format(product.soldUnits)} />
                  <Metric label="Forecast / day" value={number.format(product.unitsPerDay)} />
                  <Metric label="On hand" value={number.format(product.onHand)} danger={product.onHand <= 0 && product.soldUnits > 0} />
                  <Metric label="Forecast stock" value={number.format(product.forecastStock)} />
                  <Metric label="Stock cover" value={product.daysOfStock === null ? "—" : `${number.format(product.daysOfStock)} days`} />
                  <div><p className="text-xs text-[var(--oh-muted)]">Trend · {data?.periodDays}d</p><div className="mt-1">{product.trend === "new" ? <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">New demand</span> : product.trend === "up" ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">↑ {number.format(product.trendPercent ?? 0)}%</span> : product.trend === "down" ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">↓ {number.format(Math.abs(product.trendPercent ?? 0))}%</span> : product.trend === "steady" ? <span className="text-sm text-[var(--oh-text-secondary)]">Steady</span> : <span className="text-sm text-[var(--oh-muted)]">—</span>}</div></div>
                </div>
                <button type="button" aria-expanded={expandedReasonId === product.id} onClick={() => setExpandedReasonId((current) => current === product.id ? null : product.id)} className="mt-2 inline-flex min-h-11 items-center rounded-sm font-semibold text-[var(--oh-orange-dark)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]">{expandedReasonId === product.id ? "Hide explanation" : "Explain suggestion"}</button>
                {expandedReasonId === product.id && <ul className="ml-1 list-disc space-y-1 pl-4 text-sm leading-5 text-[var(--oh-text-secondary)]">{(product.reasonParts?.length ? product.reasonParts : [product.reason || "No detail available."]).map((part) => <li key={part}>{part}</li>)}</ul>}
              </article>)}
        </div>
        <div className="hidden min-h-0 flex-1 overflow-auto xl:block xl:min-h-[104px]">
        <table aria-label="Replenishment recommendations" className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-[#f7f8f8] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
              <tr><th scope="col" className="px-4 py-3">Product</th><th scope="col" className="px-4 py-3 text-right">Sold · {data?.historyDays}d</th><th scope="col" className="px-4 py-3 text-right">Forecast / day</th><th scope="col" className="px-4 py-3 text-right">Trend · {data?.periodDays}d</th><th scope="col" className="px-4 py-3 text-right">On hand</th><th scope="col" className="px-4 py-3 text-right">Forecast stock</th><th scope="col" className="px-4 py-3 text-right">Stock cover</th><th scope="col" className="px-4 py-3 text-right">Suggested order</th><th scope="col" className="px-4 py-3">Why</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--oh-border)]">
              {loading && !data ? <tr><td colSpan={9} className="px-4 py-16 text-center text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Calculating demand…</span></td></tr>
                : !visibleItems.length ? <tr><td colSpan={9} className="px-4 py-5 text-center text-[var(--oh-muted)]">{data?.products.length ? "No products need replenishment for this coverage target." : "No POS products were returned by Odoo."}</td></tr>
                  : visibleItems.map((product) => <tr key={product.id} className="hover:bg-sky-50/40">
                    <td className="px-4 py-3"><span className="block font-medium text-[var(--oh-text)]">{product.name}</span><span className="mt-0.5 block text-xs text-[var(--oh-muted)]">{product.sku ? `SKU ${product.sku} · ` : ""}{product.unit}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{number.format(product.soldUnits)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{number.format(product.unitsPerDay)}</td>
                    <td className="px-4 py-3 text-right">{product.trend === "new" ? <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">New demand</span> : product.trend === "up" ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">↑ {number.format(product.trendPercent ?? 0)}%</span> : product.trend === "down" ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">↓ {number.format(Math.abs(product.trendPercent ?? 0))}%</span> : product.trend === "steady" ? <span className="text-xs text-[var(--oh-muted)]">Steady</span> : <span className="text-xs text-[var(--oh-muted)]">—</span>}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${product.onHand <= 0 && product.soldUnits > 0 ? "font-semibold text-red-700" : "text-[var(--oh-text-secondary)]"}`}>{number.format(product.onHand)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]" title="Odoo forecast quantity includes scheduled incoming and outgoing stock moves">{number.format(product.forecastStock)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{product.daysOfStock === null ? "—" : `${number.format(product.daysOfStock)} days`}</td>
                    <td className="px-4 py-3 text-right">{product.suggestedQuantity > 0 ? <span className="inline-flex min-w-16 justify-center rounded-full bg-[var(--oh-orange-light)] px-2.5 py-1 text-xs font-bold tabular-nums text-[var(--oh-orange-dark)]">{number.format(product.suggestedQuantity)} {product.unit}</span> : <span className="text-xs text-[var(--oh-muted)]">No order</span>}</td>
                    <td className="px-4 py-3 text-xs text-[var(--oh-muted)]">
                      <button type="button" aria-expanded={expandedReasonId === product.id} onClick={() => setExpandedReasonId((current) => current === product.id ? null : product.id)} className="inline-flex min-h-11 items-center rounded-sm font-semibold text-[var(--oh-orange-dark)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]">
                        {expandedReasonId === product.id ? "Hide" : "Explain"}
                      </button>
                      {expandedReasonId === product.id && (
                        <ul className="mt-2 max-w-xs list-disc space-y-1 pl-4 text-left text-[var(--oh-text-secondary)]">
                          {(product.reasonParts?.length ? product.reasonParts : [product.reason || "No detail available."]).map((part) => (
                            <li key={part}>{part}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>)}
            </tbody>
          </table>
        </div>
        {data?.truncated && <p role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">Showing up to 1,000 products or product demand groups. Narrow the product catalogue in Odoo for a complete plan.</p>}
      </section>

      {auditEntries.length > 0 && (
        <section className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
          <h2 className="text-sm font-semibold text-[var(--oh-text)]">Recent draft RFQs</h2>
          <p className="mt-1 text-xs text-[var(--oh-muted)]">The browser shows recent approvals from this device. Each RFQ keeps the forecast method, coverage target, suggested and ordered quantities, and reasons in an internal Odoo chatter note.</p>
          <ul className="mt-3 divide-y divide-[var(--oh-border)]">
            {auditEntries.slice(0, 8).map((entry) => {
              const edited = entry.lines.filter((line) => Math.abs(line.orderedQuantity - line.suggestedQuantity) > 0.001).length;
              const adopted = entry.lines.length - edited;
              return (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-[var(--oh-text)]">{entry.rfqName} · {entry.supplierName}</p>
                    <p className="mt-0.5 text-xs text-[var(--oh-muted)]">
                      {formatOdooDateTime(entry.createdAt, storeTimezone)}
                      {" · "}{entry.lines.length} lines · {adopted} kept as suggested · {edited} edited · cover {entry.coverageDays}d
                    </p>
                  </div>
                  <a href={entry.rfqUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--oh-orange-dark)] hover:underline">Open RFQ <ExternalLink size={12} /></a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-md border border-[var(--oh-border)] bg-white px-4 py-3 text-xs leading-5 text-[var(--oh-muted)]">
        <p className="font-semibold text-[var(--oh-text-secondary)]">How this estimate works</p>
        <p className="mt-1">Forecast daily demand combines the most recent {data?.periodDays ?? 28} days (70%) with the previous {data?.periodDays ?? 28} days (30%); if one period has no sales, the other period is used. Suggested order = max(0, forecast daily demand × {planCoverageDays}-day coverage − forecast stock), rounded up to a whole unit. Forecast stock comes from Odoo and includes scheduled incoming and outgoing stock moves, helping avoid ordering units already on the way. This estimate does not account for supplier lead times, pack sizes, holidays or store-specific events. Use Explain on each row for the exact inputs behind a suggestion.</p>
      </section>

      <p className="inline-flex items-center gap-2 text-xs text-[var(--oh-muted)]"><Clock3 size={14} />Generated {data ? formatOdooDateTime(data.generatedAt, storeTimezone) : "—"}.</p>

      {rfqOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !rfqSubmitting) setRfqOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="rfq-title" className="my-auto flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--oh-border)] p-5 md:px-6">
            <div><h2 id="rfq-title" className="text-lg font-semibold text-[var(--oh-text)]">Review draft RFQ</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Choose one supplier and check the quantities before creating a draft in Odoo.</p></div>
            <button type="button" onClick={() => setRfqOpen(false)} disabled={rfqSubmitting} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <form onSubmit={(event) => void submitRfq(event)} className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-w-0 gap-4 overflow-y-auto p-5 md:px-6">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]"><span>Supplier <span className="text-red-700">*</span></span>
                <select ref={rfqSupplierRef} value={rfqSupplierId} onChange={(event) => setRfqSupplierId(event.target.value)} required disabled={rfqLoadingSuppliers || rfqSubmitting} className="h-11 w-full min-w-0 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-normal text-[var(--oh-text)] disabled:opacity-60">
                  <option value="">{rfqLoadingSuppliers ? "Loading suppliers…" : rfqSuppliers.length ? "Select an Odoo supplier" : "No suppliers available"}</option>
                  {rfqSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.email ? ` · ${supplier.email}` : ""}</option>)}
                </select>
              </label>
              {rfqSupplierError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"><span>{rfqSupplierError}</span><button type="button" onClick={() => void loadRfqSuppliers()} disabled={rfqLoadingSuppliers} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-white px-3 font-semibold disabled:opacity-60"><RefreshCw size={15} /> Retry suppliers</button></div>}
              <div className="overflow-hidden rounded-lg border border-[var(--oh-border)]">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f7f8f8] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]"><span>Suggested products</span><span>{selectedRfqLines.length} selected</span></div>
                <div className="max-h-[38dvh] divide-y divide-[var(--oh-border)] overflow-y-auto">
                  {rfqLines.map((line) => <div key={line.productId} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(96px,120px)] items-center gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_140px_140px]">
                    <div className="min-w-0"><p className="break-words text-sm font-medium text-[var(--oh-text)]">{line.name}</p><p className="text-xs text-[var(--oh-muted)]">Suggested {number.format(line.suggestedQuantity)} {line.unit}</p></div>
                    <label className="grid gap-1 text-[13px] font-medium text-[var(--oh-muted)] sm:col-auto">Order quantity
                    <input type="number" min="0" max={MAX_RFQ_QUANTITY} step="0.01" value={line.quantity} onChange={(event) => { const value = Number(event.target.value); setRfqLines((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity: Number.isFinite(value) ? value : 0 } : item)); }} disabled={rfqSubmitting} className="h-11 w-full min-w-0 rounded-md border border-[var(--oh-border)] px-2 text-sm font-semibold tabular-nums text-[var(--oh-text)] outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[#f3920030] disabled:opacity-60" />
                    </label>
                    <p className="hidden text-right text-sm text-[var(--oh-muted)] sm:block">{line.unit}</p>
                  </div>)}
                  {!rfqLines.length && <p className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">No replenishment suggestions to add.</p>}
                </div>
              </div>
              {suggestedItems.length > MAX_RFQ_LINES && <p className="text-xs leading-5 text-amber-900">This RFQ includes the top {MAX_RFQ_LINES} suggestions. Create another RFQ for the remaining products.</p>}
              <div className="rounded-md bg-[var(--oh-surface)] px-3 py-2.5 text-xs leading-5 text-[var(--oh-muted)]"><p className="font-semibold text-[var(--oh-text-secondary)]">Draft only</p><p className="mt-1">This creates an Odoo RFQ in draft status. It will not email the supplier or confirm an order. Review the supplier prices, taxes, delivery dates and quantities in Odoo before sending.</p></div>
              {rfqError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{rfqError}</p>}
            </div>
            <footer className="flex flex-col gap-2 border-t border-[var(--oh-border)] p-4 sm:flex-row sm:justify-end md:px-6">
              <button type="button" onClick={() => setRfqOpen(false)} disabled={rfqSubmitting} className="min-h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={rfqSubmitting || rfqLoadingSuppliers || !rfqSuppliers.length || !selectedRfqLines.length} className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-wait disabled:opacity-60">{rfqSubmitting ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} {rfqSubmitting ? "Creating draft…" : "Create draft RFQ"}</button>
            </footer>
          </form>
        </section>
      </div>}
    </main>
  );
}

function ReplenishmentSkeleton() {
  return (
    <main aria-busy="true" aria-label="Loading replenishment plan" className="flex h-full min-h-0 flex-col gap-5 overflow-hidden bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2"><span className="h-3 w-40 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-8 w-64 animate-pulse rounded bg-[var(--oh-border)]" /><span className="h-4 w-96 max-w-[80vw] animate-pulse rounded bg-[var(--oh-border)]" /></div>
        <div className="h-11 w-64 animate-pulse rounded-md bg-[var(--oh-border)]" />
      </header>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" />)}</section>
      <section className="min-h-0 flex-1 animate-pulse rounded-lg border border-[var(--oh-border)] bg-white" />
    </main>
  );
}

function SummaryCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <article className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
    <p className="text-sm font-medium text-[var(--oh-muted)]">{title}</p>
    <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-[var(--oh-text)]">{value}</p>
    <p className="mt-1 text-xs text-[var(--oh-muted)]">{detail}</p>
  </article>;
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div><p className="text-xs text-[var(--oh-muted)]">{label}</p><p className={`mt-1 font-semibold tabular-nums ${danger ? "text-red-700" : "text-[var(--oh-text-secondary)]"}`}>{value}</p></div>;
}
