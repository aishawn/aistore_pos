import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_LINES = 80;

type RpcResult<T> = { result?: T; error?: { message?: string; data?: { message?: string } } };
type Relation = [number, string] | false;

type OdooConfig = {
  id: number;
  name: string;
  company_id: Relation;
  current_session_id: Relation;
  payment_method_ids: number[];
  pricelist_id: Relation;
  default_fiscal_position_id: Relation;
  currency_id: Relation;
  cash_rounding: boolean;
  only_round_cash_method: boolean;
  rounding_method: Relation;
};

type OdooProduct = {
  id: number;
  name: string;
  lst_price: number;
  taxes_id: number[];
  available_in_pos: boolean;
  free_qty: number;
  uom_id: Relation;
};

type OdooCustomer = {
  id: number;
  property_product_pricelist: Relation;
  property_account_position_id: Relation;
};

type OdooRefundSourceLine = {
  id: number;
  product_id: Relation;
  qty: number;
  refunded_qty: number;
  price_unit: number;
  discount: number;
  tax_ids: number[];
};

type TaxTotals = { total_excluded: number; total_included: number };
type OdooPaymentMethod = { id: number; name: string; is_cash_count: boolean; type: string };
type OdooCashRounding = { id: number; rounding: number; rounding_method: "UP" | "DOWN" | "HALF-UP" };

class OdooSessionExpiredError extends Error {}
class OdooCheckoutError extends Error {
  constructor(message: string, public readonly status = 422) { super(message); }
}

function getBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new OdooCheckoutError("Odoo connection is not configured on the POS server.", 503);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new OdooCheckoutError("Odoo connection must use HTTPS.", 503);
  }
  return value;
}

