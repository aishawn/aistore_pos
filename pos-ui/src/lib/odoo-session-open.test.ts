import assert from "node:assert/strict";
import test from "node:test";
import { resolveRegisterOpenDecision } from "./odoo-session-open.ts";

const target = { configId: 7, companyId: 3, hasOpenSession: false };

test("denies register opening outside the authenticated tenant company", () => {
  assert.equal(resolveRegisterOpenDecision(target, 7, [4]), "denied");
  assert.equal(resolveRegisterOpenDecision(target, 8, [3]), "denied");
  assert.equal(resolveRegisterOpenDecision(null, 7, [3]), "denied");
});

test("returns the existing open session without requesting another open", () => {
  assert.equal(resolveRegisterOpenDecision({ ...target, hasOpenSession: true }, 7, [3]), "already-open");
});

test("opens a closed register only inside the authenticated tenant company", () => {
  assert.equal(resolveRegisterOpenDecision(target, 7, [3]), "open");
});
