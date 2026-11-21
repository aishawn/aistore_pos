import assert from "node:assert/strict";
import { test } from "node:test";
import * as parkedSale from "../components/register-sell/shared.ts";

test("parked sale notes reject whitespace only when the company requires one", () => {
  assert.deepEqual(parkedSale.prepareParkedSaleNote("  ", true), { valid: false, note: null });
  assert.deepEqual(parkedSale.prepareParkedSaleNote("  ", false), { valid: true, note: null });
});

test("parked sale notes trim text before saving", () => {
  assert.deepEqual(parkedSale.prepareParkedSaleNote("  Count bottles  ", true), {
    valid: true,
    note: "Count bottles",
  });
});
