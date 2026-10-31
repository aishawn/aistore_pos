import { test } from "node:test";
import assert from "node:assert/strict";
import { readCompleteRows } from "./replenishment-pagination.ts";

test("complete catalogue includes selling products beyond the former 1000 cutoff", async () => {
  const catalogue = Array.from({ length: 2341 }, (_, index) => ({ id: index * 3 + 1 }));
  const rows = await readCompleteRows(async () => catalogue.length,
    async (afterId, limit) => catalogue.filter((row) => row.id > afterId).slice(0, limit));
  assert.deepEqual(rows, catalogue);
});

test("incomplete pages, overlapping IDs, count changes and safety limits fail closed", async () => {
  await assert.rejects(readCompleteRows(async () => 2, async () => [{ id: 1 }]));
  await assert.rejects(readCompleteRows(async () => 2, async () => [{ id: 1 }, { id: 1 }]));
  await assert.rejects(readCompleteRows(async () => 0, async () => undefined));
  let reads = 0;
  await assert.rejects(readCompleteRows(async () => ++reads, async () => [{ id: 1 }]));
  await assert.rejects(readCompleteRows(async () => 25001, async () => []));
  assert.deepEqual(await readCompleteRows(async () => 0, async () => []), []);
});
