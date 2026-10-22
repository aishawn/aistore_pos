import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  friendlyProductName,
  looksLikeR2ImportMarker,
  truncateSku,
} from "./product-display-name.ts";

describe("friendlyProductName", () => {
  it("strips import ids and test prefixes (aligned with AssistantDisplayText)", () => {
    assert.equal(
      friendlyProductName(
        "[R2-11eee66f71b39c7abc790636865404] R2 TEST | PIZZINI SANGIOVESE SHIRAZ 750M",
      ),
      "PIZZINI SANGIOVESE SHIRAZ 750M",
    );
    assert.equal(
      friendlyProductName(
        "[R2-11eee66f71b3841aa14c0636865404] R2 TEST | RARE PENNY SHIRAZ",
      ),
      "RARE PENNY SHIRAZ",
    );
    assert.equal(friendlyProductName("Shiraz Reserve"), "Shiraz Reserve");
    assert.equal(friendlyProductName("   "), "Product");
  });

  it("strips DEMO pipe prefixes and short seed tags", () => {
    assert.equal(friendlyProductName("DEMO | House Red"), "House Red");
    assert.equal(friendlyProductName("SEED | Gin 700ml"), "Gin 700ml");
  });
});

describe("truncateSku", () => {
  it("keeps short SKUs and truncates long R2 codes", () => {
    assert.equal(truncateSku("ABC-12"), "ABC-12");
    assert.equal(
      truncateSku("R2-11eee66f71b39c7abc790636865404"),
      "R2-11eee66f…",
    );
    assert.equal(truncateSku(""), "");
  });
});

describe("looksLikeR2ImportMarker", () => {
  it("detects R2 TEST / R2- SKU markers", () => {
    assert.equal(looksLikeR2ImportMarker("R2 TEST | PINOT"), true);
    assert.equal(looksLikeR2ImportMarker("R2-11eee66f"), true);
    assert.equal(looksLikeR2ImportMarker("[R2-abc] Wine"), true);
    assert.equal(looksLikeR2ImportMarker("148 PINOT NOIR"), false);
  });
});
