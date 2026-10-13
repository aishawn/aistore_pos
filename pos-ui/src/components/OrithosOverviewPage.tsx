"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  LayoutDashboard,
  LoaderCircle,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
} from "lucide-react";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { cn } from "@/lib/utils";

type OverviewData = {
  rangeHours: number;
  from: string;
  to: string;
  company: string;
  currency: string;
  trendGranularity: "hour" | "day";
  revenue: number;
  tax: number;
  transactions: number;
  itemsSold: number;
  openRegisters: number;
  trend: { label: string; revenue: number; transactions: number }[];
  topProducts: { id: number; name: string; qty: number; revenue: number }[];
  byCategory: { name: string; revenue: number; share: number }[];
  compare: {
    revenue: number;
    transactions: number;
    itemsSold: number;
    revenueDeltaPct: number | null;
    transactionsDeltaPct: number | null;
    itemsSoldDeltaPct: number | null;
    averageSaleDeltaPct: number | null;
  };
};

const PARKED_SALES_KEY = "orithos-odoo-parked-sales-v1";

const MARK_TONES = [
  { bg: "#eff6ff", fg: "#1d4ed8" },
  { bg: "#ecfdf5", fg: "#047857" },
  { bg: "#fff7ed", fg: "#c2410c" },
  { bg: "#f5f3ff", fg: "#6d28d9" },
  { bg: "#fdf2f8", fg: "#be185d" },
  { bg: "#ecfeff", fg: "#0e7490" },
] as const;

const CATEGORY_COLORS = ["#2563eb", "#0ea5e9", "#16a36a", "#f59e0b", "#6366f1", "#94a3b8"];

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatSydney(value: string, options: Intl.DateTimeFormatOptions) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", ...options }).format(date);
}

function greetingForSydney() {
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hour12: false }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayChipLabel() {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

function markTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 1)) % MARK_TONES.length;
  return MARK_TONES[hash] ?? MARK_TONES[0];
}

function friendlyName(name: string) {
  return name.replace(/^\[[^\]]+\]\s*/u, "").replace(/^DEMO\s*[|·\-–—]\s*/iu, "").trim() || name;
}

