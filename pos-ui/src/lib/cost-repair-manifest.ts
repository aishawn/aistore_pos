import { amount, object, type AuditSnapshot, type CostAudit } from "./cost-reconciliation.ts";

/** Immutable proposal only. Production execution additionally needs a restored backup and approved scope. */
export function costRepairManifest(snapshot: AuditSnapshot, audit: CostAudit) {
  const originals = new Map(snapshot.lines.map(line => [line.id, line]));
  const rows = audit.products.flatMap(product => product.lines.map(line => {
    const original = originals.get(line.saleLineId);
    if (!original) throw Error("Manifest line absent from snapshot");
    const evidence = object(original.source_evidence);
    return {
      model: "pos.order.line", id: line.saleLineId, orderId: line.orderId, productId: line.productId,
      sourceSaleId: line.sourceSaleId, sourceLineId: line.sourceLineId, sourceProductId: line.sourceId,
      expected: { writeDate: original.write_date ?? null, quantity: line.quantity, totalCost: line.originalTotalCost,
        net: line.originalNet, gross: line.gross, tax: line.recordedTax, refundedOrderlineId: original.refunded_orderline_id ?? null },
      proposed: { totalCost: line.proposedTotalCost, net: line.proposedNet, gross: line.gross, tax: line.sourceTax },
      evidence: { sourceMatched: evidence.verified === true, historicalCostDocument: object(original.cost_evidence).documentRef ?? null,
        receiptId: line.receiptId, receiptLine: line.receiptLine, costMethod: line.costMethod },
      status: line.status, blockers: line.issues,
      needsChange: (line.proposedTotalCost !== null && line.originalTotalCost !== null && Math.abs(line.proposedTotalCost - line.originalTotalCost) >= 0.005)
        || (line.proposedNet !== null && line.originalNet !== null && Math.abs(line.proposedNet - line.originalNet) >= 0.005),
      originalCostComputed: original.is_total_cost_computed === true,
    };
  }));
  const orderIds = new Set(rows.map(row => row.orderId));
  const orders = snapshot.orders.filter(order => orderIds.has(order.id)).map(order => ({ id: order.id,
    expected: { writeDate: order.write_date ?? null, total: amount(order.amount_total), tax: amount(order.amount_tax), state: order.state ?? null },
    lineIds: snapshot.lines.filter(line => Array.isArray(line.order_id) && line.order_id[0] === order.id).map(line => line.id),
    taxMismatch: order.audit_tax_mismatch === true }));
  return { version: "cost-repair-v2", batchId: audit.batchId, sourceHash: audit.sourceHash, ruleVersion: audit.ruleVersion,
    scope: { companyId: audit.companyId, store: audit.store, timezone: audit.timezone, from: audit.from, to: audit.to },
    dryRun: true, businessWrites: 0, executable: false,
    executionGates: ["RESTORED_BACKUP_REQUIRED", "EXACT_MANIFEST_APPROVAL_REQUIRED", "SOURCE_AND_TARGET_REVALIDATION_REQUIRED", "ORDER_WIDE_TAX_RECONCILIATION_REQUIRED"],
    coverage: snapshot.coverage ?? null, summary: { lines: rows.length, needsChange: rows.filter(row => row.needsChange).length,
      blocked: rows.filter(row => row.blockers.length > 0).length, correctionSupported: rows.filter(row => row.status === "correctable").length },
    orders, rows };
}
