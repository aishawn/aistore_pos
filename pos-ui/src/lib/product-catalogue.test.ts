import assert from "node:assert/strict";
import test from "node:test";
import { catalogueDomain } from "./product-catalogue.ts";

test("inventory All products counts saleable variants, including products hidden from POS", () => {
  assert.deepEqual(catalogueDomain("all"), [["sale_ok", "=", true]]);
});

test("hidden-from-POS filter is scoped to saleable variants", () => {
  assert.deepEqual(catalogueDomain("hidden"), [
    ["sale_ok", "=", true],
    ["available_in_pos", "=", false],
  ]);
});
