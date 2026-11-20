import assert from "node:assert/strict";
import { test } from "node:test";
import { companySettingOptions, normalizeRequiredCashReason } from "./company-setting-options.ts";

test("company setting reason options parse configured JSON string arrays", () => {
  assert.deepEqual(companySettingOptions('["Safe drop","Supplier payment"]'), ["Safe drop", "Supplier payment"]);
  assert.deepEqual(companySettingOptions(["Safe drop", "Supplier payment"]), ["Safe drop", "Supplier payment"]);
});

test("company setting reason options ignore blank and duplicate entries", () => {
  assert.deepEqual(companySettingOptions('["Safe drop"," safe drop ","", "Float"]'), ["Safe drop", "Float"]);
});

test("company setting reason options safely fall back for malformed values", () => {
  assert.deepEqual(companySettingOptions("not-json"), []);
  assert.deepEqual(companySettingOptions('["valid",4]'), []);
});

test("cash movement reasons are trimmed and required", () => {
  assert.equal(normalizeRequiredCashReason("  Safe drop  "), "Safe drop");
  assert.equal(normalizeRequiredCashReason("   "), null);
});
