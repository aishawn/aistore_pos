import assert from "node:assert/strict";
import { test } from "node:test";
import { transcriptionUatCasesForRuntime } from "./transcription-uat-contract.mjs";

test("online transcription cases run only against the exact source runtime", () => {
  const cases = [{ id: "en" }, { id: "zh" }];
  assert.equal(transcriptionUatCasesForRuntime(cases, true), cases);
  assert.deepEqual(transcriptionUatCasesForRuntime(cases, false), []);
  assert.deepEqual(transcriptionUatCasesForRuntime(cases, true, true), []);
});
