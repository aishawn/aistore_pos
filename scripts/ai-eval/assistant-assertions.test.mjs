import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantTraceability,
  assistantFastPathSafety,
  assistantUtteranceAcceptance,
  assistantUtteranceStatus,
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

test("utterance acceptance checks answer content, language, routing, query and safety", () => {
  const result = assistantUtteranceAcceptance({
    intent: "report_sales",
    route: null,
    noRoute: true,
    answerIncludes: ["营业额", "AUD"],
    answerExcludes: ["Odoo"],
    answerRegex: "2026-11-12.*AUD 1,234\\.50",
    answerLanguage: "zh",
  }, {
    intent: "report_sales",
    route: null,
    slots: {},
    answer: "2026-11-12 营业额 AUD 1,234.50。",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });

  assert.deepEqual(result, {
    intent: true,
    route: true,
    noRoute: true,
    query: true,
    answerNonEmpty: true,
    answerContentAssertionRequired: true,
    answerAssertionsPresent: true,
    answerIncludes: true,
    answerExcludes: true,
    answerRegex: true,
    answerLanguage: true,
    deterministicRoute: true,
    writeSafety: true,
    passed: true,
  });
});

test("utterance acceptance fails on wrong answer text, language, route, slot or safety", () => {
  const result = assistantUtteranceAcceptance({
    intent: "report_stock",
    route: null,
    noRoute: true,
    query: "Shiraz",
    answerIncludes: ["3"],
    answerExcludes: ["0 units"],
    answerRegex: "3 units",
    answerLanguage: "zh",
  }, {
    intent: "report_stock",
    route: "/products",
    slots: { query: "Cabernet" },
    answer: "3 units in stock",
    source: "llm",
    llmFallback: true,
    writeRequests: [{ type: "update" }],
  });

  assert.deepEqual(result, {
    intent: true,
    route: false,
    noRoute: false,
    query: false,
    answerNonEmpty: true,
    answerContentAssertionRequired: true,
    answerAssertionsPresent: true,
    answerIncludes: true,
    answerExcludes: true,
    answerRegex: true,
    answerLanguage: false,
    deterministicRoute: false,
    writeSafety: false,
    passed: false,
  });
});

test("factual answers require explicit positive content expectations", () => {
  const result = assistantUtteranceAcceptance({ intent: "report_stock" }, {
    intent: "report_stock",
    answer: "No matching stock found.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });

  assert.equal(result.answerAssertionsPresent, false);
  assert.equal(result.answerContentAssertionRequired, true);
  assert.equal(result.passed, false);
});

test("empty expected snippets do not satisfy factual answer coverage", () => {
  const result = assistantUtteranceAcceptance({ intent: "report_sales", answerIncludes: ["", "  "] }, {
    intent: "report_sales",
    answer: "Sales were AUD 1,234.50.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });

  assert.equal(result.answerAssertionsPresent, false);
  assert.equal(result.answerIncludes, true);
  assert.equal(result.passed, false);
});

test("empty responses fail even when the expected intent and route match", () => {
  const result = assistantUtteranceAcceptance({ intent: "navigate", route: "/products" }, {
    intent: "navigate",
    route: "/products",
    answer: "  ",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });

  assert.equal(result.answerNonEmpty, false);
  assert.equal(result.answerContentAssertionRequired, false);
  assert.equal(result.passed, false);
});

test("runner blocks missing answer contracts but keeps known behavior failures as failures", () => {
  const missingAnswerContract = assistantUtteranceAcceptance({ intent: "report_stock" }, {
    intent: "report_stock",
    answer: "No matching stock found.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });
  assert.deepEqual(assistantUtteranceStatus(missingAnswerContract, {
    sourceRuntimeMatch: true,
    unavailable: false,
    noWrites: true,
  }), { status: "BLOCKED", blockReason: "ANSWER_ASSERTIONS_MISSING" });

  const wrongRoute = assistantUtteranceAcceptance({ intent: "report_stock", route: null }, {
    intent: "navigate",
    route: "/products",
    answer: "No matching stock found.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });
  assert.deepEqual(assistantUtteranceStatus(wrongRoute, {
    sourceRuntimeMatch: true,
    unavailable: false,
    noWrites: true,
  }), { status: "FAIL", blockReason: null });

  const completeContract = assistantUtteranceAcceptance({ intent: "navigate" }, {
    intent: "navigate",
    answer: "Opened the products page.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });
  assert.deepEqual(assistantUtteranceStatus(completeContract, {
    sourceRuntimeMatch: true,
    unavailable: false,
    noWrites: false,
  }), { status: "FAIL", blockReason: null });
});

test("runner marks environment mismatch and unavailable service as blocked", () => {
  const acceptance = assistantUtteranceAcceptance({ intent: "navigate" }, {
    intent: "navigate",
    answer: "Opened the products page.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });
  assert.deepEqual(assistantUtteranceStatus(acceptance, {
    sourceRuntimeMatch: false,
    unavailable: false,
    noWrites: true,
  }), { status: "BLOCKED", blockReason: "SOURCE_RUNTIME_MISMATCH" });
  assert.deepEqual(assistantUtteranceStatus(acceptance, {
    sourceRuntimeMatch: true,
    unavailable: true,
    noWrites: true,
  }), { status: "BLOCKED", blockReason: "SERVICE_UNAVAILABLE" });
});

test("invalid expected answer regex fails closed", () => {
  assert.equal(assistantUtteranceAcceptance({ answerRegex: "[" }, {
    answer: "anything",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  }).answerRegex, false);
});

test("noRoute false does not require a navigation route", () => {
  const result = assistantUtteranceAcceptance({ noRoute: false }, {
    route: null,
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });

  assert.equal(result.noRoute, true);
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
