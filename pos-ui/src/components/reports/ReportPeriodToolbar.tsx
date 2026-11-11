"use client";

import { RefreshCw } from "lucide-react";
import {
  matchReportDatePreset,
  reportDatePreset,
  syncReportRangeToUrl,
  type ReportDatePreset,
} from "@/lib/report-date-selection";
import { cn } from "@/lib/utils";

const PRESETS: Array<{ id: Exclude<ReportDatePreset, "custom">; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7_days", label: "Last 7 days" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "this_month", label: "This month" },
];

export function ReportPeriodToolbar({
  period,
  from,
  to,
  loading = false,
  onChange,
  onRefresh,
  timezone = "Australia/Adelaide",
}: {
  period: ReportDatePreset;
  from: string;
  to: string;
  loading?: boolean;
  onChange: (next: { period: ReportDatePreset; from: string; to: string }) => void;
  onRefresh?: () => void;
  timezone?: string;
}) {
  function apply(nextPeriod: ReportDatePreset, nextFrom: string, nextTo: string) {
    onChange({ period: nextPeriod, from: nextFrom, to: nextTo });
    syncReportRangeToUrl(nextPeriod, nextFrom, nextTo);
  }

  function selectPreset(id: Exclude<ReportDatePreset, "custom">) {
    const range = reportDatePreset(id, new Date(), timezone);
    apply(id, range.from, range.to);
  }

  function changeFrom(value: string) {
    const nextTo = value > to ? value : to;
    const nextPeriod = matchReportDatePreset(value, nextTo, new Date(), timezone);
    apply(nextPeriod, value, nextTo);
  }

  function changeTo(value: string) {
    const nextFrom = value < from ? value : from;
    const nextPeriod = matchReportDatePreset(nextFrom, value, new Date(), timezone);
    apply(nextPeriod, nextFrom, value);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Reporting period"
        className="flex flex-wrap rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-0.5"
      >
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={period === preset.id}
            onClick={() => selectPreset(preset.id)}
            className={cn(
              "min-h-11 rounded-md px-2.5 text-xs font-semibold transition-colors sm:px-3",
              period === preset.id
                ? "bg-[var(--oh-primary)] text-white"
                : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]",
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-[10px] font-medium uppercase tracking-wide text-[var(--oh-muted)]">
          From
          <input
            type="date"
            value={from}
            onChange={(event) => changeFrom(event.target.value)}
            className="min-h-11 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-2 text-sm text-[var(--oh-text)]"
          />
        </label>
        <label className="grid gap-1 text-[10px] font-medium uppercase tracking-wide text-[var(--oh-muted)]">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => changeTo(event.target.value)}
            className="min-h-11 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-2 text-sm text-[var(--oh-text)]"
          />
        </label>
      </div>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh report"
          title="Refresh report"
          className="grid size-11 place-items-center rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      ) : null}
    </div>
  );
}
