import { storeWeekStart } from "./assistant-business-period.ts";
import { localMidnightUtc, salesDate, shiftDay } from "./replenishment-safety.ts";

export type ReportPeriod = "yesterday" | "last_7_days" | "last_week" | "last_month";
export type ReportQueryPeriod = ReportPeriod | "today";

export type ReportPeriodBounds = {
  period: ReportQueryPeriod;
  start: Date;
  end: Date;
  compareStart: Date;
  compareEnd: Date;
  comparisonLabel: string;
  trendGranularity: "hour" | "day";
};

function utcDate(day: string, timezone: string) {
  return new Date(`${localMidnightUtc(day, timezone).replace(" ", "T")}Z`);
}

function monthStart(day: string, offset: number) {
  const [year, month] = day.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 + offset, 1));
  return value.toISOString().slice(0, 10);
}

export function getReportPeriodBounds(period: ReportQueryPeriod, now: Date, timezone: string): ReportPeriodBounds {
  const today = salesDate(now.toISOString(), timezone);
  if (period === "today") {
    const start = utcDate(today, timezone);
    return { period, start, end: now, compareStart: start, compareEnd: now, comparisonLabel: "", trendGranularity: "hour" };
  }
  if (period === "yesterday") {
    const endDay = today;
    const startDay = shiftDay(today, -1);
    const start = utcDate(startDay, timezone);
    const end = utcDate(endDay, timezone);
    return { period, start, end, compareStart: utcDate(shiftDay(startDay, -7), timezone), compareEnd: utcDate(shiftDay(endDay, -7), timezone), comparisonLabel: "vs same day last week", trendGranularity: "hour" };
  }
  if (period === "last_week") {
    const currentMonday = salesDate(storeWeekStart(now, timezone).toISOString(), timezone);
    const startDay = shiftDay(currentMonday, -7);
    const start = utcDate(startDay, timezone);
    const end = utcDate(currentMonday, timezone);
    return { period, start, end, compareStart: utcDate(shiftDay(startDay, -7), timezone), compareEnd: utcDate(shiftDay(currentMonday, -7), timezone), comparisonLabel: "vs previous week", trendGranularity: "day" };
  }
  if (period === "last_7_days") {
    const startDay = shiftDay(today, -7);
    const start = utcDate(startDay, timezone);
    const end = utcDate(today, timezone);
    return { period, start, end, compareStart: utcDate(shiftDay(startDay, -7), timezone), compareEnd: start, comparisonLabel: "vs previous 7 days", trendGranularity: "day" };
  }
  const currentMonth = monthStart(today, 0);
  const previousMonth = monthStart(today, -1);
  const priorMonth = monthStart(today, -2);
  const start = utcDate(previousMonth, timezone);
  const end = utcDate(currentMonth, timezone);
  return { period, start, end, compareStart: utcDate(priorMonth, timezone), compareEnd: start, comparisonLabel: "vs previous month", trendGranularity: "day" };
}
