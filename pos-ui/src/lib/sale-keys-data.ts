import type { SaleKey } from "@/types/orithos";
import {
  CATEGORY_COL_END,
  CATEGORY_KEY_IDS,
  CATEGORY_ROW,
  CATEGORY_SALE_KEYS_GRID,
} from "@/lib/sale-key-categories";

/** Default "Home Keys" layout — category row + sample product keys from row 2. */
export const DEFAULT_SALE_KEYS: SaleKey[] = [
  ...CATEGORY_SALE_KEYS_GRID.map((k) => ({ ...k })),
  { id: "others", image: null, label: "OTHERS", bg: "rgb(222, 84, 84)", textColor: "#ffffff", colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
  { id: "soft-drink", image: null, label: "SOFT DRINK", bg: "rgb(226, 245, 205)", textColor: "#000000", colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
  { id: "red-wine", image: null, label: "RED WINE", bg: "rgb(141, 18, 56)", textColor: "#ffffff", colStart: 3, colSpan: 1, rowStart: 2, rowSpan: 1 },
  { id: "vb-cans", image: null, label: "VB CANS", bg: "rgb(252, 222, 171)", textColor: "#000000", colStart: 1, colSpan: 1, rowStart: 3, rowSpan: 1 },
  { id: "vb-10pk", image: null, label: "VB 10PK", bg: "rgb(226, 245, 205)", textColor: "#000000", colStart: 2, colSpan: 1, rowStart: 3, rowSpan: 1 },
  { id: "return-product", image: "/images/keys/functions/return-product.png", bg: "rgb(222, 84, 84)", colStart: 1, colSpan: 2, rowStart: 4, rowSpan: 3 },
  { id: "discount", image: null, label: "DISCOUNT", bg: "rgb(141, 18, 56)", textColor: "#ffffff", colStart: 3, colSpan: 2, rowStart: 4, rowSpan: 3 },
  { id: "eftpos", image: "/images/keys/eftpos.png", bg: "rgb(141, 18, 56)", colStart: 7, colSpan: 2, rowStart: 2, rowSpan: 2 },
  { id: "plus-quantity", image: "/images/keys/plus-quantity.png", bg: "rgb(226, 245, 205)", colStart: 9, colSpan: 2, rowStart: 2, rowSpan: 2 },
  { id: "exact-cash", image: "/images/keys/exact-cash.png", bg: "rgb(226, 245, 205)", colStart: 7, colSpan: 2, rowStart: 4, rowSpan: 2 },
  { id: "minus-quantity", image: "/images/keys/minus-quantity.png", bg: "rgb(252, 222, 171)", colStart: 9, colSpan: 2, rowStart: 4, rowSpan: 2 },
  { id: "cash-out", image: "/images/keys/cash-out.png", bg: "rgb(252, 222, 171)", colStart: 9, colSpan: 2, rowStart: 6, rowSpan: 1 },
  { id: "more-functions", image: "/images/keys/more-functions.png", bg: "rgb(206, 229, 252)", colStart: 1, colSpan: 1, rowStart: 9, rowSpan: 2 },
  { id: "carlton", image: null, label: "carlton", bg: "rgb(222, 84, 84)", textColor: "#ffffff", colStart: 10, colSpan: 1, rowStart: 9, rowSpan: 1 },
  { id: "clear-sale", image: "/images/keys/clear-sale.png", bg: "rgb(252, 222, 171)", colStart: 8, colSpan: 1, rowStart: 10, rowSpan: 1 },
  { id: "case-quantity", image: null, label: "CASE QTY", bg: "rgb(226, 245, 209)", textColor: "#1a1a1a", colStart: 9, colSpan: 2, rowStart: 10, rowSpan: 1 },
];

const BG_PRESETS = [
  { label: "Red", value: "rgb(222, 84, 84)" },
  { label: "Dark Red", value: "rgb(141, 18, 56)" },
  { label: "Green", value: "rgb(226, 245, 205)" },
  { label: "Orange", value: "rgb(252, 222, 171)" },
  { label: "Blue", value: "rgb(206, 229, 252)" },
  { label: "White", value: "#ffffff" },
];

export { BG_PRESETS };

function overlapsCategorySlot(key: SaleKey): boolean {
  const rowEnd = key.rowStart + key.rowSpan - 1;
  const colEnd = key.colStart + key.colSpan - 1;
  return (
    key.rowStart <= CATEGORY_ROW &&
    rowEnd >= CATEGORY_ROW &&
    key.colStart <= CATEGORY_COL_END &&
    colEnd >= 1
  );
}

/** Ensure row 1 category keys exist and custom keys do not overlap them. */
export function mergeSaleKeysWithCategories(keys: SaleKey[]): SaleKey[] {
  const savedCategories = keys.filter((k) => CATEGORY_KEY_IDS.has(k.id));
  const categories = CATEGORY_SALE_KEYS_GRID.map((defaults) => {
    const saved = savedCategories.find((k) => k.id === defaults.id);
    return saved ? { ...defaults, ...saved, colStart: defaults.colStart, rowStart: defaults.rowStart, colSpan: 1, rowSpan: 1 } : { ...defaults };
  });

  const custom = keys
    .filter((k) => !CATEGORY_KEY_IDS.has(k.id))
    .map((k) => {
      if (!overlapsCategorySlot(k)) return { ...k };
      return { ...k, rowStart: CATEGORY_ROW + 1 };
    });

  return [...categories, ...custom];
}

/** Grid extent anchored at (1,1) — matches the settings editor layout. */
export function getSaleKeysGridExtent(keys: SaleKey[]) {
  let maxCol = CATEGORY_COL_END;
  let maxRow = CATEGORY_ROW;
  for (const key of keys) {
    maxCol = Math.max(maxCol, key.colStart + key.colSpan - 1);
    maxRow = Math.max(maxRow, key.rowStart + key.rowSpan - 1);
  }
  return { minCol: 1, minRow: 1, cols: maxCol, rows: maxRow };
}

function normalizeSaleKeys(keys: SaleKey[]): SaleKey[] {
  const merged = mergeSaleKeysWithCategories(keys);
  return merged.sort((a, b) => a.rowStart - b.rowStart || a.colStart - b.colStart);
}

export function parseSaleKeys(raw: string | SaleKey[] | null | undefined): SaleKey[] {
  if (!raw) return normalizeSaleKeys(DEFAULT_SALE_KEYS.map((k) => ({ ...k })));
  if (Array.isArray(raw)) {
    return raw.length > 0 ? normalizeSaleKeys(raw.map((k) => ({ ...k }))) : normalizeSaleKeys(DEFAULT_SALE_KEYS.map((k) => ({ ...k })));
  }
  try {
    const parsed = JSON.parse(raw) as SaleKey[];
    return Array.isArray(parsed) && parsed.length > 0
      ? normalizeSaleKeys(parsed.map((k) => ({ ...k })))
      : normalizeSaleKeys(DEFAULT_SALE_KEYS.map((k) => ({ ...k })));
  } catch {
    return normalizeSaleKeys(DEFAULT_SALE_KEYS.map((k) => ({ ...k })));
  }
}

function cellOccupied(keys: SaleKey[], col: number, row: number, excludeId?: string): boolean {
  return keys.some((key) => {
    if (excludeId && key.id === excludeId) return false;
    return (
      col >= key.colStart &&
      col < key.colStart + key.colSpan &&
      row >= key.rowStart &&
      row < key.rowStart + key.rowSpan
    );
  });
}

/** Find the first empty 1×1 cell — row 2+ first, then row 1 cols 6–10. */
export function findEmptyCell(keys: SaleKey[]): { colStart: number; rowStart: number } | null {
  for (let row = CATEGORY_ROW + 1; row <= 10; row++) {
    for (let col = 1; col <= 10; col++) {
      if (!cellOccupied(keys, col, row)) return { colStart: col, rowStart: row };
    }
  }
  for (let col = CATEGORY_COL_END + 1; col <= 10; col++) {
    if (!cellOccupied(keys, col, CATEGORY_ROW)) return { colStart: col, rowStart: CATEGORY_ROW };
  }
  return null;
}

export function createBlankKey(keys: SaleKey[]): SaleKey | null {
  const spot = findEmptyCell(keys);
  if (!spot) return null;
  return {
    id: `key-${Date.now()}`,
    image: null,
    label: "New Key",
    bg: "rgb(206, 229, 252)",
    textColor: "#000000",
    colStart: spot.colStart,
    colSpan: 1,
    rowStart: spot.rowStart,
    rowSpan: 1,
  };
}
