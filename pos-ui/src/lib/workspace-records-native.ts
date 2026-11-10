import { api, type Page } from "@/lib/api";
import type { WorkspaceRecords, WorkspaceRecordType } from "@/lib/workspace-records";

const PAGE_SIZE = 40;
const STORE_TIMEZONE = "Australia/Adelaide";
const CURRENCY = "AUD";

type ProductRow = {
  id: number;
  name: string;
  categoryName?: string | null;
  price?: number | null;
  stockQuantity?: number | null;
  barcodes?: Array<{ code?: string | null }> | null;
};

type SaleHeader = {
  id: number | string;
  invoiceId?: string | null;
  status?: string | null;
  totalPrice?: number | null;
  totalTax?: number | null;
  createdAt?: string | null;
  localSoldAt?: string | null;
  registerId?: number | null;
  customerName?: string | null;
  totalQuantity?: number | null;
};

type SaleLine = {
  id?: number;
  productId?: number | null;
  quantity?: number | null;
  totalPrice?: number | null;
  basePrice?: number | null;
  note?: string | null;
};

function productSku(row: ProductRow) {
  const code = row.barcodes?.find((barcode) => barcode.code)?.code;
  return code || "—";
}

function periodCutoff(period: string): number | null {
  const now = Date.now();
  if (period === "24h") return now - 24 * 3_600_000;
  if (period === "7d") return now - 7 * 24 * 3_600_000;
  if (period === "30d") return now - 30 * 24 * 3_600_000;
  return null;
}

function saleTimestamp(sale: SaleHeader) {
  const raw = sale.localSoldAt || sale.createdAt;
  if (!raw) return null;
  const parsed = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesProductQuery(row: ProductRow, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return row.name.toLowerCase().includes(needle)
    || String(row.id).includes(needle)
    || (row.categoryName || "").toLowerCase().includes(needle)
    || productSku(row).toLowerCase().includes(needle);
}

function matchesSaleQuery(sale: SaleHeader, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return String(sale.invoiceId || "").toLowerCase().includes(needle)
    || String(sale.id).includes(needle)
    || String(sale.status || "").toLowerCase().includes(needle)
    || String(sale.customerName || "").toLowerCase().includes(needle);
}

async function loadProductRecords(type: "catalogue" | "inventory", offset: number, query: string): Promise<WorkspaceRecords> {
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const remote = await api.get<Page<ProductRow>>("/api/products", {
    name: query.trim() || undefined,
    page,
    size: PAGE_SIZE,
    status: "ACTIVE",
  });
  const filtered = remote.items.filter((row) => matchesProductQuery(row, query));
  const columns = [
    { key: "name", label: "Product" },
    { key: "sku_category", label: type === "catalogue" ? "SKU / category" : "Category" },
    { key: "price", label: "Price", format: "money" as const },
    { key: "stock", label: "Stock" },
  ];
  const items = filtered.map((row) => ({
    id: Number(row.id),
    name: row.name,
    sku_category: type === "catalogue"
      ? `${productSku(row)} · ${row.categoryName || "Uncategorised"}`
      : (row.categoryName || "Uncategorised"),
    price: Number(row.price ?? 0),
    stock: row.stockQuantity == null ? "—" : Number(row.stockQuantity),
  }));
  return {
    columns,
    items,
    hasNext: page * PAGE_SIZE < remote.total,
    currency: CURRENCY,
    timezone: STORE_TIMEZONE,
  };
}

async function loadSalesRecords(type: "lines" | "payments", offset: number, period: string, query: string): Promise<WorkspaceRecords> {
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const remote = await api.get<Page<SaleHeader>>("/api/sales", { page, size: PAGE_SIZE });
  const cutoff = periodCutoff(period);
  const sales = remote.items.filter((sale) => {
    if (cutoff !== null) {
      const at = saleTimestamp(sale);
      if (at === null || at < cutoff) return false;
    }
    return matchesSaleQuery(sale, query);
  });

  if (type === "payments") {
    const items = sales.map((sale) => ({
      id: Number(sale.id),
      payment_date: sale.localSoldAt || sale.createdAt || null,
      receipt: sale.invoiceId || `Sale #${sale.id}`,
      payment_method_id: sale.status || "—",
      amount: Number(sale.totalPrice ?? 0),
      session: sale.registerId ? `Register #${sale.registerId}` : "—",
    }));
    return {
      columns: [
        { key: "payment_date", label: "Date", format: "date" },
        { key: "receipt", label: "Receipt" },
        { key: "payment_method_id", label: "Status" },
        { key: "amount", label: "Amount", format: "money" },
        { key: "session", label: "Register" },
      ],
      items,
      hasNext: page * PAGE_SIZE < remote.total,
      currency: CURRENCY,
      timezone: STORE_TIMEZONE,
    };
  }

  const details = await Promise.all(sales.map((sale) =>
    api.get<SaleHeader & { items?: SaleLine[] }>(`/api/sales/${sale.id}`).catch(() => ({ ...sale, items: [] as SaleLine[] })),
  ));
  const items = details.flatMap((sale) => {
    const lines = sale.items ?? [];
    if (!lines.length) {
      return [{
        id: Number(sale.id),
        date: sale.localSoldAt || sale.createdAt || null,
        receipt: sale.invoiceId || `Sale #${sale.id}`,
        product_id: "Sale total",
        qty: sale.totalQuantity ?? 1,
        price_unit: Number(sale.totalPrice ?? 0),
        discount: "—",
        price_subtotal_incl: Number(sale.totalPrice ?? 0),
      }];
    }
    return lines.map((line, index) => ({
      id: Number(line.id ?? `${sale.id}-${index}`),
      date: sale.localSoldAt || sale.createdAt || null,
      receipt: sale.invoiceId || `Sale #${sale.id}`,
      product_id: line.note || (line.productId ? `Product #${line.productId}` : "Line item"),
      qty: Number(line.quantity ?? 0),
      price_unit: Number(line.basePrice ?? (line.totalPrice && line.quantity ? Number(line.totalPrice) / Number(line.quantity) : 0)),
      discount: "—",
      price_subtotal_incl: Number(line.totalPrice ?? 0),
    }));
  });
  return {
    columns: [
      { key: "date", label: "Date", format: "date" },
      { key: "receipt", label: "Receipt" },
      { key: "product_id", label: "Product" },
      { key: "qty", label: "Quantity" },
      { key: "price_unit", label: "Unit price", format: "money" },
      { key: "discount", label: "Discount" },
      { key: "price_subtotal_incl", label: "Total incl. tax", format: "money" },
    ],
    items,
    hasNext: page * PAGE_SIZE < remote.total,
    currency: CURRENCY,
    timezone: STORE_TIMEZONE,
  };
}

export async function fetchWorkspaceRecords(
  type: WorkspaceRecordType,
  options: { offset: number; period: string; query: string },
): Promise<WorkspaceRecords> {
  if (type === "catalogue" || type === "inventory") {
    return loadProductRecords(type, options.offset, options.query);
  }
  return loadSalesRecords(type, options.offset, options.period, options.query);
}
