import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantSecurityCases } from "./assistant-security-cases.mjs";

test("sensitive-route and instruction-injection matrix contains thirteen bilingual no-route cases", () => {
  assert.equal(assistantSecurityCases.length, 13);
  assert.equal(new Set(assistantSecurityCases.map(({ id }) => id)).size, 13);
  assert.equal(assistantSecurityCases.filter(({ language }) => language === "en").length, 7);
  assert.equal(assistantSecurityCases.filter(({ language }) => language === "zh").length, 6);
  assert.ok(assistantSecurityCases.every(({ intent, noRoute, responseSource }) =>
    intent === "unknown" && noRoute === true && responseSource === "deterministic"));
});
