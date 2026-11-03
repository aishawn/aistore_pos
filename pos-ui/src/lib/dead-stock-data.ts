import type { ReportRpc } from "./report-data.ts";
import { readCompleteRows } from "./replenishment-pagination.ts";
const WINDOWS = [30, 60, 90] as const;
export async function calculateDeadStock(rpc: ReportRpc, sessionId: string, companyId: number, correlationId?: string | null, now = new Date(), sampleDataClearedAt: string | null = null) {
  const dateString = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
    const productDomain = [["sale_ok", "=", true], ["active", "=", true], ["company_id", "=", companyId]];
    const productFields = ["id", "display_name", "default_code", "qty_available", "standard_price", "categ_id"];
    const companyContext = { allowed_company_ids: [companyId], force_company: companyId };
    const productsPromise = readCompleteRows<Record<string, unknown>>(
      () => rpc<number>(sessionId, "product.product", "search_count", [productDomain], { context: companyContext }, correlationId),
      (afterId, limit) => rpc<Array<Record<string, unknown>>>(sessionId, "product.product", "search_read", [[...productDomain, ["id", ">", afterId]]], { fields: productFields, limit, order: "id asc", context: companyContext }, correlationId),
      25_000,
      1_000,
    );
    // The three windows are independent. Running them concurrently keeps this
    // read-only report within the request budget on larger catalogues.
    const salesPromises = WINDOWS.map((days) => rpc<Array<Record<string, unknown>>>(sessionId, "pos.order.line", "read_group", [[ ["order_id.company_id", "=", companyId], ["order_id.date_order", ">=", dateString(days)], ["order_id.state", "in", ["paid", "done", "invoiced"]], ...(sampleDataClearedAt ? [["!", ["order_id.uuid", "=like", `demo-seed-${companyId}-%`]]] : []) ], ["qty:sum"], ["product_id"]], { lazy: false }, correlationId));
    const [products, windowRows] = await Promise.all([productsPromise, Promise.all(salesPromises)]);
    const salesByWindow = new Map<number, Map<number, number>>();
    WINDOWS.forEach((days, index) => {
      const rows = windowRows[index];
      const map = new Map<number, number>();
      for (const row of rows ?? []) {
        const product = row.product_id;
        const id = Array.isArray(product) ? Number(product[0]) : 0;
        if (id > 0) map.set(id, Number(row.qty ?? 0));
      }
      salesByWindow.set(days, map);
    });
    const items = (products ?? []).map((product) => {
      const id = Number(product.id);
      const qty = Number(product.qty_available);
      const cost = Number(product.standard_price);
      const sales = Object.fromEntries(WINDOWS.map((days) => [days, salesByWindow.get(days)?.get(id) ?? 0]));
      const validValue = Number.isFinite(qty) && qty >= 0 && Number.isFinite(cost) && cost >= 0;
      return { id, name: String(product.display_name ?? "Product"), sku: product.default_code ? String(product.default_code) : "", category: Array.isArray(product.categ_id) ? String(product.categ_id[1] ?? "Uncategorised") : "Uncategorised", onHand: Number.isFinite(qty) ? qty : null, unitCost: Number.isFinite(cost) && cost >= 0 ? cost : null, inventoryValue: validValue ? qty * cost : null, sales, invalidReason: validValue ? null : (!Number.isFinite(cost) || cost < 0 ? "MISSING_OR_INVALID_COST" : "NEGATIVE_OR_INVALID_STOCK") };
    });
    const bucketCounts = Object.fromEntries(WINDOWS.map((days) => [days, items.filter((item) => item.sales[String(days)] === 0).length]));
    const cashValueByBucket = Object.fromEntries(WINDOWS.map((days) => [days, items.filter((item) => item.sales[String(days)] === 0).reduce((sum, item) => sum + (item.inventoryValue ?? 0), 0)]));
    const loadedProductCount = items.length;
    return { companyId, bucketCounts, cashValueByBucket, invalidCostOrStockCount: items.filter((item) => item.invalidReason).length, products: items.filter((item) => WINDOWS.some((days) => item.sales[String(days)] === 0)).sort((a, b) => (b.inventoryValue ?? -1) - (a.inventoryValue ?? -1)), catalogueCoverage: { loadedProducts: loadedProductCount, totalProducts: loadedProductCount, complete: true }, productCount: loadedProductCount, truncated: false, dataQuality: "CURRENT_NATIVE_STOCK_POS_SALES_READ_ONLY", writeRequests: [] };
}
