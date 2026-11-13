import assert from "node:assert/strict";
import test from "node:test";
import { assistantAbortOutcome } from "./assistant-request-state.ts";

test("keeps a user-cancelled assistant request distinct from a hard timeout", () => {
  assert.equal(assistantAbortOutcome("user"), "cancelled");
  assert.equal(assistantAbortOutcome("timeout"), "timeout");
});
