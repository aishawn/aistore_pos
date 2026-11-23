import assert from "node:assert/strict";
import test from "node:test";
import { hasNewFrontendBuild } from "./frontend-update";

const current = "a".repeat(40);

test("detects a different complete frontend build SHA", () => {
  assert.equal(hasNewFrontendBuild(current, "b".repeat(40)), true);
});

test("does not report missing, malformed, or matching build identities", () => {
  assert.equal(hasNewFrontendBuild(null, "b".repeat(40)), false);
  assert.equal(hasNewFrontendBuild(current, "unknown"), false);
  assert.equal(hasNewFrontendBuild(current, current.toUpperCase()), false);
});
