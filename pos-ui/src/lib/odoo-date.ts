const DEFAULT_STORE_TIMEZONE = "Australia/Adelaide";

function normalizeOdooDate(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.includes("T") ? value : value.replace(" ", "T");
}

function hasExplicitTimezone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/u.test(value);
}

function parseOdooDate(value: string | null | undefined, preserveDateOnly = false): { date: Date; hasTimezone: boolean } | null {
  const normalized = normalizeOdooDate(value);
  if (!normalized) return null;
  const explicitTimezone = hasExplicitTimezone(normalized);
  const dateValue = explicitTimezone
    ? normalized
    : `${normalized}${preserveDateOnly && normalized.length === 10 ? "T12:00:00" : ""}Z`;
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : { date, hasTimezone: explicitTimezone };
}

/** Format Odoo's naive UTC datetimes and ISO datetimes in the store timezone. */
export function formatOdooDateTime(value: string | null | undefined, timezone = DEFAULT_STORE_TIMEZONE, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  const parsed = parseOdooDate(value);
  if (!parsed) return value || "—";
  try {
    return new Intl.DateTimeFormat("en-AU", { timeZone: timezone || DEFAULT_STORE_TIMEZONE, ...options }).format(parsed.date);
  } catch {
    return new Intl.DateTimeFormat("en-AU", { timeZone: DEFAULT_STORE_TIMEZONE, ...options }).format(parsed.date);
  }
}

/** Format a browser load timestamp in the store timezone used by the page. */
export function formatStoreEpoch(epochMs: number, timezone = DEFAULT_STORE_TIMEZONE, options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  return formatOdooDateTime(new Date(epochMs).toISOString(), timezone, options);
}

/** Format read_group buckets, which are store-local wall times without a timezone. */
export function formatOdooGroupedDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  const parsed = parseOdooDate(value, true);
  if (!parsed) return value || "—";
  try {
    return new Intl.DateTimeFormat("en-AU", { timeZone: parsed.hasTimezone ? undefined : "UTC", ...options }).format(parsed.date);
  } catch {
    return value;
  }
}
