import assert from "node:assert/strict";
import test from "node:test";
import { isCompanySettingRuntimeSupported } from "./company-settings-catalog";

test("sale keys position is editable because Sell consumes it", () => {
  assert.equal(isCompanySettingRuntimeSupported("company.misc.sale_keys_position"), true);
});

test("default sale keys remains stored-only until a source layout can be mapped", () => {
  assert.equal(isCompanySettingRuntimeSupported("company.misc.default_sale_keys"), false);
});
