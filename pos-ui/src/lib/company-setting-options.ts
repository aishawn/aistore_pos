export function companySettingOptions(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) return [];
    const seen = new Set<string>();
    return parsed.map((item) => item.trim()).filter((item) => {
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

export function normalizeRequiredCashReason(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
