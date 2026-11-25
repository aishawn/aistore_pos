import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, "../..");
const validator = path.join(directory, "validate-catalog.mjs");

function runValidator(input) {
  return spawnSync(process.execPath, [validator, input], {
    cwd: repository,
    encoding: "utf8",
  });
}

test("all committed AI evaluation catalogs satisfy their executable contracts", () => {
  for (const fixture of ["utterances.jsonl", "dynamic-report-utterances.jsonl", "readonly-smoke.jsonl"]) {
    const result = runValidator(path.join(directory, "fixtures", fixture));
    assert.equal(result.status, 0, `${fixture}: ${result.stdout}${result.stderr}`);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary.errors, []);
    assert.deepEqual(summary.missingAnswerExpectationIds, []);
    assert.equal(summary.coveredFactualCases, summary.factualCases);
  }
});

test("factual fixtures without a positive answer contract are rejected", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-eval-catalog-"));
  const input = path.join(temporaryDirectory, "missing-answer.jsonl");
  fs.writeFileSync(input, `${JSON.stringify({
    id: "missing-answer",
    category: "sales",
    question: "How much did we sell?",
    expected: { intent: "report_sales" },
  })}\n`);

  try {
    const result = runValidator(input);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /missing positive answer expectation/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("dynamic factual reports require a metric and period and count as answer coverage", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-eval-catalog-"));
  const input = path.join(temporaryDirectory, "dynamic-report.jsonl");
  fs.writeFileSync(input, `${JSON.stringify({
    id: "dynamic-sales",
    category: "sales",
    question: "How much did we make this month?",
    expected: { intent: "report_sales", metric: "sales", period: "current_month" },
  })}\n`);

  try {
    const result = runValidator(input);
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout).missingAnswerExpectationIds, []);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("unstructured negative prose is rejected instead of counted as coverage", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-eval-catalog-"));
  const input = path.join(temporaryDirectory, "unsupported-negative.jsonl");
  fs.writeFileSync(input, `${JSON.stringify({
    id: "unsupported-negative",
    category: "sales",
    question: "How much did we sell?",
    expected: {
      intent: "report_sales",
      data: { revenue: 12.5 },
      negative: ["do not invent a sales total"],
    },
  })}\n`);

  try {
    const result = runValidator(input);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /unsupported negative assertion/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("valid JSON with a non-object value is reported as a catalog error", () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-eval-catalog-"));
  const input = path.join(temporaryDirectory, "non-object.jsonl");
  fs.writeFileSync(input, "null\n");

  try {
    const result = runValidator(input);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /line 1: case must be an object/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
