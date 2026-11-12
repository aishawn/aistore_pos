import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantCard } from "@/lib/api";
import { restoredAssistantCardFields, retryQuestionForAssistantCards } from "./assistant-chat-history.ts";

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
