const AUTHORITATIVE_SOURCE = "orithos_ledger";
const BUSINESS_TIMEZONE = "Australia/Melbourne";

function deterministicRoute(assistant) {
  return assistant?.source === "deterministic" && assistant?.llmFallback === false;
}

export function previousCompleteBusinessWeek(today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error("INVALID_BUSINESS_DATE");
  const date = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== today) {
    throw new Error("INVALID_BUSINESS_DATE");
  }
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday - 7);
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { from, to: date.toISOString().slice(0, 10) };
}

function numericValues(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) numericValues(item, found);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/revenue|sales|grossprofit|profit|averageSale|aov|amount/i.test(key)
          && Number.isFinite(Number(item))) found.push(Number(item));
      else numericValues(item, found);
    }
  }
  return found;
}

function answerAmounts(assistant) {
  const text = [assistant.answer ?? "", JSON.stringify(assistant.table ?? {}), JSON.stringify(assistant.cards ?? [])]
    .join(" ");
  const formatted = [...text.matchAll(/(?:AUD\s*)\$?\s*([\d,]+\.\d{2})/gi)]
    .map((match) => Number(match[1].replaceAll(",", "")));
  return [...formatted, ...numericValues(assistant.table ?? {}), ...numericValues(assistant.cards ?? {})];
}

export function nativeOverviewAcceptance(report, { from, to }) {
  const checks = {
    source: report?.source === AUTHORITATIVE_SOURCE && report?.dataSource === AUTHORITATIVE_SOURCE,
    period: report?.from === from && report?.to === to
      && report?.reportPeriodFrom === from && report?.reportPeriodTo === to,
    timezone: report?.timeZone === BUSINESS_TIMEZONE,
    dataStatus: ["available", "incomplete"].includes(String(report?.reportDataStatus).toLowerCase()),
    revenue: Number.isFinite(Number(report?.revenue)),
  };
  return { checks, passed: Object.values(checks).every(Boolean) };
}

export function inventorySummaryAcceptance(summary, overview) {
  const equal = (left, right) => left != null && left !== ""
    && right != null && right !== ""
    && Number.isFinite(Number(left))
    && Number.isFinite(Number(right)) && Number(left) === Number(right);
  const checks = {
    positiveSkuCount: equal(summary?.productCount, overview?.inventoryPositiveSkuCount),
    caseLevel: equal(summary?.caseLevelTotal, overview?.inventoryCaseLevel),
    itemLevel: equal(summary?.itemLevelTotal, overview?.inventoryItemLevel),
  };
  return { checks, passed: Object.values(checks).every(Boolean) };
}

export function assistantReportAcceptance(assistant, expected, report) {
  const amounts = answerAmounts(assistant);
  const reportAmounts = numericValues(report);
  const expectedAmount = Number(expected.metric === "aov" ? report.averageSale : report.revenue);
  const result = {
    intent: assistant?.intent === expected.intent,
    route: assistant?.route == null,
    deterministicRoute: deterministicRoute(assistant),
    source: assistant?.dataSource === AUTHORITATIVE_SOURCE,
    storeScope: assistant?.storeScope === "current_authenticated_store",
    period: assistant?.reportPeriodFrom === expected.from && assistant?.reportPeriodTo === expected.to,
    timezone: assistant?.reportTimeZone === BUSINESS_TIMEZONE,
    status: ["available", "incomplete"].includes(String(assistant?.reportDataStatus).toLowerCase()),
    noWrites: Array.isArray(assistant?.writeRequests) && assistant.writeRequests.length === 0,
    amountMatchesReport: Number.isFinite(expectedAmount)
      && amounts.some((amount) => Math.abs(amount - expectedAmount) < 0.005),
    reportHasComparableMetric: reportAmounts.some((amount) => Math.abs(amount - expectedAmount) < 0.005),
  };
  return { checks: result, answerAmounts: amounts, passed: Object.values(result).every(Boolean) };
}

