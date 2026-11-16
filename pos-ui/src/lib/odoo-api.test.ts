import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOdooQuoteTimeoutMessage, ODOO_QUOTE_TIMEOUT_MS } from "./odoo-quote-timeout.ts";
import { mapNativeProduct } from "./native-product-mapping.ts";

describe("quoteOdooPosOrder", () => {
  it("uses a finite deadline and provides a retryable timeout message", () => {
    assert.equal(ODOO_QUOTE_TIMEOUT_MS, 45_000);
    assert.equal(
      getOdooQuoteTimeoutMessage(new DOMException("signal timed out", "TimeoutError")),
      "Orithos did not return a cart total in time. Retry quote before finalising.",
    );
    assert.equal(getOdooQuoteTimeoutMessage(new Error("fetch failed")), null);
  });
});

describe("mapNativeProduct cost provenance", () => {
  it("does not call a POS cost Shopfront cost without source timestamp evidence", () => {
    const product = mapNativeProduct({ id: 1, name: "Wine", cost: 10.35, caseQuantity: 6 });
    assert.equal(product.standard_price, 10.35);
    assert.equal(product.shopfront_cost, null);
    assert.equal(product.shopfront_cost_status, "unavailable");
    assert.equal(product.shopfront_case_quantity, 6);
  });

  it("uses timestamped Shopfront case cost and preserves percentage costs", () => {
    const product = mapNativeProduct({
      id: 1,
      name: "Wine",
      cost: 10.35,
      costPercentage: false,
      caseQuantity: 6,
      shopfrontSourceUpdatedAt: "2026-10-29T13:19:56+08:00",
    });
    assert.equal(product.shopfront_cost, 10.35);
    assert.equal(product.shopfront_cost_status, "available");
    assert.equal(product.shopfront_cost_percentage, false);
    assert.equal(product.shopfront_source_updated_at, "2026-10-29T13:19:56+08:00");

    const percentage = mapNativeProduct({
      id: 2,
      name: "Gift card",
      cost: 20,
      costPercentage: true,
      shopfrontSourceUpdatedAt: "2026-10-29T13:19:56+08:00",
    });
    assert.equal(percentage.shopfront_cost, 20);
    assert.equal(percentage.shopfront_cost_percentage, true);
  });

  it("does not turn a missing Orithos cost into zero", () => {
    const product = mapNativeProduct({ id: 1, name: "Wine", cost: null, caseQuantity: 6 });
    assert.equal(product.standard_price, false);
    assert.equal(product.shopfront_cost, null);
    assert.equal(product.shopfront_cost_status, "unavailable");
  });
});
