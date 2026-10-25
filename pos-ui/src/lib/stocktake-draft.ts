export type StocktakeDraft = {
  version: 1;
  updatedAt: string;
  uncertain: boolean;
  lines: Array<{ id: number; countedQty: string; expectedQty: number }>;
};

export function stocktakeDraftKey(host: string, tenant: string | number, employee: string, location: string) {
  return `orithos:stocktake:v1:${encodeURIComponent(host)}:${encodeURIComponent(String(tenant))}:${encodeURIComponent(employee)}:${encodeURIComponent(location)}`;
}

export function parseStocktakeDraft(raw: string | null): StocktakeDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StocktakeDraft;
    if (value.version !== 1 || typeof value.uncertain !== "boolean" || typeof value.updatedAt !== "string"
      || !Array.isArray(value.lines) || value.lines.length > 40
      || value.lines.some((line) => !Number.isSafeInteger(line.id) || line.id < 1 || typeof line.countedQty !== "string" || line.countedQty.length > 40 || !Number.isFinite(line.expectedQty))
      || new Set(value.lines.map((line) => line.id)).size !== value.lines.length) return null;
    return value;
  } catch { return null; }
}
