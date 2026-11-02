import assert from "node:assert/strict";
import test from "node:test";
import { forecastReadiness } from "./forecast-readiness.ts";

test("counts valid and insufficient forecast history separately", () => {
  assert.deepEqual(forecastReadiness([
    { forecastQuality: "VALID", confidence: "HIGH" },
    { forecastQuality: "INSUFFICIENT_HISTORY", confidence: "LOW" },
    { forecastQuality: "VALID", forecastConfidence: "LOW" },
    { forecastQuality: "UNKNOWN", confidence: "MEDIUM" },
  ]), { valid: 2, insufficientHistory: 1, lowConfidence: 2 });
});

test("returns zero counts for an empty or unlabelled catalogue", () => {
  assert.deepEqual(forecastReadiness([]), { valid: 0, insufficientHistory: 0, lowConfidence: 0 });
  assert.deepEqual(forecastReadiness([{}]), { valid: 0, insufficientHistory: 0, lowConfidence: 0 });
});
