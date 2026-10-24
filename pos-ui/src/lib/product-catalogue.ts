export const CATALOGUE_VIEWS = [
  { value: "all", label: "All products" },
  { value: "out-of-stock", label: "Out of stock" },
  { value: "negative-stock", label: "Negative stock" },
  { value: "zero-price", label: "Zero price" },
  { value: "missing-barcode", label: "Missing barcode" },
  { value: "uncategorised", label: "Uncategorised" },
  { value: "hidden", label: "Hidden from POS" },
] as const;

export type CatalogueView = typeof CATALOGUE_VIEWS[number]["value"];

/** Explicit opt-in: cashier product searches keep their existing POS-only domain. */
export function catalogueDomain(view: unknown): unknown[][] {
  if (!CATALOGUE_VIEWS.some((option) => option.value === view)) throw new Error("Invalid catalogue view");
  const base: unknown[][] = [["sale_ok", "=", true]];
  switch (view) {
    case "out-of-stock": return [...base, ["qty_available", "=", 0]];
    case "negative-stock": return [...base, ["qty_available", "<", 0]];
    case "zero-price": return [...base, ["list_price", "=", 0]];
    case "missing-barcode": return [...base, ["barcode", "=", false]];
    case "uncategorised": return [...base, ["pos_categ_ids", "=", false]];
    case "hidden": return [...base, ["available_in_pos", "=", false]];
    default: return base;
  }
}

export function productIssues(product: { qty_available: number; list_price: number; barcode: string | false; pos_categ_ids: number[] }) {
  const issues: string[] = [];
  if (product.qty_available < 0) issues.push("Negative stock");
  else if (product.qty_available === 0) issues.push("Out of stock");
  if (product.list_price === 0) issues.push("Zero price");
  if (!product.barcode) issues.push("Missing barcode");
  if (!product.pos_categ_ids.length) issues.push("Uncategorised");
  return issues;
}
