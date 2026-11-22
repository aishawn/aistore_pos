"use client";

import { reportDatePreset, type ReportComparison, type ReportDatePreset, type ReportDateRange } from "@/lib/report-date-selection";

export function ReportDateControls({ value, onChange, comparison, onComparisonChange, timezone = "Australia/Melbourne" }: {
  value: ReportDateRange;
  onChange: (range: ReportDateRange) => void;
  comparison: ReportComparison;
  onComparisonChange: (comparison: ReportComparison) => void;
  timezone?: string;
}) {
  const presets: Array<{ id: Exclude<ReportDatePreset, "custom">; label: string }> = [
    { id: "today", label: "Today" },
    { id: "last_7_days", label: "Last 7 days" },
    { id: "last_30_days", label: "Last 30 days" },
  ];

  return <>
    <div role="group" aria-label="Quick date range" className="flex min-h-11 items-center gap-1 border-b border-[var(--oh-border)] sm:border-b-0 sm:border-r sm:pr-3">
      {presets.map((preset) => {
        const range = reportDatePreset(preset.id, new Date(), timezone);
        const selected = value.from === range.from && value.to === range.to;
        return <button key={preset.id} type="button" aria-pressed={selected} onClick={() => onChange(range)} className={`min-h-9 rounded-md px-2 text-xs font-semibold ${selected ? "bg-[var(--oh-primary)] text-white" : "text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)]"}`}>{preset.label}</button>;
      })}
    </div>
    <label className="grid gap-1 text-xs font-medium text-[var(--oh-muted)]">Compare
      <select aria-label="Compare report period" value={comparison} onChange={(event) => onComparisonChange(event.target.value as ReportComparison)} className="min-h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]">
        <option value="none">No comparison</option>
        <option value="previous_period">Previous period</option>
        <option value="last_year">Same period last year</option>
      </select>
    </label>
  </>;
}