export function stockValueHonestyAcceptance(assistant) {
  const answer = assistant?.answer ?? "";
  const cardText = JSON.stringify(assistant?.cards ?? []);
  const incomplete = String(assistant?.reportDataStatus).toLowerCase() === "incomplete";
  const unavailableCopy = /inventory value is unavailable|库存价值暂不可用/i.test(answer);
  const costGapVisible = /no on-hand products have verifiable positive costs|products? were not valued|complete inventory value is unavailable|没有[^。；;]*可验证[^。；;]*正成本|商品[^。；;]*(?:未计价|未估值)|完整库存金额暂不可用/i.test(answer);
  const amountsAreLabelled = !/(?:complete|full|total) inventory value\s*(?:is|:)?\s*(?:AUD\s*)\$?[\d,]+\.\d{2}/i.test(answer)
    && !/(?:完整库存金额|全店库存总值|库存总金额)\s*(?:为|是|:|：)?\s*(?:AUD\s*)\$?[\d,]+(?:\.\d{2})?/i.test(answer);
  const unvaluedCountVisible = /\b\d[\d,]*\s+products?\s+(?:were\s+)?not\s+valued|\d[\d,]*\s*(?:个)?商品[^。；;]*(?:未计价|未估值)/i.test(answer);
  const provenance = assistant?.dataSource === AUTHORITATIVE_SOURCE
    && assistant?.storeScope === "current_authenticated_store";
  const deterministic = deterministicRoute(assistant);
  const noWrites = Array.isArray(assistant?.writeRequests) && assistant.writeRequests.length === 0;
  return {
    checks: {
      incomplete, unavailableCopy, costGapVisible, amountsAreLabelled, unvaluedCountVisible,
      provenance, deterministicRoute: deterministic, noWrites,
    },
    evidence: { answer, cardText },
    passed: incomplete && unavailableCopy && costGapVisible && amountsAreLabelled
      && unvaluedCountVisible && provenance && deterministic && noWrites,
  };
}

export function productCountAcceptance(assistant, catalogue) {
  const cardCount = (assistant?.cards ?? []).flatMap((card) =>
    [card.count, card.total, card.totalCount, card.productCount, card.summary].filter((value) => value != null))
    .map((value) => String(value).replaceAll(",", "").match(/\d+/)?.[0])
    .map(Number)
    .find(Number.isFinite);
  const total = Number(catalogue?.total);
  const activeCatalogueScope = catalogue?.status === "ACTIVE";
  const countMatches = Number.isFinite(cardCount) && Number.isFinite(total) && cardCount === total;
  return {
    checks: {
      intent: assistant?.intent === "product_count",
      deterministicRoute: deterministicRoute(assistant),
      activeCatalogueScope,
      liveCount: Number.isFinite(cardCount),
      countMatchesCatalogue: countMatches,
      noWrites: Array.isArray(assistant?.writeRequests) && assistant.writeRequests.length === 0,
    },
    cardCount: Number.isFinite(cardCount) ? cardCount : null,
    catalogueCount: Number.isFinite(total) ? total : null,
    passed: assistant?.intent === "product_count" && deterministicRoute(assistant) && activeCatalogueScope
      && Number.isFinite(cardCount) && countMatches
      && Array.isArray(assistant?.writeRequests) && assistant.writeRequests.length === 0,
  };
}

export function singleProductStockAcceptance(assistant, expected) {
  const answer = assistant?.answer ?? "";
  const name = typeof expected?.name === "string" ? expected.name.trim() : "";
  const nameIndex = name ? answer.toLowerCase().indexOf(name.toLowerCase()) : -1;
  const afterName = nameIndex < 0 ? "" : answer.slice(nameIndex + name.length);
  const quantityMatch = afterName.match(/^\s*(?:库存\s*)?[:：]\s*(?:(?:系统记录库存为|system-recorded stock is)\s*)?(-?\d+(?:\.\d+)?)/i);
  const answerQuantity = quantityMatch ? Number(quantityMatch[1]) : null;
  const expectedQuantity = Number(expected?.quantity);
  const dataAsOf = assistant?.dataAsOf ?? assistant?.report_data_as_of ?? assistant?.reportDataAsOf;
  const negativeStockDisclosure = expectedQuantity >= 0
    || /负库存属于数据异常|negative stock is a data anomaly/i.test(answer);
  const freshnessHonest = Boolean(dataAsOf)
    || /inventory update time unknown|库存更新时间未知/i.test(answer);
  const checks = {
    intent: assistant?.intent === "report_stock",
    deterministicRoute: deterministicRoute(assistant),
    exactProductVisible: nameIndex >= 0,
    quantityMatches: Number.isFinite(expectedQuantity) && answerQuantity === expectedQuantity,
    negativeStockDisclosure,
    route: assistant?.route == null,
    dataSource: assistant?.dataSource === "orithos_ledger",
    storeScope: assistant?.storeScope === "current_authenticated_store",
    freshnessHonest,
    noWrites: Array.isArray(assistant?.writeRequests) && assistant.writeRequests.length === 0,
  };
  return {
    checks,
    expectedQuantity: Number.isFinite(expectedQuantity) ? expectedQuantity : null,
    answerQuantity,
    dataAsOfPresent: Boolean(dataAsOf),
    passed: Object.values(checks).every(Boolean),
  };
}
