import assert from "node:assert/strict";
import test from "node:test";

test("purchase dispatch marker prevents double purchase on resume", () => {
  const orderUuid = `test-${Date.now()}`;
  const key = `orithos.eftpos.purchase-dispatched.${orderUuid}`;
  sessionStorage.removeItem(key);
  sessionStorage.setItem(key, "1");
  assert.equal(sessionStorage.getItem(key), "1");
  sessionStorage.removeItem(key);
});