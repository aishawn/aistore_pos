import assert from "node:assert/strict";
import test from "node:test";
import { compareStockAnswer, parseStockAnswer } from "./stock-answer-assertions.mjs";

test("parses English stock with freshness suffix", () => {
  assert.deepEqual(parseStockAnswer("VB CAN 10PK 375ML: 24 (inventory update time unknown; verify before relying on it)"), {
    name: "VB CAN 10PK 375ML",
    quantity: 24,
  });
});

test("parses Chinese stock with units and freshness suffix", () => {
  assert.deepEqual(parseStockAnswer("VB CAN 10PK 375ML库存：2.5 件（库存更新时间未知，请核实）"), {
    name: "VB CAN 10PK 375ML",
    quantity: 2.5,
  });
});

test("compares exact product name and quantity while allowing case differences", () => {
  assert.equal(compareStockAnswer("vb can 10pk 375ml: -2", {
    name: "VB CAN 10PK 375ML", stockQuantity: -2,
  }).matches, true);
  assert.equal(compareStockAnswer("VB CAN 10PK 375ML: 20", {
    name: "VB CAN 10PK 375ML", stockQuantity: 21,
  }).matches, false);
});

test("does not treat ambiguous or malformed stock answers as a single product result", () => {
  assert.equal(parseStockAnswer("Multiple products match VB CAN: A; B. Please specify the exact product name."), null);
  assert.equal(parseStockAnswer("No matching stock found."), null);
});
