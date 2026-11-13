"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, LoaderCircle, RefreshCw } from "lucide-react";
import { api, type Page } from "@/lib/api";

type ProductRow = {
  id: number;
  name: string;
  categoryName?: string | null;
  status?: string | null;
  price?: number | null;
  stockQuantity?: number | null;
};

type NativeOverview = {
  source: "orithos_ledger";
  from: string;
  to: string;
  revenue: number;
  tax: number | null;
  grossProfit: number | null;
  profitMargin: number | null;
  costAvailable: boolean;
  taxAvailable: boolean;
  transactions: number;
  inventoryAvailable?: boolean;
  inventoryUnits?: number | null;
  inventoryStatus?: string | null;
  negativeStockProducts?: number | null;
};

const buttonClass = "inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]";
const number = (value: unknown) => Number.isFinite(Number(value)) ? new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(Number(value)) : "—";
const money = (value: unknown) => Number.isFinite(Number(value)) ? new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value)) : "—";

function SectionFrame({ title, subtitle, expanded, setExpanded, children }: { title: string; subtitle: string; expanded: boolean; setExpanded: (value: boolean) => void; children: ReactNode }) {
  return <section className="shrink-0 overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div><h2 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h2><p className="mt-0.5 text-xs text-[var(--oh-muted)]">{subtitle}</p></div>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className={buttonClass}>{expanded ? "Hide" : "View"} <ChevronDown size={15} aria-hidden="true" /></button>
    </header>
    {expanded && <div className="border-t border-[var(--oh-border)] p-4">{children}</div>}
  </section>;
}

function SourceState({ loading, error, onRetry, children }: { loading: boolean; error: string; onRetry: () => void; children: ReactNode }) {
  if (loading) return <p role="status" className="flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" /> Loading Orithos ledger…</p>;
  if (error) return <div role="status" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-[var(--oh-muted)]">{error}</span><button type="button" onClick={onRetry} className={buttonClass}><RefreshCw size={15} /> Retry</button></div>;
  return <>{children}</>;
}

function dayInAdelaide(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

async function readNativeOverview(from: string, to: string, signal?: AbortSignal): Promise<NativeOverview> {
  const params = new URLSearchParams({ from, to });
  const response = await fetch(`/api/reports/native-overview?${params}`, { credentials: "same-origin", cache: "no-store", signal });
  const body = await response.json().catch(() => null) as { data?: NativeOverview; message?: string } | null;
  if (!response.ok || !body?.data || body.data.source !== "orithos_ledger") {
    throw new Error(body?.message || "Orithos sales data is unavailable.");
  }
  return body.data;
}

/** Catalogue inventory strip after Shopfront source retirement — Orithos on-hand. */
export function ShopfrontInventorySummary({ productCount }: { productCount?: number }) {
  const [overview, setOverview] = useState<NativeOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const today = dayInAdelaide();
    setLoading(true);
    setError("");
    void readNativeOverview(today, today, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setOverview(data); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Orithos inventory summary unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return <section className="shrink-0 overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
    <header className="px-4 py-3">
      <h2 className="text-sm font-semibold text-[var(--oh-text)]">Orithos inventory snapshot</h2>
      <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Orithos ledger · on-hand quantities for this store</p>
    </header>
    <div className="px-4 pb-4">
      <SourceState loading={loading} error={error} onRetry={() => { setLoading(true); setError(""); void readNativeOverview(dayInAdelaide(), dayInAdelaide()).then(setOverview).catch((cause) => setError(cause instanceof Error ? cause.message : "Orithos inventory summary unavailable.")).finally(() => setLoading(false)); }}>
        {(overview || typeof productCount === "number") && <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          {typeof productCount === "number" && <p><span className="block text-xs text-[var(--oh-muted)]">Catalogue products</span><strong>{number(productCount)}</strong></p>}
          {overview?.inventoryUnits != null && <p><span className="block text-xs text-[var(--oh-muted)]">On-hand units</span><strong>{number(overview.inventoryUnits)}</strong></p>}
          {overview?.negativeStockProducts != null && overview.negativeStockProducts > 0 && <p><span className="block text-xs text-[var(--oh-muted)]">Negative stock products</span><strong>{number(overview.negativeStockProducts)}</strong></p>}
          <p className="basis-full text-xs text-[var(--oh-muted)]">{overview?.inventoryStatus ? `Inventory ${overview.inventoryStatus}` : "Inventory from Orithos product on-hand"}.</p>
        </div>}
      </SourceState>
    </div>
  </section>;
}

/** Product sample list from Orithos catalogue (replaces retired Shopfront history). */
export function ShopfrontProductHistorySection() {
  const [expanded, setExpanded] = useState(false);
  const [requestId, setRequestId] = useState(0);
  const [resolvedId, setResolvedId] = useState(-1);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const loading = expanded && resolvedId !== requestId && !error;

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    const active = requestId;
    setError("");
    void api.get<Page<ProductRow>>("/api/products", { page: 1, size: 25, status: "ACTIVE" })
      .then((page) => {
        if (controller.signal.aborted) return;
        setRows(page.items);
        setTotal(page.total);
        setResolvedId(active);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Orithos products unavailable.");
      });
    return () => controller.abort();
  }, [expanded, requestId]);

  return <SectionFrame title="Orithos product catalogue" subtitle="Orithos ledger · active products" expanded={expanded} setExpanded={(open) => { setExpanded(open); if (open) setRequestId((value) => value + 1); }}>
    <SourceState loading={loading} error={error} onRetry={() => setRequestId((value) => value + 1)}>
      <p className="mb-3 text-xs text-[var(--oh-muted)]">{number(total)} active Orithos products · showing first {rows.length}.</p>
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="text-xs text-[var(--oh-muted)]"><th className="border-b px-2 py-2">Product</th><th className="border-b px-2 py-2">Category</th><th className="border-b px-2 py-2">Status</th><th className="border-b px-2 py-2 text-right">Shelf price</th><th className="border-b px-2 py-2 text-right">On hand</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="border-b px-2 py-2">{row.name}</td><td className="border-b px-2 py-2">{row.categoryName || "—"}</td><td className="border-b px-2 py-2">{row.status || "ACTIVE"}</td><td className="border-b px-2 py-2 text-right">{money(row.price)}</td><td className="border-b px-2 py-2 text-right">{number(row.stockQuantity)}</td></tr>)}</tbody></table></div> : !loading && !error ? <p role="status" className="text-sm text-[var(--oh-muted)]">No Orithos products found.</p> : null}
    </SourceState>
  </SectionFrame>;
}

