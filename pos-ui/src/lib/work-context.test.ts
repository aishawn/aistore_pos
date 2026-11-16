import assert from "node:assert/strict";
import test from "node:test";
import { hasBlockingWorkActivityInCurrentTab, readWorkActivityInCurrentTab, writeWorkActivity } from "./work-context.ts";

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  key(index: number) { return [...values.keys()][index] ?? null; },
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) { values.set(key, value); },
  removeItem(key: string) { values.delete(key); },
};

Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
Object.defineProperty(globalThis, "window", {
  value: { addEventListener() {} },
  configurable: true,
});

test("blocking work activity protects an in-flight register operation", () => {
  writeWorkActivity(true, "user-1", "operation");
  assert.equal(readWorkActivityInCurrentTab("user-1"), "operation");
  assert.equal(hasBlockingWorkActivityInCurrentTab("user-1"), true);
  assert.equal(hasBlockingWorkActivityInCurrentTab("user-2"), false);
  writeWorkActivity(false, "user-1");
  assert.equal(hasBlockingWorkActivityInCurrentTab("user-1"), false);
});

test("cart activity remains confirmable instead of being treated as an in-flight operation", () => {
  writeWorkActivity(true, "user-1", "cart");
  assert.equal(readWorkActivityInCurrentTab("user-1"), "cart");
  assert.equal(hasBlockingWorkActivityInCurrentTab("user-1"), false);
  writeWorkActivity(false, "user-1");
});

test("unsaved register counts are reported separately from carts and pending operations", () => {
  writeWorkActivity(true, "user-1", "unsaved");
  assert.equal(readWorkActivityInCurrentTab("user-1"), "unsaved");
  writeWorkActivity(false, "user-1");
});
