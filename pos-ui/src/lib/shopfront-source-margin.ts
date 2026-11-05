import { amount, auditTime, divideCost, multiplyCost, object, type AuditRecord } from "./cost-reconciliation.ts";

export type SourceMargin = {
  basis: "shopfront_original_sale_cost"; accountingVerified: false; complete: boolean;
  completedOrders: number; excludedOrders: number; invalidOrders: number; lines: number; refundLines: number;
  grossSales: number | null; tax: number | null; netSales: number | null; salesCost: number | null;
  grossProfit: number | null; grossMarginPercent: number | null; costEvidencePendingLines: number;
  aggregation: "original_order_totals"; lineReconciliationComplete: boolean; ordersWithLineDifferences: number;
  lineVsOrderGrossDifference: number; lineVsOrderTaxDifference: number; lineVsOrderCostDifference: number;
  lineDifferences: { saleId: string; gross: number; tax: number; cost: number }[];
  excludedSourceTotals: { complete: boolean; grossSales: number; tax: number; salesCost: number };
  normalizedMismatchSaleIds: string[];
  issues: { saleId: string; reasons: string[] }[];
};

function sum(values: number[]): number {
  return Number(values.reduce((total, value) => total + BigInt(value.toFixed(6).replace(".", "")), BigInt(0))) / 1e6;
}
const differs = (a: unknown, b: unknown, tolerance = 0.000001) => amount(a) === null || amount(b) === null || Math.abs(Number(a) - Number(b)) > tolerance;

