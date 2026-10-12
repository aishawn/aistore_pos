import { generateInStoreEan13, validateBarcode } from "@/lib/barcode";

/**
 * Shared AI "create" prefill: write defaults to sessionStorage, open create UI
 * with ?create=1, leave Save/Create for the user.
 */

export const AI_CREATE_PARAM = "create";

export function aiCreateStorageKey(entity: string): string {
  return `orithos:ai-create-${entity}`;
}

export function writeAiCreatePrefill(entity: string, data: object): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(aiCreateStorageKey(entity), JSON.stringify(data));
}

export function consumeAiCreatePrefill<T extends object>(
  entity: string,
): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(aiCreateStorageKey(entity));
    if (!raw) return null;
    sessionStorage.removeItem(aiCreateStorageKey(entity));
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Append ?create=1 (or &create=1) so list pages auto-open the create UI. */
export function withAiCreateFlag(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${AI_CREATE_PARAM}=1`;
}

/** Strip create trigger words and return leftover name hint. */
export function parseCreateNameHint(query: string, entityWords: string[]): string {
  let q = query.trim();
  if (!q) return "";
  const entityAlt = entityWords.map(escapeRegExp).join("|");
  q = q
    .replace(
      new RegExp(
        `^(?:create|add|new|新建|创建|添加|新增)\\s*(?:a\\s+)?(?:new\\s+)?(?:${entityAlt})?`,
        "i",
      ),
      "",
    )
    .replace(new RegExp(`^(?:${entityAlt})\\s*`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();
  return q;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function firstClassificationId(type: string): Promise<string | null> {
  try {
    const { api } = await import("@/lib/api");
    const items = await api.get<{ id: string | number }[]>(`/api/classifications/${type}`);
    const first = (items ?? []).find((g) => g.id != null && String(g.id).trim() !== "");
    return first ? String(first.id) : null;
  } catch {
    return null;
  }
}

export async function prepareNamedCreatePrefill(
  entity: string,
  query: string,
  entityWords: string[],
  defaultName: string,
): Promise<{ name: string }> {
  const hint = parseCreateNameHint(query, entityWords);
  const name = hint || defaultName;
  writeAiCreatePrefill(entity, { name });
  return { name };
}

export interface ProductCreatePrefill {
  name: string;
  categoryId: string;
  tagId: string;
  familyId: string;
  caseQuantity: string;
  priceQuantity: string;
  price: string;
  barcode: string;
}

const PRODUCT_PRICE_PATTERNS: RegExp[] = [
  /(?:price|售价|价格|单价|油价|定价|cost)\s*[:=：]?\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?|美元|刀|yuan|元)?/i,
  /\$\s*(\d+(?:\.\d{1,2})?)/,
  /(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?|美元|刀|yuan|元)/i,
];

const PRODUCT_BARCODE_IN_TEXT = /\b(\d{8}|\d{12}|\d{13}|\d{14})\b/;

/** Parse optional name / price / barcode from create-product query text. */
export function parseProductCreateHints(query: string): {
  name?: string;
  price?: string;
  barcode?: string;
} {
  let rest = query.trim();
  if (!rest) return {};

  rest = rest
    .replace(
      /^(?:please\s+)?(?:create|add|new|新建|创建|添加|新增)\s*(?:a\s+|an\s+|一个)?(?:new\s+|新的?)?(?:product|item|商品|产品)?[，,、]?\s*/i,
      "",
    )
    .replace(/^(?:product|item|商品|产品)\s*[，,、]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  let barcode: string | undefined;
  const barcodeMatch = rest.match(PRODUCT_BARCODE_IN_TEXT);
  if (barcodeMatch && !validateBarcode(barcodeMatch[1])) {
    barcode = barcodeMatch[1];
    rest = `${rest.slice(0, barcodeMatch.index)}${rest.slice((barcodeMatch.index ?? 0) + barcodeMatch[0].length)}`
      .replace(/\s+/g, " ")
      .trim();
  }

  let price: string | undefined;
  for (const pattern of PRODUCT_PRICE_PATTERNS) {
    const match = rest.match(pattern);
    if (!match?.[1]) continue;
    price = match[1];
    rest = `${rest.slice(0, match.index)}${rest.slice((match.index ?? 0) + match[0].length)}`;
    break;
  }
  rest = rest
    .replace(/(?:price|售价|价格|单价|油价|定价|cost)\s*[:=：]?\s*/gi, " ")
    .replace(/[，,、]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (price) {
    rest = rest
      .replace(/^(?:usd|dollars?|美元|刀|yuan|元)\s*/i, "")
      .replace(/\s*(?:usd|dollars?|美元|刀|yuan|元)$/i, "")
      .trim();
  }

  const name = rest.replace(/^[，,、.\s]+|[，,、.\s]+$/g, "").trim();
  return {
    name: name || undefined,
    price,
    barcode,
  };
}

export async function prepareProductCreatePrefill(query: string): Promise<ProductCreatePrefill> {
  const hints = parseProductCreateHints(query);
  const [categoryId, tagId, familyId] = await Promise.all([
    firstClassificationId("category"),
    firstClassificationId("tag"),
    firstClassificationId("family"),
  ]);
  const data: ProductCreatePrefill = {
    name: hints.name || "New Product",
    categoryId: categoryId ?? "",
    tagId: tagId ?? "",
    familyId: familyId ?? "",
    caseQuantity: "1",
    priceQuantity: "1",
    price: hints.price || "0",
    barcode: hints.barcode || generateInStoreEan13(),
  };
  writeAiCreatePrefill("product", data);
  return data;
}

export async function prepareSupplierCreatePrefill(query: string): Promise<{ name: string }> {
  return prepareNamedCreatePrefill(
    "supplier",
    query,
    ["supplier", "供应商"],
    "New Supplier",
  );
}

export async function prepareCustomerGroupCreatePrefill(query: string): Promise<{ name: string }> {
  return prepareNamedCreatePrefill(
    "customer_group",
    query,
    ["customer group", "customer_group", "客户组", "客户分组"],
    "New Group",
  );
}

export async function preparePriceListCreatePrefill(query: string): Promise<{ name: string }> {
  return prepareNamedCreatePrefill(
    "price_list",
    query,
    ["price list", "price_list", "pricelist", "价格表", "价目表"],
    "New Price List",
  );
}

export async function prepareClassificationCreatePrefill(query: string): Promise<{
  name: string;
  type: string;
}> {
  const hint = parseCreateNameHint(query, [
    "classification",
    "brand",
    "category",
    "family",
    "tag",
    "分类",
    "品牌",
    "品类",
    "标签",
  ]);
  const lower = query.toLowerCase();
  let type = "category";
  if (/\bbrand\b|品牌/.test(lower)) type = "brand";
  else if (/\bfamily\b|系列/.test(lower)) type = "family";
  else if (/\btag\b|标签/.test(lower)) type = "tag";
  else if (/\bcategory\b|品类|分类/.test(lower)) type = "category";
  const data = { name: hint || "New Classification", type };
  writeAiCreatePrefill("classification", data);
  return data;
}

export async function prepareStocktakeCreatePrefill(query: string): Promise<{ name: string }> {
  return prepareNamedCreatePrefill(
    "stocktake",
    query,
    ["stocktake", "stock take", "盘点"],
    "New Stocktake",
  );
}

export async function prepareBuyingPeriodCreatePrefill(query: string): Promise<{
  start: string;
  end: string;
  quantity: string;
  cost: string;
}> {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const iso = `${yyyy}-${mm}-${dd}`;
  const data = {
    start: iso,
    end: iso,
    quantity: "1",
    cost: "0",
  };
  void query;
  writeAiCreatePrefill("buying_period", data);
  return data;
}
