"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  LoaderCircle,
  Package,
  Percent,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getReportPeriodBounds, type ReportQueryPeriod } from "@/lib/report-period";
import { salesDate, shiftDay } from "@/lib/replenishment-safety";
import { formatStoreEpoch } from "@/lib/odoo-date";
import { parseShopfrontInventoryReport, parseShopfrontSalesReport } from "@/lib/shopfront-dashboard-metrics";
import { useShopfrontSyncRefresh } from "@/hooks/useShopfrontSyncRefresh";

type DashboardPeriod = ReportQueryPeriod | "custom";

type TrendPoint = { date: string; revenue: number; transactions: number; profit: number };

type TopProduct = { id: string; name: string; revenue: number; quantity: number };

const PERIODS = [
  { period: "today" as const, label: "Today" },
  { period: "yesterday" as const, label: "Yesterday" },
  { period: "last_week" as const, label: "Last week" },
  { period: "last_month" as const, label: "Last month" },
];

const TIMEZONE = "Australia/Adelaide";

function percentDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

function periodDays(period: DashboardPeriod, fromDay: string, toDay: string, now = new Date()) {
  if (period === "custom" && fromDay && toDay) return { from: fromDay, to: toDay };
  if (period === "custom") return null;
  const bounds = getReportPeriodBounds(period, now, TIMEZONE);
  const endInclusive = salesDate(new Date(bounds.end.getTime() - 1).toISOString(), TIMEZONE);
  const start = salesDate(bounds.start.toISOString(), TIMEZONE);
  return { from: start, to: endInclusive };
}

function compareDays(period: DashboardPeriod, from: string, to: string, now = new Date()) {
  if (period === "custom") {
    const span = Math.max(1, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1);
    return { from: shiftDay(from, -span), to: shiftDay(from, -1), label: "vs previous period" };
  }
  const bounds = getReportPeriodBounds(period as ReportQueryPeriod, now, TIMEZONE);
  return {
    from: salesDate(bounds.compareStart.toISOString(), TIMEZONE),
    to: salesDate(new Date(bounds.compareEnd.getTime() - 1).toISOString(), TIMEZONE),
    label: bounds.comparisonLabel,
  };
}

function parseTrendRows(body: unknown): TrendPoint[] {
  const raw = Array.isArray((body as { data?: unknown })?.data) ? (body as { data: Array<Record<string, unknown>> }).data : [];
  return raw.map((row) => ({
    date: String(row.date ?? ""),
    revenue: Number(row.revenue ?? 0),
    transactions: Number(row.transaction_count ?? 0),
    profit: Number(row.profit ?? 0),
  })).filter((row) => row.date);
}

function dayMarginPercent(point: TrendPoint): number | null {
  if (point.revenue <= 0) return null;
  const margin = point.profit / point.revenue;
  return Number.isFinite(margin) ? margin * 100 : null;
}

function formatDayLabel(day: string, short = false) {
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
  }).format(date);
}

export function ShopfrontReportsOverviewPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("yesterday");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const periodRef = useRef(period);
  const customRef = useRef({ from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unmapped, setUnmapped] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [margin, setMargin] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<number | null>(null);
  const [sellableUnits, setSellableUnits] = useState<number | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [compareRevenue, setCompareRevenue] = useState<number | null>(null);
  const [comparisonLabel, setComparisonLabel] = useState("");
  const [missingTrendDays, setMissingTrendDays] = useState(0);
  const [marginWeek, setMarginWeek] = useState<TrendPoint[]>([]);
  const revision = useRef(0);

  const rangeLabel = useMemo(() => {
    if (period === "custom" && fromDay && toDay) return `${formatDayLabel(fromDay, true)} – ${formatDayLabel(toDay, true)}`;
    return PERIODS.find((item) => item.period === period)?.label ?? "Overview";
  }, [fromDay, period, toDay]);

  const load = useCallback(async (refresh = false, selected = periodRef.current) => {
    const current = ++revision.current;
    const days = periodDays(selected, customRef.current.from, customRef.current.to);
    if (!days) {
      setError("Choose a valid date range.");
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setUnmapped(false);
    const compare = compareDays(selected, days.from, days.to);
    setComparisonLabel(compare.label);
    try {
      const salesQuery = new URLSearchParams({
        resource: "report-sales",
        from: days.from,
        to: days.to,
        dashboard: "true",
        size: "600",
      });
      const trendQuery = new URLSearchParams({ resource: "sales-trend", from: days.from, to: days.to });
      const inventoryQuery = new URLSearchParams({ resource: "dashboard-inventory" });
      const compareQuery = new URLSearchParams({
        resource: "report-sales",
        from: compare.from,
        to: compare.to,
        size: "600",
      });
      const weekEnd = salesDate(new Date().toISOString(), TIMEZONE);
      const weekStart = shiftDay(weekEnd, -6);
      const weekTrendQuery = new URLSearchParams({ resource: "sales-trend", from: weekStart, to: weekEnd });
      const cache = refresh ? "no-store" : "default";
      const [salesRes, trendRes, inventoryRes, compareRes, weekTrendRes] = await Promise.all([
        fetch(`/api/shopfront-source?${salesQuery}`, { credentials: "same-origin", cache }),
        fetch(`/api/shopfront-source?${trendQuery}`, { credentials: "same-origin", cache }),
        fetch(`/api/shopfront-source?${inventoryQuery}`, { credentials: "same-origin", cache }),
        fetch(`/api/shopfront-source?${compareQuery}`, { credentials: "same-origin", cache }),
        fetch(`/api/shopfront-source?${weekTrendQuery}`, { credentials: "same-origin", cache }),
      ]);
      if (current !== revision.current) return;
      if (salesRes.status === 409 || trendRes.status === 409) {
        setUnmapped(true);
        throw new Error("Shopfront is not mapped for this store.");
      }
      const salesBody = await salesRes.json().catch(() => null);
      const trendBody = await trendRes.json().catch(() => null);
      const weekTrendBody = await weekTrendRes.json().catch(() => null);
      const inventoryBody = await inventoryRes.json().catch(() => null);
      const compareBody = await compareRes.json().catch(() => null);
      if (!salesRes.ok || !salesBody) throw new Error(salesBody?.message ?? "Shopfront sales are unavailable.");
      const metrics = parseShopfrontSalesReport(salesBody);
      if (!metrics) throw new Error("Shopfront returned an incomplete sales summary.");
      setRevenue(metrics.revenue);
      setMargin(metrics.grossMargin);
      setTransactions(metrics.transactionCount);
      setFetchedAt(metrics.fetchedAt ?? new Date().toISOString());
      const compareMetrics = compareRes.ok ? parseShopfrontSalesReport(compareBody) : null;
      setCompareRevenue(compareMetrics?.revenue ?? null);
      const inventory = parseShopfrontInventoryReport(inventoryBody);
      setSellableUnits(inventory?.sellableUnits ?? (Number.isFinite(Number(inventoryBody?.sellable_units)) ? Number(inventoryBody.sellable_units) : null));
      setTrend(parseTrendRows(trendBody));
      setMarginWeek(parseTrendRows(weekTrendBody));
      setMissingTrendDays(Array.isArray(trendBody?.coverage?.missing_dates) ? trendBody.coverage.missing_dates.length : 0);
      const metricBlock = salesBody.metrics as Record<string, unknown> | undefined;
      const products = Array.isArray(metricBlock?.top_products) ? metricBlock.top_products as Array<Record<string, unknown>> : [];
      setTopProducts(products.slice(0, 6).map((row) => ({
        id: String(row.id ?? row.name ?? "product"),
        name: String(row.name ?? "Product"),
        revenue: Number(row.revenue ?? 0),
        quantity: Number(row.quantity ?? 0),
      })));
    } catch (cause) {
      if (current === revision.current) {
        setError(cause instanceof Error ? cause.message : "Could not load overview.");
      }
    } finally {
      if (current === revision.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useShopfrontSyncRefresh(() => { void load(true); });

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const saved = search.get("period");
    const mapped = saved === "last_7_days" ? "last_week" : saved;
    const normalized = PERIODS.some((item) => item.period === mapped) ? mapped as ReportQueryPeriod
      : mapped === "custom" ? "custom" : mapped === "today" ? "today" : "yesterday";
    if (normalized === "custom" && search.get("from") && search.get("to")) {
      const from = search.get("from")!;
      const to = search.get("to")!;
      customRef.current = { from, to };
      setFromDay(from);
      setToDay(to);
      periodRef.current = "custom";
      setPeriod("custom");
    } else {
      periodRef.current = normalized === "custom" ? "yesterday" : normalized;
      setPeriod(periodRef.current);
    }
    void load();
    return () => { revision.current++; };
  }, [load]);

  const maxRevenue = Math.max(1, ...trend.map((point) => point.revenue));
  const hasTrend = trend.some((point) => point.revenue > 0);
  const revenueDelta = revenue !== null && compareRevenue !== null ? percentDelta(revenue, compareRevenue) : null;
  const averageSale = revenue !== null && transactions ? revenue / transactions : 0;

  function selectPeriod(next: DashboardPeriod) {
    const url = new URL(location.href);
    url.searchParams.set("period", next);
    url.searchParams.delete("from");
    url.searchParams.delete("to");
    history.replaceState(null, "", url);
    periodRef.current = next;
    setPeriod(next);
    customRef.current = { from: "", to: "" };
    setFromDay("");
    setToDay("");
    void load(false, next);
  }

  function applyCustomRange() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(toDay) || fromDay > toDay) {
      setError("Choose a valid date range.");
      return;
    }
    const span = Math.round((Date.parse(`${toDay}T12:00:00Z`) - Date.parse(`${fromDay}T12:00:00Z`)) / 86_400_000) + 1;
    if (span > 366) {
      setError("Custom ranges are limited to 366 days.");
      return;
    }
    customRef.current = { from: fromDay, to: toDay };
    periodRef.current = "custom";
    setPeriod("custom");
    const url = new URL(location.href);
    url.searchParams.set("period", "custom");
    url.searchParams.set("from", fromDay);
    url.searchParams.set("to", toDay);
    history.replaceState(null, "", url);
    void load(false, "custom");
  }

  const marginWeekPoints = useMemo(() => marginWeek.map((point) => ({ point, pct: dayMarginPercent(point) })).filter((row) => row.pct !== null) as Array<{ point: TrendPoint; pct: number }>, [marginWeek]);
  const maxMarginPct = Math.max(1, ...marginWeekPoints.map((row) => row.pct));
  const weekMarginAvg = marginWeekPoints.length
    ? marginWeekPoints.reduce((sum, row) => sum + row.pct, 0) / marginWeekPoints.length
    : null;

  if (unmapped && !revenue) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <section className="max-w-lg rounded-xl border border-[var(--oh-border)] bg-white p-8 text-center shadow-[var(--oh-shadow-card)]">
          <Package className="mx-auto text-amber-600" size={30} />
          <h1 className="mt-4 text-xl font-semibold text-[var(--oh-text)]">Connect Shopfront</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Overview reads your Shopfront sales reports. Map this store under Integrations to continue.</p>
          <Link href="/settings/integrations" className="mt-5 inline-flex h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">Open integrations</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--oh-surface)] p-3 lg:p-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="oh-type-meta text-[var(--oh-muted)]">Shopfront · source of truth</p>
          <h1 className="oh-type-title mt-0.5 text-[var(--oh-text)]">Overview</h1>
          <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">
            {rangeLabel}
            {fetchedAt ? <> · Updated {formatStoreEpoch(Date.parse(fetchedAt.includes("T") ? fetchedAt : `${fetchedAt.replace(" ", "T")}Z`), TIMEZONE)}</> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="group" aria-label="Reporting range" className="inline-flex max-w-full flex-wrap rounded-lg border border-[var(--oh-border)] bg-white p-0.5 shadow-sm">
            {PERIODS.map((item) => (
              <button
                key={item.period}
                type="button"
                aria-pressed={period === item.period}
                onClick={() => selectPeriod(item.period)}
                className={cn(
                  "oh-type-meta min-h-9 rounded-md px-3 font-medium transition-colors",
                  period === item.period ? "bg-[var(--oh-primary)] text-white shadow-sm" : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--oh-border)] bg-white p-1">
            <label className="sr-only" htmlFor="overview-from">From</label>
            <input id="overview-from" type="date" value={fromDay} onChange={(event) => setFromDay(event.target.value)} className="min-h-9 rounded border border-[var(--oh-border)] px-2 text-xs" />
            <span className="text-xs text-[var(--oh-muted)]">to</span>
            <label className="sr-only" htmlFor="overview-to">To</label>
            <input id="overview-to" type="date" value={toDay} onChange={(event) => setToDay(event.target.value)} className="min-h-9 rounded border border-[var(--oh-border)] px-2 text-xs" />
            <button
              type="button"
              disabled={!fromDay || !toDay || fromDay > toDay}
              onClick={applyCustomRange}
              className={cn(
                "min-h-9 rounded-md px-3 text-xs font-semibold",
                period === "custom" ? "bg-[var(--oh-primary)] text-white" : "bg-[var(--oh-surface)] text-[var(--oh-text)] hover:bg-[var(--oh-surface-muted)]",
                (!fromDay || !toDay || fromDay > toDay) && "opacity-50",
              )}
            >
              Custom
            </button>
          </div>
          <RefreshButton onClick={() => void load(true)} disabled={refreshing || loading} />
        </div>
      </header>

      {error ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          <span className="flex items-center gap-2"><AlertCircle size={16} />{error}</span>
          <button type="button" onClick={() => void load(true)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-red-300 bg-white px-3 text-xs font-semibold">Retry</button>
        </div>
      ) : null}

      {missingTrendDays > 0 ? (
        <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Daily trend is missing {missingTrendDays} day{missingTrendDays === 1 ? "" : "s"} in this range (not counted as zero sales).
        </p>
      ) : null}

      <section aria-busy={loading} aria-label={`${rangeLabel} summary`} className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <HeroKpi title="Sales" value={revenue !== null ? money(revenue) : "—"} detail="Shopfront revenue" delta={revenueDelta} comparisonLabel={comparisonLabel} icon={<ShoppingBag size={18} />} loading={loading} />
        <HeroKpi title="Gross margin" value={margin !== null ? `${(margin * 100).toFixed(1)}%` : "—"} detail="Profit ÷ revenue" icon={<Percent size={18} />} loading={loading} />
        <HeroKpi title="Transactions" value={transactions !== null ? transactions.toLocaleString("en-AU") : "—"} detail={averageSale ? `Avg ${money(averageSale)}` : "Shopfront sales count"} icon={<TrendingUp size={18} />} loading={loading} />
        <HeroKpi title="Sellable units" value={sellableUnits !== null ? sellableUnits.toLocaleString("en-AU") : "—"} detail="On-hand · Shopfront inventory" icon={<Package size={18} />} loading={loading} href="/reports/inventory" />
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <section className="flex min-h-[15rem] flex-col rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] lg:col-span-2 lg:min-h-[18rem]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[var(--oh-text)]">Sales trend</h2>
              <p className="text-xs text-[var(--oh-muted)]">Daily Shopfront totals · {rangeLabel}</p>
            </div>
            {(() => {
              const bounds = periodDays(period, customRef.current.from, customRef.current.to);
              return bounds ? (
                <Link href={`/reports/sales?from=${bounds.from}&to=${bounds.to}&group=day`} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--oh-primary)] hover:underline">
                  Sales report <ArrowUpRight size={14} />
                </Link>
              ) : null;
            })()}
          </div>
          {loading && !hasTrend ? (
            <div className="mt-6 h-36 animate-pulse rounded-lg bg-[var(--oh-surface-muted)]" aria-hidden="true" />
          ) : hasTrend ? (
            <div className="mt-4 flex min-h-[10rem] flex-1 flex-col">
              <div aria-hidden className="relative flex min-h-[10rem] flex-1 items-end gap-1 border-b border-l border-[var(--oh-border)] px-1 pb-0 pt-2">
                {trend.map((point) => {
                  const height = Math.max(point.revenue > 0 ? 6 : 0, (point.revenue / maxRevenue) * 100);
                  return (
                    <div
                      key={point.date}
                      className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
                      title={`${formatDayLabel(point.date, true)}: ${money(point.revenue)} · ${point.transactions} txns`}
                    >
                      <div className="mx-auto w-full max-w-12 rounded-t bg-[var(--oh-primary)]/90 transition group-hover:bg-[var(--oh-primary)]" style={{ height: `${height}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[var(--oh-muted)]">
                <span>{trend[0] ? formatDayLabel(trend[0].date, true) : ""}</span>
                <span>{trend.length > 1 ? formatDayLabel(trend[trend.length - 1].date, true) : ""}</span>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <BarChart3 className="text-[var(--oh-primary)]" size={28} aria-hidden="true" />
              <p className="text-sm font-medium text-[var(--oh-text)]">No sales in this period</p>
              <p className="text-xs text-[var(--oh-muted)]">Try another range or refresh after sync.</p>
            </div>
          )}
        </section>

        <section className="flex min-h-[15rem] flex-col rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]" aria-label="Last 7 days gross margin">
          <div>
            <h2 className="text-base font-semibold text-[var(--oh-text)]">Weekly margin</h2>
            <p className="text-xs text-[var(--oh-muted)]">Gross margin % by day · rolling 7 days</p>
            {weekMarginAvg !== null ? (
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--oh-text)]">{weekMarginAvg.toFixed(1)}% <span className="text-xs font-normal text-[var(--oh-muted)]">avg</span></p>
            ) : null}
          </div>
          {loading && marginWeekPoints.length === 0 ? (
            <div className="mt-4 h-28 animate-pulse rounded-lg bg-[var(--oh-surface-muted)]" aria-hidden="true" />
          ) : marginWeekPoints.length > 0 ? (
            <div className="mt-3 flex min-h-[8rem] flex-1 flex-col">
              <div aria-hidden className="relative flex flex-1 items-end gap-1 border-b border-[var(--oh-border)] px-0.5 pb-0 pt-1">
                {marginWeekPoints.map(({ point, pct }) => {
                  const height = Math.max(8, (pct / maxMarginPct) * 100);
                  return (
                    <div
                      key={point.date}
                      className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
                      title={`${formatDayLabel(point.date, true)}: ${pct.toFixed(1)}%`}
                    >
                      <div className="mx-auto w-full max-w-10 rounded-t bg-[var(--brand-module-teal)]/85 transition group-hover:bg-[var(--brand-module-teal)]" style={{ height: `${height}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between gap-1 text-[10px] text-[var(--oh-muted)]">
                <span>{formatDayLabel(marginWeekPoints[0].point.date, true)}</span>
                <span>{formatDayLabel(marginWeekPoints[marginWeekPoints.length - 1].point.date, true)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-center text-xs text-[var(--oh-muted)]">No margin data for the last 7 days.</p>
          )}
        </section>
      </div>

      {topProducts.length > 0 ? (
        <section className="mt-3 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--oh-text)]">Top products</h2>
            <Link href="/reports/sales" className="text-xs font-semibold text-[var(--oh-primary)] hover:underline">Detail in Sales report</Link>
          </div>
          <ul className="mt-3 divide-y divide-[var(--oh-border)]">
            {topProducts.map((product) => (
              <li key={product.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate font-medium text-[var(--oh-text)]">{product.name}</span>
                <span className="shrink-0 tabular-nums text-[var(--oh-muted)]">{product.quantity.toLocaleString("en-AU")} units</span>
                <span className="shrink-0 tabular-nums font-semibold text-[var(--oh-text)]">{money(product.revenue)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="oh-type-meta mt-4 text-[var(--oh-muted)]">
        Overview uses Shopfront reports only. Open <Link href="/reports/sales" className="font-semibold text-[var(--oh-primary)] hover:underline">Sales report</Link> for ledgers, exports, and daily breakdowns.
      </p>
    </main>
  );
}

function RefreshButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text)] shadow-sm disabled:opacity-60"
    >
      {disabled ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
      Refresh
    </button>
  );
}

function HeroKpi({
  title,
  value,
  detail,
  delta,
  comparisonLabel,
  icon,
  loading,
  href,
}: {
  title: string;
  value: string;
  detail?: string;
  delta?: number | null;
  comparisonLabel?: string;
  icon: React.ReactNode;
  loading?: boolean;
  href?: string;
}) {
  const card = (
    <article className={cn("rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]", loading && value === "—" && "animate-pulse")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">{title}</p>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--oh-text)] tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[var(--oh-muted)]">{detail}</p> : null}
      {delta !== null && delta !== undefined && Number.isFinite(delta) ? (
        <p className={cn("mt-2 text-xs font-semibold", delta >= 0 ? "text-[var(--oh-success)]" : "text-red-600")}>
          {delta >= 0 ? "+" : ""}{delta.toFixed(1)}% {comparisonLabel}
        </p>
      ) : null}
    </article>
  );
  return href ? <Link href={href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">{card}</Link> : card;
}