/** Reproduce Shopfront's reported cost, explicitly separate from independently verified accounting COGS. */
export function shopfrontSourceMargin(rows: AuditRecord[], from: string, to: string, coverageComplete: boolean): SourceMargin {
  const result: SourceMargin = { basis: "shopfront_original_sale_cost", accountingVerified: false, complete: false,
    completedOrders: 0, excludedOrders: 0, invalidOrders: 0, lines: 0, refundLines: 0,
    grossSales: null, tax: null, netSales: null, salesCost: null, grossProfit: null, grossMarginPercent: null,
    aggregation: "original_order_totals", lineReconciliationComplete: true, ordersWithLineDifferences: 0,
    lineVsOrderGrossDifference: 0, lineVsOrderTaxDifference: 0, lineVsOrderCostDifference: 0, lineDifferences: [],
    excludedSourceTotals: { complete: true, grossSales: 0, tax: 0, salesCost: 0 },
    costEvidencePendingLines: 0, normalizedMismatchSaleIds: [], issues: [] };
  const start = auditTime(from), end = auditTime(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw Error("Invalid source margin period");
  const seen = new Set<string>(), gross: number[] = [], taxes: number[] = [], costs: number[] = [];
  for (const row of rows) {
    const time = auditTime(row.created_at), payload = object(row.raw_payload), raw = object(payload.raw_payload);
    if (!Number.isFinite(time)) { result.issues.push({ saleId: String(row.external_id || row.id), reasons: ["SOURCE_DATE_MISSING"] }); result.invalidOrders++; continue; }
    if (time < start || time >= end) continue;
    if (payload.status !== "COMPLETED") {
      result.excludedOrders++;
      if (String(raw.id || "") !== String(row.external_id) || raw.status !== payload.status || differs(row.total_price, raw.totalPrice) || differs(row.total_tax, raw.totalTax) || differs(row.total_cost, raw.totalCost)) result.excludedSourceTotals.complete = false;
      else {
        result.excludedSourceTotals.grossSales = sum([result.excludedSourceTotals.grossSales, Number(row.total_price)]);
        result.excludedSourceTotals.tax = sum([result.excludedSourceTotals.tax, Number(row.total_tax)]);
        result.excludedSourceTotals.salesCost = sum([result.excludedSourceTotals.salesCost, Number(row.total_cost)]);
      }
      continue;
    }
    result.completedOrders++;
    const saleId = String(row.external_id || ""), reasons: string[] = [];
    if (!saleId || seen.has(saleId)) reasons.push("SOURCE_SALE_ID_DUPLICATE_OR_MISSING");
    seen.add(saleId);
    if (raw.status !== "COMPLETED" || String(raw.id || "") !== saleId || auditTime(raw.createdAt) !== time) reasons.push("RAW_SALE_IDENTITY_MISMATCH");
    const normalized = Array.isArray(payload.items) ? payload.items.map(object) : [], original = Array.isArray(raw.items) ? raw.items.map(object) : [];
    if (!original.length) reasons.push("SOURCE_LINES_INCOMPLETE");
    // Raw Sale items are the source evidence. Never repair a normalized mirror
    // silently or let its duplicated last line overwrite an intact original.
    const normalizedIds = normalized.map(item => String(object(item.raw_payload).id || ""));
    if (normalized.length !== original.length || new Set(normalizedIds).size !== original.length || original.some(line => {
      const item = normalized.find(item => String(object(item.raw_payload).id || "") === String(line.id));
      return !item || String(item.source_product_id || "") !== String(object(line.item).id || "")
        || differs(item.quantity, line.quantity) || differs(item.line_total, line.totalPrice) || differs(item.tax, line.tax) || differs(item.cost, line.cost);
    })) result.normalizedMismatchSaleIds.push(saleId);
    const lineIds = new Set<string>(), values: { gross: number; tax: number; cost: number }[] = [];
    for (const rawLine of original) {
      const id = String(rawLine.id || "");
      result.lines++; result.costEvidencePendingLines++;
      const qty = amount(rawLine.quantity), lineGross = amount(rawLine.totalPrice), tax = amount(rawLine.tax), cost = amount(rawLine.cost);
      if (qty !== null && qty < 0) result.refundLines++;
      if (!id || lineIds.has(id) || !String(object(rawLine.item).id || "")) reasons.push("SOURCE_LINE_IDENTITY_MISMATCH");
      lineIds.add(id);
      if (qty === null || lineGross === null || tax === null || cost === null) reasons.push("SOURCE_AMOUNT_MISSING");
      else if (Math.abs(tax) > Math.abs(lineGross) + 0.011 || (lineGross !== 0 && tax !== 0 && Math.sign(lineGross) !== Math.sign(tax))) reasons.push("SOURCE_TAX_INVALID");
      if (lineGross !== null && tax !== null && cost !== null) values.push({ gross: lineGross, tax, cost });
    }
    const totals = { gross: sum(values.map(v => v.gross)), tax: sum(values.map(v => v.tax)), cost: sum(values.map(v => v.cost)) };
    for (const [field, rawField] of [["total_price", "totalPrice"], ["total_tax", "totalTax"], ["total_cost", "totalCost"]] as const) {
      if (differs(row[field], raw[rawField])) reasons.push("RAW_ORDER_TOTAL_MISMATCH");
    }
    if (!reasons.length) {
      const delta = { saleId, gross: sum([totals.gross, -Number(row.total_price)]), tax: sum([totals.tax, -Number(row.total_tax)]), cost: sum([totals.cost, -Number(row.total_cost)]) };
      if ([delta.gross, delta.tax, delta.cost].some(value => Math.abs(value) > 0.000001)) result.lineDifferences.push(delta);
    }
    if (reasons.length) { result.invalidOrders++; result.issues.push({ saleId, reasons: [...new Set(reasons)] }); }
    else { gross.push(Number(row.total_price)); taxes.push(Number(row.total_tax)); costs.push(Number(row.total_cost)); }
  }
  result.ordersWithLineDifferences = result.lineDifferences.length;
  result.lineReconciliationComplete = result.lineDifferences.length === 0;
  result.lineVsOrderGrossDifference = sum(result.lineDifferences.map(row => row.gross));
  result.lineVsOrderTaxDifference = sum(result.lineDifferences.map(row => row.tax));
  result.lineVsOrderCostDifference = sum(result.lineDifferences.map(row => row.cost));
  result.complete = coverageComplete && result.invalidOrders === 0;
  if (!coverageComplete) result.issues.push({ saleId: "", reasons: ["SOURCE_COVERAGE_NOT_VERIFIED"] });
  if (result.complete) {
    result.grossSales = sum(gross); result.tax = sum(taxes); result.netSales = sum([result.grossSales, -result.tax]); result.salesCost = sum(costs);
    result.grossProfit = sum([result.grossSales, -result.salesCost]);
    result.grossMarginPercent = result.grossSales > 0 ? divideCost(multiplyCost(result.grossProfit, 100), result.grossSales) : null;
  }
  return result;
}
