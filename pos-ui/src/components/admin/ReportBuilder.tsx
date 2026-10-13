import {
  EditIcon, SelectChevronIcon, ExportIcon, PrinterIcon, SaveIcon, ColumnsIcon, SortArrowsIcon,
} from "@/components/icons";

interface Panel {
  label: string;
  value: string;
}

/**
 * Orithos report builder — a syntax-highlighted query bar, a grid of dark
 * dropdown panels, a search + Include Deleted toggle, the Export/Print/Save/
 * Columns toolbar, and a dark results table header with a totals row.
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
  return (
    <div className="h-full overflow-auto bg-white p-4 font-sans">
      {/* Query bar */}
      <div className="flex items-center gap-3 rounded-lg border border-neutral-300 px-4 py-2">
        <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[15px] text-neutral-700">
          {query}
        </code>
        <span className="flex items-center gap-1.5 font-semibold text-[#3cb44b]">
          <EditIcon size={16} /> Edit
        </span>
      </div>

      {/* Dropdown panels */}
      <div className="mt-4 flex flex-wrap gap-px bg-neutral-300">
        {panels.map((p) => (
          <div key={p.label} className="flex min-w-[280px] flex-1 items-center justify-between bg-[#5f636b] px-4 py-3 text-white">
            <span>
              <span className="block text-[14px] opacity-80">{p.label}</span>
              <span className="text-[20px]">{p.value}</span>
            </span>
            <SelectChevronIcon size={18} />
          </div>
        ))}
      </div>

      {/* Search + toggle */}
      <div className="mt-4 flex items-stretch gap-px border border-neutral-300">
        <input placeholder="Search for anything" className="flex-1 px-4 py-3 text-[16px] outline-none placeholder:text-neutral-400" />
        <div className="flex flex-col items-center justify-center border-l border-neutral-300 px-4 py-2">
          <span className="text-[15px] text-black">Include Deleted</span>
          <span className="mt-1 flex h-6 w-11 items-center rounded-full bg-neutral-300 p-1">
            <span className="h-4 w-4 rounded-full bg-white" />
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-4">
          <button className="flex items-center gap-2 rounded-md border border-[#5cb3e0] px-5 py-2.5 font-semibold text-[var(--sf-tab-blue)]"><ExportIcon size={18} /> Export</button>
          <button className="flex items-center gap-2 rounded-md border border-[#5cb3e0] px-5 py-2.5 font-semibold text-[var(--sf-tab-blue)]"><PrinterIcon size={18} /> Print</button>
          <button className="flex items-center gap-2 rounded-md border border-[#5cb3e0] px-5 py-2.5 font-semibold text-[var(--sf-tab-blue)]"><SaveIcon size={18} /> Save</button>
        </div>
        <button className="flex items-center gap-2 rounded-md border border-[#5cb3e0] px-5 py-2.5 font-semibold text-[var(--sf-tab-blue)]"><ColumnsIcon size={18} /> Columns</button>
      </div>

      {/* Results table — matches ListTable (Products / Customers) header */}
      <div className="mt-4 overflow-x-auto">
        <div className="overflow-hidden rounded-md font-sans text-[13px]">
          <div
            className="grid items-center bg-black px-3 py-2 text-center text-[13px] font-bold text-white"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {columns.map((c, i) => (
              <div key={c} className="flex min-w-0 items-center justify-center gap-1 px-1.5">
                {c}
                {i > 0 && <SortArrowsIcon size={12} className="shrink-0 opacity-70" />}
              </div>
            ))}
          </div>
          <div
            className="grid items-center bg-[var(--oh-primary)] px-3 py-2 text-center text-[13px] font-bold text-white"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {totals.map((t, i) => (
              <div key={i} className="min-w-0 px-1.5">
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
