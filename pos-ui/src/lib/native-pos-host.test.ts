import assert from "node:assert/strict";
import test from "node:test";
import { isNativePosHost } from "./native-pos-host.ts";

test("native POS host gate is enabled for Orithos-ledger stores", () => {
  assert.equal(isNativePosHost("skr.orithos.com.au"), true);
  assert.equal(isNativePosHost("demo.orithos.com.au"), true);
  assert.equal(isNativePosHost("app.orithos.com.au"), false);
  assert.equal(isNativePosHost("localhost:3000"), false);
});
