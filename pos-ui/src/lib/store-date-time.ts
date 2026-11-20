export type StoreDateTimeSettings = {
  timezone: string;
  dateFormat: string;
  timeFormat: string;
};

export const DEFAULT_STORE_DATE_TIME: StoreDateTimeSettings = {
  timezone: "Australia/Melbourne",
  dateFormat: "DD/MM/YYYY",
  timeFormat: "HH:mm",
};

const DATE_FORMATS = new Set(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]);
const TIME_FORMATS = new Set(["HH:mm", "HH:mm:ss", "hh:mm a", "hh:mm:ss a"]);

function safeTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone }).format(0);
    return timezone;
  } catch {
    return DEFAULT_STORE_DATE_TIME.timezone;
  }
}

function parseDate(value: string | number | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(trimmed)
    ? `${trimmed}Z`
    : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function formatDateParts(parts: Record<string, string>, format: string): string {
  const selected = DATE_FORMATS.has(format) ? format : DEFAULT_STORE_DATE_TIME.dateFormat;
  const values: Record<string, string> = {
    DD: parts.day,
    MM: parts.month,
    YYYY: parts.year,
  };
  return selected.replace(/DD|MM|YYYY/g, (token) => values[token]);
}

function businessDateParts(value: string | number | Date, timezone: string): Record<string, string> | null {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (match) return { year: match[1], month: match[2], day: match[3] };
  }
  const date = parseDate(value);
  return date ? formatParts(date, safeTimezone(timezone)) : null;
}

export function formatStoreDate(value: string | number | Date, settings: StoreDateTimeSettings): string {
  const parts = businessDateParts(value, settings.timezone);
  if (!parts) return String(value);
  return formatDateParts(parts, settings.dateFormat);
}

export function formatStoreDateTime(value: string | number | Date, settings: StoreDateTimeSettings): string {
  const date = parseDate(value);
  if (!date) return String(value);
  const timezone = safeTimezone(settings.timezone);
  const dateText = formatDateParts(formatParts(date, timezone), settings.dateFormat);
  const selected = TIME_FORMATS.has(settings.timeFormat) ? settings.timeFormat : DEFAULT_STORE_DATE_TIME.timeFormat;
  const twelveHour = selected.startsWith("hh");
  const hasSeconds = selected.includes(":ss");
  const timeParts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    ...(hasSeconds ? { second: "2-digit" as const } : {}),
    hourCycle: twelveHour ? "h12" : "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(timeParts.map(({ type, value }) => [type, value]));
  const timeText = `${values.hour}:${values.minute}${hasSeconds ? `:${values.second}` : ""}${twelveHour ? ` ${values.dayPeriod.toUpperCase()}` : ""}`;
  return `${dateText} ${timeText}`;
}
