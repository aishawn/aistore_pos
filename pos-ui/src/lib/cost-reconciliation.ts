/** Evidence reconciliation only. A receipt-price comparison never changes FIFO/AVCO. */
export type AuditRecord = Record<string, unknown> & { id: number };
export type AuditRpc = <T>(model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) => Promise<T>;
export type AuditSnapshot = {
  companyId: number; store: string; timezone: string; from: string; to: string; capturedAt: string;
  products: AuditRecord[]; lines: AuditRecord[]; orders: AuditRecord[]; receipts: AuditRecord[];
  sourceSales?: AuditRecord[];
  coverage?: { allProducts: boolean; totalOrders: number; totalLines: number; selectedLines: number;
    sourceCompletedOrders?: number; sourceMissingNativeOrders?: number; importedMissingSourceOrders?: number; sourceRowsComplete?: boolean };
};
export type AuditLine = {
  productId: number; name: string; sourceId: string; saleLineId: number; orderId: number; soldAt: string;
  quantity: number; currentUnitCost: number | null; originalTotalCost: number | null; costMethod: string;
  receiptId: string | null; receiptLine: number | null; receivedAt: string | null; supplier: string | null;
  casePrice: number | null; caseQuantity: number | null; candidateUnitCost: number | null;
  purchaseTax: number | null; verifiedReceiptUnitCost: number | null; proposedTotalCost: number | null;
  unitDifference: number | null; originalNet: number | null; gross: number | null; recordedTax: number | null;
  status: "matched" | "correctable" | "review"; issues: string[];
  sourceSaleId: string | null; sourceLineId: string | null; sourceLineCost: number | null; sourceTax: number | null;
  proposedNet: number | null;
  candidateUnitDifference: number | null; sourceUnitCost: number | null;
};
export type AuditProduct = {
  id: number; name: string; sold: number; returned: number; currentUnitCost: number | null;
  costMethod: string; status: AuditLine["status"]; issues: string[]; lines: AuditLine[];
};
export type CostAudit = {
  ruleVersion: string; batchId: string; sourceHash: string; companyId: number; store: string; timezone: string;
  from: string; to: string; capturedAt: string; readOnly: true; products: AuditProduct[];
  sourceMargin?: import("./shopfront-source-margin.ts").SourceMargin;
  summary: { matched: number; correctable: number; review: number; lines: number; originalCost: number; originalNet: number; gross: number; recordedTax: number; grossProfit: number | null; grossMarginPercent?: number | null; publicationBlockers?: string[] };
};

