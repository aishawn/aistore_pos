/** Browse-by-category shortcuts shown at the top of the Sale Keys panel. */
export const SALE_KEY_CATEGORIES = [
  {
    id: "beer",
    label: "Beer",
    folder: "Beer",
    bg: "var(--oh-tile-orange-bg)",
    border: "var(--oh-tile-orange-border)",
    color: "var(--oh-tile-orange-text)",
  },
  {
    id: "wines",
    label: "Wines",
    folder: "Wines",
    bg: "var(--oh-tile-red-bg)",
    border: "var(--oh-tile-red-border)",
    color: "var(--oh-tile-red-text)",
  },
  {
    id: "spirits",
    label: "Spirits",
    folder: "Spirits",
    bg: "var(--oh-tile-blue-bg)",
    border: "var(--oh-tile-blue-border)",
    color: "var(--oh-tile-blue-text)",
  },
  {
    id: "products",
    label: "Products",
    folder: "Products",
    bg: "var(--oh-tile-green-bg)",
    border: "var(--oh-tile-green-border)",
    color: "var(--oh-tile-green-text)",
  },
  {
    id: "promotions",
    label: "Promotions",
    promotions: true,
    bg: "var(--oh-orange-light)",
    border: "var(--oh-tile-orange-border)",
    color: "var(--oh-tile-orange-text)",
  },
] as const;

export const SALE_KEY_CATEGORY_BUTTON_CLASS =
  "inline-flex h-[30px] min-w-[94px] cursor-pointer items-center justify-center rounded-[var(--oh-radius)] border px-2 text-center transition-opacity hover:opacity-90";

/** Default grid placement for category keys on the 10×10 editor grid (row 1). */
export const CATEGORY_SALE_KEYS_GRID = SALE_KEY_CATEGORIES.map((cat, index) => ({
  id: cat.id,
  image: null as string | null,
  label: cat.label,
  bg:
    cat.id === "beer"
      ? "rgb(252, 222, 171)"
      : cat.id === "wines"
        ? "rgb(252, 210, 210)"
        : cat.id === "spirits"
          ? "rgb(206, 229, 252)"
          : cat.id === "products"
            ? "rgb(226, 245, 205)"
            : "rgb(255, 237, 213)",
  textColor: "#1a1a1a",
  colStart: index + 1,
  colSpan: 1,
  rowStart: 1,
  rowSpan: 1,
}));

export const CATEGORY_KEY_IDS = new Set<string>(CATEGORY_SALE_KEYS_GRID.map((k) => k.id));

/** Row 1, columns 1–5 are reserved for category keys. */
export const CATEGORY_ROW = 1;
export const CATEGORY_COL_END = 5;
