"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, BarChart3, RefreshCw } from "lucide-react";
import { money, type OverviewPulse, pulseMarginNote } from "./useOverview";

function updatedAt(value: string | undefined, timezone: string) {
  if (!value) return null;
  try {
    const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
    return new Intl.DateTimeFormat("en-AU", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  } catch { return null; }
}

function Metric({ label, href, value, note, noteHref, title }: { label: string; href: string; value: ReactNode; note: string; noteHref?: string; title?: string }) {
  return <div className="ov-pulse-metric">
    <dt><Link href={href} title={title}>{label}</Link></dt>
    <dd>{value}</dd>
    <dd className="ov-stat-note">{noteHref ? <Link href={noteHref}>{note}</Link> : note}</dd>
  </div>;
}

export function OverviewStorePulse({ data, loading, canReport, onRefresh, sandboxNote }: {
  data: OverviewPulse;
  loading: boolean;
  canReport: boolean;
  onRefresh: () => void;
  sandboxNote?: boolean;
}) {
  const timestamp = updatedAt(data.queryThrough, data.timezone);
  const stockAvailable = data.inventoryAvailable && data.inventoryUnits != null && Number.isFinite(data.inventoryUnits)
    && data.inventoryStatus !== "mixed_units" && data.inventoryStatus !== "unavailable";
  const marginAvailable = data.yesterdayGrossMargin != null;
  const marginNote = pulseMarginNote(data);
  const datePart = (value?: string) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: data.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`)) : "";
  const marginHref = `/products?dialog=cost-reconciliation&fromDay=${datePart(data.yesterdayFrom)}&toDay=${datePart(data.yesterdayTo)}`;
  const netUnits = data.inventoryNetUnits;
  const negativeStockHref = "/products?view=negative-stock";

  return (
    <section className="ov-pulse-panel" aria-labelledby="ov-pulse-title">
      <header className="ov-pulse-heading">
        <div>
          <div className="ov-pulse-title"><BarChart3 size={18} aria-hidden="true" /><h2 id="ov-pulse-title">Store pulse</h2></div>
          {timestamp && <p className="ov-pulse-updated">Updated {timestamp}</p>}
          {sandboxNote && <p className="ov-pulse-updated">Sandbox snapshot · not live Shopfront sync</p>}
        </div>
        <button type="button" className="ov-pulse-refresh" disabled={loading} aria-label={loading ? "Refreshing store summary" : "Refresh store summary"} aria-busy={loading} title={loading ? "Refreshing…" : "Refresh"} onClick={onRefresh}>
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </header>
      {data.cacheStatus === "STALE" && <p className="ov-pulse-updating" role="status">Updating · Showing saved summary</p>}
      <dl className="ov-pulse-stats" aria-label="Store metrics">
        <Metric label="Yesterday sales" href="/reports/daily-sales"
          value={data.yesterdaySalesAvailable === false ? "—" : money(data.yesterdaySales ?? 0, data.currency)}
          note={data.yesterdaySalesAvailable === false ? "Temporarily unavailable" : "Including tax"} />
        <Metric label="Gross margin" href={marginHref}
          value={marginAvailable ? `${(data.yesterdayGrossMargin! * 100).toFixed(1)}%` : "—"}
          note={marginNote} />
        <Metric label="Sellable units" href="/products"
          title={stockAvailable ? "Sum of positive on-hand balances by product across internal locations." : undefined}
          value={stockAvailable ? (
            <div className="flex flex-col gap-0.5">
              <span>{data.inventoryUnits!.toLocaleString("en-AU")}</span>
              {netUnits != null && Number.isFinite(netUnits) && (
                <span className={netUnits < 0 ? "text-sm font-medium text-amber-800" : "text-sm text-[var(--oh-muted)]"}>
                  Net {netUnits.toLocaleString("en-AU")}
                </span>
              )}
            </div>
          ) : "—"}
          note={data.inventoryStatus === "mixed_units" ? "Mixed units of measure" : !stockAvailable ? "Temporarily unavailable"
            : data.inventoryStatus === "negative_stock" ? `${data.negativeStockProducts ?? 0} SKUs below zero · review list` : "Positive on-hand only"}
          noteHref={data.inventoryStatus === "negative_stock" ? negativeStockHref : undefined} />
      </dl>
      {canReport && <Link className="ov-pulse-report" href="/reports/dashboard">View reports<ArrowUpRight size={16} aria-hidden="true" /></Link>}
    </section>
  );
}
