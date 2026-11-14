export const AUTHORITATIVE_ASSISTANT_DATA_SOURCE = "orithos_ledger";

const ANSWER_CONTENT_INTENTS = new Set([
  "product_count",
  "qa",
  "report_adhoc",
  "report_aov",
  "report_dead_stock",
  "report_qty",
  "report_sales",
  "report_stock",
  "report_stock_value",
  "search_customer",
  "search_product",
  "unknown",
]);

function requiresAnswerContent(intent) {
  return Array.isArray(intent)
    ? intent.some((item) => ANSWER_CONTENT_INTENTS.has(item))
    : ANSWER_CONTENT_INTENTS.has(intent);
}

export function assistantFastPathSafety(assistant) {
  return {
    deterministicRoute: assistant.source === "deterministic" && assistant.llmFallback === false,
    writeSafety: Array.isArray(assistant.writeRequests) && assistant.writeRequests.length === 0,
  };
}

export function assistantUtteranceAcceptance(expected = {}, assistant = {}) {
  const route = assistant.route ?? assistant.ui?.route ?? null;
  const query = assistant.slots?.query ?? null;
  const answer = typeof assistant.answer === "string" ? assistant.answer : "";
  const expectedQuery = typeof expected.entities?.product === "string"
    ? expected.entities.product
    : typeof expected.query === "string" ? expected.query : null;
  const expectedIntent = expected.intent;
  const answerIncludes = Array.isArray(expected.answerIncludes)
    ? expected.answerIncludes.filter((text) => typeof text === "string" && text.trim().length > 0)
    : [];
  const answerExcludes = Array.isArray(expected.answerExcludes) ? expected.answerExcludes : [];
  const answerContentAssertionRequired = requiresAnswerContent(expectedIntent);
  const answerAssertionsPresent = !answerContentAssertionRequired
    || answerIncludes.length > 0
    || (typeof expected.answerRegex === "string" && expected.answerRegex.trim().length > 0);
  let answerRegex = true;
  if (expected.answerRegex) {
    try {
      answerRegex = new RegExp(expected.answerRegex, "i").test(answer);
    } catch {
      answerRegex = false;
    }
  }
  const safety = assistantFastPathSafety(assistant);
  const result = {
    intent: expectedIntent === undefined || (Array.isArray(expectedIntent)
      ? expectedIntent.includes(assistant.intent) : expectedIntent === assistant.intent),
    route: !Object.hasOwn(expected, "route") || expected.route === route,
    noRoute: expected.noRoute !== true || route === null,
    query: expectedQuery === null || query === expectedQuery,
    answerNonEmpty: answer.trim().length > 0,
    answerContentAssertionRequired,
    answerAssertionsPresent,
    answerIncludes: answerIncludes.every((text) => answer.includes(text)),
    answerExcludes: answerExcludes.every((text) => !answer.includes(text)),
    answerRegex,
    answerLanguage: expected.answerLanguage === undefined
      || (expected.answerLanguage === "zh"
        ? /\p{Script=Han}/u.test(answer)
        : !/\p{Script=Han}/u.test(answer)),
    ...safety,
  };
  return { ...result, passed: Object.values(result).every(Boolean) };
}

export function assistantUtteranceStatus(acceptance, { sourceRuntimeMatch, unavailable, noWrites }) {
  const missingAnswerAssertions = !acceptance.answerAssertionsPresent;
  const behaviorPassed = Object.entries(acceptance)
    .filter(([key]) => !["passed", "answerContentAssertionRequired", "answerAssertionsPresent"].includes(key))
    .every(([, passed]) => passed === true);
  const status = !sourceRuntimeMatch || unavailable ? "BLOCKED"
    : !behaviorPassed || !noWrites ? "FAIL"
      : missingAnswerAssertions ? "BLOCKED" : "PASS";
  const blockReason = status !== "BLOCKED" ? null
    : !sourceRuntimeMatch ? "SOURCE_RUNTIME_MISMATCH"
      : unavailable ? "SERVICE_UNAVAILABLE" : "ANSWER_ASSERTIONS_MISSING";
  return { status, blockReason };
}

export function assistantTraceability(assistant, expected) {
  const safety = assistantFastPathSafety(assistant);
  return {
    dataAsOf: Boolean(assistant.dataAsOf),
    storeScope: assistant.storeScope === "current_authenticated_store",
    dataSource: assistant.dataSource === AUTHORITATIVE_ASSISTANT_DATA_SOURCE,
    period: assistant.reportPeriodFrom === expected.from && assistant.reportPeriodTo === expected.to,
    timezone: assistant.reportTimeZone === expected.timeZone,
    dataStatus: assistant.reportDataStatus?.toLowerCase() === (expected.status ?? "available"),
    ...safety,
  };
}

export function readOnlyApiAcceptanceStatus(httpStatus, errorCode, valid) {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus >= 500
      || errorCode === 40100 || errorCode === 40300
      || (typeof errorCode === "number" && errorCode >= 50000)) {
    return "BLOCKED";
  }
  if (httpStatus < 200 || httpStatus >= 300 || (errorCode != null && errorCode !== 0)) {
    return "FAIL";
  }
  return valid ? "PASS" : "FAIL";
}

export function replenishmentCardAcceptance(assistant) {
  const answer = assistant.answer ?? "";
  const lowerAnswer = answer.toLowerCase();
  const incomplete = lowerAnswer.includes("some items were excluded because data is missing")
    || lowerAnswer.includes("replenishment data is incomplete")
    || lowerAnswer.includes("data gaps:")
    || answer.includes("部分商品因数据缺失未纳入建议")
    || answer.includes("补货建议数据不完整")
    || answer.includes("数据缺口：");
  const noSalesHistory = lowerAnswer.includes("no verifiable sales history")
    || answer.includes("没有可验证的销售历史");
  const unavailable = /unavailable|timed out|timeout|permission|暂不可用|没有权限|无权限/i.test(answer);
  const noSuggestions = lowerAnswer.includes("no restock") || lowerAnswer.includes("no replenishment quantities")
    || answer.includes("没有补货数量建议") || answer.includes("没有补货建议");
  const expectedStatus = incomplete ? "partial"
    : noSalesHistory || noSuggestions ? "empty" : unavailable ? "unavailable" : "ready";
  const card = assistant.cards?.find((item) => item.type === "replenishment") ?? null;
  const summary = card?.summary ?? "";
  const result = {
    expectedStatus,
    cardPresent: card !== null,
    statusMatches: card?.status === expectedStatus,
    sourceVisible: /source:\s*orithos inventory and sales ledger|数据来源：\s*orithos\s*库存与销售账本/i.test(summary),
    dataAsOfVisible: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/.test(summary),
    dataGapsVisible: expectedStatus !== "partial"
      || /some items were excluded because data is missing|supplier details are incomplete|data gaps:|部分商品因数据缺失未纳入建议|数据缺口：|供应商资料不完整/i.test(summary),
  };
  return { ...result, passed: Object.values(result).every(Boolean) };
}
