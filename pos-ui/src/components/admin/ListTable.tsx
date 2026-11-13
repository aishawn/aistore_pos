"use client";

import { useMemo, useState, type ReactElement } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ListColumn {
  label: React.ReactNode;
  align?: "left" | "right" | "center";
  /** Tailwind width class, e.g. "w-[120px]". */
  width?: string;
  sortable?: boolean;
  sortValue?: (row: React.ReactNode[]) => string | number | null | undefined;
}

type SortState = { column: number; direction: "asc" | "desc" };
const naturalCollator = new Intl.Collator("en-AU", { numeric: true, sensitivity: "base" });
const dateValue = (value: string | number) => {
  const match = String(value).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  return match
    ? Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0))
    : null;
};
const numericValue = (value: string | number) => {
  if (typeof value === "number") return value;
  const normalized = value.trim().replace(/[,$%\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : null;
};

function cellText(value: React.ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(cellText).join(" ");
  if (value && typeof value === "object" && "props" in value) {
    return cellText((value as ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return "";
}

function compareValues(a: string | number | null | undefined, b: string | number | null | undefined) {
  const aMissing = a == null || a === "";
  const bMissing = b == null || b === "";
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  const presentA = a as string | number;
  const presentB = b as string | number;
  if (typeof presentA === "number" && typeof presentB === "number") return presentA - presentB;
  const aDate = dateValue(presentA);
  const bDate = dateValue(presentB);
  if (aDate != null && bDate != null) return aDate - bDate;
  const aNumber = numericValue(presentA);
  const bNumber = numericValue(presentB);
  if (aNumber != null && bNumber != null) return aNumber - bNumber;
  return naturalCollator.compare(String(presentA), String(presentB));
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
  defaultSort,
}: {
  columns: ListColumn[];
  rows: React.ReactNode[][];
  compact?: boolean;
  headerClassName?: string;
  /** Extra label pinned to the right of the black header (e.g. "Total 96"). */
  headerRight?: React.ReactNode;
  rowClassName?: string;
  ariaLabel?: string;
  /** Set false when the rows intentionally arrive in a meaningful time order. */
  defaultSort?: false | { column: number; direction?: "asc" | "desc" };
}) {
  const [sort, setSort] = useState<SortState | null>(() => defaultSort === false
    ? null
    : { column: defaultSort?.column ?? 0, direction: defaultSort?.direction ?? "asc" });
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns[sort.column];
    if (!column || column.sortable === false) return rows;
    const direction = sort.direction === "asc" ? 1 : -1;
    return rows.map((row, index) => ({ row, index })).sort((a, b) => {
      const aValue = column.sortValue ? column.sortValue(a.row) : cellText(a.row[sort.column]);
      const bValue = column.sortValue ? column.sortValue(b.row) : cellText(b.row[sort.column]);
      const compared = compareValues(aValue, bValue);
      const eitherMissing = aValue == null || aValue === "" || bValue == null || bValue === "";
      return (eitherMissing ? compared : compared * direction) || a.index - b.index;
    }).map(({ row }) => row);
  }, [columns, rows, sort]);

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
        aria-rowindex={1}
      >
        {columns.map((c, i) => (
          <div key={i} role="columnheader" aria-colindex={i + 1} aria-sort={sort?.column === i ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={cn("px-1.5", c.width ?? "min-w-0", !equalColumns && !c.width && "flex-1 basis-0", align(c.align))}>
            {c.sortable === false ? c.label : (
              <button
                type="button"
                onClick={() => setSort((current) => current?.column === i
                  ? { column: i, direction: current.direction === "asc" ? "desc" : "asc" }
                  : { column: i, direction: "asc" })}
                title={`Sort by ${typeof c.label === "string" ? c.label : `column ${i + 1}`}`}
                className="inline-flex min-h-8 max-w-full items-center gap-1 text-inherit hover:text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
              >
                <span className="truncate">{c.label}</span>
                {sort?.column === i
                  ? sort.direction === "asc" ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />
                  : <ArrowUpDown size={13} aria-hidden="true" />}
              </button>
            )}
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
        {sortedRows.map((row, r) => (
          <div
            key={r}
            className={cn(
              rowLayout,
              "items-center border-b border-[var(--oh-border)] px-3 transition-colors hover:bg-[var(--oh-paper)]",
              compact ? "py-1.5" : "py-2.5",
r % 2 === 1 ? "bg-[var(--oh-surface)]" : "bg-[var(--oh-surface-elevated)]",
              headerRight && "pr-24",
              rowClassName,
            )}
            style={gridStyle}
            role="row"
            aria-rowindex={r + 2}
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
