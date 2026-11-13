"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, BarChart3, RefreshCw } from "lucide-react";
import { formatShopfrontProfitPercent } from "@/lib/shopfront-aligned-margin";
import { money, type OverviewPulse, pulseMarginNote } from "./useOverview";

function updatedAt(value: string | undefined, timezone: string) {
  if (!value) return null;
  try {
    const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
    return new Intl.DateTimeFormat("en-AU", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  } catch {
    return null;
  }
}

function Metric({ label, href, value, note, noteHref, title }: { label: string; href: string; value: ReactNode; note: string; noteHref?: string; title?: string }) {
  return (
    <div className="ov-pulse-metric">
      <dt><Link href={href} title={title}>{label}</Link></dt>
      <dd>{value}</dd>
      <dd className="ov-stat-note">{noteHref ? <Link href={noteHref}>{note}</Link> : note}</dd>
    </div>
  );
}

export function OverviewStorePulse({ data, loading, canReport, onRefresh, sandboxNote }: {
  data: OverviewPulse;
  loading: boolean;
  canReport: boolean;
  onRefresh: () => void;
  sandboxNote?: boolean;
}) {
  const timestamp = updatedAt(data.sourceReportsFetchedAt ?? data.queryThrough, data.timezone);
  const caseLevel = data.inventoryCaseLevel != null && Number.isFinite(data.inventoryCaseLevel) ? data.inventoryCaseLevel : null;
  const itemLevel = data.inventoryItemLevel != null && Number.isFinite(data.inventoryItemLevel) ? data.inventoryItemLevel : null;
  const stockAvailable = data.inventoryAvailable
    && caseLevel != null
    && itemLevel != null
    && data.inventoryStatus !== "mixed_units"
    && data.inventoryStatus !== "unavailable";
  const stockValue = stockAvailable
    ? `${caseLevel!.toLocaleString("en-AU")} · ${itemLevel!.toLocaleString("en-AU")}`
    : "—";
  const marginAvailable = data.yesterdayGrossMargin != null;
  const marginNote = pulseMarginNote(data);
  const orithosMode = data.shopfrontReportsMode === "orithos";
  const sourceMode = data.shopfrontReportsMode === "source";
  const marginHref = orithosMode || sourceMode
    ? "/reports/dashboard?period=yesterday"
    : `/products?dialog=cost-reconciliation&fromDay=${data.yesterdayFrom || ""}&toDay=${data.yesterdayTo || ""}`;
  const negativeStockHref = orithosMode || sourceMode ? "/reports/inventory" : "/products?view=negative-stock";
  // Shopfront / Orithos sales report: Profit % = (revenue - cost) / revenue (tax inclusive).
  const marginValue = marginAvailable
    ? formatShopfrontProfitPercent(data.yesterdayGrossMargin!, sourceMode || orithosMode ? 2 : 1)
    : "—";

  return (
    <section className="ov-pulse-panel" aria-labelledby="ov-pulse-title">
      <header className="ov-pulse-heading">
        <div>
          <div className="ov-pulse-title"><BarChart3 size={18} aria-hidden="true" /><h2 id="ov-pulse-title">Store pulse</h2></div>
          {timestamp && (
            <p className="ov-pulse-updated">
              {orithosMode ? "Orithos ledger · " : sourceMode ? "Reports · " : "Updated "}
              {timestamp}
            </p>
          )}
          {sourceMode && !timestamp && <p className="ov-pulse-updated">Reports unavailable</p>}
          {sandboxNote && <p className="ov-pulse-updated">Sandbox snapshot · not live data sync</p>}
        </div>
        <button type="button" className="ov-pulse-refresh" disabled={loading} aria-label={loading ? "Refreshing store summary" : "Refresh store summary"} aria-busy={loading} title={loading ? "Refreshing…" : "Refresh"} onClick={onRefresh}>
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </header>
      {data.cacheStatus === "STALE" && <p className="ov-pulse-updating" role="status">Updating · Showing saved summary</p>}
      <dl className="ov-pulse-stats" aria-label="Store metrics">
        <Metric
          label="Yesterday sales"
          href="/reports/dashboard?period=yesterday"
          value={data.yesterdaySalesAvailable === false ? "—" : money(data.yesterdaySales ?? 0, data.currency)}
          note={
            data.yesterdaySalesAvailable === false
              ? orithosMode ? "Orithos ledger unavailable" : sourceMode ? "Report unavailable" : "Temporarily unavailable"
              : orithosMode ? "Orithos ledger · including tax" : sourceMode ? "Sales report" : "Including tax"
          }
        />
        <Metric
          label={sourceMode || orithosMode ? "Profit percentage" : "Gross margin"}
          href={marginHref}
          value={marginValue}
          note={marginNote}
        />
        <Metric
          label="Inventory on hand"
          href={orithosMode || sourceMode ? "/reports/inventory" : "/products"}
          title={stockAvailable
            ? "Same Case Level · Item Level totals as Reports → Inventory (Inventory on Hand)."
            : undefined}
          value={stockValue}
          note={
            data.inventoryStatus === "partial_inventory"
              ? `Known subtotal · ${Math.round((data.inventoryCoverage ?? 0) * 100)}% of rows · ${data.inventoryIncompleteRows ?? 0} excluded`
              : data.inventoryStatus === "mixed_units"
                ? "Mixed units of measure"
                : data.inventoryStatus === "stale"
                  ? "Inventory report is stale"
                  : !stockAvailable
                    ? orithosMode
                      ? "Open inventory report for Orithos on-hand"
                      : sourceMode
                        ? "Inventory report unavailable"
                        : "Temporarily unavailable"
                    : data.inventoryStatus === "negative_stock"
                      ? `Case · Item · ${data.negativeStockProducts ?? 0} SKUs below zero`
                      : "Case level · Item level · positive only"
          }
          noteHref={data.inventoryStatus === "negative_stock" || (orithosMode && !stockAvailable) ? negativeStockHref : undefined}
        />
      </dl>
      {canReport && <Link className="ov-pulse-report" href="/reports/dashboard">View reports<ArrowUpRight size={16} aria-hidden="true" /></Link>}
    </section>
  );
}
