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

function Metric({ label, href, value, note }: { label: string; href: string; value: ReactNode; note: string }) {
  return (
    <div className="ov-pulse-metric">
      <dt><Link href={href}>{label}</Link></dt>
      <dd>{value}</dd>
      <dd className="ov-stat-note">{note}</dd>
    </div>
  );
}

export function OverviewStorePulse({ data, loading, canReport, onRefresh }: {
  data: OverviewPulse;
  loading: boolean;
  canReport: boolean;
  onRefresh: () => void;
  sandboxNote?: boolean;
}) {
  const timestamp = updatedAt(data.sourceReportsFetchedAt ?? data.queryThrough, data.timezone);
  const marginAvailable = data.yesterdayGrossMargin != null;
  const marginNote = pulseMarginNote(data);

  return (
    <section className="ov-pulse-panel" aria-labelledby="ov-pulse-title">
      <header className="ov-pulse-heading">
        <div>
          <div className="ov-pulse-title"><BarChart3 size={18} aria-hidden="true" /><h2 id="ov-pulse-title">Store pulse</h2></div>
          {timestamp && <p className="ov-pulse-updated">Orithos ledger · {timestamp}</p>}
          {!timestamp && <p className="ov-pulse-updated">Orithos ledger</p>}
        </div>
        <button type="button" className="ov-pulse-refresh" disabled={loading} aria-label={loading ? "Refreshing store summary" : "Refresh store summary"} aria-busy={loading} title={loading ? "Refreshing…" : "Refresh"} onClick={onRefresh}>
          <RefreshCw size={17} aria-hidden="true" />
        </button>
      </header>
      <dl className="ov-pulse-stats" aria-label="Store metrics">
        <Metric
          label="Yesterday sales"
          href="/reports/dashboard?period=yesterday"
          value={data.yesterdaySalesAvailable === false ? "—" : money(data.yesterdaySales ?? 0, data.currency)}
          note={data.yesterdaySalesAvailable === false ? "Temporarily unavailable" : "Including tax"}
        />
        <Metric
          label="Gross margin"
          href="/reports/dashboard?period=yesterday"
          value={marginAvailable ? `${(data.yesterdayGrossMargin! * 100).toFixed(1)}%` : "—"}
          note={marginNote}
        />
        <Metric
          label="Sellable units"
          href="/reports/inventory"
          value="—"
          note="Native inventory snapshot not in this pulse"
        />
      </dl>
      {canReport && <Link className="ov-pulse-report" href="/reports/dashboard">View reports<ArrowUpRight size={16} aria-hidden="true" /></Link>}
    </section>
  );
}
