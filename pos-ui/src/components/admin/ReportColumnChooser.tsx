"use client";

import { Columns3 } from "lucide-react";

export type ReportColumn = { key: string; label: string };

export function ReportColumnChooser({ columns, selected, onChange, required = [] }: {
  columns: ReportColumn[];
  selected: string[];
  onChange: (key: string) => void;
  required?: string[];
}) {
  return <details className="relative">
    <summary title="Choose visible columns" className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)]">
      <Columns3 size={16} aria-hidden="true" />Columns
    </summary>
    <fieldset className="absolute right-0 z-20 mt-1 grid min-w-48 gap-2 border border-[var(--oh-border)] bg-white p-3 shadow-lg">
      <legend className="px-1 text-xs font-semibold text-[var(--oh-muted)]">Visible columns</legend>
      {columns.map((column) => <label key={column.key} className="flex min-h-8 items-center gap-2 text-sm text-[var(--oh-text)]">
        <input type="checkbox" checked={selected.includes(column.key)} disabled={required.includes(column.key) || (selected.includes(column.key) && selected.length === 1)} onChange={() => onChange(column.key)} />
        {column.label}
      </label>)}
    </fieldset>
  </details>;
}
