export type StoreProductExportRow = {
  id: number;
  name: string;
  price?: number | null;
  stockQuantity?: number | null;
  categoryName?: string | null;
};

function csvText(value: string | null | undefined) {
  return `"${(value ?? "").replaceAll('"', '""')}"`;
}

export function buildStoreProductsCsv(rows: StoreProductExportRow[]) {
  return [
    "id,name,category,price,stock",
    ...rows.map((row) => [
      row.id,
      csvText(row.name),
      csvText(row.categoryName),
      row.price ?? "",
      row.stockQuantity ?? "",
    ].join(",")),
  ].join("\r\n");
}
