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

const DATA_KEY_ALIASES = {
  revenue: ["revenue", "sales", "grossSales"],
  profit: ["profit", "grossProfit"],
  aov: ["aov", "averageSale", "averageTicket"],
  stock: ["stock", "stockQuantity", "qtyAvailable", "quantityOnHand"],
  transactions: ["transactions", "tickets", "orders"],
  quantity: ["quantity", "units", "qty"],
};

function normalizedKey(value) {
  return String(value).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function collectValuesForKeys(value, keys, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectValuesForKeys(item, keys, found);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (keys.has(normalizedKey(key))) found.push(item);
      collectValuesForKeys(item, keys, found);
    }
  }
  return found;
}

function sameExpectedValue(actual, expected, key) {
  const expectedNumber = Number(expected);
  const actualNumber = Number(actual);
  if (Number.isFinite(expectedNumber) && Number.isFinite(actualNumber)) {
    const money = /sales|revenue|profit|cost|amount|value|price|aov/i.test(key);
    return Math.abs(actualNumber - expectedNumber) < (money ? 0.005 : 0.000001);
  }
  return String(actual) === String(expected);
}

function answerContainsExpectedValue(answer, expected) {
  if (typeof expected === "number" && Number.isFinite(expected)) {
    const values = new Set([
      String(expected),
      new Intl.NumberFormat("en-AU", { useGrouping: false, maximumFractionDigits: 2 }).format(expected),
      new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(expected),
    ]);
    return [...values].some((value) => {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?<![\\d.-])${escaped}(?![\\d]|[.-](?=\\d))`).test(answer);
    });
  }
  return answer.includes(String(expected));
}

function answerDataChecks(expectedData, assistant, answer) {
  const checks = {};
  for (const [key, expected] of Object.entries(expectedData)) {
    if (expected === null || expected === undefined) continue;
    const aliases = DATA_KEY_ALIASES[key] ?? [key];
    const values = collectValuesForKeys(
      { table: assistant.table, cards: assistant.cards },
      new Set(aliases.map(normalizedKey)),
    );
    checks[key] = values.length > 0
      ? values.some((actual) => sameExpectedValue(actual, expected, key))
      : answerContainsExpectedValue(answer, expected);
  }
  return checks;
}

function answerSlotChecks(expectedEntities, assistant) {
  const checks = {};
  for (const [key, expected] of Object.entries(expectedEntities)) {
    if (key === "stock" || key === "product") continue;
    if (key === "date") {
      checks[key] = assistant.slots?.date === expected
        || (assistant.reportPeriodFrom === expected && assistant.reportPeriodTo === expected);
      continue;
    }
    checks[key] = assistant.slots?.[key] === expected;
  }
  return checks;
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
  const expectedData = { ...(expected.data ?? {}) };
  if (expected.entities?.stock !== undefined && expectedData.stock === undefined) {
    expectedData.stock = expected.entities.stock;
  }
  const expectedDataChecks = answerDataChecks(expectedData, assistant, answer);
  const entitySlotChecks = answerSlotChecks(expected.entities ?? {}, assistant);
  const expectedIntent = expected.intent;
  const answerIncludes = Array.isArray(expected.answerIncludes)
    ? expected.answerIncludes.filter((text) => typeof text === "string" && text.trim().length > 0)
    : [];
  const answerExcludes = Array.isArray(expected.answerExcludes) ? expected.answerExcludes : [];
  const unsupportedNegativeAssertions = Array.isArray(expected.negative)
    ? expected.negative.filter((assertion) => assertion !== "writeRequests empty")
    : expected.negative === undefined ? [] : ["expected.negative must be an array"];
  const answerContentAssertionRequired = requiresAnswerContent(expectedIntent);
  const answerAssertionsPresent = !answerContentAssertionRequired
    || answerIncludes.length > 0
    || (typeof expected.answerRegex === "string" && expected.answerRegex.trim().length > 0)
    || Object.keys(expectedDataChecks).length > 0;
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
    slots: Object.values(entitySlotChecks).every(Boolean),
    answerNonEmpty: answer.trim().length > 0,
    answerData: Object.values(expectedDataChecks).every(Boolean),
    answerContentAssertionRequired,
    answerAssertionsPresent,
    answerIncludes: answerIncludes.every((text) => answer.includes(text)),
    answerExcludes: answerExcludes.every((text) => !answer.includes(text)),
    answerRegex,
    answerLanguage: expected.answerLanguage === undefined
      || (expected.answerLanguage === "zh"
        ? /\p{Script=Han}/u.test(answer)
        : !/\p{Script=Han}/u.test(answer)),
    negativeAssertionsPresent: unsupportedNegativeAssertions.length === 0,
    unsupportedNegativeAssertions,
    ...(expected.clarification === undefined
      ? {}
      : { clarification: assistant.clarificationRequired === expected.clarification }),
    ...safety,
  };
  return {
    ...result,
    entitySlotChecks,
    expectedDataChecks,
    passed: Object.values(result).every(Boolean),
  };
}

export function assistantUtteranceStatus(acceptance, { sourceRuntimeMatch, unavailable, noWrites }) {
  const missingAnswerAssertions = !acceptance.answerAssertionsPresent;
  const missingNegativeAssertions = acceptance.negativeAssertionsPresent === false;
  const behaviorPassed = Object.entries(acceptance)
    .filter(([key, value]) => typeof value === "boolean"
      && !["passed", "answerContentAssertionRequired", "answerAssertionsPresent", "negativeAssertionsPresent"].includes(key))
    .every(([, passed]) => passed === true);
  const status = !sourceRuntimeMatch || unavailable ? "BLOCKED"
    : !behaviorPassed || !noWrites ? "FAIL"
      : missingAnswerAssertions || missingNegativeAssertions ? "BLOCKED" : "PASS";
  const blockReason = status !== "BLOCKED" ? null
    : !sourceRuntimeMatch ? "SOURCE_RUNTIME_MISMATCH"
      : unavailable ? "SERVICE_UNAVAILABLE"
        : missingNegativeAssertions ? "NEGATIVE_ASSERTIONS_UNSUPPORTED" : "ANSWER_ASSERTIONS_MISSING";
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

export function expectedReportDataStatus(reportData = {}) {
  const explicitStatus = reportData.reportDataStatus ?? reportData.dataStatus;
  if (typeof explicitStatus === "string" && explicitStatus.trim()) return explicitStatus.toLowerCase();
  if (reportData.costAvailable === false || reportData.grossProfit === null) return "incomplete";
  return "available";
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
  const incomplete = lowerAnswer.includes("some items are excluded pending data review")
    || lowerAnswer.includes("items are excluded pending data review")
    || lowerAnswer.includes("replenishment data is incomplete")
    || lowerAnswer.includes("data gaps:")
    || answer.includes("部分商品因数据不全暂未纳入")
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
      || /items are excluded pending data review|supplier details are incomplete|data gaps:|部分商品因数据不全暂未纳入|数据缺口：|供应商资料不完整/i.test(summary),
  };
  return { ...result, passed: Object.values(result).every(Boolean) };
}
