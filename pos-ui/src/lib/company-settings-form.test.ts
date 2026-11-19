import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPANY_SECTIONS } from "./company-settings-catalog.ts";
import { formatCompanySetting, serializeCompanySetting, validateCompanySetting } from "./company-settings-form.ts";

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
