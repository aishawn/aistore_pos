import assert from "node:assert/strict";
import { test } from "node:test";
import { selectTranscriptionUatCases, transcriptionUatCasesForRuntime } from "./transcription-uat-contract.mjs";

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
