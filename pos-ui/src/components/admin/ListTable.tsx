import { cn } from "@/lib/utils";

export interface ListColumn {
  label: React.ReactNode;
  align?: "left" | "right" | "center";
  /** Tailwind width class, e.g. "w-[120px]". */
  width?: string;
}

/**
 * Orithos admin list table — light header, clear row dividers and responsive
 * horizontal scrolling for dense tables.
 */
export function ListTable({
  columns,
  rows,
  compact = false,
  headerClassName,
  headerRight,
  rowClassName,
  ariaLabel = "Data table",
}: {
  columns: ListColumn[];
  rows: React.ReactNode[][];
  compact?: boolean;
  headerClassName?: string;
  /** Extra label pinned to the right of the black header (e.g. "Total 96"). */
  headerRight?: React.ReactNode;
  rowClassName?: string;
  ariaLabel?: string;
}) {
  const align = (a?: ListColumn["align"]) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  const equalColumns = columns.every((c) => !c.width);
  const gridStyle = equalColumns
    ? { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }
    : undefined;
  const rowLayout = equalColumns ? "grid" : "flex";
  const tableMinWidth = Math.max(720, columns.length * 112);

  return (
    <div className="overflow-x-auto rounded-lg" role="table" aria-label={ariaLabel} aria-colcount={columns.length} aria-rowcount={rows.length + 1}>
    <div className="font-sans text-[13px]" style={{ minWidth: `${tableMinWidth}px` }}>
      {/* Header */}
      <div
        className={cn(
          rowLayout,
          "relative items-center border-b border-[var(--oh-border)] bg-[var(--oh-paper)] px-3 font-semibold text-[var(--oh-muted)]",
          compact ? "py-1.5 text-xs" : "py-2.5 text-xs uppercase tracking-wide",
          headerRight && "pr-24",
          headerClassName,
        )}
        style={gridStyle}
        role="row"
      >
        {columns.map((c, i) => (
          <div key={i} role="columnheader" aria-colindex={i + 1} className={cn("px-1.5", c.width ?? "min-w-0", !equalColumns && !c.width && "flex-1 basis-0", align(c.align))}>
            {c.label}
          </div>
        ))}
        {headerRight != null && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 whitespace-nowrap font-bold">
            {headerRight}
          </div>
        )}
      </div>
      {/* Rows */}
      <div role="rowgroup">
        {rows.map((row, r) => (
          <div
            key={r}
            className={cn(
              rowLayout,
              "items-center border-b border-[var(--oh-border)] px-3 transition-colors hover:bg-[var(--oh-paper)]",
              compact ? "py-1.5" : "py-2.5",
              r % 2 === 1 ? "bg-[var(--oh-surface)]" : "bg-white",
              headerRight && "pr-24",
              rowClassName,
            )}
            style={gridStyle}
            role="row"
          >
            {row.map((cell, c) => (
              <div
                key={c}
                role="cell"
                aria-colindex={c + 1}
                className={cn(
                  "min-w-0 overflow-hidden px-1.5 text-[var(--oh-text-secondary)]",
                  columns[c]?.width ?? "min-w-0",
                  !equalColumns && !columns[c]?.width && "flex-1 basis-0",
                  align(columns[c]?.align),
                )}
              >
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
