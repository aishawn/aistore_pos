import type { CompanyField } from "./company-settings-catalog";

export function formatCompanySetting(field: CompanyField, value: string): string {
  if (field.type !== "string-list") return value;
  const parsed = parseStringListSetting(value);
  return parsed ? parsed.join("\n") : value;
}

export function parseStringListSetting(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeCompanySetting(field: CompanyField, value: string): string {
  if (field.type !== "string-list") return value;
  const seen = new Set<string>();
  const reasons = value.split(/\r?\n/).map((reason) => reason.trim()).filter((reason) => {
    if (!reason) return false;
    const key = reason.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return JSON.stringify(reasons);
}

export function validateCompanySetting(field: CompanyField, value: string): string | null {
  if (field.type === "number" && value.trim()) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return `${field.label} must be a valid number.`;
    if (field.key === "company.currency.round_to" && numeric <= 0) {
      return `${field.label} must be greater than zero.`;
    }
    if (field.key === "company.currency.round_to" && Math.abs(numeric * 100 - Math.round(numeric * 100)) > 1e-8) {
      return `${field.label} cannot have more than two decimal places.`;
    }
    if (numeric < 0) return `${field.label} cannot be negative.`;
  }
  if (field.key === "company.timezone") {
    try {
      if (!value.trim()) throw new RangeError();
      new Intl.DateTimeFormat("en-AU", { timeZone: value.trim() });
    } catch {
      return `${field.label} must be a valid time zone.`;
    }
  }
  if (field.type === "string-list") {
    const items = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (items.length > 100) return `${field.label} cannot contain more than 100 reasons.`;
    if (items.some((item) => item.length > 120)) return `Each ${field.label.toLowerCase()} reason must be 120 characters or fewer.`;
  }
  return null;
}
