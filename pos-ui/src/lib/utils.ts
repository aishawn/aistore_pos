import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Display label for AI report columns (e.g. category → Category, qty_sold → Qty Sold). */
export function formatReportColumnHeader(col: string): string {
  if (!col || /[\u4e00-\u9fff]/.test(col)) return col;
  return col
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
