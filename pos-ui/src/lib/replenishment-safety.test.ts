import { test } from "node:test";
import assert from "node:assert/strict";
import { salesDate, shiftDay, localMidnightUtc, replenishmentIssues, replenishmentDemandIssues, stockoutProjection } from "./replenishment-safety.ts";

test("Odoo UTC orders cross into the Australian business day", () => {
  assert.equal(salesDate("2026-10-30 14:00:00", "Australia/Adelaide"), "2026-10-31");
  assert.equal(salesDate("2026-10-30 12:00:00", "Australia/Adelaide"), "2026-10-30");
  assert.throws(() => salesDate("missing", "Australia/Adelaide"));
});

test("complete-day boundaries respect daylight savings", () => {
  assert.equal(localMidnightUtc("2026-10-05", "Australia/Adelaide"), "2026-10-04 13:30:00");
  assert.equal(localMidnightUtc("2026-10-04", "Australia/Adelaide"), "2026-10-03 14:30:00");
  assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
});

test("negative stock, cost anomalies and purchase unit conversions block suggestions", () => {
  const valid = { qty_available: 10, virtual_available: 10, standard_price: 2, list_price: 4, uom_id: [1, "Units"], uom_po_id: [1, "Units"] };
  assert.deepEqual(replenishmentIssues(valid), []);
  assert.deepEqual(replenishmentIssues({ ...valid, qty_available: -23022 }), ["NEGATIVE_STOCK"]);
  assert.deepEqual(replenishmentIssues({ ...valid, standard_price: 5 }), ["REVIEW_COST_PRICE"]);
  assert.deepEqual(replenishmentIssues({ ...valid, uom_po_id: [2, "Case"] }), ["REVIEW_PURCHASE_UNIT"]);
});

test("stockout loss counts each missed unit once and ignores zero demand", () => {
  assert.deepEqual(stockoutProjection(0, [0, 0, 0]), { days: 0, unmetUnits: 0 });
  assert.deepEqual(stockoutProjection(2, [2, 3, 4]), { days: 2, unmetUnits: 7 });
});

test("low-confidence demand stays review-only", () => {
  assert.deepEqual(replenishmentDemandIssues({ soldUnits: 13 }), ["LOW_DEMAND_HISTORY"]);
  assert.deepEqual(replenishmentDemandIssues({ soldUnits: 20, selectionStatus: "ANALOG_COLD_START" }), ["LOW_CONFIDENCE_ANALOG"]);
  assert.deepEqual(replenishmentDemandIssues({ soldUnits: 20, forecastEnabled: true, forecastUsable: true, forecastConfidence: "LOW" }), ["LOW_FORECAST_CONFIDENCE"]);
  assert.deepEqual(replenishmentDemandIssues({ soldUnits: 20, forecastEnabled: true, forecastUsable: false, forecastConfidence: "LOW" }), ["LOW_FORECAST_CONFIDENCE"]);
  assert.deepEqual(replenishmentDemandIssues({ soldUnits: 20, timezoneVerified: false }), ["UNVERIFIED_STORE_TIMEZONE"]);
});