function Delta({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const positive = value >= 0;
  return (
    <span className={cn("text-xs font-semibold", positive ? "text-[var(--oh-success)]" : "text-red-600")}>
      {positive ? "+" : ""}{value}% vs same period last week
    </span>
  );
}

function readParkedCount() {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PARKED_SALES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function OrithosOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [parkedCount, setParkedCount] = useState(0);
  const greeting = useMemo(() => greetingForSydney(), []);
  const dateLabel = useMemo(() => todayChipLabel(), []);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      // Overview uses a rolling 24h window so “today” KPIs stay useful overnight.
      const response = await fetchOdooRoute("/api/odoo/reporting-dashboard?hours=24", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as OverviewData | { message?: string } | null;
      if (!response.ok) {
        const message = payload && "message" in payload ? payload.message : undefined;
        setNeedsConnection(response.status === 401 || response.status === 503);
        throw new Error(message || `Could not load overview (${response.status}).`);
      }
      if (!payload || !("revenue" in payload) || !Array.isArray(payload.trend)) {
        throw new Error("Odoo returned an incomplete overview response.");
      }
      setNeedsConnection(false);
      setData({
        ...payload,
        itemsSold: Number(payload.itemsSold ?? 0),
        topProducts: Array.isArray(payload.topProducts) ? payload.topProducts : [],
        byCategory: Array.isArray(payload.byCategory) ? payload.byCategory : [],
        compare: payload.compare ?? {
          revenue: 0,
          transactions: 0,
          itemsSold: 0,
          revenueDeltaPct: null,
          transactionsDeltaPct: null,
          itemsSoldDeltaPct: null,
          averageSaleDeltaPct: null,
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load overview.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setParkedCount(readParkedCount()); }, []);

  const averageSale = data?.transactions ? data.revenue / data.transactions : 0;
  const maxRevenue = useMemo(() => Math.max(1, ...(data?.trend.map((item) => item.revenue) ?? [0])), [data]);
  const donutGradient = useMemo(() => {
    if (!data?.byCategory.length) return "conic-gradient(#e2e8f0 0 100%)";
    let cursor = 0;
    const parts = data.byCategory.map((item, index) => {
      const start = cursor;
      cursor += item.share;
      return `${CATEGORY_COLORS[index % CATEGORY_COLORS.length]} ${start}% ${cursor}%`;
    });
    if (cursor < 100) parts.push(`#e2e8f0 ${cursor}% 100%`);
    return `conic-gradient(${parts.join(", ")})`;
  }, [data]);

  if (loading && !data) {
    return <main className="grid h-full place-items-center bg-[var(--oh-surface)]"><LoaderCircle className="animate-spin text-[var(--oh-muted)]" /></main>;
  }

  if (needsConnection && !data) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <Store className="mx-auto text-amber-600" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Odoo to open Overview</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Overview reads completed sales from your connected Odoo company.</p>
          <Link href="/settings/integrations" className="mt-5 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Connect Odoo</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)]">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:overflow-hidden lg:p-5">
        <div className="flex min-w-0 flex-1 flex-col gap-4 lg:overflow-y-auto lg:pr-1">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">
                <LayoutDashboard size={14} /> Overview · {data?.company ?? "Store"}
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--oh-text)] sm:text-3xl">{greeting}</h1>
              <p className="mt-1 text-sm text-[var(--oh-muted)]">Here&apos;s what&apos;s happening in your store today.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-10 items-center rounded-full border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] shadow-sm">
                Today · {dateLabel}
              </span>
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] shadow-sm hover:bg-white disabled:opacity-60"
              >
                {refreshing ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                Refresh
              </button>
            </div>
          </header>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />{error}
            </div>
          )}

          <section aria-label="Today summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Total sales"
              value={formatMoney(data?.revenue ?? 0, data?.currency ?? "AUD")}
              delta={data?.compare.revenueDeltaPct}
              icon={<ShoppingBag size={18} />}
            />
            <KpiCard
              title="Transactions"
              value={new Intl.NumberFormat("en-AU").format(data?.transactions ?? 0)}
              delta={data?.compare.transactionsDeltaPct}
              icon={<Package size={18} />}
            />
            <KpiCard
              title="Average sale"
              value={formatMoney(averageSale, data?.currency ?? "AUD")}
              delta={data?.compare.averageSaleDeltaPct}
              icon={<ArrowRight size={18} />}
            />
            <KpiCard
              title="Items sold"
              value={new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(data?.itemsSold ?? 0)}
              delta={data?.compare.itemsSoldDeltaPct}
              icon={<Archive size={18} />}
            />
          </section>

          <section className="rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--oh-border)] px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-base font-semibold text-[var(--oh-text)]">Top products today</h2>
                <p className="text-xs text-[var(--oh-muted)]">Last 24 hours · completed POS orders</p>
              </div>
              <Link href="/products/odoo" className="text-sm font-semibold text-[var(--oh-primary)] hover:underline">View all products →</Link>
            </div>
            {data?.topProducts.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--oh-border)] text-xs uppercase tracking-wide text-[var(--oh-muted)]">
                      <th className="px-4 py-3 font-semibold sm:px-5">Product</th>
                      <th className="px-3 py-3 text-right font-semibold">Units</th>
                      <th className="px-4 py-3 text-right font-semibold sm:px-5">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--oh-border)]">
                    {data.topProducts.map((product) => {
                      const label = friendlyName(product.name);
                      const tone = markTone(label);
                      const initial = (label.replace(/[^A-Za-z0-9]/gu, "").charAt(0) || "?").toUpperCase();
                      return (
                        <tr key={product.id}>
                          <td className="px-4 py-3 sm:px-5">
                            <div className="flex items-center gap-3">
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: tone.bg, color: tone.fg }} aria-hidden="true">{initial}</span>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-[var(--oh-text)]" title={product.name}>{label}</p>
                                <p className="truncate text-xs text-[var(--oh-muted)]">SKU / POS product</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-[var(--oh-text)]">{new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(product.qty)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--oh-text)] sm:px-5">{formatMoney(product.revenue, data.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid min-h-40 place-items-center px-4 py-8 text-center">
                <div>
                  <p className="text-sm font-semibold text-[var(--oh-text)]">No product sales yet</p>
                  <p className="mt-1 text-sm text-[var(--oh-muted)]">Complete a sale on the register to see top products here.</p>
                  <Link href="/" className="mt-3 inline-flex h-10 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Open point of sale</Link>
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
              <h2 className="text-base font-semibold text-[var(--oh-text)]">Sales trend</h2>
              <p className="mt-1 text-xs text-[var(--oh-muted)]">Last 24 hours · Sydney time</p>
              {data?.trend.length ? (
                <div className="mt-5 flex h-48 items-end gap-2 border-b border-l border-[var(--oh-border)] px-2 pb-0 pt-2">
                  {data.trend.map((item, index) => {
                    const percent = Math.max(item.revenue > 0 ? 4 : 0, (item.revenue / maxRevenue) * 100);
                    const label = formatSydney(item.label, data.trendGranularity === "hour" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" });
                    return (
                      <div key={`${item.label}-${index}`} className="group flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                        <div className="mb-1 truncate text-[10px] tabular-nums text-[var(--oh-muted)] opacity-0 transition-opacity group-hover:opacity-100">{formatMoney(item.revenue, data.currency)}</div>
                        <div className="relative mx-auto w-full max-w-12 rounded-t bg-[var(--oh-primary)]/85 transition-colors group-hover:bg-[var(--oh-primary)]" style={{ height: `${percent}%` }} title={`${formatMoney(item.revenue, data.currency)} · ${item.transactions} sales`} />
                        <span className="mt-2 truncate text-[10px] text-[var(--oh-muted)]">{label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid h-48 place-items-center text-center text-sm text-[var(--oh-muted)]">No sales in this period</div>
              )}
            </section>

            <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
              <h2 className="text-base font-semibold text-[var(--oh-text)]">Sales by category</h2>
              <p className="mt-1 text-xs text-[var(--oh-muted)]">Share of revenue · last 24 hours</p>
              {data?.byCategory.length ? (
                <div className="mt-5 flex flex-wrap items-center gap-6">
                  <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: donutGradient }} aria-hidden="true">
                    <div className="absolute inset-[28%] rounded-full bg-white" />
                  </div>
                  <ul className="min-w-0 flex-1 space-y-2">
                    {data.byCategory.map((item, index) => (
                      <li key={item.name} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
                          <span className="truncate text-[var(--oh-text)]">{item.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-[var(--oh-text-secondary)]">{item.share}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="grid h-48 place-items-center text-center text-sm text-[var(--oh-muted)]">Category mix appears after product sales post.</div>
              )}
            </section>
          </div>

          <p className="pb-2 text-xs text-[var(--oh-muted)]">
            Open registers: {data?.openRegisters ?? 0}. Deep dive in{" "}
            <Link href="/reports/dashboard" className="font-semibold text-[var(--oh-primary)] hover:underline">Reporting</Link>.
          </p>
        </div>

        <aside className="flex w-full shrink-0 flex-col rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] lg:w-[340px]">
          <div className="flex items-center justify-between border-b border-[var(--oh-border)] px-4 py-3">
            <h2 className="text-base font-semibold text-[var(--oh-text)]">Current sale</h2>
            {parkedCount > 0 && (
              <Link href="/" className="inline-flex items-center gap-1 rounded-full bg-[var(--oh-orange-light)] px-2.5 py-1 text-xs font-semibold text-[var(--oh-primary)]">
                <Archive size={13} /> {parkedCount} parked
              </Link>
            )}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">
              <ShoppingBag size={24} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--oh-text)]">Ready when you are</p>
              <p className="mt-1 text-xs leading-5 text-[var(--oh-muted)]">
                Overview is for today&apos;s store picture. Open the register to search products, take payment, and finalise.
              </p>
            </div>
          </div>
          <div className="border-t border-[var(--oh-border)] p-4">
            <Link
              href="/"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"
            >
              Open point of sale <ArrowRight size={16} />
            </Link>
            <Link
              href="/history/odoo"
              className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg border border-[var(--oh-border)] text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]"
            >
              Sales history
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}

function KpiCard({
  title,
  value,
  delta,
  icon,
}: {
  title: string;
  value: string;
  delta?: number | null;
  icon: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--oh-muted)]">{title}</p>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[var(--oh-text)]">{value}</p>
      <div className="mt-1 min-h-4"><Delta value={delta} /></div>
    </article>
  );
}
