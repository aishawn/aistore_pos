import {
  EditIcon, SelectChevronIcon, ExportIcon, PrinterIcon, SaveIcon, ColumnsIcon, SortArrowsIcon,
} from "@/components/icons";

interface Panel {
  label: string;
  value: string;
}

/**
 * Orithos report builder — a query bar, filter panels, search and toolbar,
 * followed by a responsive results table and totals row.
 * Shared by Sales / Inventory / Purchase / Transfer / Actions / Advanced /
 * Misc reports.
 */
export function ReportBuilder({
  query,
  panels,
  columns,
  totals,
}: {
  query: React.ReactNode;
  panels: Panel[];
  columns: string[];
  totals: (string | null)[];
}) {
  const tableMinWidth = Math.max(800, columns.length * 112);
  const tableGridStyle = {
    gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
    minWidth: `${tableMinWidth}px`,
  };

  return (
    <div className="h-full overflow-auto bg-[var(--oh-surface)] p-3 font-sans sm:p-4 lg:p-6">
      {/* Query bar */}
      <div className="flex items-center gap-3 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2.5 shadow-[var(--oh-shadow-card)] sm:px-4">
        <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] text-[var(--oh-text-secondary)]">
          {query}
        </code>
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--oh-success)]">
          <EditIcon size={16} /> Edit
        </span>
      </div>

      {/* Dropdown panels */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {panels.map((p) => (
          <div key={p.label} className="flex min-h-[76px] min-w-0 items-center justify-between rounded-lg border border-[var(--oh-border)] bg-white px-4 py-3 text-[var(--oh-text)] shadow-[var(--oh-shadow-card)]">
            <span>
              <span className="block text-xs font-medium text-[var(--oh-muted)]">{p.label}</span>
              <span className="mt-0.5 block text-base font-semibold">{p.value}</span>
            </span>
            <SelectChevronIcon size={18} className="shrink-0 text-[var(--oh-muted)]" />
          </div>
        ))}
      </div>

      {/* Search + toggle */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input placeholder="Search for anything" className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--oh-border)] bg-white px-4 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]" />
        <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2 sm:justify-center sm:px-4">
          <span className="text-sm font-medium text-[var(--oh-text-secondary)]">Include Deleted</span>
          <span className="flex h-6 w-11 items-center rounded-full bg-[var(--oh-border)] p-1" aria-hidden="true">
            <span className="h-4 w-4 rounded-full bg-white" />
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-paper)]"><ExportIcon size={18} className="text-[var(--oh-primary)]" /> Export</button>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-paper)]"><PrinterIcon size={18} className="text-[var(--oh-primary)]" /> Print</button>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-paper)]"><SaveIcon size={18} className="text-[var(--oh-primary)]" /> Save</button>
        </div>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-paper)]"><ColumnsIcon size={18} className="text-[var(--oh-primary)]" /> Columns</button>
      </div>

      {/* Results table */}
      <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
        <div className="overflow-hidden rounded-lg font-sans text-[13px]" style={{ minWidth: `${tableMinWidth}px` }}>
          <div
            className="grid items-center border-b border-[var(--oh-border)] bg-[var(--oh-paper)] px-3 py-2.5 text-center text-xs font-semibold text-[var(--oh-muted)]"
            style={tableGridStyle}
          >
            {columns.map((c, i) => (
              <div key={c} className="flex min-w-0 items-center justify-center gap-1 px-1.5">
                {c}
                {i > 0 && <SortArrowsIcon size={12} className="shrink-0 opacity-70" />}
              </div>
            ))}
          </div>
          <div
            className="grid items-center border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2.5 text-center text-[13px] font-semibold text-[var(--oh-text)]"
            style={tableGridStyle}
          >
            {totals.map((t, i) => (
              <div key={i} className="min-w-0 px-1.5">
                {t}
              </div>
            ))}
          </div>
          <div className="grid min-h-36 place-items-center border-t border-[var(--oh-border)] px-4 text-center text-sm text-[var(--oh-muted)]">
            No report rows to display for these filters.
          </div>
        </div>
      </div>
    </div>
  );
}
