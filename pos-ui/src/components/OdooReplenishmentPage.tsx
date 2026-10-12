"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarRange, Clock3, LoaderCircle, RefreshCw, Store } from "lucide-react";

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
  daysOfStock: number | null;
  suggestedQuantity: number;
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

export function OdooReplenishmentPage() {
  const [data, setData] = useState<ReplenishmentData | null>(null);
  const [coverageDays, setCoverageDays] = useState(21);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/odoo/replenishment?coverageDays=${coverageDays}`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => null) as ReplenishmentData | { message?: string } | null;
      if (!response.ok) {
        const message = payload && "message" in payload ? payload.message : undefined;
        setNeedsConnection(response.status === 401 || response.status === 503);
        throw new Error(message || `Could not load the replenishment plan (${response.status}).`);
      }
      if (!payload || !("products" in payload) || !Array.isArray(payload.products)) throw new Error("Odoo returned an incomplete replenishment plan.");
      setNeedsConnection(false);
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the replenishment plan.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [coverageDays]);

  useEffect(() => { void load(); }, [load]);

  const suggestedItems = useMemo(() => data?.products.filter((product) => product.suggestedQuantity > 0) ?? [], [data]);
  const visibleItems = showAll ? data?.products ?? [] : suggestedItems;
  const totalSuggestedUnits = suggestedItems.reduce((sum, product) => sum + product.suggestedQuantity, 0);
  const outOfStockWithDemand = suggestedItems.filter((product) => product.onHand <= 0 && product.soldUnits > 0).length;

  if (loading && !data) return <main className="grid h-full place-items-center bg-[var(--oh-surface)]"><LoaderCircle className="animate-spin text-[var(--oh-muted)]" /></main>;

  if (needsConnection && !data) return (
    <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
      <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
        <Store className="mx-auto text-amber-600" size={30} />
        <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to plan replenishment</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">This view uses Odoo POS sales and on-hand stock for your current company.</p>
        <Link href="/settings/integrations" className="mt-5 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
      </section>
    </main>
  );

  return (
    <main className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock planning · {data?.company}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--oh-text)]">Replenishment plan</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Suggested quantities from recent Odoo sales and current on-hand stock.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="coverage-days" className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-xs font-medium text-[var(--oh-muted)]"><CalendarRange size={15} /> Cover</label>
          <select id="coverage-days" value={coverageDays} onChange={(event) => setCoverageDays(Number(event.target.value))} className="-ml-2 h-10 rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm font-medium text-[var(--oh-text)]">
            {coverageOptions.map((days) => <option key={days} value={days}>{days} days</option>)}
          </select>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-paper)] disabled:opacity-60">{refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh</button>
        </div>
      </header>

      {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard title="Products to replenish" value={number.format(suggestedItems.length)} detail={`of ${number.format(data?.products.length ?? 0)} POS products`} />
        <SummaryCard title="Suggested units" value={number.format(totalSuggestedUnits)} detail={`Across a ${coverageDays}-day target`} />
        <SummaryCard title="Out of stock with demand" value={number.format(outOfStockWithDemand)} detail={`Sold in the last ${data?.historyDays ?? 56} days`} />
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-3 md:px-5">
          <div><h2 className="text-sm font-semibold text-[var(--oh-text)]">{showAll ? "All POS products" : "Replenishment suggestions"}</h2><p className="mt-1 text-xs text-[var(--oh-muted)]">Average daily sales use the last {data?.historyDays ?? 56} days.</p></div>
          <button type="button" onClick={() => setShowAll((value) => !value)} className="text-sm font-semibold text-[var(--oh-orange-dark)] hover:underline">{showAll ? "Show suggestions only" : "Show all products"}</button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-[#f7f8f8] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
              <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Sold · {data?.historyDays}d</th><th className="px-4 py-3 text-right">Forecast / day</th><th className="px-4 py-3 text-right">Trend · {data?.periodDays}d</th><th className="px-4 py-3 text-right">On hand</th><th className="px-4 py-3 text-right">Stock cover</th><th className="px-4 py-3 text-right">Suggested order</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--oh-border)]">
              {loading && !data ? <tr><td colSpan={7} className="px-4 py-16 text-center text-[var(--oh-muted)]"><LoaderCircle size={20} className="mx-auto animate-spin" /><span className="mt-2 block">Calculating demand…</span></td></tr>
                : !visibleItems.length ? <tr><td colSpan={7} className="px-4 py-16 text-center text-[var(--oh-muted)]">{data?.products.length ? "No products need replenishment for this coverage target." : "No POS products were returned by Odoo."}</td></tr>
                  : visibleItems.map((product) => <tr key={product.id} className="hover:bg-sky-50/40">
                    <td className="px-4 py-3"><span className="block font-medium text-[var(--oh-text)]">{product.name}</span><span className="mt-0.5 block text-xs text-[var(--oh-muted)]">{product.sku ? `SKU ${product.sku} · ` : ""}{product.unit}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{number.format(product.soldUnits)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{number.format(product.unitsPerDay)}</td>
                    <td className="px-4 py-3 text-right">{product.trend === "new" ? <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">New demand</span> : product.trend === "up" ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">↑ {number.format(product.trendPercent ?? 0)}%</span> : product.trend === "down" ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">↓ {number.format(Math.abs(product.trendPercent ?? 0))}%</span> : product.trend === "steady" ? <span className="text-xs text-[var(--oh-muted)]">Steady</span> : <span className="text-xs text-[var(--oh-muted)]">—</span>}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${product.onHand <= 0 && product.soldUnits > 0 ? "font-semibold text-red-700" : "text-[var(--oh-text-secondary)]"}`}>{number.format(product.onHand)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--oh-text-secondary)]">{product.daysOfStock === null ? "—" : `${number.format(product.daysOfStock)} days`}</td>
                    <td className="px-4 py-3 text-right">{product.suggestedQuantity > 0 ? <span className="inline-flex min-w-16 justify-center rounded-full bg-[#fff2da] px-2.5 py-1 text-xs font-bold tabular-nums text-[#8b4a00]">{number.format(product.suggestedQuantity)} {product.unit}</span> : <span className="text-xs text-[var(--oh-muted)]">No order</span>}</td>
                  </tr>)}
            </tbody>
          </table>
        </div>
        {data?.truncated && <p role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">Showing up to 1,000 products or product demand groups. Narrow the product catalogue in Odoo for a complete plan.</p>}
      </section>

      <section className="rounded-md border border-[var(--oh-border)] bg-white px-4 py-3 text-xs leading-5 text-[var(--oh-muted)]">
        <p className="font-semibold text-[var(--oh-text-secondary)]">How this estimate works</p>
        <p className="mt-1">Forecast daily demand combines the most recent {data?.periodDays ?? 28} days (70%) with the previous {data?.periodDays ?? 28} days (30%); if one period has no sales, the other period is used. Suggested order = max(0, forecast daily demand × {coverageDays}-day coverage − on-hand stock), rounded up to a whole unit. This estimate does not account for supplier lead times, pack sizes, holidays or store-specific events.</p>
      </section>

      <p className="inline-flex items-center gap-2 text-xs text-[var(--oh-muted)]"><Clock3 size={14} />Generated {data ? new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" }).format(new Date(data.generatedAt)) : "—"}.</p>
    </main>
  );
}

function SummaryCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <article className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
    <p className="text-sm font-medium text-[var(--oh-muted)]">{title}</p>
    <p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--oh-text)]">{value}</p>
    <p className="mt-1 text-xs text-[var(--oh-muted)]">{detail}</p>
  </article>;
}
