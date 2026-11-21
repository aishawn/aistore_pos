import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPANY_SECTIONS, isCompanySettingRuntimeSupported } from "./company-settings-catalog.ts";
import { formatCompanySetting, normalizeCompanySetting, serializeCompanySetting, validateCompanySetting } from "./company-settings-form.ts";

test("date and time settings expose the supported Shopfront formats", () => {
  const section = COMPANY_SECTIONS.find((item) => item.id === "date-time");
  assert.ok(section);
  const dateFormat = section.fields.find((field) => field.key === "company.date_format");
  const timeFormat = section.fields.find((field) => field.key === "company.time_format");
  assert.equal(dateFormat?.type, "select");
  assert.equal(timeFormat?.type, "select");
  assert.ok(timeFormat?.options?.some((option) => option.value === "HH:mm:ss"));
  assert.ok(dateFormat?.options?.some((option) => option.value === "DD/MM/YYYY"));
});

test("login settings do not offer the unimplemented PIN flow", () => {
  const section = COMPANY_SECTIONS.find((item) => item.id === "login");
  const loginType = section?.fields.find((field) => field.key === "company.login.login_type");
  assert.ok(loginType);
  assert.deepEqual(loginType.options?.map((option) => option.value), ["USERNAME_PASSWORD"]);
  assert.equal(normalizeCompanySetting(loginType, "PIN"), "USERNAME_PASSWORD");
  assert.equal(normalizeCompanySetting(loginType, "USERNAME_PASSWORD"), "USERNAME_PASSWORD");
});

test("only company settings wired to Orithos behavior remain editable", () => {
  assert.equal(isCompanySettingRuntimeSupported("company.general.use_quantity_rate"), true);
  assert.equal(isCompanySettingRuntimeSupported("company.login.require_password"), true);
  assert.equal(isCompanySettingRuntimeSupported("company.sell.cash_out_reasons"), true);
  assert.equal(isCompanySettingRuntimeSupported("company.sell.discounts_require_reason"), true);
  assert.equal(isCompanySettingRuntimeSupported("company.search.product_level"), false);
});

test("cash reason settings render one reason per line", () => {
  assert.equal(formatCompanySetting({ key: "company.sell.cash_in_reasons", label: "Cash In", type: "string-list" }, '["Float top-up","Till correction"]'), "Float top-up\nTill correction");
});

test("cash reason settings save trimmed unique nonblank values as JSON", () => {
  const field = { key: "company.sell.cash_out_reasons", label: "Cash Out", type: "string-list" as const };
  assert.equal(serializeCompanySetting(field, "Petty cash\n\n petty cash \nBanking"), '["Petty cash","Banking"]');
});

test("numeric and timezone settings reject invalid values", () => {
  assert.match(validateCompanySetting({ key: "company.currency.round_to", label: "Round To", type: "number" }, "0"), /greater than zero/i);
  assert.match(validateCompanySetting({ key: "company.currency.round_to", label: "Round To", type: "number" }, "0.005"), /two decimal places/i);
  assert.match(validateCompanySetting({ key: "company.timezone", label: "Timezone", type: "text" }, "Mars/Phobos"), /valid time zone/i);
  assert.equal(validateCompanySetting({ key: "company.currency.round_to", label: "Round To", type: "number" }, "0.05"), null);
});
