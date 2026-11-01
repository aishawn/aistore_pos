import assert from "node:assert/strict";
import test from "node:test";
import { isSupportedForecastModelVersion } from "./forecast-version.ts";

test("accepts forecast catalogue versions supported by the replenishment contract", () => {
  assert.equal(isSupportedForecastModelVersion("5"), true);
  assert.equal(isSupportedForecastModelVersion("6"), true);
});

test("rejects missing and unknown forecast versions", () => {
  assert.equal(isSupportedForecastModelVersion(undefined), false);
  assert.equal(isSupportedForecastModelVersion("7"), false);
  assert.equal(isSupportedForecastModelVersion(6), false);
});
