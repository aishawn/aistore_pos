"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { FilterDateRangePicker } from "@/components/admin/FilterDateRangePicker";
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
  const [draft, setDraft] = useState({ start: from, end: to });

  useEffect(() => {
    setDraft({ start: from, end: to });
  }, [from, to]);

  function apply(nextPeriod: ReportDatePreset, nextFrom: string, nextTo: string) {
    onChange({ period: nextPeriod, from: nextFrom, to: nextTo });
    syncReportRangeToUrl(nextPeriod, nextFrom, nextTo);
  }

  function selectPreset(id: Exclude<ReportDatePreset, "custom">) {
    const range = reportDatePreset(id, new Date(), timezone);
    setDraft({ start: range.from, end: range.to });
    apply(id, range.from, range.to);
  }

  function changeRange(range: { start: string; end: string }) {
    setDraft(range);
    if (!range.start || !range.end) return;
    const nextPeriod = matchReportDatePreset(range.start, range.end, new Date(), timezone);
    apply(nextPeriod, range.start, range.end);
  }

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-2 lg:w-auto lg:max-w-none lg:flex-row lg:items-center">
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
      <div className="flex flex-wrap items-center gap-2">
        <FilterDateRangePicker label="Date range" start={draft.start} end={draft.end} onChange={changeRange} />
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh report"
            title="Refresh report"
            className="grid size-10 place-items-center rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] disabled:opacity-50 sm:size-11"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
