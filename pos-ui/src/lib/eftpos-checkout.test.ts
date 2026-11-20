import assert from "node:assert/strict";
import test from "node:test";
import { markPurchaseDispatched, wasPurchaseDispatched } from "./eftpos-checkout.ts";

test("purchase dispatch marker is isolated per order and survives resume checks", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  assert.equal(wasPurchaseDispatched("order-a", storage), false);
  markPurchaseDispatched("order-a", storage);
  assert.equal(wasPurchaseDispatched("order-a", storage), true);
  assert.equal(wasPurchaseDispatched("order-b", storage), false);
});
