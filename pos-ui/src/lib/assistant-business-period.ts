import { localMidnightUtc, salesDate, shiftDay } from "./replenishment-safety.ts";

/** Monday midnight in the store timezone, rather than a sliding seven-day window. */
export function storeWeekStart(now: Date, timezone: string): Date {
  const today = salesDate(now.toISOString(), timezone);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = shiftDay(today, -(weekday + 6) % 7);
  return new Date(`${localMidnightUtc(monday, timezone).replace(" ", "T")}Z`);
}
