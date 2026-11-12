type ReportRow = Record<string, unknown>;

const MONTHS = new Map([
  ["jan", "01"], ["feb", "02"], ["mar", "03"], ["apr", "04"],
  ["may", "05"], ["jun", "06"], ["jul", "07"], ["aug", "08"],
  ["sep", "09"], ["oct", "10"], ["nov", "11"], ["dec", "12"],
]);

function validIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function reportDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);
  if (iso) return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const localized = /^(\d{1,2})\s+([A-Za-z]{3})\.?\s+(\d{4})$/.exec(text);
  if (!localized) return null;
  const month = MONTHS.get(localized[2].toLowerCase());
  return month ? validIsoDate(Number(localized[3]), Number(month), Number(localized[1])) : null;
}

export function assistantRouteLabel(source: string | null | undefined): string | null {
  if (source === "deterministic") return "Rule-based route";
  if (source === "llm") return "AI-classified route";
  return source?.trim() || null;
}

export function latestReportDataDate(rows: ReportRow[] | null | undefined): string | null {
  const dates = (rows ?? [])
    .map((row) => reportDate(row.date ?? row.Date))
    .filter((date): date is string => date !== null)
    .sort();
  return dates.at(-1) ?? null;
}

export function returnedReportDateRange(rows: ReportRow[] | null | undefined): string | null {
  const dates = (rows ?? [])
    .map((row) => reportDate(row.date ?? row.Date))
    .filter((date): date is string => date !== null)
    .sort();
  if (!dates.length) return null;
  return dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} to ${dates.at(-1)}`;
}

export function requestedSalesDateRange(
  intent: string | null | undefined,
  slots: Record<string, unknown> | null | undefined,
): string | null {
  if (intent !== "report_sales") return null;
  const from = reportDate(slots?.from);
  const to = reportDate(slots?.to);
  if (!from) return to;
  if (!to || from === to) return from;
  return `${from} to ${to}`;
}

export function assistantReportDateRange(fromValue: unknown, toValue: unknown): string | null {
  const from = reportDate(fromValue);
  const to = reportDate(toValue);
  if (!from) return null;
  if (!to || from === to) return from;
  return `${from} to ${to}`;
}

export function assistantDataAsOf(
  dataAsOf: string | null | undefined,
): string | null {
  return dataAsOf || null;
}

export function formatAssistantDataAsOf(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}
