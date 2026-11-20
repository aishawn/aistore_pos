import assert from "node:assert/strict";
import test from "node:test";
import { formatCartUnitPrice, resolveCartDisplayAmounts } from "./register-cart-pricing";

test("uses the current server quote for tier-priced cart lines", () => {
  assert.deepEqual(resolveCartDisplayAmounts(4, 8.99, { quantity: 4, total: 26.99 }), {
    unitPrice: 26.99 / 4,
    lineTotal: 26.99,
  });
});

test("keeps the base price preview until a matching quote is available", () => {
  assert.deepEqual(resolveCartDisplayAmounts(4, 8.99, { quantity: 1, total: 8.99 }), {
    unitPrice: 8.99,
    lineTotal: 35.96,
  });
});

test("shows enough unit price precision to explain rounded tier totals", () => {
  assert.equal(formatCartUnitPrice(26.99 / 4), "$6.7475");
  assert.equal(formatCartUnitPrice(8.99), "$8.99");
});
