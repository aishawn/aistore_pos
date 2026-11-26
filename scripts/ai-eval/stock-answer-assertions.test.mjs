import assert from "node:assert/strict";
import test from "node:test";
import * as stockAssertions from "./stock-answer-assertions.mjs";
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

test("stock oracle requires the native product lookup to confirm a no-match answer", () => {
  const knownProduct = { name: "VB CAN 10PK 375ML", stockQuantity: 24 };
  const falseNoMatch = stockAssertions.evaluateStockOracleAnswer?.("No matching stock found.", "VB CAN 10PK 375ML", [knownProduct]);
  assert.equal(falseNoMatch?.matches, false);

  const confirmedNoMatch = stockAssertions.evaluateStockOracleAnswer?.("No matching stock found.", "UNKNOWN SKU", []);
  assert.equal(confirmedNoMatch?.matches, true);
  assert.equal(stockAssertions.evaluateStockOracleAnswer?.("No matching stock found.", "UNKNOWN SKU", [], false)?.matches, false);
  assert.equal(stockAssertions.evaluateStockOracleAnswer?.("No matching stock found.", "VB CAN 10PK 375ML", [knownProduct])?.matches, false);
  assert.equal(stockAssertions.evaluateStockOracleAnswer?.("VB CAN 10PK 375ML: 24", "UNKNOWN SKU", [knownProduct])?.matches, false);

  const exactStock = stockAssertions.evaluateStockOracleAnswer?.("VB CAN 10PK 375ML: 24", "VB CAN 10PK 375ML", [knownProduct]);
  assert.equal(exactStock?.matches, true);
});
