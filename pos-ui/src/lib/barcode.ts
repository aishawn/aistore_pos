export const BARCODE_FORMAT_HINT =
  "Supported: EAN-8 (8 digits), UPC-A (12 digits), EAN-13 (13 digits), ITF-14 (14 digits). Numbers only, with a valid check digit.";

const ALLOWED_LENGTHS = new Set([8, 12, 13, 14]);

function gtinCheckDigit(bodyWithoutCheck: string): string {
  let sum = 0;
  for (let i = 0; i < bodyWithoutCheck.length; i++) {
    const d = Number.parseInt(bodyWithoutCheck.charAt(bodyWithoutCheck.length - 1 - i), 10);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return String((10 - (sum % 10)) % 10);
}

function isValidGtinCheckDigit(digits: string): boolean {
  if (digits.length < 2) return false;
  return gtinCheckDigit(digits.slice(0, -1)) === digits.charAt(digits.length - 1);
}

/** In-store EAN-13 (prefix 20) so AI/create forms can prefill a valid barcode. */
export function generateInStoreEan13(): string {
  const seq = Date.now().toString().slice(-10).padStart(10, "0");
  const body = `20${seq}`;
  return `${body}${gtinCheckDigit(body)}`;
}

/** Returns an error message, or null when empty (optional) or valid. */
export function validateBarcode(
  barcode: string,
  options?: { required?: boolean },
): string | null {
  const trimmed = barcode.trim();
  if (!trimmed) return options?.required ? "Barcode is required." : null;

  if (!/^\d+$/.test(trimmed)) {
    return "Barcode must contain digits only.";
  }
  if (!ALLOWED_LENGTHS.has(trimmed.length)) {
    return "Barcode must be 8, 12, 13, or 14 digits (EAN-8, UPC-A, EAN-13, or ITF-14).";
  }
  if (!isValidGtinCheckDigit(trimmed)) {
    return "Invalid barcode check digit.";
  }
  return null;
}
