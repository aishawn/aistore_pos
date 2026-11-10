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
  const stockAvailable = data.inventoryAvailable && data.inventoryUnits != null && Number.isFinite(data.inventoryUnits)
    && data.inventoryStatus !== "mixed_units" && data.inventoryStatus !== "unavailable";
  const marginAvailable = data.yesterdayGrossMargin != null;
  const marginNote = pulseMarginNote(data);
  const orithosMode = data.shopfrontReportsMode === "orithos";
  const sourceMode = data.shopfrontReportsMode === "source";
  const marginHref = orithosMode || sourceMode
    ? "/reports/dashboard?period=yesterday"
    : `/products?dialog=cost-reconciliation&fromDay=${data.yesterdayFrom || ""}&toDay=${data.yesterdayTo || ""}`;
  const negativeStockHref = orithosMode || sourceMode ? "/reports/inventory" : "/products?view=negative-stock";
  const marginValue = (() => {
    if (!marginAvailable) return "—";
    if (orithosMode) {
      const net = data.yesterdayNetSales;
      if (net != null && net > 0) {
        return `${((data.yesterdayGrossMargin! / net) * 100).toFixed(1)}%`;
      }
      return money(data.yesterdayGrossMargin!, data.currency);
    }
    return `${(data.yesterdayGrossMargin! * 100).toFixed(sourceMode ? 2 : 1)}%`;
  })();

  return (
    <section className="ov-pulse-panel" aria-labelledby="ov-pulse-title">
      <header className="ov-pulse-heading">
        <div>
          <div className="ov-pulse-title"><BarChart3 size={18} aria-hidden="true" /><h2 id="ov-pulse-title">Store pulse</h2></div>
          {timestamp && (
            <p className="ov-pulse-updated">
              {orithosMode ? "Orithos ledger · " : sourceMode ? "Shopfront reports · " : "Updated "}
              {timestamp}
            </p>
          )}
          {sourceMode && !timestamp && <p className="ov-pulse-updated">Shopfront reports unavailable</p>}
          {sandboxNote && <p className="ov-pulse-updated">Sandbox snapshot · not live Shopfront sync</p>}
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
              ? orithosMode ? "Orithos ledger unavailable" : sourceMode ? "Shopfront report unavailable" : "Temporarily unavailable"
              : orithosMode ? "Orithos ledger · including tax" : sourceMode ? "Shopfront Sales report" : "Including tax"
          }
        />
        <Metric
          label={sourceMode ? "Profit percentage" : "Gross margin"}
          href={marginHref}
          value={marginValue}
          note={marginNote}
        />
        <Metric
          label="Sellable units"
          href={orithosMode || sourceMode ? "/reports/inventory" : "/products"}
          title={stockAvailable
            ? orithosMode
              ? "Sum of positive on-hand balances in the Orithos product ledger."
              : sourceMode
                ? data.inventoryStatus === "partial_inventory"
                  ? "Estimated from Shopfront rows with complete case and item quantities."
                  : "Positive on-hand quantity converted from Shopfront case and item levels."
                : "Sum of positive on-hand balances by product across internal locations."
            : undefined}
          value={stockAvailable ? data.inventoryUnits!.toLocaleString("en-AU") : "—"}
          note={
            data.inventoryStatus === "partial_inventory"
              ? `Known subtotal · ${Math.round((data.inventoryCoverage ?? 0) * 100)}% of rows · ${data.inventoryIncompleteRows ?? 0} excluded`
              : data.inventoryStatus === "mixed_units"
                ? "Mixed units of measure"
                : data.inventoryStatus === "stale"
                  ? "Shopfront inventory report is stale"
                  : !stockAvailable
                    ? orithosMode
                      ? "Open inventory report for Orithos on-hand"
                      : sourceMode
                        ? "Shopfront inventory report unavailable"
                        : "Temporarily unavailable"
                    : data.inventoryStatus === "negative_stock"
                      ? `${data.negativeStockProducts ?? 0} SKUs below zero · review list`
                      : orithosMode
                        ? "Orithos on-hand · positive only"
                        : sourceMode
                          ? "Shopfront Inventory · positive on-hand only"
                          : "Positive on-hand only"
          }
          noteHref={data.inventoryStatus === "negative_stock" || (orithosMode && !stockAvailable) ? negativeStockHref : undefined}
        />
      </dl>
      {canReport && <Link className="ov-pulse-report" href="/reports/dashboard">View reports<ArrowUpRight size={16} aria-hidden="true" /></Link>}
    </section>
  );
}
