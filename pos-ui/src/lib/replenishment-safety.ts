/** Odoo stores naive datetime strings in UTC. Business days belong to the store. */
export function salesDate(value: string, timezone: string): string {
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(date.getTime())) throw new Error("Sales history contains an invalid order date");
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function shiftDay(day: string, offset: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}

export function localMidnightUtc(day: string, timezone: string): string {
  const target = Date.parse(`${day}T00:00:00Z`);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
    const wallTime = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    instant += target - wallTime;
  }
  return new Date(instant).toISOString().slice(0, 19).replace("T", " ");
}

export function replenishmentIssues(product: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const onHand = Number(product.qty_available);
  const available = Number(product.virtual_available);
  const cost = Number(product.standard_price);
  const price = Number(product.list_price);
  if (product.qty_available == null || product.virtual_available == null || !Number.isFinite(onHand) || !Number.isFinite(available)) issues.push("INVALID_STOCK");
  else {
    if (onHand < 0) issues.push("NEGATIVE_STOCK");
    if (available < 0) issues.push("NEGATIVE_VIRTUAL_STOCK");
  }
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(price) || price <= 0 || cost > price) issues.push("REVIEW_COST_PRICE");
  const unit = product.uom_id;
  const purchaseUnit = product.uom_po_id;
  if (!Array.isArray(unit) || !Array.isArray(purchaseUnit) || unit[0] !== purchaseUnit[0]) issues.push("REVIEW_PURCHASE_UNIT");
  return issues;
}

/** Low-confidence demand remains human-review-only. */
export function replenishmentDemandIssues(input: {
  soldUnits: number;
  forecastEnabled?: boolean;
  forecastUsable?: boolean;
  forecastConfidence?: string | null;
  selectionStatus?: string | null;
  timezoneVerified?: boolean;
}): string[] {
  const issues: string[] = [];
  if (Number.isFinite(input.soldUnits) && input.soldUnits > 0 && input.soldUnits < 14) {
    issues.push("LOW_DEMAND_HISTORY");
  }
  if (input.selectionStatus === "ANALOG_COLD_START") {
    issues.push("LOW_CONFIDENCE_ANALOG");
  }
  if (input.forecastEnabled && input.forecastConfidence === "LOW") {
    issues.push("LOW_FORECAST_CONFIDENCE");
  }
  if (input.timezoneVerified === false) {
    issues.push("UNVERIFIED_STORE_TIMEZONE");
  }
  return issues;
}

export function stockoutProjection(stock: number, demand: number[]) {
  let available = Math.max(0, stock);
  let days = 0;
  let unmetUnits = 0;
  for (const value of demand) {
    const units = Math.max(0, value);
    const unmet = Math.max(0, units - available);
    if (unmet > 0) days++;
    unmetUnits += unmet;
    available = Math.max(0, available - units);
  }
  return { days, unmetUnits };
}

export type ReplenishmentAttention = {
  level: "REVIEW" | "HIGH" | "MEDIUM" | "LOW";
  score: number;
  reasons: string[];
};

/** Prioritise the exceptions a shop owner should handle first. */
export function replenishmentAttention(input: {
  dataIssues?: string[];
  risk?: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" | null;
  expectedStockoutDays?: number | null;
  trend?: "up" | "down" | "steady" | "new" | null;
  soldUnits?: number;
}): ReplenishmentAttention {
  const reasons = [...new Set(input.dataIssues ?? [])];
  if (input.expectedStockoutDays !== null && input.expectedStockoutDays !== undefined && input.expectedStockoutDays > 0) reasons.push("EXPECTED_STOCKOUT");
  if (input.risk === "HIGH") reasons.push("LOW_COVERAGE");
  if (input.trend === "up" || input.trend === "new") reasons.push("DEMAND_TREND_UP");
  if (input.soldUnits === 0) reasons.push("NO_DEMAND");
  if (input.dataIssues?.length) return { level: "REVIEW", score: 100, reasons };
  if (reasons.includes("EXPECTED_STOCKOUT") || input.risk === "HIGH") return { level: "HIGH", score: 80, reasons };
  if (input.risk === "MEDIUM" || reasons.includes("DEMAND_TREND_UP")) return { level: "MEDIUM", score: 50, reasons };
  return { level: "LOW", score: reasons.includes("NO_DEMAND") ? 10 : 20, reasons };
}
