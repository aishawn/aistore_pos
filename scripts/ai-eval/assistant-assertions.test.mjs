import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantTraceability,
  assistantFastPathSafety,
  replenishmentCardAcceptance,
  AUTHORITATIVE_ASSISTANT_DATA_SOURCE,
  readOnlyApiAcceptanceStatus,
} from "./assistant-assertions.mjs";

const expected = {
  from: "2026-11-12",
  to: "2026-11-12",
  timeZone: "Australia/Adelaide",
};

function response(overrides = {}) {
  return {
    dataAsOf: "2026-11-13T01:00:00Z",
    dataSource: AUTHORITATIVE_ASSISTANT_DATA_SOURCE,
    source: "deterministic",
    llmFallback: false,
    storeScope: "current_authenticated_store",
    reportPeriodFrom: expected.from,
    reportPeriodTo: expected.to,
    reportTimeZone: expected.timeZone,
    reportDataStatus: "available",
    writeRequests: [],
    ...overrides,
  };
}

test("authoritative report traceability passes only for current provenance and read-only response", () => {
  assert.deepEqual(assistantTraceability(response(), expected), {
    dataAsOf: true,
    storeScope: true,
    dataSource: true,
    period: true,
    timezone: true,
    dataStatus: true,
    deterministicRoute: true,
    writeSafety: true,
  });
});

test("missing or non-empty writeRequests fail read-only acceptance", () => {
  assert.equal(assistantTraceability(response({ writeRequests: undefined }), expected).writeSafety, false);
  assert.equal(assistantTraceability(response({ writeRequests: [{ type: "update" }] }), expected).writeSafety, false);
});

test("model classification fallback fails the deterministic latency acceptance", () => {
  assert.equal(assistantTraceability(response({ llmFallback: true }), expected).deterministicRoute, false);
  assert.equal(assistantTraceability(response({ source: "llm" }), expected).deterministicRoute, false);
});

test("dynamic read-only utterances require deterministic routing and an empty write set", () => {
  const assistant = response();
  assert.deepEqual(assistantFastPathSafety(assistant), { deterministicRoute: true, writeSafety: true });
  assert.deepEqual(assistantFastPathSafety(response({ source: "llm", writeRequests: ["update"] })), {
    deterministicRoute: false,
    writeSafety: false,
  });
});

test("legacy source and mismatched metadata fail provenance acceptance", () => {
  const traceability = assistantTraceability(response({
    dataSource: "orithos",
    reportPeriodTo: "2026-11-11",
  }), expected);
  assert.equal(traceability.dataSource, false);
  assert.equal(traceability.period, false);
});

test("non-available report states are not accepted as reconciled metrics", () => {
  assert.equal(assistantTraceability(response({ reportDataStatus: "incomplete" }), expected).dataStatus, false);
  assert.equal(assistantTraceability(response({ reportDataStatus: "unavailable" }), expected).dataStatus, false);
});

test("unavailable read-only services are recorded as blocked instead of aborting the report", () => {
  assert.equal(readOnlyApiAcceptanceStatus(200, 50331, false), "BLOCKED");
  assert.equal(readOnlyApiAcceptanceStatus(503, null, false), "BLOCKED");
  assert.equal(readOnlyApiAcceptanceStatus(200, 0, true), "PASS");
  assert.equal(readOnlyApiAcceptanceStatus(200, 0, false), "FAIL");
});

test("partial replenishment cards expose their state, source, data time, and data gaps", () => {
  const result = replenishmentCardAcceptance({
    answer: "Some items were excluded because data is missing: Shiraz: supplier unavailable. Source: Orithos inventory and sales ledger; latest available ledger data at 2026-11-14T09:22:25Z.",
    cards: [{
      type: "replenishment",
      status: "partial",
      summary: "Top restock suggestions.\nSource: Orithos inventory and sales ledger; latest available ledger data at 2026-11-14T09:22:25Z.\nSome items were excluded because data is missing: Shiraz: supplier unavailable.",
    }],
  });
  assert.deepEqual(result, {
    expectedStatus: "partial",
    cardPresent: true,
    statusMatches: true,
    sourceVisible: true,
    dataAsOfVisible: true,
    dataGapsVisible: true,
    passed: true,
  });
});

test("missing provenance or hidden data gaps fail replenishment card acceptance", () => {
  const result = replenishmentCardAcceptance({
    answer: "Replenishment data is incomplete: supplier details missing. Source: Orithos inventory and sales ledger; latest available ledger data at 2026-11-14T09:22:25Z.",
    cards: [{ type: "replenishment", status: "ready", summary: "Top restock suggestions." }],
  });
  assert.equal(result.statusMatches, false);
  assert.equal(result.sourceVisible, false);
  assert.equal(result.dataAsOfVisible, false);
  assert.equal(result.dataGapsVisible, false);
});
