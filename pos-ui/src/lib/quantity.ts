/** Returns an error message, or null when valid. */
export function validatePositiveQuantity(value: string, fieldLabel: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return `${fieldLabel} is required.`;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return `${fieldLabel} must be a valid number.`;
  if (num <= 0) return `${fieldLabel} must be greater than zero.`;
  return null;
}

/** Returns an error message, or null when valid. Allows empty for optional fields. */
export function validateNonNegativeMoney(
  value: string | number | null | undefined,
  fieldLabel: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num)) return `${fieldLabel} must be a valid number.`;
  if (num < 0) return `${fieldLabel} cannot be negative.`;
  return null;
}

/** Sell price must be present as a number greater than zero. Empty stays valid for optional fields. */
export function validatePositiveMoney(
  value: string | number | null | undefined,
  fieldLabel: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(num)) return `${fieldLabel} must be a valid number.`;
  if (num <= 0) return `${fieldLabel} must be greater than zero.`;
  return null;
}

export function isZeroPrice(price?: number | null): boolean {
  return price != null && Number(price) === 0;
}

export function parseNonNegativeNumber(raw: string): number | null {
  if (raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

export function parsePositiveQuantity(raw: string): number | null {
  if (raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}
