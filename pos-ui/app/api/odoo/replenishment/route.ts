import { NextRequest, NextResponse } from "next/server";
import { resolveOdooAllowedCompanyIds } from "@/lib/odoo-companies";
import { resolveTenantForcedCompanyIds } from "@/lib/odoo-tenant-company";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";
import { readInventorySnapshotStatus } from "@/lib/inventory-snapshot-status";
import { readCompleteRows } from "@/lib/replenishment-pagination";
import type { ForecastBusinessCost } from "@/lib/forecast-business-cost";

import { getOdooCompanyTimezone } from "@/lib/odoo-store-timezone";
import { salesDate, shiftDay, localMidnightUtc, replenishmentIssues, replenishmentDemandIssues, stockoutProjection } from "@/lib/replenishment-safety";
import { isSupportedForecastModelVersion } from "@/lib/forecast-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const HISTORY_DAYS = 56;
const PERIOD_DAYS = 28;
const FORECAST_BATCH_SIZE = 500;
const REPLENISHMENT_CACHE_TTL_MS = 5 * 60 * 1000;
const COVERAGE_OPTIONS = new Set([7, 14, 21, 28, 42]);
const FORECAST_MODELS = new Set([
  "seasonal_naive_v1",
  "moving_average_7_v1",
  "exponential_smoothing_v1",
  "croston_sba_v1",
  "tsb_v1",
  "two_stage_occurrence_v1",
  "analog_category_brand_price_v1",
]);

const replenishmentCache = new Map<string, { expiresAt: number; body: Record<string, unknown> }>();

type RpcEnvelope<T> = { result?: T; error?: { message?: string } };

function getBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Orithos connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Orithos connection must use HTTPS");
  return value;
}

