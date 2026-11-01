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

test("large catalogue batches reduce RPC round trips without truncating coverage", async () => {
  const catalogue = Array.from({ length: 10_013 }, (_, index) => ({ id: index + 1 }));
  let pages = 0;
  const rows = await readCompleteRows(async () => catalogue.length, async (afterId, limit) => {
    pages++;
    assert.equal(limit, 5000);
    return catalogue.filter((row) => row.id > afterId).slice(0, limit);
  }, 25_000, 5000);
  assert.deepEqual(rows, catalogue);
  assert.equal(pages, 3);
  for (const size of [0, -1, 5001, 1.5, NaN]) {
    await assert.rejects(readCompleteRows(async () => 0, async () => [], 25_000, size));
  }
  await assert.rejects(readCompleteRows(async () => 5001, async () => [{ id: 1 }], 25_000, 5000));
});
