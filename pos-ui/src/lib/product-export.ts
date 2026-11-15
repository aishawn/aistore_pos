import { api, type Page } from "./api";
import { buildStoreProductsCsv, type StoreProductExportRow } from "./product-export-csv";

export { buildStoreProductsCsv } from "./product-export-csv";

export async function exportStoreProductsCsv(): Promise<void> {
  const rows: StoreProductExportRow[] = [];
  let pageNumber = 1;
  for (;;) {
    const page = await api.get<Page<StoreProductExportRow>>("/api/products", {
      page: pageNumber,
      size: 200,
      status: "ACTIVE",
    });
    rows.push(...page.items);
    if (pageNumber * 200 >= page.total || !page.items.length) break;
    pageNumber += 1;
    if (pageNumber > 100) break;
  }

  const blob = new Blob([buildStoreProductsCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "orithos-products.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
