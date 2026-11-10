import assert from "node:assert/strict";
import test from "node:test";
import { isNativePosHost } from "./native-pos-host.ts";

test("native POS host gate is off while sell uses the Odoo register", () => {
  assert.equal(isNativePosHost("skr.orithos.com.au"), false);
  assert.equal(isNativePosHost("demo.orithos.com.au"), false);
  assert.equal(isNativePosHost("app.orithos.com.au"), false);
  assert.equal(isNativePosHost("localhost:3000"), false);
});
