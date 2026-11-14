import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  replenishmentCardAcceptance,
  assistantTraceability,
  readOnlyApiAcceptanceStatus,
} from "./assistant-assertions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = process.env.SKR_ENV_FILE || path.join(root, ".env");
const env = Object.fromEntries(fs.readFileSync(envPath, "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
const base = (process.env.SKR_BASE_URL || "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = process.env.SKR_USERNAME || env.ORITHOS_SKR_USER || env.SKR_USER;
const password = process.env.SKR_PASSWORD || env.ORITHOS_SKR_PASS || env.SKR_PASS;
const outputPath = path.resolve(root, process.env.SKR_AI_UAT_OUTPUT
  || ".local/ai-eval/online-ai-readonly-uat.json");
if (!username || !password) throw new Error("SKR_READONLY_CREDENTIALS_MISSING");

let cookieHeader = "";
let accessToken = "";
const apiFailures = [];

async function api(pathname, method = "GET", body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(new URL(pathname, base), {
      method,
      headers: {
        Origin: base,
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      cache: "no-store",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const result = { status: response.status, body: await response.json().catch(() => ({})) };
    if (!response.ok || (result.body.code !== undefined && result.body.code !== 0)) {
      apiFailures.push({ path: pathname, status: response.status, code: result.body.code ?? null });
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function formatBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDate(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function lastWeekRange(today) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const mondayThisWeek = shiftDate(today, mondayOffset);
  return { from: shiftDate(mondayThisWeek, -7), to: shiftDate(mondayThisWeek, -1) };
}

function unwrap(body) {
  if (body && typeof body === "object" && "code" in body) {
    if (body.code !== 0) throw new Error(`API_CODE_${body.code}`);
    return body.data ?? body;
  }
  return body;
}

function safelyUnwrap(body) {
  try {
    return { data: unwrap(body), errorCode: null };
  } catch (error) {
    const code = /^API_CODE_(\d+)$/.exec(error instanceof Error ? error.message : "")?.[1];
    return { data: null, errorCode: code ? Number(code) : null };
  }
}

function assistantSummary(result) {
  if (result.body && typeof result.body === "object" && result.body.code !== undefined
      && result.body.code !== 0) {
    return {
      httpStatus: result.status,
      code: result.body.code,
      errorMessage: result.body.message ?? null,
      intent: null,
      route: null,
      answer: null,
      source: null,
      dataSource: null,
      storeScope: null,
      dataAsOf: null,
      fastPathId: null,
      llmFallback: null,
      writeRequests: result.body.writeRequests ?? null,
      cards: [],
      table: null,
    };
  }
  const body = unwrap(result.body);
  return {
    httpStatus: result.status,
    code: 0,
    intent: body.intent ?? null,
    route: body.ui?.route ?? null,
    answer: body.answer ?? null,
    source: body.source ?? null,
    dataSource: body.dataSource ?? null,
    storeScope: body.storeScope ?? null,
    dataAsOf: body.dataAsOf ?? null,
    reportPeriodFrom: body.reportPeriodFrom ?? null,
    reportPeriodTo: body.reportPeriodTo ?? null,
    reportTimeZone: body.reportTimeZone ?? null,
    reportDataStatus: body.reportDataStatus ?? null,
    fastPathId: body.fastPathId ?? null,
    llmFallback: body.llmFallback ?? null,
    writeRequests: body.writeRequests ?? null,
    cards: (body.cards || []).map((card) => ({
      type: card.type ?? null,
      status: card.status ?? null,
      source: card.source ?? null,
      generatedAt: card.generatedAt ?? null,
      summary: card.summary ?? null,
      itemCount: Array.isArray(card.items) ? card.items.length : null,
    })),
    table: body.table ?? null,
  };
}

let results;
try {
  const versionResponse = await api("/api/public/version");
  const versionBody = versionResponse.body;
  const loginResponse = await fetch(new URL("/api/auth/login", base), {
    method: "POST",
    headers: { Origin: base, "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const loginBody = await loginResponse.json().catch(() => ({}));
  if (!loginResponse.ok || loginBody.code !== 0) {
    throw new Error(`SKR_LOGIN_FAILED_${loginResponse.status}`);
  }
  const cookies = loginResponse.headers.getSetCookie?.() || [];
  cookieHeader = cookies.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
  const accessCookie = cookies.map((value) => value.split(";", 1)[0])
    .find((value) => value.startsWith("orithos_access_token="));
  accessToken = accessCookie?.slice("orithos_access_token=".length) || "";
  if (!cookieHeader || !accessToken || !loginBody.data?.user) throw new Error("SKR_LOGIN_SESSION_MISSING");

  const today = formatBusinessDate();
  const yesterday = shiftDate(today, -1);
  const lastWeek = lastWeekRange(today);
  const yesterdayReportPath = `/api/reports/native-overview?from=${yesterday}&to=${yesterday}`;
  const weeklyReportPath = `/api/reports/native-overview?from=${lastWeek.from}&to=${lastWeek.to}`;
  const reportHistoryPath = (from, to) => `/api/reports/native-sales-history?from=${from}&to=${to}`;
  const reportResults = await Promise.all([
    api(yesterdayReportPath),
    api(weeklyReportPath),
  ]);
  const report = unwrap(reportResults[0].body);
  const weeklyReport = unwrap(reportResults[1].body);
  const timezone = report.timeZone || "Australia/Adelaide";
  const businessDate = yesterday;
  const exactDate = process.env.SKR_EXACT_DATE || "2026-10-16";
  const [salesAssistantResult, averageSaleAssistantResult, exactSalesAssistantResult, exactSalesHistoryResult,
    weeklySalesAssistantResult, operationsAssistantResult, replenishmentResult] = await Promise.all([
    api("/api/ai/assistant", "POST", {
      question: "昨天营业额怎么样？", surface: "ai-eval-readonly",
    }),
    api("/api/ai/assistant", "POST", {
      question: "What was our average sale yesterday?", surface: "ai-eval-readonly",
    }),
    api("/api/ai/assistant", "POST", {
      question: `sales on ${new Date(`${exactDate}T12:00:00Z`).toLocaleDateString("en-AU", {
        timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
      })}`, surface: "ai-eval-readonly",
    }),
    api(reportHistoryPath(exactDate, exactDate)),
    api("/api/ai/assistant", "POST", {
      question: "How much did we take last week?", surface: "ai-eval-readonly",
    }),
    api("/api/ai/assistant", "POST", {
      question: "What do we need to buy?", surface: "ai-eval-readonly",
    }),
    api("/api/ai/forecast/risks?horizonDays=7", "POST"),
  ]);
  const replenishmentUnwrapped = safelyUnwrap(replenishmentResult.body);
  const replenishment = replenishmentUnwrapped.data ?? {};
  const salesAssistant = assistantSummary(salesAssistantResult);
  const averageSaleAssistant = assistantSummary(averageSaleAssistantResult);
  const exactSalesAssistant = assistantSummary(exactSalesAssistantResult);
  const weeklySalesAssistant = assistantSummary(weeklySalesAssistantResult);
  const operationsAssistant = assistantSummary(operationsAssistantResult);
  const replenishmentAssistantResult = await api("/api/ai/assistant", "POST", {
    question: "What should I restock?", surface: "ai-eval-readonly",
  });
  const replenishmentAssistant = assistantSummary(replenishmentAssistantResult);
  const replenishmentCard = replenishmentCardAcceptance(replenishmentAssistant);
  replenishmentAssistant.acceptanceStatus = replenishmentAssistant.httpStatus >= 200
    && replenishmentAssistant.httpStatus < 300 && replenishmentAssistant.code === 0
    && replenishmentCard.passed
    && Array.isArray(replenishmentAssistant.writeRequests)
    && replenishmentAssistant.writeRequests.length === 0
    ? "PASS" : replenishmentAssistant.httpStatus >= 200 && replenishmentAssistant.httpStatus < 300
      ? "FAIL" : "BLOCKED";
  replenishmentAssistant.cardAcceptance = replenishmentCard;
  operationsAssistant.acceptanceStatus = operationsAssistant.httpStatus >= 200
    && operationsAssistant.httpStatus < 300 && operationsAssistant.code === 0
    && operationsAssistant.intent === "navigate" && operationsAssistant.route === "/stock/replenishment"
    && Array.isArray(operationsAssistant.writeRequests) && operationsAssistant.writeRequests.length === 0
    ? "PASS" : operationsAssistant.httpStatus >= 200 && operationsAssistant.httpStatus < 300 ? "FAIL" : "BLOCKED";
  const exactSalesHistory = unwrap(exactSalesHistoryResult.body);
  const exactDaily = (exactSalesHistory.days || []).find((item) => item.date === exactDate) ?? null;
  function reconcileRevenue(assistant, reportData) {
    const amountText = [
      assistant.answer || "",
      JSON.stringify(assistant.table || {}),
      JSON.stringify(assistant.cards || []),
    ].join(" ");
    const amounts = [...amountText.matchAll(/(?:AUD\s*)?\$?\s*([\d,]+\.\d{2})/gi)]
      .map((match) => Number(match[1].replaceAll(",", "")));
    const apiRevenue = Number(reportData.revenue ?? reportData.grossSales);
    const reportComparable = Number.isFinite(apiRevenue);
    const explicitNoSales = /no completed sales|no sales found/i.test(amountText);
    const assistantRevenueMatch = !reportComparable ? null
      : apiRevenue === 0 && explicitNoSales ? true
        : amounts.some((amount) => Math.abs(amount - apiRevenue) < 0.005);
    const apiGrossProfit = Number(reportData.grossProfit);
    const grossProfitMatch = reportData.costAvailable !== true ? null
      : amounts.some((amount) => Math.abs(amount - apiGrossProfit) < 0.005);
    const businessDateInAnswer = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4}\b/i.test(amountText);
    const traceability = {
      dateOrRange: businessDateInAnswer,
      ...assistantTraceability(assistant, {
        from: reportData.from,
        to: reportData.to,
        timeZone: reportData.timeZone,
      }),
    };
    return {
      status: assistant.httpStatus >= 200 && assistant.httpStatus < 300 && assistant.code === 0
        ? (assistantRevenueMatch === true
          && (reportData.costAvailable !== true || grossProfitMatch === true)
          && Object.values(traceability).every(Boolean) ? "PASS" : "FAIL") : "BLOCKED",
      assistantRevenueMatch,
      grossProfitMatch,
      amountCandidates: amounts,
      explicitNoSales,
      traceability,
    };
  }
  const yesterdayReconciliation = reconcileRevenue(salesAssistant, report);
  const averageSaleText = [averageSaleAssistant.answer || "", JSON.stringify(averageSaleAssistant.table || {}),
    JSON.stringify(averageSaleAssistant.cards || [])].join(" ");
  const averageSaleAmounts = [...averageSaleText.matchAll(/(?:AUD\s*)?\$?\s*([\d,]+\.\d{2})/gi)]
    .map((match) => Number(match[1].replaceAll(",", "")));
  const averageSaleMatch = averageSaleAmounts.some((amount) => Math.abs(amount - Number(report.averageSale)) < 0.005);
  const averageSaleTraceability = assistantTraceability(averageSaleAssistant, {
    from: report.from,
    to: report.to,
    timeZone: report.timeZone,
  });
  const averageSaleReconciliation = {
    status: averageSaleAssistant.httpStatus >= 200 && averageSaleAssistant.httpStatus < 300
      && averageSaleAssistant.code === 0 && averageSaleMatch
      && Object.values(averageSaleTraceability).every(Boolean) ? "PASS"
      : averageSaleAssistant.httpStatus >= 200 && averageSaleAssistant.httpStatus < 300
        && averageSaleAssistant.code === 0 ? "FAIL" : "BLOCKED",
    averageSaleMatch,
    expectedAverageSale: report.averageSale,
    amountCandidates: averageSaleAmounts,
    traceability: averageSaleTraceability,
  };
  const weeklyReconciliation = reconcileRevenue(weeklySalesAssistant, weeklyReport);
  const exactAnswerText = [exactSalesAssistant.answer || "", JSON.stringify(exactSalesAssistant.table || {}),
    JSON.stringify(exactSalesAssistant.cards || [])].join(" ");
  const exactAnswerAmounts = [...exactAnswerText.matchAll(/(?:AUD\s*)?\$?\s*([\d,]+\.\d{2})/gi)]
    .map((match) => Number(match[1].replaceAll(",", "")));
  const exactExpectedAmounts = exactDaily ? [Number(exactDaily.netSales)] : [];
  const exactAssistantRevenueMatch = exactSalesAssistant.code !== 0 ? null
    : exactExpectedAmounts.some((amount) => exactAnswerAmounts.some((answer) => Math.abs(amount - answer) < 0.005));
  const exactTraceability = {
    dateOrRange: exactAnswerText.includes(exactDate),
    ...assistantTraceability(exactSalesAssistant, {
      from: exactDate,
      to: exactDate,
      timeZone: "Australia/Adelaide",
    }),
  };
  results = {
    generatedAt: new Date().toISOString(),
    target: base,
    mode: "read-only-ai-questions-and-GET-reports; no RFQ or purchase writes",
    sourceCommit: process.env.SKR_SOURCE_COMMIT || "unknown",
    runtime: {
      httpStatus: versionResponse.status,
      frontend: versionBody.frontend ?? null,
      backend: versionBody.backend ?? null,
    },
    login: { httpStatus: loginResponse.status, succeeded: true },
    reportApi: {
      httpStatus: reportResults[0].status,
      period: "yesterday",
      from: report.from ?? null,
      to: report.to ?? null,
      timezone: report.timeZone ?? null,
      source: report.source ?? null,
      revenue: report.revenue ?? null,
      grossSales: report.grossSales ?? null,
      refunds: report.refunds ?? null,
      grossProfit: report.grossProfit ?? null,
      averageSale: report.averageSale ?? null,
      transactions: report.transactions ?? null,
      refundTransactions: report.refundTransactions ?? null,
      costAvailable: report.costAvailable ?? null,
      lastWeek: {
        httpStatus: reportResults[1].status,
        period: "last_week",
        from: weeklyReport.from ?? null,
        to: weeklyReport.to ?? null,
        timezone: weeklyReport.timeZone ?? null,
        source: weeklyReport.source ?? null,
        revenue: weeklyReport.revenue ?? null,
        grossProfit: weeklyReport.grossProfit ?? null,
        averageSale: weeklyReport.averageSale ?? null,
        transactions: weeklyReport.transactions ?? null,
      },
    },
    salesQuestion: {
      businessDate,
      ...salesAssistant,
      directReportRevenue: report.revenue ?? report.grossSales ?? null,
      ...yesterdayReconciliation,
    },
    averageSaleQuestion: {
      ...averageSaleAssistant,
      directReportAverageSale: report.averageSale ?? null,
      ...averageSaleReconciliation,
    },
    exactDateSalesQuestion: {
      status: exactSalesAssistant.httpStatus >= 200 && exactSalesAssistant.httpStatus < 300
        && exactSalesAssistant.code === 0 && exactAssistantRevenueMatch === true
        && Object.values(exactTraceability).every(Boolean) ? "PASS" : "FAIL",
      businessDate: exactDate,
      ...exactSalesAssistant,
      directSalesDailyApi: {
        httpStatus: exactSalesHistoryResult.status,
        source: exactSalesHistory.source ?? null,
        from: exactSalesHistory.from ?? null,
        to: exactSalesHistory.to ?? null,
        record: exactDaily,
      },
      directRevenueCandidates: exactExpectedAmounts,
      amountCandidates: exactAnswerAmounts,
      assistantRevenueMatch: exactAssistantRevenueMatch,
      traceability: exactTraceability,
    },
    weeklySalesQuestion: {
      ...weeklySalesAssistant,
      directReportRevenue: weeklyReport.revenue ?? weeklyReport.grossSales ?? null,
      ...weeklyReconciliation,
    },
    operationsQuestion: operationsAssistant,
    replenishmentQuestion: replenishmentAssistant,
    forecastApi: {
      httpStatus: replenishmentResult.status,
      status: replenishment.status ?? null,
      sourceVersion: replenishment.sourceVersion ?? null,
      model: replenishment.model ?? null,
      stockoutAlertCount: Array.isArray(replenishment.stockoutAlerts) ? replenishment.stockoutAlerts.length : null,
      overstockAlertCount: Array.isArray(replenishment.overstockAlerts) ? replenishment.overstockAlerts.length : null,
      dataQualityAlertCount: Array.isArray(replenishment.dataQualityAlerts) ? replenishment.dataQualityAlerts.length : null,
      acceptanceStatus: readOnlyApiAcceptanceStatus(
        replenishmentResult.status,
        replenishmentUnwrapped.errorCode,
        replenishment.status === "READ_ONLY"
        && Array.isArray(replenishment.stockoutAlerts) && Array.isArray(replenishment.overstockAlerts)
        && Array.isArray(replenishment.dataQualityAlerts)),
      errorCode: replenishmentUnwrapped.errorCode,
    },
    apiFailures,
  };
} finally {
  if (cookieHeader) await api("/api/auth/logout", "POST").catch(() => null);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const runtimeCommit = results.runtime.backend?.commit ?? results.runtime.backend?.sourceCommit ?? null;
const sourceRuntimeMatch = Boolean(results.sourceCommit && results.sourceCommit !== "unknown"
  && runtimeCommit === results.sourceCommit);
results.runtime.sourceRuntimeMatch = sourceRuntimeMatch;
results.summary = {
  PASS: [results.salesQuestion.status, results.averageSaleQuestion.status,
    results.exactDateSalesQuestion.status, results.weeklySalesQuestion.status,
    results.operationsQuestion.acceptanceStatus, results.replenishmentQuestion.acceptanceStatus,
    results.forecastApi.acceptanceStatus]
    .filter((status) => status === "PASS").length,
  FAIL: [results.salesQuestion.status, results.averageSaleQuestion.status,
    results.exactDateSalesQuestion.status, results.weeklySalesQuestion.status,
    results.operationsQuestion.acceptanceStatus, results.replenishmentQuestion.acceptanceStatus,
    results.forecastApi.acceptanceStatus]
    .filter((status) => status === "FAIL").length,
  BLOCKED: [results.salesQuestion.status, results.averageSaleQuestion.status,
    results.exactDateSalesQuestion.status, results.weeklySalesQuestion.status,
    results.operationsQuestion.acceptanceStatus, results.replenishmentQuestion.acceptanceStatus,
    results.forecastApi.acceptanceStatus]
    .filter((status) => status === "BLOCKED").length
    + (sourceRuntimeMatch ? 0 : 1)
    + (results.reportApi.httpStatus === 200 && results.reportApi.lastWeek.httpStatus === 200 ? 0 : 1),
};
fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  runtime: results.runtime,
  sourceCommit: results.sourceCommit,
  summary: results.summary,
  salesQuestion: {
    status: results.salesQuestion.httpStatus,
    intent: results.salesQuestion.intent,
    dataAsOf: results.salesQuestion.dataAsOf,
    directReportRevenue: results.salesQuestion.directReportRevenue,
    assistantRevenueMatch: results.salesQuestion.assistantRevenueMatch,
    traceability: results.salesQuestion.traceability,
  },
  averageSaleQuestion: {
    status: results.averageSaleQuestion.status,
    httpStatus: results.averageSaleQuestion.httpStatus,
    code: results.averageSaleQuestion.code,
    intent: results.averageSaleQuestion.intent,
    expectedAverageSale: results.averageSaleQuestion.expectedAverageSale,
    amountCandidates: results.averageSaleQuestion.amountCandidates,
    averageSaleMatch: results.averageSaleQuestion.averageSaleMatch,
    traceability: results.averageSaleQuestion.traceability,
  },
  exactDateSalesQuestion: {
    status: results.exactDateSalesQuestion.status,
    httpStatus: results.exactDateSalesQuestion.httpStatus,
    code: results.exactDateSalesQuestion.code,
    intent: results.exactDateSalesQuestion.intent,
    answer: results.exactDateSalesQuestion.answer,
    date: results.exactDateSalesQuestion.businessDate,
    dataAsOf: results.exactDateSalesQuestion.dataAsOf,
    dataSource: results.exactDateSalesQuestion.dataSource,
    storeScope: results.exactDateSalesQuestion.storeScope,
    directRevenueCandidates: results.exactDateSalesQuestion.directRevenueCandidates,
    answerAmountCandidates: results.exactDateSalesQuestion.amountCandidates,
    assistantRevenueMatch: results.exactDateSalesQuestion.assistantRevenueMatch,
    traceability: results.exactDateSalesQuestion.traceability,
  },
  weeklySalesQuestion: {
    status: results.weeklySalesQuestion.httpStatus,
    intent: results.weeklySalesQuestion.intent,
    dataAsOf: results.weeklySalesQuestion.dataAsOf,
    directReportRevenue: results.weeklySalesQuestion.directReportRevenue,
    assistantRevenueMatch: results.weeklySalesQuestion.assistantRevenueMatch,
    traceability: results.weeklySalesQuestion.traceability,
  },
  operationsQuestion: {
    status: results.operationsQuestion.httpStatus,
    code: results.operationsQuestion.code,
    intent: results.operationsQuestion.intent,
    route: results.operationsQuestion.route,
    writeRequests: results.operationsQuestion.writeRequests,
  },
  replenishmentQuestion: {
    acceptanceStatus: results.replenishmentQuestion.acceptanceStatus,
    intent: results.replenishmentQuestion.intent,
    cardAcceptance: results.replenishmentQuestion.cardAcceptance,
  },
  forecast: {
    status: results.forecastApi.httpStatus,
    responseStatus: results.forecastApi.status,
    sourceVersion: results.forecastApi.sourceVersion,
    model: results.forecastApi.model,
    stockoutAlertCount: results.forecastApi.stockoutAlertCount,
    overstockAlertCount: results.forecastApi.overstockAlertCount,
    dataQualityAlertCount: results.forecastApi.dataQualityAlertCount,
  },
  apiFailureCount: results.apiFailures.length,
}, null, 2));
if (results.summary.FAIL > 0) process.exitCode = 1;
else if (results.summary.BLOCKED > 0 || results.apiFailures.length > 0) process.exitCode = 2;
