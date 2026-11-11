import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatShopfrontProfitPercent, shopfrontAlignedMarginRatio } from "./shopfront-aligned-margin.ts";

describe("shopfrontAlignedMarginRatio", () => {
  it("matches Shopfront Profit Percentage on tax-inclusive revenue", () => {
    // Shopfront outlet row: revenue 4879.68, cost 3361.36 → profit 1518.32 → 31.12%
    const ratio = shopfrontAlignedMarginRatio(1518.32, 4879.68);
    assert.ok(ratio != null);
    assert.equal(formatShopfrontProfitPercent(ratio), "31.12%");
  });

  it("matches Orithos sales-report profitMargin for the same day", () => {
    // Orithos sales report: revenue 4879.68, cost 3361.21 → profit 1518.47 → 31.12%
    const ratio = shopfrontAlignedMarginRatio(1518.47, 4879.68);
    assert.ok(ratio != null);
    assert.equal(formatShopfrontProfitPercent(ratio), "31.12%");
  });

  it("does not use net (ex-tax) revenue as the denominator", () => {
    const profit = 1518.47;
    const revenueIncTax = 4879.68;
    const tax = 427.92;
    const net = revenueIncTax - tax;
    const wrongNetMargin = formatShopfrontProfitPercent(profit / net, 1);
    const aligned = formatShopfrontProfitPercent(shopfrontAlignedMarginRatio(profit, revenueIncTax)!);
    assert.equal(wrongNetMargin, "34.1%");
    assert.equal(aligned, "31.12%");
  });

  it("returns null when revenue is missing or zero", () => {
    assert.equal(shopfrontAlignedMarginRatio(10, 0), null);
    assert.equal(shopfrontAlignedMarginRatio(10, null), null);
    assert.equal(shopfrontAlignedMarginRatio(null, 100), null);
  });
});
