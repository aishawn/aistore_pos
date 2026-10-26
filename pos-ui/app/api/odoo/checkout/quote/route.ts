import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";
import { resolveCartPrices, priceSignature } from "@/lib/odoo-pricing";
import { requirePermission, StoreAccessError } from "@/lib/store-access";
import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_LINES = 80;
type Relation = [number, string] | false;
type RpcResult<T> = { result?: T; error?: { message?: string; data?: { message?: string } } };
type PosConfig = {
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
type Product = { id: number; name: string; lst_price: number; taxes_id: number[]; available_in_pos: boolean; free_qty: number };
type TaxTotals = { total_excluded: number; total_included: number };
type CashRounding = { id: number; rounding: number; rounding_method: "UP" | "DOWN" | "HALF-UP" };
class QuoteError extends Error { constructor(message: string, public readonly status = 422) { super(message); } }

function baseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new QuoteError("Orithos connection is not configured on the POS server.", 503);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new QuoteError("Orithos connection must use HTTPS.", 503);
  return value;
}

function roundCashTotal(amount: number, rounding: { rounding: number; rounding_method: "UP" | "DOWN" | "HALF-UP" }) {
  if (!Number.isFinite(rounding.rounding) || rounding.rounding <= 0) throw new QuoteError("This register has an invalid cash rounding setting.", 409);
  const ratio = amount / rounding.rounding;
  const units = rounding.rounding_method === "UP" ? Math.ceil(ratio - 1e-9) : rounding.rounding_method === "DOWN" ? Math.floor(ratio + 1e-9) : Math.floor(ratio + 0.5 + 1e-9);
  return Math.round(units * rounding.rounding * 100) / 100;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
  const correlationId = request.headers.get("x-correlation-id");

  let body: { configId?: number; customerId?: number | null; paymentMethodId?: number; lines?: { productId: number; quantity: number; uomFactor?: number; discountPercent?: number }[] };
  try { body = await request.json(); } catch { return NextResponse.json({ message: "Invalid cart quote request" }, { status: 400 }); }
  if (!Number.isInteger(body.configId) || !Number.isInteger(body.paymentMethodId) || !Array.isArray(body.lines) || !body.lines.length || body.lines.length > MAX_LINES) {
    return NextResponse.json({ message: "Choose a register, payment method and valid cart items." }, { status: 400 });
  }
  if (body.lines.some((line) => !Number.isInteger(line.productId) || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 1000 || !Number.isFinite(line.uomFactor ?? 1) || (line.uomFactor ?? 1) <= 0 || (line.uomFactor ?? 1) > 1000 || !Number.isFinite(line.discountPercent ?? 0) || (line.discountPercent ?? 0) < 0 || (line.discountPercent ?? 0) > 100)) {
    return NextResponse.json({ message: "Cart quantities or pack sizes are invalid." }, { status: 400 });
  }

  try {
    await requirePermission(request, "sell.checkout");
    const pricingScope = await scopedOdoo(request);
    const sessionInfoResponse = await fetch(`${baseUrl()}/web/session/get_session_info`, {
      method: "POST", headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${session}` }, request),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }), cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    const sessionInfo = await sessionInfoResponse.json() as RpcResult<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    if (!sessionInfoResponse.ok || sessionInfo.error || !sessionInfo.result?.uid) throw new QuoteError("Orithos session expired", 401);
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(session, sessionInfo.result, correlationId);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) throw new QuoteError(forced.error, forced.status);
    const companyIds = forced.companyIds;
    if (!companyIds.length) throw new QuoteError("This Orithos user has no accessible company.", 403);

    const rpc = <T>(_session: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, _correlation?: string | null) => { void _correlation; return pricingScope.rpc<T>(model, method, args, kwargs); };
    const searchRead = <T>(_session: string, model: string, domain: unknown[], fields: string[], limit = 100, _correlation?: string | null) => { void _correlation; return pricingScope.rpc<T[]>(model, "search_read", [domain], { fields, limit }); };

    const configs = await searchRead<PosConfig>(session, "pos.config", [["id", "=", body.configId], ["company_id", "in", companyIds]], ["id", "name", "company_id", "current_session_id", "payment_method_ids", "pricelist_id", "default_fiscal_position_id", "currency_id", "cash_rounding", "only_round_cash_method", "rounding_method"], 1, correlationId);
    const config = configs[0];
    if (!config) throw new QuoteError("This register is not available to your Orithos user.", 403);
    if (!Array.isArray(config.current_session_id)) throw new QuoteError("This register has no open POS session.", 409);
    if (!config.payment_method_ids.includes(body.paymentMethodId!)) throw new QuoteError("That payment method is not enabled for this register.", 403);

    const [sessionId] = config.current_session_id;
    const opened = await searchRead<{ id: number }>(session, "pos.session", [["id", "=", sessionId], ["state", "=", "opened"], ["config_id", "=", config.id]], ["id"], 1, correlationId);
    if (!opened.length) throw new QuoteError("The POS session has closed. Refresh the register.", 409);

    const products = await searchRead<Product>(session, "product.product", [["id", "in", [...new Set(body.lines.map((line) => line.productId))]], ["available_in_pos", "=", true]], ["id", "name", "lst_price", "taxes_id", "available_in_pos", "free_qty"], MAX_LINES, correlationId);
    if (products.length !== new Set(body.lines.map((line) => line.productId)).size) throw new QuoteError("One or more products are no longer available in this POS.", 409);
    const productMap = new Map(products.map((product) => [product.id, product]));
    const requestedByProduct = new Map<number, number>();
    for (const line of body.lines) requestedByProduct.set(line.productId, (requestedByProduct.get(line.productId) ?? 0) + line.quantity * (line.uomFactor ?? 1));
    for (const [productId, requested] of requestedByProduct) {
      const product = productMap.get(productId)!;
      if (!Number.isFinite(product.free_qty) || requested > product.free_qty + 1e-9) {
        throw new QuoteError(`Only ${Number.isFinite(product.free_qty) ? product.free_qty : 0} units of ${product.name} are available.`, 409);
      }
    }
    const paymentMethods = await searchRead<{ id: number; is_cash_count: boolean }>(session, "pos.payment.method", [["id", "=", body.paymentMethodId]], ["id", "is_cash_count"], 1, correlationId);
    if (!paymentMethods.length) throw new QuoteError("The selected payment method is unavailable.", 409);

    let fiscalPosition: Relation = config.default_fiscal_position_id;
    if (body.customerId != null) {
      if ((!Number.isSafeInteger(body.customerId) || body.customerId < 1)) throw new QuoteError("The customer selection is invalid.", 400);
      const customers = await searchRead<{ id: number; property_account_position_id: Relation }>(session, "res.partner", [["id", "=", body.customerId], ["company_id", "in", companyIds]], ["id", "property_account_position_id"], 1, correlationId);
      if (!customers.length) throw new QuoteError("The selected customer is unavailable.", 409);
      fiscalPosition = customers[0].property_account_position_id || fiscalPosition;

    }
    const prices = await resolveCartPrices(pricingScope, config.id, body.customerId, body.lines);
    const fiscalPositionId = Array.isArray(fiscalPosition) ? fiscalPosition[0] : null;
    let subtotal = 0;
    let total = 0;
    const quotedLines: { productId: number; quantity: number; uomFactor: number; unitPrice: number; priceSource: string; subtotal: number; tax: number; total: number }[] = [];
    for (const line of body.lines) {
      const product = productMap.get(line.productId)!;
      let taxIds = product.taxes_id;
      if (fiscalPositionId && taxIds.length) taxIds = await rpc<number[]>(session, "account.fiscal.position", "map_tax", [[fiscalPositionId], taxIds], {}, correlationId);
      const effectiveQuantity = line.quantity * (line.uomFactor ?? 1);
      const unitPrice = prices.prices.find((price) => price.productId === product.id)!.unitPrice;
      const discountedUnitPrice = unitPrice * (1 - (line.discountPercent ?? 0) / 100);
      const totals = taxIds.length
        ? await rpc<TaxTotals>(session, "account.tax", "compute_all", [taxIds, discountedUnitPrice, null, effectiveQuantity, false, false], {}, correlationId)
        : { total_excluded: discountedUnitPrice * effectiveQuantity, total_included: discountedUnitPrice * effectiveQuantity };
      if (!Number.isFinite(totals.total_excluded) || !Number.isFinite(totals.total_included)) throw new QuoteError(`Could not calculate tax for ${product.name}.`);
      subtotal += totals.total_excluded;
      total += totals.total_included;
      quotedLines.push({
        productId: product.id,
        quantity: line.quantity,
        unitPrice, priceSource: prices.priceSourceName,
        uomFactor: line.uomFactor ?? 1,
        subtotal: Math.round(totals.total_excluded * 100) / 100,
        tax: Math.round((totals.total_included - totals.total_excluded) * 100) / 100,
        total: Math.round(totals.total_included * 100) / 100,
      });
    }
    const taxTotal = Math.round((total - subtotal) * 100) / 100;
    subtotal = Math.round(subtotal * 100) / 100;
    total = Math.round(total * 100) / 100;

    let rounding: CashRounding | null = null;
    const cashSelected = paymentMethods[0].is_cash_count;
    if (config.cash_rounding && (!config.only_round_cash_method || cashSelected)) {
      const roundingId = Array.isArray(config.rounding_method) ? config.rounding_method[0] : null;
      if (!roundingId) throw new QuoteError("This register has cash rounding enabled but no rounding rule configured.", 409);
      rounding = (await searchRead<CashRounding>(session, "account.cash.rounding", [["id", "=", roundingId]], ["id", "rounding", "rounding_method"], 1, correlationId))[0] ?? null;
      if (!rounding) throw new QuoteError("The register cash rounding rule is unavailable.", 409);
    }
    const amountDue = rounding ? roundCashTotal(total, rounding) : total;
    const signature = priceSignature({ configId: config.id, paymentMethodId: body.paymentMethodId!, customerId: body.customerId ?? null, lines: body.lines, prices, totals: { subtotal, tax: taxTotal, total: amountDue } });
    return NextResponse.json({ signature, priceSource: prices.priceSourceName, currency: prices.currency, subtotal, tax: taxTotal, total: amountDue, unroundedTotal: total, lines: quotedLines }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos could not calculate the cart total.";
    const status = error instanceof QuoteError || error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