/** Period sales strip from Orithos native-overview (replaces retired Shopfront source sales). */
export function ShopfrontSalesSummary({ from, to, enabled = true }: { from: string; to: string; enabled?: boolean }) {
  const [data, setData] = useState<NativeOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const lastKey = useRef("");

  useEffect(() => {
    if (!enabled) return;
    const key = `${from}:${to}:${refreshKey}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void readNativeOverview(from, to, controller.signal)
      .then((overview) => { if (!controller.signal.aborted) setData(overview); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Orithos sales unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [enabled, from, to, refreshKey]);

  return <section className="rounded-lg border border-[var(--oh-border)] bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div><h2 className="text-sm font-semibold text-[var(--oh-text)]">Orithos ledger sales</h2><p className="mt-0.5 text-xs text-[var(--oh-muted)]">{from} to {to} · Australia/Adelaide</p></div>
      <button type="button" onClick={() => { lastKey.current = ""; setRefreshKey((value) => value + 1); }} disabled={loading} className={buttonClass}><RefreshCw size={15} /> Refresh</button>
    </header>
    <div className="border-t border-[var(--oh-border)] px-4 py-3">
      <SourceState loading={loading} error={error} onRetry={() => { lastKey.current = ""; setRefreshKey((value) => value + 1); }}>
        {data ? <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <p><span className="block text-xs text-[var(--oh-muted)]">Revenue</span><strong>{money(data.revenue)}</strong></p>
          <p><span className="block text-xs text-[var(--oh-muted)]">Gross profit</span><strong>{data.grossProfit == null ? "—" : money(data.grossProfit)}</strong></p>
          <p><span className="block text-xs text-[var(--oh-muted)]">Profit %</span><strong>{data.profitMargin == null ? "—" : `${Number(data.profitMargin).toFixed(2)}%`}</strong></p>
          <p><span className="block text-xs text-[var(--oh-muted)]">Transactions</span><strong>{number(data.transactions)}</strong></p>
          <p className="basis-full text-xs text-[var(--oh-muted)]">Orithos sale ledger · Profit % = (revenue − cost) / revenue · {data.costAvailable ? "cost covered" : "cost incomplete"} · {data.taxAvailable ? `tax ${money(data.tax)}` : "tax incomplete"}</p>
        </div> : !loading && !error ? <p role="status" className="text-sm text-[var(--oh-muted)]">Orithos sales data is unavailable.</p> : null}
      </SourceState>
    </div>
  </section>;
}
