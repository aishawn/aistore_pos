import assert from "node:assert/strict";
import test from "node:test";
import { compareIntentCodes, parseSeedIntents } from "./capability-alignment.mjs";

test("parses intent codes only from the ai_intent seed block", () => {
  const sql = `
    INSERT INTO \`ai_intent\` (code, name) VALUES
      ('report_stock_value', 'Inventory value'),
      ('product_count', 'Product count');
    -- ai_slot
    ('not_an_intent', 'Ignore this row');
  `;

  assert.deepEqual(parseSeedIntents(sql), ["product_count", "report_stock_value"]);
});

test("reports missing and unexpected live intent codes", () => {
  assert.deepEqual(
    compareIntentCodes(["product_count", "report_stock_value"], ["report_stock_value", "qa"]),
    { missing: ["product_count"], extra: ["qa"], matches: false },
  );
});

test("accepts live intent codes in any order", () => {
  assert.deepEqual(
    compareIntentCodes(["product_count", "report_stock_value"], ["report_stock_value", "product_count"]),
    { missing: [], extra: [], matches: true },
  );
});
