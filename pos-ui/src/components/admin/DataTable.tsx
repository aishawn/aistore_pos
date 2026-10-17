import { cn } from "@/lib/utils";

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
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td
                key={c}
                className={cn(
                  "bg-[#f8f8f8] py-2 pl-[10px] pr-2 text-black",
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
