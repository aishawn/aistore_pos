import { BarChart3, Info } from "lucide-react";

interface Panel {
  label: string;
  value: string;
}

/** Shared read-only report preview for legacy report routes. */
export function ReportBuilder({
  title,
  query,
  panels,
  columns,
}: {
  title: string;
  query: React.ReactNode;
  panels: Panel[];
  columns: string[];
  /** Accepted for compatibility with legacy route fixtures; previews contain no rows or totals. */
  totals?: Array<string | null>;
}) {
  const tableMinWidth = Math.max(720, columns.length * 104);

  return (
    <main className="h-full overflow-auto bg-[var(--oh-surface)] p-3 font-sans sm:p-4 lg:p-6">
      <header className="mb-4">
        <p className="oh-type-meta font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Reports</p>
        <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">{title}</h1>
      </header>

      <div role="status" className="mb-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
        <Info size={18} className="mt-1 shrink-0 text-sky-700" aria-hidden="true" />
        <div>
          <p className="font-semibold">Static preview · no live Odoo data</p>
          <p>Filters and report definitions are examples. This page does not load live sales, stock, purchase or transfer data.</p>
        </div>
      </div>

      <section aria-label="Example filters" className="mb-4">
        <h2 className="oh-type-label mb-2 font-semibold text-[var(--oh-text)]">Example filters</h2>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {panels.map((panel) => (
            <div key={panel.label} className="flex min-h-[68px] min-w-0 flex-col justify-center rounded-lg border border-[var(--oh-border)] bg-white px-4 py-2.5 shadow-[var(--oh-shadow-card)]">
              <span className="oh-type-meta font-medium text-[var(--oh-muted)]">{panel.label}</span>
              <span className="oh-type-body-strong mt-0.5 text-[var(--oh-text)]">{panel.value}</span>
            </div>
          ))}
        </div>
      </section>

      <details className="mb-4 rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-[var(--oh-text-secondary)] hover:bg-[var(--oh-paper)]">
          Example report definition
        </summary>
        <div className="border-t border-[var(--oh-border)] px-4 py-3">
          <code className="block overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[var(--oh-muted)]">{query}</code>
        </div>
      </details>

      <section aria-label={`${title} results`} className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: `${tableMinWidth}px` }}>
            <thead>
              <tr className="border-b border-[var(--oh-border)] bg-[var(--oh-paper)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                {columns.map((column, index) => (
                  <th key={column} scope="col" className={`px-3 py-3 ${index === 0 ? "text-left" : "text-right"}`}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={columns.length} className="h-36 border-b border-[var(--oh-border)] px-4 text-center text-[var(--oh-muted)]">
                  <span className="inline-flex flex-col items-center gap-2 text-sm">
                    <BarChart3 size={20} className="text-[var(--oh-border-strong)]" aria-hidden="true" />
                    No sample rows are available in this preview.
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
