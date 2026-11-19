import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { inventorySummaryAcceptance } from "./ai-eval/orithos-report-assertions.mjs";

const entryPath = new URL("./pilot-ai-report-readonly-uat.mjs", import.meta.url);
const entrySource = fs.readFileSync(entryPath, "utf8");

test("report readonly UAT entry delegates to the Orithos-native suite", () => {
  assert.match(entrySource, /import\s+["']\.\/pilot-ai-report-readonly-orithos-uat\.mjs["']/);
  assert.doesNotMatch(entrySource, /\/api\/(?:odoo|shopfront)/i);
});

test("on-hand summary reconciles positive SKU, case and item totals with native overview", () => {
  const result = inventorySummaryAcceptance({
    productCount: 3063,
    caseLevelTotal: 3006,
    itemLevelTotal: 15804,
  }, {
    inventoryPositiveSkuCount: 3063,
    inventoryCaseLevel: 3006,
    inventoryItemLevel: 15804,
  });

  assert.equal(result.passed, true);
  assert.deepEqual(Object.values(result.checks), [true, true, true]);
});

test("on-hand summary reports mismatched inventory totals", () => {
  const result = inventorySummaryAcceptance({
    productCount: 3062,
    caseLevelTotal: 3006,
    itemLevelTotal: 15804,
  }, {
    inventoryPositiveSkuCount: 3063,
    inventoryCaseLevel: 3006,
    inventoryItemLevel: 15804,
  });

  assert.equal(result.passed, false);
  assert.equal(result.checks.positiveSkuCount, false);
});

test("on-hand summary treats missing totals as unreconciled", () => {
  const result = inventorySummaryAcceptance({
    productCount: null,
    caseLevelTotal: 0,
    itemLevelTotal: 0,
  }, {
    inventoryPositiveSkuCount: 0,
    inventoryCaseLevel: 0,
    inventoryItemLevel: 0,
  });

  assert.equal(result.passed, false);
  assert.equal(result.checks.positiveSkuCount, false);
});
