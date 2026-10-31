export type PurchasingKind = "suppliers" | "purchase-orders";

export interface ShopfrontPurchasingRecord {
  id: string;
  name: string;
  status: string;
  phone: string;
  email: string;
  taxId: string;
  supplier: string;
  date: string;
  total: string | null;
  syncedAt: string;
  lines: Array<{ name: string; ordered: number | null; received: number | null; cost: number | null }>;
}

type SourceRow = {
  source_id: string; name?: string; business_number?: string; status?: string;
  order_date?: string; total_cost?: string | null; synced_at?: string;
  raw_payload?: {
    reference?: string; invoiceNumber?: string;
    contact?: { phone?: string; email?: string };
    products?: Array<{
      supplier?: { name?: string }; item?: { name?: string };
      orderedQuantity?: number; receivedQuantity?: number; orderedCost?: number;
    }>;
  };
};

export function normalizePurchasingRow(row: SourceRow, kind: PurchasingKind): ShopfrontPurchasingRecord {
  const raw = row.raw_payload ?? {};
  const lines = raw.products ?? [];
  return {
    id: row.source_id,
    name: kind === "suppliers" ? row.name || "Unnamed supplier" : raw.reference || raw.invoiceNumber || row.source_id,
    status: row.status || "Unknown",
    phone: raw.contact?.phone || "", email: raw.contact?.email || "", taxId: row.business_number || "",
    supplier: [...new Set(lines.map((line) => line.supplier?.name).filter(Boolean))].join(", "),
    date: row.order_date || "", total: row.total_cost ?? null, syncedAt: row.synced_at || "",
    lines: lines.map((line) => ({ name: line.item?.name || "Unnamed product", ordered: line.orderedQuantity ?? null, received: line.receivedQuantity ?? null, cost: line.orderedCost ?? null })),
  };
}

export function filterPurchasingRows(rows: ShopfrontPurchasingRecord[], query: string, status: string) {
  const needle = query.trim().toLocaleLowerCase();
  return rows.filter((row) => (status === "all" || row.status === status)
    && (!needle || [row.id, row.name, row.phone, row.email, row.taxId, row.supplier].some((value) => value.toLocaleLowerCase().includes(needle))));
}
