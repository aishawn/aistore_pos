import assert from "node:assert/strict";
import { test } from "node:test";
import {
  selectTranscriptionUatCases,
  summarizeTranscriptionUatResults,
  transcriptionRequestShouldStop,
  transcriptionUatCasesForRuntime,
} from "./transcription-uat-contract.mjs";

test("online transcription cases run only against the exact source runtime", () => {
  const cases = [{ id: "en" }, { id: "zh" }];
  assert.equal(transcriptionUatCasesForRuntime(cases, true), cases);
  assert.deepEqual(transcriptionUatCasesForRuntime(cases, false), []);
  assert.deepEqual(transcriptionUatCasesForRuntime(cases, true, true), []);
});

test("online transcription evaluation has an explicit bounded request budget", () => {
  const cases = Array.from({ length: 100 }, (_, index) => ({ id: String(index) }));
  assert.deepEqual(selectTranscriptionUatCases(cases, 10, 3), cases.slice(10, 13));
  assert.throws(() => selectTranscriptionUatCases(cases, 0, 101), /between 1 and 100/);
  assert.throws(() => selectTranscriptionUatCases(cases, -1, 2), /nonnegative integer/);
});

test("online ASR requests stop after provider quota exhaustion", () => {
  assert.equal(transcriptionRequestShouldStop(42901), true);
  assert.equal(transcriptionRequestShouldStop(50301), false);
  assert.equal(transcriptionRequestShouldStop(0), false);
});

test("online transcription reports aggregate status and latency without sample data", () => {
  const summary = summarizeTranscriptionUatResults([
    { caseId: "private-id", transcript: "private transcript", language: "en-AU", scenario: "product", status: "PASS", latencyMs: 100 },
    { caseId: "private-id-2", transcript: "private transcript 2", language: "en-AU", scenario: "product", status: "BLOCKED", latencyMs: 300 },
    { language: "zh-CN", scenario: "barcode", status: "FAIL", latencyMs: 200 },
  ]);
  assert.deepEqual(summary, [
    {
      language: "en-AU",
      scenario: "product",
      requested: 2,
      passed: 1,
      failed: 0,
      blocked: 1,
      errorRate: 0.5,
      latencyMs: { samples: 2, p50: 100, p95: 300 },
    },
    {
      language: "zh-CN",
      scenario: "barcode",
      requested: 1,
      passed: 0,
      failed: 1,
      blocked: 0,
      errorRate: 1,
      latencyMs: { samples: 1, p50: 200, p95: 200 },
    },
  ]);
  assert.equal(JSON.stringify(summary).includes("private"), false);
});
