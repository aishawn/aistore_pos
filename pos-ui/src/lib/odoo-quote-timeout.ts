export const ODOO_QUOTE_TIMEOUT_MS = 45_000;

export function getOdooQuoteTimeoutMessage(error: unknown): string | null {
  return error instanceof Error && error.name === "TimeoutError"
    ? "Orithos did not return a cart total in time. Retry quote before finalising."
    : null;
}
