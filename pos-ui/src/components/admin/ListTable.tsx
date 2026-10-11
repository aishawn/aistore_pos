import { cn } from "@/lib/utils";

export interface ListColumn {
  label: React.ReactNode;
  align?: "left" | "right" | "center";
  /** Tailwind width class, e.g. "w-[120px]". */
  width?: string;
}

/**
 * Orithos admin list table — rounded black header with white
 * uppercase-ish bold labels, and zebra-striped rows (white / #f3f3f3). Used by
 * Products, Customers, Suppliers, Classifications, Promotions, etc.
 */
export function ListTable({
  columns,
  rows,
  compact = false,
  headerClassName,
  headerRight,
  rowClassName,
}: {
  columns: ListColumn[];
  rows: React.ReactNode[][];
  compact?: boolean;
  headerClassName?: string;
  /** Extra label pinned to the right of the black header (e.g. "Total 96"). */
  headerRight?: React.ReactNode;
  rowClassName?: string;
}) {
  const align = (a?: ListColumn["align"]) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  const equalColumns = columns.every((c) => !c.width);
  const gridStyle = equalColumns
    ? { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }
    : undefined;
  const rowLayout = equalColumns ? "grid" : "flex";

  return (
    <div className="font-sans text-[13px]">
      {/* Header */}
      <div
        className={cn(
          rowLayout,
          "relative items-center rounded-md bg-black px-3 font-bold text-white",
          compact ? "py-1 text-[11px]" : "py-2 text-[12px]",
          headerRight && "pr-24",
          headerClassName,
        )}
        style={gridStyle}
      >
        {columns.map((c, i) => (
          <div key={i} className={cn("px-1.5", c.width ?? "min-w-0", !equalColumns && !c.width && "flex-1 basis-0", align(c.align))}>
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
      {rows.map((row, r) => (
        <div
          key={r}
          className={cn(
            rowLayout,
            "items-center px-3",
            compact ? "py-1" : "py-2",
            r % 2 === 1 ? "bg-[#f3f3f3]" : "bg-white",
            headerRight && "pr-24",
            rowClassName,
          )}
          style={gridStyle}
        >
          {row.map((cell, c) => (
            <div
              key={c}
              className={cn(
                "px-1.5 text-black",
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
  );
}
