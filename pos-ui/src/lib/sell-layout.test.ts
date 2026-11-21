import assert from "node:assert/strict";
import test from "node:test";
import { cn } from "./utils";
import { getSellLayoutClasses } from "./sell-layout";

test("sale keys LEFT places shortcuts before checkout", () => {
  assert.deepEqual(getSellLayoutClasses("LEFT"), {
    quickKeys: "order-2 lg:order-none lg:col-start-1 lg:row-start-2",
    checkout: "order-3 lg:col-start-2 lg:row-start-2 lg:w-auto",
    grid: "lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_minmax(0,1fr)]",
  });
});

test("sale keys RIGHT keeps the existing layout", () => {
  assert.deepEqual(getSellLayoutClasses("RIGHT"), {
    quickKeys: "order-2 lg:order-none lg:col-start-2 lg:row-start-2",
    checkout: "order-3 lg:col-start-1 lg:row-start-2 lg:w-auto",
    grid: "lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]",
  });
});

test("sale keys BOTTOM places checkout above shortcuts", () => {
  assert.deepEqual(getSellLayoutClasses("BOTTOM"), {
    quickKeys: "order-3 lg:col-span-2 lg:col-start-1 lg:row-start-3",
    checkout: "order-2 lg:col-span-2 lg:col-start-1 lg:row-start-2 lg:w-auto",
    grid: "lg:grid-cols-2 lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)]",
  });
});

test("unknown sale keys positions fall back to RIGHT", () => {
  assert.deepEqual(getSellLayoutClasses("default"), getSellLayoutClasses("RIGHT"));
});

test("configured checkout placement overrides the cart panel defaults", () => {
  const classes = cn(
    "order-3 lg:col-start-1 lg:row-start-2 lg:w-auto",
    getSellLayoutClasses("LEFT").checkout,
  );
  assert.match(classes, /lg:col-start-2/);
  assert.doesNotMatch(classes, /lg:col-start-1/);
});
