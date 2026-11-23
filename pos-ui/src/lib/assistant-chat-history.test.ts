import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantCard } from "@/lib/api";
import { assistantCardMetadataValue, restoredAssistantCardFields, retryQuestionForAssistantCards } from "./assistant-chat-history.ts";

const card = (status: AssistantCard["status"]): AssistantCard => ({
  type: "sommelier",
  title: "Wine recommendations",
  status,
  items: [],
});

test("restores historical cards and binds retry to their original question", () => {
  const cards = [card("unavailable")];
  assert.deepEqual(restoredAssistantCardFields(cards, "Recommend a red wine"), {
    cards,
    retryQuestion: "Recommend a red wine",
  });
});

test("restores report provenance from the persisted assistant message onto its card", () => {
  const restored = restoredAssistantCardFields([card("ready")], "What were sales yesterday?", {
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    dataAsOf: "2026-11-13T01:00:00Z",
    reportPeriodFrom: "2026-11-12",
    reportPeriodTo: "2026-11-12",
    reportTimeZone: "Australia/Adelaide",
    reportDataStatus: "available",
  });
  assert.deepEqual(restored.cards?.[0], {
    ...card("ready"),
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    dataAsOf: "2026-11-13T01:00:00Z",
    reportPeriodFrom: "2026-11-12",
    reportPeriodTo: "2026-11-12",
    reportTimeZone: "Australia/Adelaide",
    reportDataStatus: "available",
  });
});

test("authoritative message provenance overrides stale card provenance", () => {
  const staleCard = {
    ...card("ready"),
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    dataAsOf: "2026-11-10T01:00:00Z",
    reportPeriodFrom: "2026-11-09",
    reportPeriodTo: "2026-11-09",
    reportTimeZone: "UTC",
    reportDataStatus: "incomplete",
  };
  const restored = restoredAssistantCardFields([staleCard], "What were sales yesterday?", {
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    dataAsOf: "2026-11-13T01:00:00Z",
    reportPeriodFrom: "2026-11-12",
    reportPeriodTo: "2026-11-12",
    reportTimeZone: "Australia/Adelaide",
    reportDataStatus: "available",
  });

  assert.deepEqual(restored.cards?.[0], {
    ...staleCard,
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    dataAsOf: "2026-11-13T01:00:00Z",
    reportPeriodFrom: "2026-11-12",
    reportPeriodTo: "2026-11-12",
    reportTimeZone: "Australia/Adelaide",
    reportDataStatus: "available",
  });
});

test("explicitly missing message provenance does not fall back to stale card values", () => {
  const staleCard = {
    ...card("ready"),
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    dataAsOf: "2026-11-10T01:00:00Z",
    reportPeriodFrom: "2026-11-09",
    reportPeriodTo: "2026-11-09",
    reportTimeZone: "UTC",
    reportDataStatus: "incomplete",
  };
  const metadata = {
    dataSource: null,
    storeScope: null,
    dataAsOf: null,
    reportPeriodFrom: null,
    reportPeriodTo: null,
    reportTimeZone: null,
    reportDataStatus: null,
  };
  const restored = restoredAssistantCardFields([staleCard], "What were sales yesterday?", metadata);

  assert.deepEqual(restored.cards?.[0], { ...staleCard, ...metadata });
  assert.equal(assistantCardMetadataValue(metadata, staleCard, "dataAsOf"), null);
});

test("older history without message provenance keeps compatible card metadata", () => {
  const cachedCard = { ...card("ready"), dataAsOf: "2026-11-10T01:00:00Z" };
  assert.equal(assistantCardMetadataValue({}, cachedCard, "dataAsOf"), "2026-11-10T01:00:00Z");
  assert.equal(restoredAssistantCardFields([cachedCard], "Question?")?.cards?.[0].dataAsOf, "2026-11-10T01:00:00Z");
});

test("does not restore retry controls for ready cards or missing cards", () => {
  assert.deepEqual(restoredAssistantCardFields([card("ready")], "Show wine picks"), {
    cards: [card("ready")],
  });
  assert.deepEqual(restoredAssistantCardFields(undefined, "Show wine picks"), {});
});

test("does not restore retry controls for explicitly non-retryable unavailable cards", () => {
  const unavailable = { ...card("unavailable"), retryable: false };
  assert.deepEqual(restoredAssistantCardFields([unavailable], "Recommend a red wine"), {
    cards: [unavailable],
  });
  assert.equal(retryQuestionForAssistantCards([unavailable], "Recommend a red wine"), undefined);
  assert.equal(retryQuestionForAssistantCards([card("unavailable")], "Recommend a red wine"), "Recommend a red wine");
});

test("history keeps independent metadata on the cards of an opportunities brief", () => {
  const cards = restoredAssistantCardFields([
    { type: "opportunities", title: "Store growth opportunities" },
    { type: "sales", title: "This week's sales", reportPeriodFrom: "2026-11-23", reportDataStatus: "available" },
    { type: "replenishment", title: "Restock opportunities", reportPeriodFrom: "2026-09-29", reportDataStatus: "incomplete" },
  ], undefined, { reportPeriodFrom: "2026-11-23", reportDataStatus: "incomplete" }).cards;

  assert.equal(cards?.[1].reportDataStatus, "available");
  assert.equal(cards?.[2].reportPeriodFrom, "2026-09-29");
});
