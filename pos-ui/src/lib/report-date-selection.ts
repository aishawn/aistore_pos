import { salesDate, shiftDay } from "./replenishment-safety.ts";

export type ReportComparison = "none" | "previous_period" | "last_year";
export type ReportDateRange = { from: string; to: string };
export type ReportDatePreset = "today" | "last_7_days" | "last_30_days";

export function reportDatePreset(preset: ReportDatePreset, now = new Date(), timezone = "Australia/Adelaide"): ReportDateRange {
  const to = salesDate(now.toISOString(), timezone);
  const length = preset === "today" ? 1 : preset === "last_7_days" ? 7 : 30;
  return { from: shiftDay(to, -(length - 1)), to };
}

export function comparisonDateRange(from: string, to: string, comparison: ReportComparison): ReportDateRange | null {
  if (comparison === "none") return null;
  const dayCount = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000 + 1;
  if (!Number.isInteger(dayCount) || dayCount < 1) return null;

  if (comparison === "previous_period") {
    const compareTo = shiftDay(from, -1);
    return { from: shiftDay(compareTo, -(dayCount - 1)), to: compareTo };
  }

  const [year, month, day] = from.split("-").map(Number);
  const previousYear = year - 1;
  const dayInPreviousYear = Math.min(day, new Date(Date.UTC(previousYear, month, 0)).getUTCDate());
  const compareFrom = `${previousYear}-${String(month).padStart(2, "0")}-${String(dayInPreviousYear).padStart(2, "0")}`;
  return { from: compareFrom, to: shiftDay(compareFrom, dayCount - 1) };
}