function roundCashTotal(amount: number, rounding: OdooCashRounding) {
  if (!Number.isFinite(rounding.rounding) || rounding.rounding <= 0) {
    throw new OdooCheckoutError("This register has an invalid cash rounding setting.", 409);
  }
  const sign = amount < 0 ? -1 : 1;
  const ratio = Math.abs(amount) / rounding.rounding;
  const rounded = rounding.rounding_method === "UP"
    ? Math.ceil(ratio - 1e-9)
    : rounding.rounding_method === "DOWN"
      ? Math.floor(ratio + 1e-9)
      : Math.floor(ratio + 0.5 + 1e-9);
  return sign * Math.round(rounded * rounding.rounding * 100) / 100;
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  const response = await fetch(`${getBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `session_id=${sessionId}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { model, method, args, kwargs },
      id: Date.now(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new OdooCheckoutError("Odoo did not accept the POS request.", 502);
  const payload = (await response.json()) as RpcResult<T>;
  if (payload.error) {
    const detail = payload.error.data?.message || payload.error.message || "";
    if (/session|log in|authenticate/i.test(detail)) throw new OdooSessionExpiredError();
    throw new OdooCheckoutError(detail || "Odoo rejected the POS request. Check register, tax and payment configuration.");
  }
  if (payload.result === undefined) throw new OdooCheckoutError("Odoo returned an empty POS response.", 502);
  return payload.result;
}

async function searchRead<T>(sessionId: string, model: string, domain: unknown[], fields: string[], limit = 100) {
  return rpc<T[]>(sessionId, model, "search_read", [domain], { fields, limit });
}

/** Resolve unit price via Odoo pricelist rules; fall back to list price only when no pricelist is set. */
async function resolveUnitPrice(
  sessionId: string,
  pricelistId: number | null,
  product: OdooProduct,
  quantity: number,
  partnerId: number | false,
): Promise<number> {
  const fallback = Number(product.lst_price);
  if (!pricelistId) {
    if (!Number.isFinite(fallback) || fallback < 0) {
      throw new OdooCheckoutError(`Product ${product.name} has no valid price.`);
    }
    return fallback;
  }

  const qty = Number.isFinite(quantity) && quantity !== 0 ? Math.abs(quantity) : 1;
  try {
    // Odoo record method: product.pricelist._get_product_price(product, quantity=…, partner=…)
    const priced = await rpc<number>(
      sessionId,
      "product.pricelist",
      "_get_product_price",
      [[pricelistId], product.id],
      { quantity: qty, partner: partnerId || false },
    );
    const unit = Number(priced);
    if (Number.isFinite(unit) && unit >= 0) return unit;
  } catch (error) {
    if (error instanceof OdooSessionExpiredError) throw error;
    // Some Odoo builds expect a product recordset kwargs shape instead of positional id.
    try {
      const priced = await rpc<number>(
        sessionId,
        "product.pricelist",
        "_get_product_price",
        [[pricelistId]],
        { product: product.id, quantity: qty, partner: partnerId || false },
      );
      const unit = Number(priced);
      if (Number.isFinite(unit) && unit >= 0) return unit;
    } catch (inner) {
      if (inner instanceof OdooSessionExpiredError) throw inner;
      throw new OdooCheckoutError(
        `Could not resolve Odoo pricelist price for ${product.name}. Check the register pricelist in Odoo.`,
        409,
      );
    }
  }

  if (!Number.isFinite(fallback) || fallback < 0) {
    throw new OdooCheckoutError(`Product ${product.name} has no valid price.`);
  }
  return fallback;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const odooSession = request.cookies.get(SESSION_COOKIE)?.value;
  if (!odooSession) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  let body: {
    configId?: number;
    paymentMethodId?: number;
    orderUuid?: string;
    customerId?: number | null;
    tendered?: number;
    refundOfOrderId?: number | null;
    lines?: { productId: number; quantity: number; uomFactor?: number; refundedOrderLineId?: number }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid checkout request" }, { status: 400 });
  }

  if (!Number.isInteger(body.configId) || !Number.isInteger(body.paymentMethodId)) {
    return NextResponse.json({ message: "Choose an Odoo register and payment method." }, { status: 400 });
  }
  if (!body.orderUuid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.orderUuid)) {
    return NextResponse.json({ message: "A valid order id is required so retries cannot create a duplicate sale." }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > MAX_LINES) {
    return NextResponse.json({ message: `A sale must contain between 1 and ${MAX_LINES} items.` }, { status: 400 });
  }

  const isRefund = body.refundOfOrderId != null;
  if (isRefund && (!Number.isInteger(body.refundOfOrderId) || body.refundOfOrderId! < 1)) {
    return NextResponse.json({ message: "Choose a valid original sale for this refund." }, { status: 400 });
  }
  if (body.lines.some((line) => isRefund ? line.quantity >= 0 : line.quantity <= 0)) {
    return NextResponse.json({ message: isRefund ? "Refund quantities must all be negative." : "Sale quantities must all be positive." }, { status: 400 });
  }
  if (body.lines.some((line) => {
    const factor = line.uomFactor ?? 1;
    return !Number.isInteger(line.productId)
      || !Number.isFinite(line.quantity)
      || line.quantity === 0
      || Math.abs(line.quantity) > 1000
      || !Number.isFinite(factor)
      || factor <= 0
      || factor > 1000
      || (isRefund && (!Number.isInteger(line.refundedOrderLineId) || line.refundedOrderLineId! < 1))
      || (!isRefund && line.refundedOrderLineId != null);
  })) {
    return NextResponse.json({ message: "Sale quantities, pack sizes or product ids are invalid." }, { status: 400 });
  }

  const tendered = Number(body.tendered);
  if (!Number.isFinite(tendered) || tendered < 0 || tendered > 1_000_000) {
    return NextResponse.json({ message: "The payment amount is invalid." }, { status: 400 });
  }
  if (!isRefund && tendered <= 0) {
    return NextResponse.json({ message: "The payment amount is invalid." }, { status: 400 });
  }

  try {
    const sessionInfoResponse = await fetch(`${getBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session_id=${odooSession}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const sessionInfo = (await sessionInfoResponse.json()) as RpcResult<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    const uid = sessionInfo.result?.uid;
    const companyIds = await resolveOdooAllowedCompanyIds(odooSession, sessionInfo.result);
    if (!sessionInfoResponse.ok || sessionInfo.error || !uid) throw new OdooSessionExpiredError();
    if (!companyIds.length) throw new OdooCheckoutError("This Odoo user has no accessible company.", 403);

    const configs = await searchRead<OdooConfig>(odooSession, "pos.config", [
      ["id", "=", body.configId],
      ["company_id", "in", companyIds],
    ], ["id", "name", "company_id", "current_session_id", "payment_method_ids", "pricelist_id", "default_fiscal_position_id", "currency_id", "cash_rounding", "only_round_cash_method", "rounding_method"], 1);
    const config = configs[0];
    if (!config) throw new OdooCheckoutError("This register is not available to your Odoo user.", 403);
    if (!Array.isArray(config.current_session_id)) throw new OdooCheckoutError("This register has no open POS session. Open a session in Odoo first.", 409);
    if (!config.payment_method_ids.includes(body.paymentMethodId!)) throw new OdooCheckoutError("That payment method is not enabled for this register.", 403);
    const [sessionId, sessionName] = config.current_session_id;
    const sessions = await searchRead<{ id: number; state: string }>(odooSession, "pos.session", [
      ["id", "=", sessionId],
      ["state", "=", "opened"],
      ["config_id", "=", config.id],
    ], ["id", "state"], 1);
    if (!sessions.length) throw new OdooCheckoutError("The POS session has closed. Refresh the register and try again.", 409);

    const paymentMethods = await searchRead<OdooPaymentMethod>(odooSession, "pos.payment.method", [["id", "=", body.paymentMethodId]], ["id", "name", "is_cash_count", "type"], 1);
    const paymentMethod = paymentMethods[0];
    if (!paymentMethod) throw new OdooCheckoutError("The selected payment method is unavailable.", 409);
    let cashRounding: OdooCashRounding | null = null;
    if (config.cash_rounding) {
      const roundingId = Array.isArray(config.rounding_method) ? config.rounding_method[0] : null;
      if (!roundingId) throw new OdooCheckoutError("This register has cash rounding enabled but no rounding rule configured.", 409);
      const roundingMethods = await searchRead<OdooCashRounding>(odooSession, "account.cash.rounding", [["id", "=", roundingId]], ["id", "rounding", "rounding_method"], 1);
      cashRounding = roundingMethods[0] ?? null;
      if (!cashRounding) throw new OdooCheckoutError("The register cash rounding rule is unavailable.", 409);
    }

    let customer: OdooCustomer | null = null;
    if (body.customerId != null) {
      if (!Number.isInteger(body.customerId)) throw new OdooCheckoutError("The customer selection is invalid.", 400);
      const customers = await searchRead<OdooCustomer>(odooSession, "res.partner", [["id", "=", body.customerId]], ["id", "property_product_pricelist", "property_account_position_id"], 1);
      customer = customers[0] ?? null;
      if (!customer) throw new OdooCheckoutError("The selected customer is no longer available.", 409);
    }

    // Customer pricelist wins when set; otherwise use the register pricelist.
    const configPricelist = Array.isArray(config.pricelist_id) ? config.pricelist_id[0] : null;
    const customerPricelist = customer && Array.isArray(customer.property_product_pricelist)
      ? customer.property_product_pricelist[0]
      : null;
    const pricelist = customerPricelist || configPricelist;

    if (pricelist && !isRefund) {
      const pricelists = await searchRead<{ id: number; currency_id: Relation }>(odooSession, "product.pricelist", [["id", "=", pricelist]], ["id", "currency_id"], 1);
      const configuredCurrencyId = Array.isArray(config.currency_id) ? config.currency_id[0] : null;
      const pricelistCurrencyId = Array.isArray(pricelists[0]?.currency_id) ? pricelists[0].currency_id[0] : null;
      if (configuredCurrencyId && pricelistCurrencyId && configuredCurrencyId !== pricelistCurrencyId) {
        throw new OdooCheckoutError("This register uses a different-currency pricelist. Currency conversion must be connected before checkout.", 409);
      }
    }

    let originalOrder: {
      id: number;
      amount_total: number;
      pricelist_id: Relation;
      fiscal_position_id: Relation;
      partner_id: Relation;
    } | null = null;
    let refundSourceLines = new Map<number, OdooRefundSourceLine>();
    if (isRefund) {
      const originals = await searchRead<{
        id: number;
        state: string;
        company_id: Relation;
        lines: number[];
        amount_total: number;
        pricelist_id: Relation;
        fiscal_position_id: Relation;
        partner_id: Relation;
      }>(odooSession, "pos.order", [
        ["id", "=", body.refundOfOrderId],
        ["company_id", "in", companyIds],
        ["config_id", "=", config.id],
        ["state", "in", ["paid", "done", "invoiced"]],
      ], ["id", "state", "company_id", "config_id", "lines", "amount_total", "pricelist_id", "fiscal_position_id", "partner_id"], 1);
      const original = originals[0];
      if (!original) throw new OdooCheckoutError("The original sale was not found or cannot be refunded.", 404);
      if (original.amount_total <= 0) throw new OdooCheckoutError("Only a positive original sale can be refunded.", 409);
      const originalPartnerId = Array.isArray(original.partner_id) ? original.partner_id[0] : null;
      if ((body.customerId ?? null) !== originalPartnerId) {
        throw new OdooCheckoutError("The refund customer must match the original sale.", 400);
      }
      originalOrder = original;

      const originalLines = original.lines.length
        ? await searchRead<OdooRefundSourceLine>(
          odooSession,
          "pos.order.line",
          [["id", "in", original.lines], ["order_id", "=", original.id]],
          ["id", "product_id", "qty", "refunded_qty", "price_unit", "discount", "tax_ids"],
          MAX_LINES,
        )
        : [];
      const refundableLines = originalLines.filter((line) => line.qty > 0 && Number(line.refunded_qty || 0) === 0);
      if (refundableLines.length !== originalLines.filter((line) => line.qty > 0).length) {
        throw new OdooCheckoutError("This full-sale refund is unavailable because some items have already been refunded.", 409);
      }
      if (refundableLines.length !== body.lines.length) {
        throw new OdooCheckoutError("Refund lines must match every item on the original sale.", 400);
      }
      const originalLineById = new Map(refundableLines.map((line) => [line.id, line]));
      refundSourceLines = originalLineById;
      const seenOriginalLineIds = new Set<number>();
      for (const line of body.lines) {
        const originalLine = originalLineById.get(line.refundedOrderLineId!);
        const originalProductId = Array.isArray(originalLine?.product_id) ? originalLine.product_id[0] : null;
        const factor = line.uomFactor ?? 1;
        if (!originalLine || seenOriginalLineIds.has(originalLine.id) || originalProductId !== line.productId) {
          throw new OdooCheckoutError("A refund item does not match the original sale.", 400);
        }
        if (factor !== 1 || Math.abs(line.quantity + originalLine.qty) > 0.0001) {
          throw new OdooCheckoutError("Refund quantities must match the unrefunded quantity on the original sale.", 400);
        }
        seenOriginalLineIds.add(originalLine.id);
      }
    }

    const productIds = [...new Set(body.lines.map((line) => line.productId))];
    const productDomain: unknown[] = [
      ["id", "in", productIds],
    ];
    if (!isRefund) productDomain.push(["available_in_pos", "=", true]);
    const products = await searchRead<OdooProduct>(odooSession, "product.product", productDomain, ["id", "name", "lst_price", "taxes_id", "available_in_pos", "free_qty", "uom_id"], MAX_LINES);
    if (products.length !== productIds.length) throw new OdooCheckoutError("One or more products are no longer available in this POS.", 409);
    const productsById = new Map(products.map((product) => [product.id, product]));
    if (!isRefund) {
      const requestedByProduct = new Map<number, number>();
      for (const line of body.lines) requestedByProduct.set(line.productId, (requestedByProduct.get(line.productId) ?? 0) + line.quantity * (line.uomFactor ?? 1));
      for (const [productId, requested] of requestedByProduct) {
        const product = productsById.get(productId)!;
        if (!Number.isFinite(product.free_qty) || requested > product.free_qty + 1e-9) {
          throw new OdooCheckoutError(`Only ${Number.isFinite(product.free_qty) ? product.free_qty : 0} units of ${product.name} are available.`, 409);
        }
      }
    }

    const fiscalPosition = isRefund
      ? originalOrder?.fiscal_position_id || false
      : customer?.property_account_position_id || config.default_fiscal_position_id;
    const fiscalPositionId = Array.isArray(fiscalPosition) ? fiscalPosition[0] : null;
    const partnerId = isRefund && originalOrder
      ? (Array.isArray(originalOrder.partner_id) ? originalOrder.partner_id[0] : false)
      : customer?.id ?? false;
    const lineCommands: unknown[] = [];
    const receiptLines: { name: string; quantity: number; subtotal: number; total: number; packFactor?: number }[] = [];
    let taxTotal = 0;
    let total = 0;

    for (const inputLine of body.lines) {
      const product = productsById.get(inputLine.productId)!;
      const refundSourceLine = isRefund ? refundSourceLines.get(inputLine.refundedOrderLineId!) : null;
      const packFactor = inputLine.uomFactor && inputLine.uomFactor > 0 ? inputLine.uomFactor : 1;
      // Bottle/case: quantity is in sell units; packFactor scales for case packs (e.g. 12 bottles).
      const effectiveQty = inputLine.quantity * packFactor;
      const priceUnit = refundSourceLine
        ? Number(refundSourceLine.price_unit)
        : await resolveUnitPrice(odooSession, pricelist, product, effectiveQty, partnerId);
      const discount = refundSourceLine ? Number(refundSourceLine.discount || 0) : 0;
      if (!Number.isFinite(priceUnit) || priceUnit < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100) {
        throw new OdooCheckoutError(`The source price for ${product.name} is invalid.`, 409);
      }
      let taxIds = refundSourceLine ? refundSourceLine.tax_ids : product.taxes_id;
      if (!isRefund && fiscalPositionId && taxIds.length) {
        taxIds = await rpc<number[]>(odooSession, "account.fiscal.position", "map_tax", [[fiscalPositionId], taxIds]);
      }
      const discountedUnitPrice = priceUnit * (1 - discount / 100);
      const totals = taxIds.length
        ? await rpc<TaxTotals>(odooSession, "account.tax", "compute_all", [
          taxIds,
          discountedUnitPrice,
          null,
          effectiveQty,
          false,
          false,
        ])
        : { total_excluded: discountedUnitPrice * effectiveQty, total_included: discountedUnitPrice * effectiveQty };
      if (!Number.isFinite(totals.total_excluded) || !Number.isFinite(totals.total_included)) {
        throw new OdooCheckoutError(`Could not calculate tax for ${product.name}.`);
      }
      taxTotal += totals.total_included - totals.total_excluded;
      total += totals.total_included;
      const label = packFactor !== 1
        ? `${product.name} (${packFactor} ${Array.isArray(product.uom_id) ? product.uom_id[1] : "units"}/pack × ${inputLine.quantity})`
        : product.name;
      receiptLines.push({
        name: label,
        quantity: effectiveQty,
        subtotal: totals.total_excluded,
        total: totals.total_included,
        packFactor: packFactor !== 1 ? packFactor : undefined,
      });
      lineCommands.push([0, 0, {
        product_id: product.id,
        qty: effectiveQty,
        price_unit: priceUnit,
        discount,
        price_subtotal: totals.total_excluded,
        price_subtotal_incl: totals.total_included,
        tax_ids: [[6, 0, taxIds]],
        pack_lot_ids: [],
        ...(isRefund ? { refunded_orderline_id: inputLine.refundedOrderLineId } : {}),
      }]);
    }

    taxTotal = Math.round(taxTotal * 100) / 100;
    total = Math.round(total * 100) / 100;
    if (cashRounding && (!config.only_round_cash_method || paymentMethod.is_cash_count)) {
      total = roundCashTotal(total, cashRounding);
    }
    if (isRefund && originalOrder && Math.abs(Math.abs(total) - Math.abs(originalOrder.amount_total)) > 0.001) {
      throw new OdooCheckoutError("The refund total does not match the original sale. Use Odoo POS to complete this refund.", 409);
    }

    const amountDue = Math.abs(total);
    const roundedTender = Math.round(tendered * 100) / 100;
    if (isRefund) {
      // Refunds: tendered is the cash/card amount returned to the customer (positive).
      if (roundedTender + 0.001 < amountDue) {
        throw new OdooCheckoutError("Refund payment is less than the refund total.");
      }
      if (roundedTender > amountDue + 0.001 && paymentMethod.type !== "cash") {
        throw new OdooCheckoutError("Only a cash refund can include change. Enter the exact refund total for this payment method.");
      }
    } else {
      if (roundedTender + 0.001 < total) throw new OdooCheckoutError("Payment is less than the sale total.");
      if (roundedTender > total + 0.001 && paymentMethod.type !== "cash") {
        throw new OdooCheckoutError("Only a cash payment can include change. Enter the exact total for this payment method.");
      }
    }

    const paymentAmount = isRefund ? -Math.min(roundedTender, amountDue) : roundedTender;
    const change = isRefund
      ? Math.round(Math.max(0, roundedTender - amountDue) * 100) / 100
      : Math.round(Math.max(0, roundedTender - total) * 100) / 100;

    const date = new Date().toISOString().slice(0, 19).replace("T", " ");
    const uuid = body.orderUuid;
    const order: Record<string, unknown> = {
      amount_paid: isRefund ? paymentAmount : roundedTender,
      amount_return: change,
      amount_tax: taxTotal,
      amount_total: total,
      date_order: date,
      fiscal_position_id: fiscalPositionId || false,
      pricelist_id: isRefund && originalOrder
        ? (Array.isArray(originalOrder.pricelist_id) ? originalOrder.pricelist_id[0] : false)
        : pricelist || false,
      name: isRefund ? `Refund ${uuid}` : `Order ${uuid}`,
      is_refund: isRefund,
      last_order_preparation_change: "{}",
      lines: lineCommands,
      partner_id: partnerId,
      session_id: sessionId,
      payment_ids: [[0, 0, {
        amount: paymentAmount,
        name: date,
        payment_method_id: body.paymentMethodId,
      }]],
      uuid,
      user_id: uid,
      to_invoice: false,
    };
    const synced = await rpc<{
      "pos.order"?: { id: number; name: string; pos_reference?: string; amount_total: number; amount_tax: number }[];
    }>(odooSession, "pos.order", "sync_from_ui", [[order]]);
    const saved = synced["pos.order"]?.[0];
    if (!saved) throw new OdooCheckoutError("Odoo did not confirm the sale. Check the order history before retrying.", 502);

    return NextResponse.json({
      saleId: saved.id,
      receipt: saved.pos_reference || saved.name,
      total: saved.amount_total,
      gst: saved.amount_tax,
      subtotal: Math.round((saved.amount_total - saved.amount_tax) * 100) / 100,
      tendered: roundedTender,
      change,
      isRefund,
      lines: receiptLines,
      date,
      session: sessionName,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof OdooSessionExpiredError) {
      const response = NextResponse.json({ message: "Odoo session expired" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    const status = error instanceof OdooCheckoutError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Odoo checkout failed.";
    return NextResponse.json({ message }, { status });
  }
}
