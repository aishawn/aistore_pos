import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Display label for AI report columns (e.g. category → Category, qty_sold → Qty Sold). */
export function formatReportColumnHeader(col: string): string {
  if (!col || /[\u4e00-\u9fff]/.test(col)) return col;
  const key = col.replace(/[\s_-]+/g, "").toLowerCase();
  const labels: Record<string, string> = {
    reportdatastatus: "Data status",
    costavailable: "Cost data",
    grosssales: "Gross sales",
    dataasof: "Data as of",
    refundtransactions: "Refund transactions",
    datasource: "Data source",
    grossprofit: "Gross profit",
  };
  if (labels[key]) return labels[key];
  return col
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
