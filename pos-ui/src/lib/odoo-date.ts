const DEFAULT_STORE_TIMEZONE = "Australia/Adelaide";

/** Format Odoo's naive UTC datetimes and ISO datetimes in the store timezone. */
export function formatOdooDateTime(value: string, timezone = DEFAULT_STORE_TIMEZONE, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-AU", { timeZone: timezone || DEFAULT_STORE_TIMEZONE, ...options }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-AU", { timeZone: DEFAULT_STORE_TIMEZONE, ...options }).format(date);
  }
}
