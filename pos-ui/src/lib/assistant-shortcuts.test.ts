import assert from "node:assert/strict";
import test from "node:test";
import { fallbackHrefForQuickAction } from "./assistant-shortcuts.ts";

test("price review quick action falls back to the native price suggestions page", () => {
  assert.equal(fallbackHrefForQuickAction("Which prices should I review?"), "/stock/price-suggestions");
});