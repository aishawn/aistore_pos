export const assistantFollowupCases = [
  { id: "sales-last-7-en", question: "sales last 7 days", followUp: "and yesterday?", surface: "sell", kind: "sales", language: "en", readOnly: true },
  { id: "sales-previous-day-en", question: "sales yesterday", followUp: "and the day before?", surface: "reports", kind: "sales", language: "en", expectDayOffset: -1, readOnly: true },
  { id: "sales-last-7-zh", question: "近7天销售额", followUp: "那昨天呢", surface: "reports", kind: "sales", language: "zh", readOnly: true },
  { id: "stock-history-shiraz-en", question: "current stock for Shiraz", followUp: "and yesterday?", repeatFollowUp: "and the day before?", surface: "stock", kind: "stock-history", language: "en", readOnly: true },
  { id: "stock-history-shiraz-zh", question: "西拉现在有多少库存", followUp: "那昨天呢", repeatFollowUp: "那前一天呢", surface: "stock", kind: "stock-history", language: "zh", readOnly: true },
  { id: "sales-today-zh", question: "今天营业额多少？", followUp: "那昨天呢", surface: "reports", kind: "sales", language: "zh", readOnly: true },
  { id: "sales-yesterday-two-days-en", question: "What were sales yesterday?", followUp: "and two days before that?", surface: "reports", kind: "sales", language: "en", expectDayOffset: -2, readOnly: true },
  { id: "sales-yesterday-zh", question: "昨天营业额多少？", followUp: "那前一天呢", surface: "reports", kind: "sales", language: "zh", expectDayOffset: -1, readOnly: true },
  { id: "sales-yesterday-two-days-zh", question: "昨天销售额是多少？", followUp: "那再往前两天呢", surface: "reports", kind: "sales", language: "zh", expectDayOffset: -2, readOnly: true },
  { id: "stock-history-carlton-en", question: "How many Carlton Draught do we have?", followUp: "and yesterday?", repeatFollowUp: "and the day before?", surface: "stock", kind: "stock-history", language: "en", readOnly: true },
];

export function resolveFollowupCredentials({ baseUrl, processEnv = {}, fileEnv = {} }) {
  const isSkr = new URL(baseUrl).hostname.startsWith("skr.");
  return {
    username: processEnv.PILOT_USERNAME
      || (isSkr ? processEnv.ORITHOS_SKR_USER || processEnv.SKR_USER || fileEnv.ORITHOS_SKR_USER || fileEnv.SKR_USER : "admin"),
    password: processEnv.PILOT_PASSWORD
      || (isSkr
        ? processEnv.ORITHOS_SKR_PASS || processEnv.SKR_PASS || fileEnv.ORITHOS_SKR_PASS || fileEnv.SKR_PASS
        : processEnv.INITIAL_ADMIN_PASSWORD || fileEnv.INITIAL_ADMIN_PASSWORD),
  };
}

function businessDateAt(nowMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(nowMs);
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function evaluateSalesFollowup({ assistant, report, expectedFrom, expectedTo = expectedFrom, timeZone, nowMs = Date.now() }) {
  const answer = String(assistant?.answer ?? "");
  const slots = assistant?.slots ?? {};
  const expectedStatus = Number(report?.transactions) === 0 ? "no_data" : "available";
  const dataAsOf = typeof assistant?.dataAsOf === "string" ? assistant.dataAsOf : "";
  const dataAsOfMs = Date.parse(dataAsOf);
  const asOfValid = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(dataAsOf)
    && Number.isFinite(dataAsOfMs);
  const nativeDataAsOf = typeof report?.dataAsOf === "string" ? report.dataAsOf : "";
  const nativeDataAsOfMs = Date.parse(nativeDataAsOf);
  const nativeAsOfValid = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(nativeDataAsOf)
    && Number.isFinite(nativeDataAsOfMs);
  const includesCurrentBusinessDay = expectedTo >= businessDateAt(nowMs, timeZone);
  const dateRange = slots.from === expectedFrom && slots.to === expectedTo
    && assistant.reportPeriodFrom === expectedFrom && assistant.reportPeriodTo === expectedTo;
  const daily = Array.isArray(report?.dailyTrend)
    ? report.dailyTrend.find((row) => row.date === expectedFrom)
    : null;
  const transactions = Number(report?.transactions);
  const revenue = daily?.revenue == null ? 0 : Number(daily.revenue);
  const answerMatch = transactions === 0
    ? /no completed sales|没有已完成销售记录/i.test(answer)
    : Number.isFinite(revenue) && (() => {
      const escapedDate = expectedFrom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = answer.match(new RegExp(`(?:Sales for ${escapedDate} were AUD |${escapedDate}营业额 AUD )([\\d,]+(?:\\.\\d+)?)`, "i"));
      return Boolean(match && Math.abs(Number(match[1].replaceAll(",", "")) - revenue) < 0.005);
    })();
  const checks = {
    dateRange,
    nativeReport: report?.source === "orithos_ledger" && report.from === expectedFrom && report.to === expectedTo,
    answerMatchesNativeReport: answerMatch,
    dataSource: assistant?.dataSource === "orithos_ledger",
    storeScope: assistant?.storeScope === "current_authenticated_store",
    timeZone: assistant?.reportTimeZone === timeZone,
    dataStatus: String(assistant?.reportDataStatus ?? "").toLowerCase() === expectedStatus,
    dataAsOfFresh: asOfValid && nativeAsOfValid && dataAsOfMs === nativeDataAsOfMs
      && dataAsOfMs <= nowMs
      && (!includesCurrentBusinessDay || nowMs - dataAsOfMs <= 90 * 60 * 1000),
    noWrites: Array.isArray(assistant?.writeRequests) && assistant.writeRequests.length === 0,
  };
  return {
    ...checks,
    passed: Object.values(checks).every(Boolean),
    reportStatus: expectedStatus,
    reportTransactions: Number.isFinite(transactions) ? transactions : null,
    reportRevenue: Number.isFinite(revenue) ? revenue : null,
    dataAsOf: asOfValid ? dataAsOf : null,
  };
}
