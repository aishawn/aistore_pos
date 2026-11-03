"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, BarChart3, RefreshCw } from "lucide-react";
import { money, type OverviewPulse } from "./useOverview";

function updatedAt(value: string | undefined, timezone: string) {
  if (!value) return null;
  try {
    const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
    return new Intl.DateTimeFormat("en-AU", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  } catch { return null; }
}

function Metric({ label, href, value, note, title }: { label: string; href: string; value: ReactNode; note: string; title?: string }) {
  return <div className="ov-pulse-metric">
    <dt><Link href={href} title={title}>{label}</Link></dt>
    <dd>{value}</dd>
    <dd className="ov-stat-note">{note}</dd>
  </div>;
}

export function OverviewStorePulse({ data, loading, canReport, onRefresh }: {
  data: OverviewPulse;
  loading: boolean;
  canReport: boolean;
  onRefresh: () => void;
}) {
  const timestamp = updatedAt(data.queryThrough, data.timezone);
  const stockNeedsReview = data.inventoryStatus === "negative_stock" || data.inventoryStatus === "mixed_units";
  const marginAvailable = data.yesterdayGrossMargin != null;
  const marginNote = data.grossMarginStatus === "sales_mismatch" ? "Sales tax mismatch"
    : data.grossMarginStatus === "purchase_cost_missing" ? "Purchase cost unverified"
    : data.grossMarginStatus === "no_sales" ? "No sales yesterday"
    : !marginAvailable ? "Cost data unverified" : "Yesterday · Excluding tax";

  return (
    <section className="ov-pulse-panel" aria-labelledby="ov-pulse-title">
      <header className="ov-pulse-heading">
        <div>
          <div className="ov-pulse-title"><BarChart3 size={18} aria-hidden="true" /><h2 id="ov-pulse-title">Store pulse</h2></div>
          {timestamp && <p className="ov-pulse-updated">Updated {timestamp}</p>}
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
        <Metric label="Gross margin" href="/reports/dashboard"
          value={marginAvailable ? `${(data.yesterdayGrossMargin! * 100).toFixed(1)}%` : "—"}
          note={marginNote} />
        <Metric label="Total inventory" href="/stock/list"
          title={stockNeedsReview && data.inventoryUnits != null ? `Recorded inventory: ${data.inventoryUnits.toLocaleString("en-AU")} units. Review stock details.` : undefined}
          value={!stockNeedsReview && data.inventoryAvailable && data.inventoryUnits != null ? data.inventoryUnits.toLocaleString("en-AU") : "—"}
          note={data.inventoryStatus === "negative_stock" ? "Negative stock detected" : data.inventoryStatus === "mixed_units" ? "Mixed units of measure" : !data.inventoryAvailable ? "Temporarily unavailable" : "Current units on hand"} />
      </dl>
      {canReport && <Link className="ov-pulse-report" href="/reports/dashboard">View reports<ArrowUpRight size={16} aria-hidden="true" /></Link>}
    </section>
  );
}