export const COST_RULE_VERSION = "receipt-evidence-v2";
export function amount(value: unknown): number | null {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? n : null;
}
export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function relationId(value: unknown): number { return Array.isArray(value) ? Number(value[0]) : 0; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
// Fixed six-decimal arithmetic for cost comparisons; round only at the defined boundary.
function scaled(n: number): bigint { return BigInt(n.toFixed(6).replace(".", "")); }
function unscale(n: bigint): number { return Number(n) / 1e6; }
function roundedDivide(a: bigint, b: bigint): bigint {
  const sign = (a < BigInt(0)) !== (b < BigInt(0)) ? -BigInt(1) : BigInt(1);
  const x = a < BigInt(0) ? -a : a, y = b < BigInt(0) ? -b : b;
  return sign * ((x + y / BigInt(2)) / y);
}
export function divideCost(a: number, b: number): number { return unscale(roundedDivide(scaled(a) * BigInt(1e6), scaled(b))); }
export function multiplyCost(a: number, b: number): number { return unscale(roundedDivide(scaled(a) * scaled(b), BigInt(1e6))); }
function difference(a: number, b: number): number { return unscale(scaled(a) - scaled(b)); }
function sum(values: number[]): number { return unscale(values.reduce((total, n) => total + scaled(n), BigInt(0))); }
export function auditTime(value: unknown): number {
  const s = text(value).replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  if (!s || s.length <= 10) return NaN;
  return Date.parse(/[zZ]$|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s.replace(" ", "T")}Z`);
}

type Receipt = { sourceId: string; orderId: string; lineIndex: number; receivedAt: string; time: number; supplier: string; line: Record<string, unknown>; raw: Record<string, unknown> };
function receiptIndex(snapshot: AuditSnapshot): Map<string, Receipt[]> {
  const index = new Map<string, Receipt[]>();
  for (const row of snapshot.receipts) {
    const raw = object(row.raw_payload);
    if (row.source_status !== "RECEIVED" || raw.undergoingReview === true) continue;
    const receivedAt = text(raw.receivedAt), time = auditTime(receivedAt);
    for (const [i, value] of (Array.isArray(raw.products) ? raw.products : []).entries()) {
      const line = object(value), sourceId = text(object(line.item).id);
      if (!sourceId || (amount(line.receivedQuantity) ?? 0) <= 0) continue;
      const entries = index.get(sourceId) ?? [];
      entries.push({ sourceId, orderId: text(row.source_id), lineIndex: i + 1, receivedAt, time, supplier: text(object(line.supplier).name), line, raw });
      index.set(sourceId, entries);
    }
  }
  for (const entries of index.values()) entries.sort((a, b) => b.time - a.time);
  return index;
}

export function reconcileCosts(snapshot: AuditSnapshot, batchId: string, sourceHash: string): CostAudit {
  const receipts = receiptIndex(snapshot), orders = new Map(snapshot.orders.map(row => [row.id, row]));
  const products = new Map(snapshot.products.map(row => [row.id, row]));
  const groups = new Map<number, AuditProduct>();
  for (const line of snapshot.lines) {
    const id = relationId(line.product_id), product = products.get(id), order = orders.get(relationId(line.order_id));
    if (!product || !order) throw new Error("Incomplete product/order evidence");
    const qty = amount(line.qty);
    if (qty === null) throw new Error("Invalid sale quantity");
    const ref = text(product.shopfront_source_ref), prefix = `${snapshot.store}:`;
    const sourceId = ref.startsWith(prefix) ? ref.slice(prefix.length) : "";
    const issues: string[] = [], soldAt = text(order.date_order), time = auditTime(soldAt);
    if (!Number.isFinite(time)) throw new Error("Invalid sale timestamp");
    const candidates = receipts.get(sourceId) ?? [];
    const eligible = candidates.filter(r => Number.isFinite(r.time) && r.time < time);
    const receipt = eligible[0];
    if (!sourceId) issues.push("NO_STABLE_SOURCE_ID");
    if (!receipt) issues.push("NO_PRIOR_RECEIPT");
    if (candidates.some(r => !Number.isFinite(r.time))) issues.push("RECEIPT_TIME_UNKNOWN");
    if (receipt && eligible.filter(r => r.time === receipt.time).length > 1) issues.push("AMBIGUOUS_RECEIPT");
    if (candidates.some(r => r.time === time)) issues.push("RECEIPT_SALE_ORDER_UNKNOWN");
    const casePrice = amount(receipt?.line.orderedCost), caseQuantity = amount(receipt?.line.caseQuantity);
    const candidateUnitCost = casePrice !== null && casePrice >= 0 && caseQuantity !== null && caseQuantity > 0 ? divideCost(casePrice, caseQuantity) : null;
    if (receipt && (caseQuantity === null || caseQuantity <= 0)) issues.push("MISSING_CASE_QUANTITY");
    if (receipt && (casePrice === null || casePrice < 0)) issues.push("MISSING_CASE_PRICE");
    // Source orderedCost has not been established as a net/gross case price.
    // Only explicit invoice-backed evidence can promote a comparison to a correction.
    const evidence = object(receipt?.line.costEvidence);
    const tax = amount(evidence.taxPerCase), net = amount(evidence.netPerCase);
    const verified = evidence.verified === true && !!text(evidence.documentRef) && evidence.unit === "case";
    const purchaseTax = verified ? tax : null;
    if (receipt && !verified) issues.push("COST_UNIT_OR_INVOICE_UNVERIFIED");
    if (receipt && (!verified || tax === null || typeof evidence.taxRecoverable !== "boolean")) issues.push("PURCHASE_TAX_UNVERIFIED");
    const verifiedReceiptUnitCost = verified && net !== null && net >= 0 && tax !== null && typeof evidence.taxRecoverable === "boolean" && caseQuantity !== null && caseQuantity > 0
      ? divideCost(evidence.taxRecoverable ? net : sum([net, tax]), caseQuantity) : null;
    const costMethod = text(product.cost_method) || "unknown";
    if (costMethod !== "standard") issues.push("VALUATION_CHAIN_REQUIRED");
    else issues.push("HISTORICAL_STANDARD_COST_REQUIRED");
    // Original source sale cost is a LINE total, already computed by the source's valuation method.
    const source = object(line.source_evidence);
    const sourceVerified = source.verified === true;
    const sourceLineCost = sourceVerified ? amount(source.lineCost) : null;
    const sourceTax = sourceVerified ? amount(source.tax) : null;
    if (sourceLineCost !== null) {
      for (const issue of ["HISTORICAL_STANDARD_COST_REQUIRED", "VALUATION_CHAIN_REQUIRED"]) {
        const at = issues.indexOf(issue); if (at >= 0) issues.splice(at, 1);
      }
    }
    // An explicitly captured standard cost at sale time is distinct from current standard_price.
    const historical = object(line.cost_evidence);
    const historicalCost = historical.verified === true && text(historical.documentRef) && costMethod === "standard" ? amount(historical.unitCost) : null;
    if (historicalCost !== null && historicalCost >= 0) { const at = issues.indexOf("HISTORICAL_STANDARD_COST_REQUIRED"); if (at >= 0) issues.splice(at, 1); }
    if (qty < 0) issues.push("REFUND_ORIGINAL_COST_REQUIRED");
    const unit = Array.isArray(product.uom_id) ? text(product.uom_id[1]) : "";
    if (!/^(units?|pcs|pieces?)$/i.test(unit)) issues.push("SALE_UNIT_UNVERIFIED");
    const originalTotalCost = amount(line.total_cost), currentUnitCost = amount(product.standard_price);
    const originalNet = amount(line.price_subtotal), gross = amount(line.price_subtotal_incl);
    const orderTax = amount(order.amount_tax);
    if (originalTotalCost === null || line.is_total_cost_computed === false) issues.push("ORIGINAL_COST_UNAVAILABLE");
    // Order-level arithmetic is checked once against ALL lines in the selected orders by the loader.
    if (order.audit_tax_mismatch === true) issues.push("SALES_TAX_MISMATCH");
    if (originalNet === null || gross === null || orderTax === null) issues.push("SALES_AMOUNTS_UNAVAILABLE");
    if (sourceTax !== null && originalNet !== null && gross !== null && Math.abs(difference(difference(gross, originalNet), sourceTax)) > 0.011) issues.push("SOURCE_LINE_TAX_MISMATCH");
    if (qty === 0) issues.push("ZERO_QUANTITY_REQUIRES_REVIEW");
    // A supported source total can be displayed even when receipt/tax review blocks execution.
    const proposedTotalCost = sourceLineCost ?? (issues.length === 0 && historicalCost !== null ? multiplyCost(historicalCost, qty) : null);
    const proposedNet = sourceTax !== null && gross !== null ? difference(gross, sourceTax) : null;
    const status = issues.length || proposedTotalCost === null || originalTotalCost === null ? "review" : Math.abs(difference(proposedTotalCost, originalTotalCost)) < 0.005 ? "matched" : "correctable";
    const row: AuditLine = { productId: id, name: text(product.name), sourceId, saleLineId: line.id, orderId: order.id, soldAt, quantity: qty,
      currentUnitCost, originalTotalCost, costMethod, receiptId: receipt?.orderId ?? null, receiptLine: receipt?.lineIndex ?? null,
      receivedAt: receipt?.receivedAt ?? null, supplier: receipt?.supplier ?? null, casePrice, caseQuantity, candidateUnitCost, purchaseTax,
      verifiedReceiptUnitCost, proposedTotalCost, unitDifference: verifiedReceiptUnitCost !== null && currentUnitCost !== null ? difference(verifiedReceiptUnitCost, currentUnitCost) : null,
      originalNet, gross, recordedTax: originalNet !== null && gross !== null ? difference(gross, originalNet) : null, status, issues: [...new Set(issues)],
      sourceSaleId: sourceVerified ? text(source.saleId) : null, sourceLineId: sourceVerified ? text(source.lineId) : null, sourceLineCost, sourceTax, proposedNet,
      candidateUnitDifference: candidateUnitCost !== null && currentUnitCost !== null ? difference(candidateUnitCost, currentUnitCost) : null,
      sourceUnitCost: sourceLineCost !== null && qty !== 0 ? divideCost(sourceLineCost, qty) : null };
    const group = groups.get(id) ?? { id, name: row.name, sold: 0, returned: 0, currentUnitCost, costMethod, status: "matched", issues: [], lines: [] };
    group.sold = sum([group.sold, Math.max(0, qty)]); group.returned = sum([group.returned, Math.max(0, -qty)]);
    group.lines.push(row); groups.set(id, group);
  }
  const result = [...groups.values()].sort((a, b) => b.sold - a.sold || a.id - b.id);
  for (const product of result) {
    product.issues = [...new Set(product.lines.flatMap(line => line.issues))];
    product.status = product.lines.some(l => l.status === "review") ? "review" : product.lines.some(l => l.status === "correctable") ? "correctable" : "matched";
  }
  const lines = result.flatMap(p => p.lines), originalCost = sum(lines.map(l => l.originalTotalCost ?? 0)), originalNet = sum(lines.map(l => l.originalNet ?? 0));
  const publicationBlockers: string[] = [];
  if (!lines.length) publicationBlockers.push("NO_SALES_LINES");
  if (!snapshot.coverage?.allProducts || snapshot.coverage.selectedLines !== snapshot.coverage.totalLines || snapshot.coverage.selectedLines !== lines.length) publicationBlockers.push("FULL_SCOPE_NOT_VERIFIED");
  if (snapshot.coverage?.sourceMissingNativeOrders || snapshot.coverage?.importedMissingSourceOrders) publicationBlockers.push("SOURCE_COVERAGE_MISMATCH");
  if (lines.some(l => l.status !== "matched")) publicationBlockers.push("UNRESOLVED_COST_OR_TAX");
  const grossProfit = publicationBlockers.length ? null : difference(originalNet, originalCost);
  return { ruleVersion: COST_RULE_VERSION, batchId, sourceHash, companyId: snapshot.companyId, store: snapshot.store, timezone: snapshot.timezone,
    from: snapshot.from, to: snapshot.to, capturedAt: snapshot.capturedAt, readOnly: true, products: result,
    summary: { matched: result.filter(p => p.status === "matched").length, correctable: result.filter(p => p.status === "correctable").length,
      review: result.filter(p => p.status === "review").length, lines: lines.length, originalCost, originalNet,
      gross: sum(lines.map(l => l.gross ?? 0)), recordedTax: sum(lines.map(l => l.recordedTax ?? 0)),
      grossProfit, grossMarginPercent: grossProfit !== null && originalNet > 0 ? divideCost(multiplyCost(grossProfit, 100), originalNet) : null, publicationBlockers } };
}

export function costAuditCsv(audit: CostAudit): string {
  const keys = ["productId", "name", "sourceId", "saleLineId", "orderId", "soldAt", "quantity", "receiptId", "receiptLine", "receivedAt", "supplier", "casePrice", "caseQuantity", "purchaseTax", "candidateUnitCost", "candidateUnitDifference", "verifiedReceiptUnitCost", "currentUnitCost", "unitDifference", "costMethod", "originalTotalCost", "proposedTotalCost", "sourceSaleId", "sourceLineId", "sourceLineCost", "sourceUnitCost", "sourceTax", "proposedNet", "originalNet", "gross", "recordedTax", "status", "issues"] as const;
  const escape = (value: unknown) => { const s = Array.isArray(value) ? value.join("; ") : String(value ?? ""); return `"${(/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`; };
  return "\uFEFF" + [["batchId", "sourceHash", "ruleVersion", ...keys], ...audit.products.flatMap(p => p.lines.map(l => [audit.batchId, audit.sourceHash, audit.ruleVersion, ...keys.map(key => l[key])]))].map(row => row.map(escape).join(",")).join("\r\n");
}
