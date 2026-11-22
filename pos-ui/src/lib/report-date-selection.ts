import { salesDate, shiftDay } from "./replenishment-safety.ts";

export type ReportComparison = "none" | "previous_period" | "last_year";
export type ReportDateRange = { from: string; to: string };
export type ReportDatePreset = "today" | "yesterday" | "last_7_days" | "last_30_days" | "this_month" | "custom";

const NAMED_PRESETS: Exclude<ReportDatePreset, "custom">[] = [
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days",
  "this_month",
];

const LEGACY_PERIOD: Record<string, ReportDatePreset> = {
  today: "today",
  yesterday: "yesterday",
  last_week: "last_7_days",
  last_7_days: "last_7_days",
  last_month: "this_month",
  last_30_days: "last_30_days",
  this_month: "this_month",
  custom: "custom",
};

export function reportDatePreset(
  preset: Exclude<ReportDatePreset, "custom">,
  now = new Date(),
  timezone = "Australia/Melbourne",
): ReportDateRange {
  const today = salesDate(now.toISOString(), timezone);
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const day = shiftDay(today, -1);
    return { from: day, to: day };
  }
  if (preset === "this_month") {
    return { from: `${today.slice(0, 8)}01`, to: today };
  }
  const length = preset === "last_7_days" ? 7 : 30;
  return { from: shiftDay(today, -(length - 1)), to: today };
}

export function matchReportDatePreset(
  from: string,
  to: string,
  now = new Date(),
  timezone = "Australia/Melbourne",
): ReportDatePreset {
  for (const preset of NAMED_PRESETS) {
    const range = reportDatePreset(preset, now, timezone);
    if (range.from === from && range.to === to) return preset;
  }
  return "custom";
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

export type ReportRangeSelection = {
  period: ReportDatePreset;
  from: string;
  to: string;
};

/** Read period/from/to from a query string. Defaults to last 7 days when empty. */
export function readReportRangeFromSearch(
  search: string,
  now = new Date(),
  timezone = "Australia/Melbourne",
): ReportRangeSelection {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const periodParam = params.get("period");
  const dateOk = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

  if (dateOk(fromParam) && dateOk(toParam) && fromParam <= toParam) {
    const period = periodParam && LEGACY_PERIOD[periodParam]
      ? LEGACY_PERIOD[periodParam]
      : matchReportDatePreset(fromParam, toParam, now, timezone);
    if (period !== "custom") {
      const named = reportDatePreset(period, now, timezone);
      if (named.from === fromParam && named.to === toParam) return { period, from: fromParam, to: toParam };
    }
    return { period: "custom", from: fromParam, to: toParam };
  }

  const mapped = periodParam ? LEGACY_PERIOD[periodParam] : undefined;
  if (mapped && mapped !== "custom") {
    const range = reportDatePreset(mapped, now, timezone);
    return { period: mapped, ...range };
  }

  const fallback = reportDatePreset("last_7_days", now, timezone);
  return { period: "last_7_days", ...fallback };
}

export function syncReportRangeToUrl(period: ReportDatePreset, from: string, to: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (period === "custom") {
    url.searchParams.delete("period");
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
  } else {
    url.searchParams.set("period", period);
    url.searchParams.delete("from");
    url.searchParams.delete("to");
  }
  window.history.replaceState(null, "", url);
}
