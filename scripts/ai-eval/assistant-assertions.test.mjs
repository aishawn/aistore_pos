import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantTraceability,
  assistantFastPathSafety,
  assistantUtteranceAcceptance,
  assistantUtteranceStatus,
  replenishmentCardAcceptance,
  AUTHORITATIVE_ASSISTANT_DATA_SOURCE,
  expectedReportDataStatus,
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
    slots: true,
    answerNonEmpty: true,
    answerData: true,
    answerContentAssertionRequired: true,
    answerAssertionsPresent: true,
    answerIncludes: true,
    answerExcludes: true,
    answerRegex: true,
    answerLanguage: true,
    negativeAssertionsPresent: true,
    unsupportedNegativeAssertions: [],
    deterministicRoute: true,
    writeSafety: true,
    entitySlotChecks: {},
    expectedDataChecks: {},
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
    slots: true,
    answerNonEmpty: true,
    answerData: true,
    answerContentAssertionRequired: true,
    answerAssertionsPresent: true,
    answerIncludes: true,
    answerExcludes: true,
    answerRegex: true,
    answerLanguage: false,
    negativeAssertionsPresent: true,
    unsupportedNegativeAssertions: [],
    deterministicRoute: false,
    writeSafety: false,
    entitySlotChecks: {},
    expectedDataChecks: {},
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

test("fixed-snapshot metrics match exact structured values and formatted answer values", () => {
  const structured = assistantUtteranceAcceptance({
    intent: "report_sales",
    data: { revenue: 1840.5, transactions: 73 },
  }, {
    intent: "report_sales",
    table: { revenue: "1840.50", transactions: 73 },
    answer: "Sales were AUD 1,840.50 across 73 tickets.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });
  assert.deepEqual(structured.expectedDataChecks, { revenue: true, transactions: true });
  assert.equal(structured.answerData, true);
  assert.equal(structured.answerAssertionsPresent, true);
  assert.equal(structured.passed, true);

  const formattedText = assistantUtteranceAcceptance({
    intent: "report_sales",
    data: { revenue: 1840.5 },
  }, {
    intent: "report_sales",
    answer: "2026-10-28 营业额 AUD 1,840.50。",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });
  assert.equal(formattedText.answerData, true);

  const dateFragmentsAreNotMetrics = assistantUtteranceAcceptance({
    intent: "report_sales",
    data: { revenue: 10 },
  }, {
    intent: "report_sales",
    answer: "No completed sales found for 2026-10-10.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });
  assert.equal(dateFragmentsAreNotMetrics.answerData, false);
});

test("profit and average-ticket assertions reconcile against authoritative report field names", () => {
  const correct = assistantUtteranceAcceptance({
    intent: "report_sales",
    data: { profit: 412.75, aov: 25.21, transactions: 73 },
  }, {
    intent: "report_sales",
    table: { rows: [{ grossProfit: "412.75", averageSale: "25.21", tickets: 73 }] },
    answer: "Gross profit was AUD 399.00 and average ticket AUD 20.00 across 73 transactions.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });
  assert.deepEqual(correct.expectedDataChecks, { profit: true, aov: true, transactions: true });
  assert.equal(correct.passed, true);

  const sentenceEndingAmount = assistantUtteranceAcceptance({
    intent: "report_sales",
    data: { revenue: 1840.5 },
  }, {
    intent: "report_sales",
    answer: "Sales were AUD 1,840.50.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });
  assert.equal(sentenceEndingAmount.expectedDataChecks.revenue, true);

  const conflictingCard = assistantUtteranceAcceptance({
    intent: "report_sales",
    data: { profit: 412.75 },
  }, {
    intent: "report_sales",
    table: { rows: [{ grossProfit: "401.00" }] },
    answer: "Gross profit was AUD 412.75.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });
  assert.equal(conflictingCard.answerData, false);
  assert.equal(conflictingCard.passed, false);
});

test("structured wrong metrics and date or barcode slot mismatches fail", () => {
  const result = assistantUtteranceAcceptance({
    intent: "report_stock",
    entities: { product: "VB Cans", stock: 48, barcode: "9310000001010", date: "2026-10-28" },
  }, {
    intent: "report_stock",
    slots: { query: "VB Cans", barcode: "9310000001010" },
    reportPeriodFrom: "2026-10-27",
    reportPeriodTo: "2026-10-27",
    table: { stockQuantity: 47 },
    answer: "VB Cans: 48 units.",
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });

  assert.equal(result.query, true);
  assert.deepEqual(result.entitySlotChecks, { barcode: true, date: false });
  assert.deepEqual(result.expectedDataChecks, { stock: false });
  assert.equal(result.answerData, false);
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

test("clarification expectations match the explicit assistant clarification flag", () => {
  const expected = { intent: "qa", clarification: true };
  const assistant = {
    intent: "qa",
    answer: "Which Shiraz did you mean?",
    clarificationRequired: true,
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  };

  assert.equal(assistantUtteranceAcceptance(expected, assistant).clarification, true);
  assert.equal(assistantUtteranceAcceptance(expected, { ...assistant, clarificationRequired: false }).clarification, false);
  assert.equal(assistantUtteranceAcceptance(expected, { ...assistant, clarificationRequired: undefined }).clarification, false);
});

test("unstructured negative expectations block acceptance instead of being ignored", () => {
  const acceptance = assistantUtteranceAcceptance({
    intent: "qa",
    negative: ["do not guess between Shiraz products", "writeRequests empty"],
  }, {
    intent: "qa",
    answer: "Which Shiraz did you mean?",
    clarificationRequired: true,
    source: "deterministic",
    llmFallback: false,
    writeRequests: [],
  });

  assert.equal(acceptance.negativeAssertionsPresent, false);
  assert.deepEqual(acceptance.unsupportedNegativeAssertions, ["do not guess between Shiraz products"]);
  assert.deepEqual(assistantUtteranceStatus(acceptance, {
    sourceRuntimeMatch: true,
    unavailable: false,
    noWrites: true,
  }), { status: "BLOCKED", blockReason: "NEGATIVE_ASSERTIONS_UNSUPPORTED" });
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

test("report data status reflects incomplete direct report metrics", () => {
  assert.equal(expectedReportDataStatus({ costAvailable: true, grossProfit: 125.5 }), "available");
  assert.equal(expectedReportDataStatus({ costAvailable: false, grossProfit: null }), "incomplete");
  assert.equal(expectedReportDataStatus({ dataStatus: "unavailable", costAvailable: false }), "unavailable");
});

test("unavailable read-only services are recorded as blocked instead of aborting the report", () => {
  assert.equal(readOnlyApiAcceptanceStatus(200, 50331, false), "BLOCKED");
  assert.equal(readOnlyApiAcceptanceStatus(503, null, false), "BLOCKED");
  assert.equal(readOnlyApiAcceptanceStatus(200, 0, true), "PASS");
  assert.equal(readOnlyApiAcceptanceStatus(200, 0, false), "FAIL");
});

test("partial replenishment cards expose their state, source, data time, and data gaps", () => {
  const result = replenishmentCardAcceptance({
    answer: "Some items are excluded pending data review: Shiraz: supplier unavailable. Source: Orithos inventory and sales ledger; latest available ledger data at 2026-11-14T09:22:25Z.",
    cards: [{
      type: "replenishment",
      status: "partial",
      summary: "Top restock suggestions.\nSource: Orithos inventory and sales ledger; latest available ledger data at 2026-11-14T09:22:25Z.\nSome items are excluded pending data review: Shiraz: supplier unavailable.",
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
