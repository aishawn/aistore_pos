import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { inventorySummaryAcceptance } from "./ai-eval/orithos-report-assertions.mjs";

const entryPath = new URL("./pilot-ai-report-readonly-uat.mjs", import.meta.url);
const entrySource = fs.readFileSync(entryPath, "utf8");
const suiteSource = fs.readFileSync(new URL("./pilot-ai-report-readonly-orithos-uat.mjs", import.meta.url), "utf8");

test("report readonly UAT entry delegates to the Orithos-native suite", () => {
  assert.match(entrySource, /import\s+["']\.\/pilot-ai-report-readonly-orithos-uat\.mjs["']/);
  assert.doesNotMatch(entrySource, /\/api\/(?:odoo|shopfront)/i);
});

test("report readonly UAT evaluates dynamic stock questions in English and Chinese", () => {
  assert.match(suiteSource, /How much \$\{stockSample\.name\} is in stock/);
  assert.match(suiteSource, /\$\{stockSample\.name\}现在有多少库存/);
});

test("report readonly UAT reconciles Chinese sales answers with the native report", () => {
  assert.ok(suiteSource.includes('assistant("昨天营业额是多少？")'));
  assert.ok(suiteSource.includes("assistantReportAcceptance(salesChinese"));
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
