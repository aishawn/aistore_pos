import { cn } from "@/lib/utils";
import { naturalCompare } from "@/lib/natural-sort";

export interface Column {
  /** Header label (rendered uppercase). */
  label: string;
  align?: "left" | "right" | "center";
}

/**
 * Orithos data table — blue (#5ebbeb) uppercase bold header, light-grey
 * (#f8f8f8) body rows, optional blue totals footer row. Matches the tables
 * used across the Dashboard, Sales History, Products, Reports, etc.
 */
export function DataTable({
  columns,
  rows,
  totals,
  className,
}: {
  columns: Column[];
  rows: React.ReactNode[][];
  totals?: (React.ReactNode | null)[];
  className?: string;
}) {
  const sortedRows = rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const compared = naturalCompare(cellText(a.row[0]), cellText(b.row[0]));
    return compared || a.index - b.index;
  }).map(({ row }) => row);
  const alignCls = (a?: Column["align"]) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <table className={cn("w-full border-collapse text-[16px] font-sans", className)}>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th
              key={i}
              scope="col"
              className={cn(
                "bg-[var(--sf-link-blue)] p-2 font-bold uppercase text-[var(--sf-on-dark)]",
                alignCls(c.align),
              )}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td
                key={c}
                className={cn(
                  "bg-[var(--oh-surface-elevated)] py-2 pl-[10px] pr-2 text-[var(--oh-text)]",
                  alignCls(columns[c]?.align),
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
        {totals && (
          <tr>
            {totals.map((cell, c) => (
              <td
                key={c}
                className={cn(
                  "bg-[var(--sf-link-blue)] p-2 font-bold text-[var(--sf-on-dark)]",
                  alignCls(columns[c]?.align),
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

function cellText(value: React.ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(cellText).join(" ");
  if (value && typeof value === "object" && "props" in value) {
    return cellText((value as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return "";
}
