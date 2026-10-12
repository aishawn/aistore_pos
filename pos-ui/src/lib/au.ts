/** Australian retail helpers: dates, GST-inclusive prices, and cash rounding. */

export const DEFAULT_GST_PERCENT = 10;

/** `yyyy-mm-dd` (or an ISO timestamp) → `dd/mm/yyyy`, without shifting the calendar day. */
export function formatAuDate(value?: string | null): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** `dd/mm/yyyy` plus the clock time when the source has one. */
export function formatAuDateTime(value?: string | null): string {
  if (!value) return "";
  const date = formatAuDate(value);
  const time = value.match(/[T ](\d{2}:\d{2}(?::\d{2})?)/);
  return time ? `${date} ${time[1]}` : date;
}

/** GST component of a GST-inclusive amount. 10% is one eleventh. */
export function includedGst(inclusive: number, ratePercent = DEFAULT_GST_PERCENT): number {
  if (!Number.isFinite(inclusive) || inclusive === 0 || ratePercent <= 0) return 0;
  return Math.round((inclusive * ratePercent) / (100 + ratePercent) * 100) / 100;
}

/**
 * Nearest 5 cents. 1–2 round down, 3–4 and 8–9 round up, 6–7 round down to 5.
 * $4.53 becomes $4.55.
 */
export function roundCashToFiveCents(amount: number): number {
  if (!Number.isFinite(amount) || amount === 0) return 0;
  const sign = amount < 0 ? -1 : 1;
  const cents = Math.round(Math.abs(amount) * 100);
  const remainder = cents % 5;
  const delta = remainder === 0 ? 0 : remainder <= 2 ? -remainder : 5 - remainder;
  return (sign * (cents + delta)) / 100;
}

const LIQUOR =
  /(\b(wines?|beers?|spirits?|liquor|ciders?|whisk(?:e)?ys?|rum|vodkas?|gins?|champagnes?|proseccos?|sakes?|liqueurs?|brand(?:y|ies)|tequilas?|ales?|lagers?|stouts?|alcohol|rtds?)\b|啤酒|葡萄酒|白酒|威士忌|伏特加|洋酒|烈酒)/i;

export function isLiquorProduct(name?: string | null, category?: string | null): boolean {
  const hay = `${name ?? ""} ${category ?? ""}`.trim();
  return hay.length > 0 && LIQUOR.test(hay);
}
