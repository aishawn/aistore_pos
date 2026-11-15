export type SortValue = string | number | null | undefined;

const collator = new Intl.Collator("en-AU", {
  numeric: true,
  sensitivity: "base",
  usage: "sort",
});

function dateValue(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day)
    ? timestamp
    : null;
}

function instantValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function numericValue(value: SortValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[,$%\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function naturalCompare(left: SortValue, right: SortValue): number {
  const leftEmpty = left == null || (typeof left === "string" && left.trim() === "");
  const rightEmpty = right == null || (typeof right === "string" && right.trim() === "");
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0;
    return leftEmpty ? 1 : -1;
  }
  const leftDate = typeof left === "string" ? dateValue(left) : null;
  const rightDate = typeof right === "string" ? dateValue(right) : null;
  if (leftDate != null && rightDate != null) return leftDate - rightDate;
  const leftInstant = typeof left === "string" ? instantValue(left) : null;
  const rightInstant = typeof right === "string" ? instantValue(right) : null;
  if (leftInstant != null && rightInstant != null) return leftInstant - rightInstant;

  const leftNumber = numericValue(left);
  const rightNumber = numericValue(right);
  if (leftNumber != null && rightNumber != null) return leftNumber - rightNumber;

  return collator.compare(String(left), String(right));
}

/** ISO business days (`YYYY-MM-DD`) — newest first. */
export function compareIsoDateDesc(left: string, right: string): number {
  return right.localeCompare(left);
}

export function naturalSortRows<T>(
  rows: readonly T[],
  value: (row: T) => SortValue,
  stableKey: (row: T) => SortValue,
  direction: "asc" | "desc" = "asc",
): T[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) =>
    factor * naturalCompare(value(left), value(right)) || naturalCompare(stableKey(left), stableKey(right)),
  );
}
