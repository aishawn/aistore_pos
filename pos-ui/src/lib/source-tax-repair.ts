import { amount, auditTime, object, relationId, type AuditSnapshot } from "./cost-reconciliation.ts";
import { sourceOrderUuid } from "./cost-reconciliation-source.ts";

const micro = (n: number) => BigInt(n.toFixed(6).replace(".", ""));
const decimal = (n: bigint) => Number(n) / 1e6;
const same = (a: unknown, b: unknown) => amount(a) !== null && amount(b) !== null && micro(Number(a)) === micro(Number(b));

/** Tax mapping only. Costs, stock and accounting postings require separate reconciliation. */
export function sourceTaxRepairPlan(snapshot: AuditSnapshot, sourceHash: string) {
  const start = auditTime(snapshot.from), end = auditTime(snapshot.to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw Error("Invalid repair period");
  const products = new Map(snapshot.products.map(p => [p.id, p]));
  const sources = new Map((snapshot.sourceSales ?? []).map(s => [sourceOrderUuid(snapshot.store, String(s.external_id)), s]));
  if (sources.size !== (snapshot.sourceSales ?? []).length || new Set(snapshot.lines.map(l => l.id)).size !== snapshot.lines.length
    || new Set(snapshot.orders.map(o => o.id)).size !== snapshot.orders.length) throw Error("Duplicate snapshot identities");
  const byOrder = new Map<number, typeof snapshot.lines>();
  for (const line of snapshot.lines) {
    const id = relationId(line.order_id), lines = byOrder.get(id) ?? [];
    lines.push(line); byOrder.set(id, lines);
  }
  const orders = snapshot.orders.map(order => {
    const lines = byOrder.get(order.id) ?? [], source = sources.get(String(order.uuid)), raw = object(object(source?.raw_payload).raw_payload);
    const rawLines = Array.isArray(raw.items) ? raw.items.map(object) : [];
    const blockers: string[] = [];
    if (!Number.isFinite(auditTime(order.date_order)) || auditTime(order.date_order) < start || auditTime(order.date_order) >= end) blockers.push("TARGET_ORDER_OUTSIDE_PERIOD");
    if (relationId(order.company_id) !== snapshot.companyId || !["paid", "done", "invoiced"].includes(String(order.state))) blockers.push("TARGET_ORDER_SCOPE_INVALID");
    if (!source || raw.status !== "COMPLETED" || String(raw.id || "") !== String(source.external_id)
      || !Number.isFinite(auditTime(raw.createdAt)) || auditTime(raw.createdAt) !== auditTime(source.created_at)
      || auditTime(raw.createdAt) !== auditTime(order.date_order)) blockers.push("COMPLETED_SOURCE_IDENTITY_REQUIRED");
    if (!same(raw.totalPrice, source?.total_price) || !same(raw.totalTax, source?.total_tax)
      || !same(raw.totalPrice, order.amount_total)) blockers.push("SOURCE_ORDER_TOTAL_MISMATCH");
    if (!rawLines.length || rawLines.length !== lines.length) blockers.push("ORDER_LINES_INCOMPLETE");
    if (!order.write_date || amount(order.amount_tax) === null) blockers.push("TARGET_PRECONDITIONS_MISSING");
    const ids = rawLines.map(l => String(l.id || ""));
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) blockers.push("SOURCE_LINE_IDS_INVALID");
    let sourceGross = BigInt(0), sourceTax = BigInt(0);
    for (const line of rawLines) {
      const gross = amount(line.totalPrice), tax = amount(line.tax), qty = amount(line.quantity);
      if (gross === null || tax === null || qty === null || qty === 0 || !String(object(line.item).id || "")) blockers.push("SOURCE_LINE_AMOUNTS_INVALID");
      else {
        sourceGross += micro(gross); sourceTax += micro(tax);
        if (Math.abs(tax) > Math.abs(gross) || (tax && gross && Math.sign(tax) !== Math.sign(gross))) blockers.push("SOURCE_LINE_TAX_INVALID");
      }
    }
    // Even a one-cent source discrepancy must be explained, not redistributed.
    if (!same(decimal(sourceGross), raw.totalPrice) || !same(decimal(sourceTax), raw.totalTax)) blockers.push("SOURCE_LINE_ORDER_DIFFERENCE");
    const used = new Set<string>();
    const proposals = lines.map(line => {
      const product = products.get(relationId(line.product_id)), stable = typeof line.shopfront_source_line_ref === "string" ? line.shopfront_source_line_ref : "";
      const matches = rawLines.filter(original => String(product?.shopfront_source_ref || "") === `${snapshot.store}:${object(original.item).id}`
        && same(original.quantity, line.qty) && same(original.totalPrice, line.price_subtotal_incl)
        && (!stable || stable === `${snapshot.store}:${original.id}`));
      const original = matches.length === 1 ? matches[0] : undefined, id = String(original?.id || "");
      if (!original || used.has(id)) blockers.push("LINE_MATCH_AMBIGUOUS_OR_MISSING");
      used.add(id);
      if (!line.write_date || amount(line.price_subtotal) === null || amount(line.price_subtotal_incl) === null) blockers.push("TARGET_PRECONDITIONS_MISSING");
      const price = amount(line.price_unit), discount = amount(line.discount), quantity = amount(line.qty);
      if (price === null || discount === null || discount < 0 || discount > 100 || !Array.isArray(line.tax_ids)
        || line.tax_ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(line.tax_ids).size !== line.tax_ids.length) blockers.push("TARGET_TAX_INPUTS_MISSING_OR_INVALID");
      const gross = amount(original?.totalPrice), tax = amount(original?.tax);
      const net = gross !== null && tax !== null ? decimal(micro(gross) - micro(tax)) : null;
      const pricingAgrees = price !== null && discount !== null && quantity !== null && same(price * quantity * (1 - discount / 100), gross);
      // The source paid line amount supports an effective unit price, not an
      // invented historical list price or discount. Preserve matching inputs.
      const paidUnit = gross !== null && quantity !== null && quantity !== 0 ? Number((gross / quantity).toFixed(6)) : null;
      if (paidUnit === null || !Number.isFinite(paidUnit)) blockers.push("SOURCE_PAID_UNIT_PRICE_INVALID");
      return { id: line.id, sourceLineId: id || null, productId: relationId(line.product_id),
        expected: { writeDate: line.write_date ?? null, quantity: line.qty, net: line.price_subtotal, gross: line.price_subtotal_incl,
          priceUnit: line.price_unit ?? null, discount: line.discount ?? null, taxIds: line.tax_ids ?? null,
          sourceLineRef: line.shopfront_source_line_ref ?? false, totalCost: line.total_cost ?? null, costComputed: line.is_total_cost_computed ?? null },
        sourcePricing: { basePrice: amount(original?.basePrice), quantity, paidGross: gross, tax },
        pricingBasis: pricingAgrees ? "preserved_target_inputs" : "source_paid_unit_normalization",
        taxConfigurationReviewRequired: true,
        proposed: { price_subtotal: net, price_subtotal_incl: gross, price_unit: pricingAgrees ? price : paidUnit, discount: pricingAgrees ? discount : 0 },
        needsChange: !same(net, line.price_subtotal) || !pricingAgrees || (tax !== null && tax !== 0 && Array.isArray(line.tax_ids) && !line.tax_ids.length) };
    });
    if (used.size !== rawLines.length) blockers.push("ORDER_LINES_NOT_BIJECTIVE");
    const reasons = [...new Set(blockers)];
    return { id: order.id, sourceSaleId: source?.external_id ?? null,
      status: reasons.length ? "review" : "source_tax_supported", blockers: reasons,
      expected: { writeDate: order.write_date ?? null, state: order.state, total: order.amount_total, tax: order.amount_tax,
        sessionId: relationId(order.session_id) || null, accountMoveId: relationId(order.account_move) || null },
      proposed: reasons.length ? null : { amount_tax: amount(raw.totalTax) },
      needsChange: !reasons.length && (proposals.some(l => l.needsChange) || !same(order.amount_tax, raw.totalTax)),
      lines: reasons.length ? [] : proposals };
  });
  const coverageComplete = snapshot.coverage?.allProducts === true && snapshot.coverage.sourceRowsComplete === true
    && snapshot.coverage.totalLines === snapshot.lines.length && snapshot.coverage.totalOrders === snapshot.orders.length;
  return { version: "source-tax-repair-v2", sourceHash,
    scope: { companyId: snapshot.companyId, store: snapshot.store, from: snapshot.from, to: snapshot.to },
    dryRun: true, executable: false, businessWrites: 0, changesCosts: false, accountingCostsVerified: false,
    coverageComplete, executionBlockers: ["LIVE_SOURCE_AND_TARGET_REVALIDATION_REQUIRED", "ODOO_TAX_RECOMPUTATION_NOT_VERIFIED", "HISTORICAL_TAX_DEFINITION_REQUIRED", "ODOO_PRICE_PRECISION_NOT_VERIFIED", "POSTED_ACCOUNTING_IMPACT_NOT_CHECKED", ...(!coverageComplete ? ["FULL_SCOPE_REQUIRED"] : [])],
    summary: { orders: orders.length, supported: orders.filter(o => !o.blockers.length).length,
      review: orders.filter(o => o.blockers.length).length, needsChange: orders.filter(o => o.needsChange).length,
      supportedLines: orders.reduce((n, o) => n + o.lines.length, 0) }, orders };
}
