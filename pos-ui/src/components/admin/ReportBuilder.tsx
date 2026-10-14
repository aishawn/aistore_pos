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
  totals,
}: {
  title: string;
  query: React.ReactNode;
  panels: Panel[];
  columns: string[];
  totals: (string | null)[];
}) {
  const tableMinWidth = Math.max(720, columns.length * 112);

  return (
    <main className="h-full overflow-auto bg-[var(--oh-surface)] p-3 font-sans sm:p-4 lg:p-6">
      <header className="mb-4">
        <p className="oh-type-meta font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Reports</p>
        <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">{title}</h1>
      </header>

      <section aria-label="Applied filters" className="mb-4">
        <h2 className="oh-type-label mb-2 font-semibold text-[var(--oh-text)]">Applied filters</h2>
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
          Report definition
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
                  No report rows to display for these filters.
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-[var(--oh-surface)] text-sm font-semibold text-[var(--oh-text)]">
                {totals.map((total, index) => (
                  <td key={`${columns[index] ?? "total"}-${index}`} className={`px-3 py-3 tabular-nums ${index === 0 ? "text-left" : "text-right"}`}>
                    {total}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </main>
  );
}
