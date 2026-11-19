import type { RetailPosCategoryRecord } from "@/lib/retail-api";

export interface ProductImportRow {
  line: number;
  name: string;
  default_code: string;
  barcode: string;
  list_price: number;
  standard_price?: number;
  pos_categ_ids: number[];
}

export interface ProductCsvResult {
  rows: ProductImportRow[];
  errors: string[];
}

function normaliseHeader(value: string) {
  return value.trim().toLocaleLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/[\s_-]+/g, "");
}

function parseRecords(input: string): { records: Array<{ line: number; cells: string[] }>; error?: string } {
  const text = input.replace(/^\uFEFF/, "");
  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
        if (char === "\n") line += 1;
      }
      continue;
    }

    if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      cells.push(cell.replace(/\r$/, ""));
      if (cells.some((value) => value.trim())) records.push({ line: recordLine, cells });
      cells = [];
      cell = "";
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      line += 1;
      recordLine = line;
    } else {
      cell += char;
    }
  }

  if (quoted) return { records, error: `Line ${recordLine}: unclosed quoted value.` };
  cells.push(cell);
  if (cells.some((value) => value.trim())) records.push({ line: recordLine, cells });
  return { records };
}

function parseAmount(value: string): number | null {
  const cleaned = value.trim().replace(/\bAUD\b/gi, "").replace(/[,$\s]/g, "");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000 ? amount : NaN;
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "product", "productname", "item", "商品", "商品名称", "品名"],
  sku: ["sku", "defaultcode", "productcode", "itemcode", "商品编码", "货号"],
  barcode: ["barcode", "ean", "upc", "条码", "条形码"],
  price: ["price", "saleprice", "listprice", "retailprice", "售价", "零售价"],
  cost: ["cost", "unitcost", "standardprice", "purchaseprice", "成本", "进价"],
  category: ["category", "poscategory", "categoryname", "类别", "分类", "商品分类"],
};

export function parseProductCsv(input: string, categories: RetailPosCategoryRecord[]): ProductCsvResult {
  const parsed = parseRecords(input);
  if (parsed.error) return { rows: [], errors: [parsed.error] };
  if (parsed.records.length < 2) return { rows: [], errors: ["Add a header row and at least one product row."] };

  const headers = parsed.records[0].cells.map(normaliseHeader);
  const columns = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
    field,
    headers.findIndex((header) => aliases.includes(header)),
  ]));
  const errors: string[] = [];
  if (columns.name < 0) errors.push("Missing required column: Product Name (商品名称).");
  if (columns.price < 0) errors.push("Missing required column: Sale Price (售价).");
  if (errors.length) return { rows: [], errors };

  const categoriesByName = new Map<string, RetailPosCategoryRecord[]>();
  for (const category of categories) {
    const label = normaliseHeader(category.name);
    categoriesByName.set(label, [...(categoriesByName.get(label) ?? []), category]);
  }

  const rows: ProductImportRow[] = [];
  for (const record of parsed.records.slice(1)) {
    if (record.cells.length !== headers.length) {
      errors.push(`Line ${record.line}: expected ${headers.length} columns, found ${record.cells.length}.`);
      continue;
    }
    const value = (key: string) => columns[key] >= 0 ? (record.cells[columns[key]] ?? "").trim() : "";
    const name = value("name");
    const sku = value("sku");
    const barcode = value("barcode");
    const price = parseAmount(value("price"));
    const costText = value("cost");
    const cost = costText ? parseAmount(costText) : null;
    const categoryName = value("category");
    const rowErrors: string[] = [];

    if (!name) rowErrors.push("product name is required");
    if (name.length > 120) rowErrors.push("product name must be 120 characters or fewer");
    if (sku.length > 64) rowErrors.push("SKU must be 64 characters or fewer");
    if (barcode.length > 64) rowErrors.push("barcode must be 64 characters or fewer");
    if (price === null || Number.isNaN(price)) rowErrors.push("sale price must be between 0 and 1,000,000");
    if (costText && (cost === null || Number.isNaN(cost))) rowErrors.push("cost must be between 0 and 1,000,000");

    let categoryIds: number[] = [];
    if (categoryName) {
      const matches = categoriesByName.get(normaliseHeader(categoryName)) ?? [];
      if (matches.length === 1) categoryIds = [matches[0].id];
      else if (matches.length === 0) rowErrors.push(`POS category “${categoryName}” was not found`);
      else rowErrors.push(`POS category “${categoryName}” is ambiguous; use a unique category name`);
    }

    if (rowErrors.length) {
      errors.push(`Line ${record.line}: ${rowErrors.join("; ")}.`);
      continue;
    }
    rows.push({
      line: record.line,
      name,
      default_code: sku,
      barcode,
      list_price: price as number,
      ...(cost !== null ? { standard_price: cost } : {}),
      pos_categ_ids: categoryIds,
    });
  }
  return { rows, errors };
}
