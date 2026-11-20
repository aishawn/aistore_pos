import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(directory, "run-local-eval.mjs");
const cases = path.join(directory, "fixtures", "utterances.jsonl");

test("offline fixture checks are blocked as assistant acceptance and return exit code 2", () => {
  const env = { ...process.env };
  delete env.AI_EVAL_ENDPOINT;
  delete env.AI_EVAL_TOKEN;

  const run = spawnSync(process.execPath, [runner, "--cases", cases], {
    cwd: path.resolve(directory, "../.."),
    encoding: "utf8",
    env,
  });

  assert.equal(run.status, 2, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.deepEqual(report.summary, {
    PASS: 0,
    PARTIAL: 0,
    FAIL: 0,
    BLOCKED: report.results.length,
  });
  assert.ok(report.results.every((result) => result.status === "BLOCKED"));
  assert.ok(report.results.every((result) => result.assistantStatus === "NOT_CONFIGURED"));
  assert.ok(report.results.every((result) => result.blockReason === "ENDPOINT_NOT_CONFIGURED"));
  assert.equal(report.fixtureContractAudit.complete + report.fixtureContractAudit.incomplete, report.results.length);
  assert.equal(report.fixtureContractAudit.complete, 16);
  assert.deepEqual(report.fixtureContractAudit.missingAnswerAssertions, [
    "aov-this-week-zh",
    "sales-this-month-zh",
    "sales-last-7-en",
    "aov-last-week-en",
  ]);
  assert.deepEqual(report.fixtureContractAudit.unsupportedNegativeAssertions, []);
});
