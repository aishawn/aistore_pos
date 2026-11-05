import assert from "node:assert/strict";
import test from "node:test";
import { summarizeRegisterClosures } from "./register-closure-summary.ts";

test("closure summary adds cash fields and rounds accumulated differences to cents", () => {
  assert.deepEqual(summarizeRegisterClosures([
    { expected: 100.01, received: 100, difference: -0.01 },
    { expected: 50, received: 50.02, difference: 0.02 },
  ]), {
    sessionCount: 2,
    expectedCash: 150.01,
    receivedCash: 150.02,
    cashDifference: 0.01,
    comparableSessionCount: 2,
    missingCashCount: 0,
  });
});

test("closure summary excludes missing cash from comparisons without treating it as zero", () => {
  assert.deepEqual(summarizeRegisterClosures([
    { expected: null, received: 12, difference: null },
    { expected: 25, received: null, difference: null },
  ]), {
    sessionCount: 2,
    expectedCash: 25,
    receivedCash: 12,
    cashDifference: 0,
    comparableSessionCount: 0,
    missingCashCount: 2,
  });
});
