import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearOperationsPreviewSnapshots,
  SESSION_WARM_CACHE,
  staleOperationsPreviewSnapshot,
  storeOperationsPreviewSnapshot,
  warmOperationsPreviewSnapshot,
} from "./assistant-operations-snapshot-cache.ts";
import type { AssistantResponse } from "./api.ts";

const sampleResponse = (dataSource = "orithos_ledger"): AssistantResponse => ({
  threadId: "",
  intent: "report_sales",
  intentSummary: "This week's sales",
  answer: "Net sales $10.00 from 2 sales.",
  slots: {},
  ui: null,
  writeRequests: [],
  source: "deterministic",
  dataAsOf: "2026-11-13T01:00:00Z",
  dataSource,
  cards: [{
    type: "sales",
    title: "This week's sales",
    status: "ready",
    summary: "Net sales $10.00 from 2 sales.",
    dataSource,
    dataAsOf: "2026-11-13T01:00:00Z",
  }],
});

test("warm snapshots surface session cache for recent reads", () => {
  clearOperationsPreviewSnapshots();
  storeOperationsPreviewSnapshot("sales_week", sampleResponse());
  const warm = warmOperationsPreviewSnapshot("sales_week");
  assert.equal(warm?.cards?.[0].dataSource, SESSION_WARM_CACHE);
  assert.match(warm?.answer ?? "", /\$10\.00/);
});

test("stale snapshots annotate partial fallback", () => {
  clearOperationsPreviewSnapshots();
  storeOperationsPreviewSnapshot("sales_week", sampleResponse());
  const stale = staleOperationsPreviewSnapshot("sales_week", false);
  assert.equal(stale?.cards?.[0].status, "partial");
  assert.match(stale?.answer ?? "", /Live query failed/);
  assert.match(stale?.answer ?? "", /2026-11-13T01:00:00Z/);
});