async function rpc<T>(sessionId: string, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}, correlationId?: string | null) {
  const headers = new Headers({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` });
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  const response = await fetch(`${getBaseUrl()}/web/dataset/call_kw`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { model, method, args, kwargs }, id: Date.now() }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Orithos replenishment data is unavailable");
  const payload = await response.json() as RpcEnvelope<T>;
  if (payload.error) {
    if (/session|authenticate|log in/i.test(payload.error.message ?? "")) throw new ReplenishmentSessionExpiredError();
    throw new Error("Your Orithos account cannot read the sales history needed for a replenishment plan.");
  }
  return payload.result;
}

class ReplenishmentSessionExpiredError extends Error {}
class ForecastServiceUnavailableError extends Error {}

type ForecastServiceItem = {
  productId: number;
  model?: string;
  selectionStatus?: string;
  selectionMetric?: string | null;
  candidateScores?: Record<string, number>;
  candidateBusinessCosts?: Record<string, ForecastBusinessCost>;
  selectionValidation?: Record<string, string | number>;
  dataQuality?: string;
  confidence?: string;
  analogCount?: number;
  forecast?: Array<{ p50?: number; p80?: number; p90?: number }>;
};

type ForecastServiceResponse = {
  model?: string;
  modelVersion?: string;
  sourceVersion?: string;
  costPolicy?: { annualHoldingRate: number; annualObsolescenceRate: number; serviceLevel: number };
  costPolicySource?: string;
  businessCostBasis?: string;
  items?: ForecastServiceItem[];
};

function forecastEnabled() {
  return process.env.AI_FORECAST_ENABLED?.trim().toLowerCase() === "true";
}

function purchaseDraftEnabled() {
  return process.env.AI_PURCHASE_DRAFT_ENABLED?.trim().toLowerCase() === "true";
}

function forecastBaseUrl() {
  return (process.env.AI_FORECAST_BASE_URL?.trim() || "http://forecast-service:8000").replace(/\/+$/, "");
}

async function callForecastService(payload: unknown): Promise<ForecastServiceResponse> {
  try {
    const timeout = Number(process.env.AI_FORECAST_READ_TIMEOUT_MS ?? 10_000);
    const response = await fetch(`${forecastBaseUrl()}/v1/forecast/sales`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(Number.isFinite(timeout) ? timeout : 10_000),
    });
    if (!response.ok) throw new Error(`forecast service returned ${response.status}`);
    const result = await response.json() as ForecastServiceResponse;
    if (!Array.isArray(result.items)) throw new Error("forecast service returned an invalid response");
    return result;
  } catch (error) {
    throw new ForecastServiceUnavailableError(error instanceof Error ? error.message : "forecast service unavailable");
  }
}

type DailySalesRow = Record<string, unknown> & {
  product_id?: [number, string] | false;
  qty?: number;
  "order_id.date_order"?: string;
  date_order?: string;
};

async function loadDailySales(sessionId: string, domain: unknown[], timezone: string, correlationId?: string | null): Promise<DailySalesRow[]> {
  // Apply order filters before reading lines so cold requests do not scan the full line table.
  type Order = { id?: number; date_order?: string };
  type Line = { id?: number; product_id?: [number, string] | false; order_id?: [number, string] | false; qty?: number };
  const orderDomain = domain.filter((c): c is [string, string, unknown] => Array.isArray(c) && c.length >= 3).filter(([field]) => field.startsWith("order_id.")).map(([field, op, value]) => [field.slice(10), op, value]);
  const orders: Order[] = []; let afterId = 0;
  while (true) {
    const page = await rpc<Order[]>(sessionId, "pos.order", "search_read", [[...orderDomain, ["id", ">", afterId]]], { fields: ["id", "date_order"], limit: 5000, order: "id asc" }, correlationId);
    if (!Array.isArray(page)) throw new Error("Sales history is incomplete; no plan was generated.");
    for (const order of page) { const id = Number(order.id); if (!Number.isSafeInteger(id) || id <= afterId || typeof order.date_order !== "string") throw new Error("Sales history pagination is incomplete; no plan was generated."); afterId = id; orders.push(order); }
    if (orders.length > 200000) throw new Error("Sales history exceeds the safe query limit; no plan was generated.");
    if (page.length < 5000) break;
  }
  if (!orders.length) return [];
  const dates = new Map(orders.map((order) => [Number(order.id), String(order.date_order)]));
  const ids = orders.map((order) => Number(order.id)); const lineDomain = domain.filter((clause): clause is [string, string, unknown] => Array.isArray(clause) && clause.length >= 3).filter(([field]) => !field.startsWith("order_id.")); const lines: Line[] = [];
  for (let offset = 0; offset < ids.length; offset += 5000) {
    const page = await rpc<Line[]>(sessionId, "pos.order.line", "search_read", [[...lineDomain, ["order_id", "in", ids.slice(offset, offset + 5000)]], { fields: ["id", "product_id", "order_id", "qty"], limit: 50000, order: "id asc" }, correlationId);
    if (!Array.isArray(page)) throw new Error("Sales history is incomplete; no plan was generated."); lines.push(...page); if (lines.length > 200000) throw new Error("Sales history exceeds the safe query limit; no plan was generated.");
  }
  const daily = new Map<string, DailySalesRow>();
  for (const row of lines) { const productId = Array.isArray(row.product_id) ? Number(row.product_id[0]) : 0; const orderId = Array.isArray(row.order_id) ? Number(row.order_id[0]) : 0; const orderDate = dates.get(orderId); if (!orderDate) throw new Error("An order date is missing; no plan was generated."); const date = salesDate(orderDate, timezone); const qty = Number(row.qty); if (productId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(qty)) continue; const key = `${productId}|${date}`; const current = daily.get(key); if (current) current.qty = Number(current.qty ?? 0) + qty; else daily.set(key, { product_id: row.product_id, qty, "order_id.date_order": date }); }
  return [...daily.values()];
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
  const correlationId = request.headers.get("x-correlation-id");

  const parsedCoverage = Number(request.nextUrl.searchParams.get("coverageDays") ?? 21);
  const coverageDays = COVERAGE_OPTIONS.has(parsedCoverage) ? parsedCoverage : 21;

  try {
    const sessionResponse = await fetch(`${getBaseUrl()}/web/session/get_session_info`, {
      method: "POST",
      headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: {}, id: Date.now() }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!sessionResponse.ok) throw new ReplenishmentSessionExpiredError();
    const session = await sessionResponse.json() as RpcEnvelope<{ uid?: number; user_context?: { allowed_company_ids?: number[] } }>;
    if (session.error || !session.result?.uid) throw new ReplenishmentSessionExpiredError();
    const sessionCompanyIds = await resolveOdooAllowedCompanyIds(sessionId, session.result, correlationId);
    const forced = await resolveTenantForcedCompanyIds(request, sessionCompanyIds);
    if (forced.error) return NextResponse.json({ message: forced.error }, { status: forced.status });
    const companyId = forced.companyIds[0];
    if (!companyId) return NextResponse.json({ message: "No Orithos companies are available to this user." }, { status: 403 });
    const cacheKey = `${companyId}:${coverageDays}`;
    const cacheEntry = request.nextUrl.searchParams.get("validateSales") === "true" ? null : replenishmentCache.get(cacheKey);
    if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
      return NextResponse.json({ ...cacheEntry.body, cache: { status: "HIT", expiresAt: new Date(cacheEntry.expiresAt).toISOString() } }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    if (cacheEntry) replenishmentCache.delete(cacheKey);

    const salesBaseDomain = [
      ["order_id.company_id", "=", companyId],
      ["order_id.state", "in", ["paid", "done", "invoiced"]],
    ];
    const unitFields = await rpc<Record<string, unknown>>(sessionId, "product.product", "fields_get", [["uom_po_id", "brand_id"]], { attributes: ["type"] }, correlationId);
    const hasPurchaseUnit = Boolean(unitFields && Object.hasOwn(unitFields, "uom_po_id"));
    const companyContext = { allowed_company_ids: [companyId], force_company: companyId };
    const productDomain = [["available_in_pos", "=", true], ["company_id", "=", companyId]];
    const productFields = ["id", "name", "display_name", "default_code", "product_tmpl_id", "qty_available", "virtual_available", "uom_id", ...(hasPurchaseUnit ? ["uom_po_id"] : []), "type", "sale_ok", "purchase_ok", "standard_price", "list_price", "categ_id", "create_date", ...(unitFields && Object.hasOwn(unitFields, "brand_id") ? ["brand_id"] : [])];
    const [products, companies] = await Promise.all([
      readCompleteRows<Record<string, unknown>>(
        () => rpc<number>(sessionId, "product.product", "search_count", [productDomain], { context: companyContext }, correlationId),
        (afterId, limit) => rpc<Array<Record<string, unknown>>>(sessionId, "product.product", "search_read", [[...productDomain, ["id", ">", afterId]]],
          { fields: productFields, limit, order: "id asc", context: companyContext }, correlationId),
        25_000, 5000,
      ),
      rpc<Array<{ name?: string; country_id?: [number, string]; state_id?: [number, string] }>>(sessionId, "res.company", "search_read", [[["id", "=", companyId]]], { fields: ["name", "country_id", "state_id"], limit: 1 }, correlationId),
    ]);
    // Odoo 20 uses the base unit on purchase lines; older releases expose a separate purchase unit.
    if (!hasPurchaseUnit) for (const product of products ?? []) product.uom_po_id = product.uom_id;
    const timezone = getOdooCompanyTimezone(companies?.[0]?.country_id, companies?.[0]?.state_id);
    const timezoneVerified = Boolean(companies?.[0]?.country_id && companies?.[0]?.state_id);
    const today = salesDate(new Date().toISOString(), timezone);
    const historyStart = shiftDay(today, -HISTORY_DAYS);
    const recentStart = shiftDay(today, -PERIOD_DAYS);
    const historyFromUtc = localMidnightUtc(historyStart, timezone);
    const historyToUtc = localMidnightUtc(today, timezone);
    const dailySales = products?.length ? await loadDailySales(sessionId, [
      ...salesBaseDomain, ["product_id", "in", products.map((p) => Number(p.id))],
      ["order_id.date_order", ">=", historyFromUtc], ["order_id.date_order", "<", historyToUtc],
    ], timezone, correlationId) : [];
    const recentSold = new Map<number, number>();
    const previousSold = new Map<number, number>();
    for (const row of dailySales) {
      if (!Array.isArray(row.product_id)) continue;
      const target = String(row["order_id.date_order"]) >= recentStart ? recentSold : previousSold;
      target.set(row.product_id[0], (target.get(row.product_id[0]) ?? 0) + Number(row.qty));
    }
    const leadTimes = new Map<number, number>();
    let leadTimeQuality: "AVAILABLE" | "UNKNOWN" = "AVAILABLE";
    try {
      const templateIds = (products ?? []).map((product) => Array.isArray(product.product_tmpl_id) ? Number(product.product_tmpl_id[0]) : 0).filter((id) => id > 0);
      if (templateIds.length) {
        const supplierDomain = [["product_tmpl_id", "in", templateIds]];
        type Supplier = { id?: number; product_tmpl_id?: [number, string]; delay?: number };
        const suppliers = await readCompleteRows<Supplier>(
          () => rpc<number>(sessionId, "product.supplierinfo", "search_count", [supplierDomain], { context: companyContext }, correlationId),
          (afterId, limit) => rpc<Supplier[]>(sessionId, "product.supplierinfo", "search_read", [[...supplierDomain, ["id", ">", afterId]]],
            { fields: ["id", "product_tmpl_id", "delay"], limit, order: "id asc", context: companyContext }, correlationId),
          25_000, 5000,
        );
        for (const supplier of suppliers ?? []) {
          const templateId = Array.isArray(supplier.product_tmpl_id) ? Number(supplier.product_tmpl_id[0]) : 0;
          const delay = Number(supplier.delay);
          if (templateId > 0 && Number.isFinite(delay) && delay >= 0 && (!leadTimes.has(templateId) || delay < (leadTimes.get(templateId) ?? Infinity))) leadTimes.set(templateId, delay);
        }
      }
    } catch {
      leadTimes.clear();
      leadTimeQuality = "UNKNOWN";
    }
    const hasLeadTime = leadTimes.size > 0;
    const eligibleProducts = (products ?? []).filter((product) => {
      const productType = String(product.type ?? "");
      return ["product", "consu"].includes(productType) && product.purchase_ok === true;
    });
    const excludedProductCount = (products ?? []).length - eligibleProducts.length;
    const dailyByProduct = new Map<number, Map<string, number>>();
    for (const row of dailySales ?? []) {
      const productId = Array.isArray(row.product_id) ? Number(row.product_id[0]) : 0;
      const dateKey = String(row["order_id.date_order:day"] ?? row["order_id.date_order"] ?? row.date_order ?? "").slice(0, 10);
      const qty = Number(row.qty);
      if (productId > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && Number.isFinite(qty)) {
        const values = dailyByProduct.get(productId) ?? new Map<string, number>();
        values.set(dateKey, (values.get(dateKey) ?? 0) + qty);
        dailyByProduct.set(productId, values);
      }
    }
    const forecastItems = new Map<number, ForecastServiceItem>();
    let forecastMeta: Pick<ForecastServiceResponse, "modelVersion" | "sourceVersion" | "costPolicy" | "costPolicySource" | "businessCostBasis"> = {};
    if (forecastEnabled()) {
      const dates = Array.from({ length: HISTORY_DAYS }, (_, index) => shiftDay(historyStart, index));
      const series = eligibleProducts.map((product) => {
        const values = dailyByProduct.get(Number(product.id)) ?? new Map<string, number>();
        const createdDay = typeof product.create_date === "string" ? salesDate(product.create_date, timezone) : null;
        const hasCreationBoundary = Boolean(createdDay && createdDay > historyStart && !dates.some((date) => date < createdDay && (values.get(date) ?? 0) > 0));
        const isNew = Boolean(hasCreationBoundary && createdDay && createdDay > shiftDay(today, -28));
        const observedDates = hasCreationBoundary && createdDay ? dates.filter((date) => date > createdDay) : dates;
        const cost = Number(product.standard_price);
        const price = Number(product.list_price);
        return { productId: Number(product.id), dates: observedDates, units: observedDates.map((date) => values.get(date) ?? 0), stockoutFlags: [],
          category: Array.isArray(product.categ_id) ? String(product.categ_id[0]) : null,
          brand: Array.isArray(product.brand_id) ? String(product.brand_id[0]) : null,
          priceBand: price > 0 ? price <= 15 ? "LOW_LE_15" : price <= 30 ? "MID_15_30" : "HIGH_GT_30" : null,
          isNew, unitCost: cost > 0 && price > cost ? cost : null, unitPrice: price > 0 ? price : null };

      });
      // Zero-demand mature products remain in the complete plan with zero
      // suggested quantity. Only targets with demand or a new-product boundary
      // require model inference; donors remain available across every batch.
      const targets = series.filter((item) => item.isNew || item.units.some((units) => units > 0));
      const referenceSeries = series.filter((item) => !item.isNew && item.units.length >= 28 && item.units.slice(-28).reduce((sum, value) => sum + value, 0) > 0);
      for (let offset = 0; offset < targets.length; offset += FORECAST_BATCH_SIZE * 2) {
        const batches = [targets.slice(offset, offset + FORECAST_BATCH_SIZE), targets.slice(offset + FORECAST_BATCH_SIZE, offset + FORECAST_BATCH_SIZE * 2)].filter((batch) => batch.length);
        const responses = await Promise.all(batches.map((batch) => callForecastService({ vendorId: companyId, outletId: companyId, horizonDays: Math.max(coverageDays, 7), forecastStartDate: shiftDay(today, -1), sourceVersion: "odoo_pos_order_line_local_complete_days_v2", series: batch, referenceSeries })));
        for (const [index, forecastResponse] of responses.entries()) {
          if (!isSupportedForecastModelVersion(forecastResponse.modelVersion)) {
            throw new ForecastServiceUnavailableError("Forecast service needs a supported catalogue batch version");
          }
          const batch = batches[index];
          const expectedIds = new Set(batch.map((item) => item.productId));
          const receivedIds = new Set<number>();
          for (const item of forecastResponse.items ?? []) {
            const id = Number(item.productId);
            if (!expectedIds.has(id) || receivedIds.has(id)) throw new ForecastServiceUnavailableError("Forecast coverage mismatch");
            receivedIds.add(id);
            forecastItems.set(id, item);
          }
          if (receivedIds.size !== expectedIds.size) throw new ForecastServiceUnavailableError("Forecast coverage incomplete");
          if (forecastMeta.modelVersion && forecastMeta.modelVersion !== forecastResponse.modelVersion) throw new ForecastServiceUnavailableError("Forecast version changed during the read");
          forecastMeta = { modelVersion: forecastResponse.modelVersion, sourceVersion: forecastResponse.sourceVersion, costPolicy: forecastResponse.costPolicy, costPolicySource: forecastResponse.costPolicySource, businessCostBasis: forecastResponse.businessCostBasis };
        }
      }
    }
    const replenishmentItems = eligibleProducts.map((product) => {
      const id = Number(product.id);
      const recentUnits = recentSold.get(id) ?? 0;
      const previousUnits = previousSold.get(id) ?? 0;
      const soldUnits = recentUnits + previousUnits;
      const onHand = Number(product.qty_available ?? 0);
      const virtualAvailable = Number(product.virtual_available);
      const forecastStock = Number.isFinite(virtualAvailable) ? virtualAvailable : onHand;
      const templateId = Array.isArray(product.product_tmpl_id) ? Number(product.product_tmpl_id[0]) : 0;
      const leadTimeDays = templateId > 0 ? leadTimes.get(templateId) ?? null : null;
      const recentUnitsPerDay = recentUnits / PERIOD_DAYS;
      const previousUnitsPerDay = previousUnits / PERIOD_DAYS;
      const unitsPerDay = recentUnits > 0 && previousUnits > 0
        ? recentUnitsPerDay * 0.7 + previousUnitsPerDay * 0.3
        : recentUnitsPerDay || previousUnitsPerDay;
      const trendPercent = previousUnitsPerDay > 0 ? ((recentUnitsPerDay / previousUnitsPerDay) - 1) * 100 : null;
      const trend = recentUnits > 0 && previousUnits === 0
        ? "new"
        : trendPercent === null ? null
          : trendPercent > 10 ? "up"
            : trendPercent < -10 ? "down" : "steady";
      const targetDays = Math.max(coverageDays, leadTimeDays ?? 0);
      const forecastItem = forecastItems.get(id);
      const forecastPoints = forecastItem?.forecast ?? [];
      const hasUsableForecast = Boolean(forecastItem && forecastPoints.length >= coverageDays && (forecastItem.dataQuality === "VALID" || forecastItem.selectionStatus === "ANALOG_COLD_START") && forecastItem.selectionStatus !== "BLOCKED" && forecastItem.selectionStatus !== "INSUFFICIENT_HISTORY");
      const forecastP50 = forecastPoints.slice(0, coverageDays).reduce((sum, point) => sum + Math.max(0, Number(point.p50) || 0), 0);
      const forecastP80 = forecastPoints.slice(0, coverageDays).reduce((sum, point) => sum + Math.max(0, Number(point.p80) || 0), 0);
      const forecastP90 = forecastPoints.slice(0, coverageDays).reduce((sum, point) => sum + Math.max(0, Number(point.p90) || 0), 0);
      const demandPerDay = hasUsableForecast ? forecastP50 / coverageDays : unitsPerDay;
      const dataIssues = [
        ...replenishmentIssues(product),
        ...replenishmentDemandIssues({
          soldUnits,
          forecastEnabled: forecastEnabled(),
          forecastUsable: hasUsableForecast,
          // A usable forecast without an explicit confidence is not validated
          // enough for automatic purchasing. The response below already shows
          // this case as LOW, so apply the same conservative value to the gate.
          forecastConfidence: forecastEnabled() ? forecastItem?.confidence ?? "LOW" : null,
          selectionStatus: forecastItem?.selectionStatus ?? null,
          timezoneVerified,
        }),
      ];
      const recommendationBlocked = dataIssues.length > 0 || soldUnits <= 0;
      const suggestedQuantity = recommendationBlocked ? 0 : Math.max(0, Math.ceil(demandPerDay * targetDays - forecastStock));
      const postReplenishmentForecast = forecastStock + suggestedQuantity;
      let expectedStockoutDaysAfterReplenishment: number | null = null;
      let stockoutDemandUnitsAfterReplenishment: number | null = null;
      if (hasUsableForecast && !recommendationBlocked) {
        const projection = stockoutProjection(postReplenishmentForecast, forecastPoints.slice(0, coverageDays).map((point) => Number(point.p50) || 0));
        expectedStockoutDaysAfterReplenishment = projection.days;
        stockoutDemandUnitsAfterReplenishment = projection.unmetUnits;
      }
      const unitCost = Number(product.standard_price);
      const unitPrice = Number(product.list_price);
      const unit = Array.isArray(product.uom_id) ? String(product.uom_id[1]) : "Units";
      const daysOfStock = unitsPerDay > 0 ? forecastStock / unitsPerDay : null;
      const daysOfStockAfterReplenishment = unitsPerDay > 0
        ? (forecastStock + suggestedQuantity) / unitsPerDay : null;
      const risk = daysOfStock === null ? "UNKNOWN"
        : daysOfStock <= (leadTimeDays ?? coverageDays) ? "HIGH"
          : daysOfStock <= targetDays ? "MEDIUM" : "LOW";
      const confidence = recommendationBlocked || !timezoneVerified ? "LOW" : hasUsableForecast ? String(forecastItem?.confidence ?? "LOW") : soldUnits >= 14 ? "MEDIUM" : "LOW";
      const reasonParts: string[] = [];
      if (forecastItem?.selectionStatus === "ANALOG_COLD_START") reasonParts.push(`New product estimate from ${forecastItem.analogCount ?? 0} similar products in the same category, brand (when known) and price band. Low confidence; review before ordering.`);
      if (dataIssues.length) {
        reasonParts.push(`Data review required: ${dataIssues.join(", ")}. Purchase suggestion paused until stock, cost and purchase units are checked in Orithos.`);
      } else if (soldUnits <= 0) {
        reasonParts.push("No completed POS sales in the lookback window — suggestion is zero until demand appears.");
      } else {
        reasonParts.push(hasUsableForecast
          ? `Forecast demand ≈ ${demandPerDay.toFixed(2)} ${unit}/day using ${forecastItem?.model ?? "selected model"}.`
          : `Demand ≈ ${unitsPerDay.toFixed(2)} ${unit}/day from ${HISTORY_DAYS}d sales (recent ${PERIOD_DAYS}d weighted 70%).`);
        reasonParts.push(`Target cover ${coverageDays}d ⇒ need ≈ ${(demandPerDay * targetDays).toFixed(1)} ${unit}.`);
        reasonParts.push(`Forecast stock ${forecastStock.toFixed(1)} ${unit} (on hand ${onHand.toFixed(1)} incl. scheduled moves).`);
        if (suggestedQuantity > 0) {
          reasonParts.push(`Suggested order = ceil(need − forecast) = ${suggestedQuantity} ${unit}.`);
        } else {
          reasonParts.push("Forecast stock already covers the target window — no order suggested.");
        }
        if (trend === "up") reasonParts.push(`Trend up ${Number(trendPercent?.toFixed(0) ?? 0)}% vs prior period.`);
        if (trend === "down") reasonParts.push(`Trend down ${Math.abs(Number(trendPercent?.toFixed(0) ?? 0))}% vs prior period.`);
        if (trend === "new") reasonParts.push("New demand — sold recently with no prior-period sales.");
      }
      if (!timezoneVerified) reasonParts.push(`Store address has no state; ${timezone} is the current fallback. Verify the store timezone before relying on daily patterns.`);
      if (leadTimeDays === null) reasonParts.push("Data quality warning: supplier lead time is unknown; coverage target is used as a fallback.");
      else reasonParts.push(`Supplier lead time ${leadTimeDays}d; target coverage uses ${targetDays}d.`);
      if (risk === "UNKNOWN") reasonParts.push("Risk is unknown because there is no positive demand baseline.");
      if (soldUnits < 14) reasonParts.push("Data quality warning: fewer than 14 units sold in the lookback window; this item is review-only until demand history improves.");
      return {
        id,
        name: String(product.display_name ?? product.name ?? "Product"),
        sku: product.default_code ? String(product.default_code) : "",
        unit,
        soldUnits,
        recentUnits,
        previousUnits,
        unitsPerDay,
        trendPercent,
        trend,
        onHand,
        forecastStock,
        daysOfStock,
        daysOfStockAfterReplenishment,
        leadTimeDays,
        risk,
        confidence,
        recommendationStatus: dataIssues.length ? "REVIEW_DATA" : soldUnits <= 0 ? "NO_DEMAND" : "READY",
        dataIssues,
        dataQuality: dataIssues.length ? "REVIEW_REQUIRED" : leadTimeQuality === "AVAILABLE" && leadTimeDays !== null ? "NATIVE_STOCK_SALES_SUPPLIER_LEAD_TIME" : "NATIVE_STOCK_SALES_LEAD_TIME_UNKNOWN",
        suggestedQuantity,
        reason: reasonParts.join(" "),
        reasonParts,
        method: hasUsableForecast && forecastItem?.model && FORECAST_MODELS.has(forecastItem.model) ? forecastItem.model : "rules_v1_weighted_velocity",
        modelVersion: hasUsableForecast ? forecastMeta.modelVersion ?? null : null,
        forecastQuality: hasUsableForecast ? forecastItem?.dataQuality ?? "UNKNOWN" : forecastEnabled() ? forecastItem?.dataQuality ?? "INSUFFICIENT_HISTORY" : "DISABLED",
        forecastConfidence: hasUsableForecast && !recommendationBlocked && timezoneVerified ? forecastItem?.confidence ?? "LOW" : "LOW",
        selectionStatus: forecastItem?.selectionStatus ?? null,
        selectionMetric: forecastItem?.selectionMetric ?? null,
        candidateScores: forecastItem?.candidateScores ?? {},
        candidateBusinessCosts: forecastItem?.candidateBusinessCosts ?? {},
        selectionValidation: forecastItem?.selectionValidation ?? {},
        analogCount: forecastItem?.analogCount ?? 0,
        p50: hasUsableForecast ? forecastP50 : null,
        p80: hasUsableForecast ? forecastP80 : null,
        p90: hasUsableForecast ? forecastP90 : null,
        expectedStockoutDaysAfterReplenishment,
        stockoutDemandUnitsAfterReplenishment,
        unitCost: Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : null,
        unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : null,
        inventoryValue: Number.isFinite(unitCost) && unitCost >= 0 ? onHand * unitCost : null,
        suggestedOrderValue: Number.isFinite(unitCost) && unitCost >= 0 ? suggestedQuantity * unitCost : null,
        stockoutRevenueAtRisk: Number.isFinite(unitPrice) && unitPrice >= 0 && stockoutDemandUnitsAfterReplenishment !== null ? stockoutDemandUnitsAfterReplenishment * unitPrice : null,
        forecastSourceVersion: hasUsableForecast ? forecastMeta.sourceVersion ?? null : null,
      };
    }).sort((a, b) => b.suggestedQuantity - a.suggestedQuantity || b.unitsPerDay - a.unitsPerDay || a.name.localeCompare(b.name));
    const sumNullable = (field: "inventoryValue" | "suggestedOrderValue" | "stockoutRevenueAtRisk") => {
      const values = replenishmentItems.filter((item) => item.recommendationStatus !== "REVIEW_DATA").map((item) => item[field]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    const expectedStockoutDays = replenishmentItems.map((item) => item.expectedStockoutDaysAfterReplenishment).filter((value): value is number => typeof value === "number");
    const reviewIssueCounts: Record<string, number> = {};
    for (const item of replenishmentItems) {
      for (const issue of item.dataIssues) reviewIssueCounts[issue] = (reviewIssueCounts[issue] ?? 0) + 1;
    }

    const responseBody = {
      company: companies?.[0]?.name ?? "Current company",
      historyDays: HISTORY_DAYS,
      periodDays: PERIOD_DAYS,
      coverageDays,
      products: replenishmentItems,
      truncated: false,
      catalogueCoverage: { status: "COMPLETE", loadedProducts: products.length, eligibleProducts: eligibleProducts.length, excludedProducts: excludedProductCount, forecastedProducts: forecastItems.size, zeroDemandProducts: replenishmentItems.filter((item) => item.soldUnits <= 0).length },
      salesHistory: { timezone, timezoneVerified, timezoneSource: timezoneVerified ? "ODOO_COMPANY_ADDRESS" : "COMPANY_ADDRESS_FALLBACK_REVIEW_REQUIRED", startDate: historyStart, endDateExclusive: today, fromUtc: historyFromUtc, toUtc: historyToUtc, completeDaysOnly: true, dailyRows: dailySales.length, refunds: "SIGNED_NET_UNITS" },
      salesValidation: request.nextUrl.searchParams.get("validateSales") === "true"
        ? [...replenishmentItems].filter((item) => item.soldUnits > 0).sort((a, b) => b.soldUnits - a.soldUnits).slice(0, 20).map((item) => ({
          productId: item.id,
          dates: Array.from({ length: HISTORY_DAYS }, (_, index) => shiftDay(historyStart, index)),
          units: Array.from({ length: HISTORY_DAYS }, (_, index) => dailyByProduct.get(item.id)?.get(shiftDay(historyStart, index)) ?? 0),
        })) : undefined,
      reviewRequiredCount: replenishmentItems.filter((item) => item.recommendationStatus === "REVIEW_DATA").length,
      reviewIssueCounts,
      excludedProductCount,
      productEligibility: "STOCKABLE_AND_PURCHASABLE",
      generatedAt: new Date().toISOString(),
      inventoryHistory: await readInventorySnapshotStatus(companyId),
      dataQuality: leadTimeQuality === "AVAILABLE" && hasLeadTime ? "NATIVE_STOCK_SALES_SUPPLIER_LEAD_TIME" : "NATIVE_STOCK_SALES_LEAD_TIME_UNKNOWN",
      forecast: {
        enabled: forecastEnabled(),
        modelSelection: forecastEnabled() ? "per_product_selected" : "rules_v1_weighted_velocity",
        modelVersion: forecastMeta.modelVersion ?? null,
        sourceVersion: forecastMeta.sourceVersion ?? null,
        status: forecastEnabled() ? "AVAILABLE" : "DISABLED",
        costPolicy: forecastMeta.costPolicy ?? null,
        costPolicySource: forecastMeta.costPolicySource ?? null,
        businessCostBasis: forecastMeta.businessCostBasis ?? null,
      },
      purchaseWorkflow: {
        draftEnabled: purchaseDraftEnabled(),
        mode: purchaseDraftEnabled() ? "DRAFT_RFQ" : "READ_ONLY_PREVIEW",
      },
      businessMetrics: {
        inventoryValue: sumNullable("inventoryValue"),
        suggestedOrderValue: sumNullable("suggestedOrderValue"),
        stockoutRevenueAtRisk: sumNullable("stockoutRevenueAtRisk"),
        productsWithExpectedStockout: expectedStockoutDays.filter((days) => days > 0).length,
        expectedStockoutDaysAfterReplenishment: expectedStockoutDays.length ? expectedStockoutDays.reduce((sum, days) => sum + days, 0) : null,
        excludedReviewProducts: replenishmentItems.filter((item) => item.recommendationStatus === "REVIEW_DATA").length,
        dataQuality: forecastEnabled() ? "MODEL_FORECAST_ONLY_UNTIL_NATIVE_STOCKOUT_HISTORY" : "RULES_ESTIMATE",
      },
      cache: { status: "MISS", expiresAt: new Date(Date.now() + REPLENISHMENT_CACHE_TTL_MS).toISOString() },
    };
    if (request.nextUrl.searchParams.get("validateSales") !== "true") {
      replenishmentCache.set(cacheKey, { expiresAt: Date.now() + REPLENISHMENT_CACHE_TTL_MS, body: responseBody });
    }
    return NextResponse.json(responseBody, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ReplenishmentSessionExpiredError) {
      const response = NextResponse.json({ message: "Orithos session expired" }, { status: 401 });
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    if (error instanceof ForecastServiceUnavailableError) {
      return NextResponse.json({ code: "FORECAST_SERVICE_UNAVAILABLE", message: "Forecasting is temporarily unavailable; no replenishment plan was generated." }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Orithos is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}
