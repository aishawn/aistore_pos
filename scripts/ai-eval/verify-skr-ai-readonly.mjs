import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ extraHTTPHeaders: { Origin: base } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

async function api(pathname, method = "GET", body) {
  return page.evaluate(async ({ pathname: route, method: verb, body: payload }) => {
    const token = localStorage.getItem("sf_token");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch(route, {
        method: verb,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(payload === undefined ? {} : { "content-type": "application/json" }),
        },
        credentials: "same-origin",
        cache: "no-store",
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: controller.signal,
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    } finally {
      clearTimeout(timer);
    }
  }, { pathname, method, body });
}

function unwrap(body) {
  if (body && typeof body === "object" && "code" in body) {
    if (body.code !== 0) throw new Error(`API_CODE_${body.code}`);
    return body.data ?? body;
  }
  return body;
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
  const versionResponse = await context.request.get(`${base}/api/public/version`);
  const versionBody = await versionResponse.json().catch(() => ({}));
  const loginResponse = await context.request.post(`${base}/api/auth/login`, {
    data: { username, password },
    headers: { Origin: base },
  });
  const loginBody = await loginResponse.json().catch(() => ({}));
  if (!loginResponse.ok() || loginBody.code !== 0) {
    throw new Error(`SKR_LOGIN_FAILED_${loginResponse.status()}`);
  }
  const cookie = (await context.cookies(base)).find((item) => item.name === "orithos_access_token");
  if (!cookie || !loginBody.data?.user) throw new Error("SKR_LOGIN_SESSION_MISSING");
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: cookie.value, user: loginBody.data.user });
  // The UAT contract is API-level and the overview bundle can remain pending
  // while the tenant loads. Establish the origin after login without making
  // the read-only checks depend on the full UI navigation completing.
  await page.goto(`${base}/overview`, { waitUntil: "commit", timeout: 30_000 }).catch(() => null);

  const session = await api("/api/odoo/session");
  const sessionBody = unwrap(session.body);
  const [reportResult, weeklyReportResult] = await Promise.all([
    api("/api/odoo/reporting-dashboard?period=yesterday"),
    api("/api/odoo/reporting-dashboard?period=last_week"),
  ]);
  const report = unwrap(reportResult.body);
  const weeklyReport = unwrap(weeklyReportResult.body);
  const timezone = report.timezone || "Australia/Adelaide";
  const businessDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(Date.now() - 86_400_000));
  const exactDate = "2026-10-16";
  const [salesAssistantResult, exactSalesAssistantResult, exactSalesDailyResult,
    weeklySalesAssistantResult, operationsAssistantResult, replenishmentResult] = await Promise.all([
    api("/api/ai/assistant", "POST", {
      question: `How much did we take on ${new Date(`${businessDate}T12:00:00`).toLocaleDateString("en-AU", {
        timeZone: timezone, day: "numeric", month: "short", year: "numeric",
      })}?`, surface: "ai-eval-readonly",
    }),
    api("/api/ai/assistant", "POST", {
      question: "16 Oct 2026 sales", surface: "ai-eval-readonly",
    }),
    api("/api/odoo/sales-daily", "POST", {
      status: "completed", fromDate: exactDate, toDate: exactDate, limit: 10, offset: 0,
    }),
    api("/api/ai/assistant", "POST", {
      question: "How much did we take last week?", surface: "ai-eval-readonly",
    }),
    api("/api/ai/assistant", "POST", {
      question: "What do we need to buy?", surface: "ai-eval-readonly",
    }),
    api("/api/odoo/replenishment?coverageDays=7&validateSales=true"),
  ]);
  const replenishment = unwrap(replenishmentResult.body);
  const salesAssistant = assistantSummary(salesAssistantResult);
  const exactSalesAssistant = assistantSummary(exactSalesAssistantResult);
  const weeklySalesAssistant = assistantSummary(weeklySalesAssistantResult);
  const operationsAssistant = assistantSummary(operationsAssistantResult);
  const exactSalesDaily = unwrap(exactSalesDailyResult.body);
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
    const businessDateInAnswer = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4}\b/i.test(amountText);
    return {
      status: assistant.httpStatus >= 200 && assistant.httpStatus < 300 && assistant.code === 0
        ? (assistantRevenueMatch === true ? "PASS" : "FAIL") : "BLOCKED",
      assistantRevenueMatch,
      amountCandidates: amounts,
      explicitNoSales,
      traceability: {
        dateOrRange: businessDateInAnswer,
        dataAsOf: Boolean(assistant.dataAsOf || /data (?:checked|as of|through)/i.test(amountText)),
        storeScope: Boolean(assistant.storeScope || (reportData.company && amountText.includes(reportData.company))),
        dataSource: Boolean(assistant.dataSource) || assistant.cards.some((card) => Boolean(card.source)),
      },
    };
  }
  const yesterdayReconciliation = reconcileRevenue(salesAssistant, report);
  const weeklyReconciliation = reconcileRevenue(weeklySalesAssistant, weeklyReport);
  const exactDaily = (exactSalesDaily.items || []).find((item) => item.date === exactDate) ?? null;
  const exactAnswerText = [exactSalesAssistant.answer || "", JSON.stringify(exactSalesAssistant.table || {}),
    JSON.stringify(exactSalesAssistant.cards || [])].join(" ");
  const exactAnswerAmounts = [...exactAnswerText.matchAll(/(?:AUD\s*)?\$?\s*([\d,]+\.\d{2})/gi)]
    .map((match) => Number(match[1].replaceAll(",", "")));
  const exactExpectedAmounts = exactDaily
    ? [Number(exactDaily.salesAmount), Number(exactDaily.netSales)] : [];
  const exactAssistantRevenueMatch = exactSalesAssistant.code !== 0 ? null
    : exactExpectedAmounts.some((amount) => exactAnswerAmounts.some((answer) => Math.abs(amount - answer) < 0.005));
  const exactTraceability = {
    dateOrRange: /\b2026-10-16\b|\b16\s+Oct(?:ober)?\s+2026\b/i.test(exactAnswerText),
    dataAsOf: Boolean(exactSalesAssistant.dataAsOf || /data (?:checked|as of|through)/i.test(exactAnswerText)),
    storeScope: Boolean(exactSalesAssistant.storeScope
      || (report.company && exactAnswerText.includes(report.company))),
    dataSource: Boolean(exactSalesAssistant.dataSource)
      || exactSalesAssistant.cards.some((card) => Boolean(card.source)),
  };
  results = {
    generatedAt: new Date().toISOString(),
    target: base,
    mode: "read-only-ai-questions-and-GET-reports; no RFQ or purchase writes",
    runtime: {
      httpStatus: versionResponse.status,
      frontend: versionBody.frontend ?? null,
      backend: versionBody.backend ?? null,
    },
    login: { httpStatus: loginResponse.status, succeeded: true, companyId: loginBody.data?.user?.companyId ?? null },
    odooSession: { httpStatus: session.status, authenticated: Boolean(sessionBody?.authenticated ?? sessionBody?.ok ?? true) },
    reportApi: {
      httpStatus: reportResult.status,
      period: report.period ?? null,
      from: report.from ?? null,
      to: report.to ?? null,
      timezone,
      generatedAt: report.generatedAt ?? null,
      queryThrough: report.queryThrough ?? null,
      company: report.company ?? null,
      currency: report.currency ?? null,
      revenue: report.revenue ?? null,
      grossSales: report.grossSales ?? null,
      refunds: report.refunds ?? null,
      transactions: report.transactions ?? null,
      itemsSold: report.itemsSold ?? null,
      lastWeek: {
        httpStatus: weeklyReportResult.status,
        period: weeklyReport.period ?? null,
        from: weeklyReport.from ?? null,
        to: weeklyReport.to ?? null,
        timezone: weeklyReport.timezone ?? null,
        generatedAt: weeklyReport.generatedAt ?? null,
        queryThrough: weeklyReport.queryThrough ?? null,
        company: weeklyReport.company ?? null,
        currency: weeklyReport.currency ?? null,
        revenue: weeklyReport.revenue ?? null,
        grossSales: weeklyReport.grossSales ?? null,
        refunds: weeklyReport.refunds ?? null,
        transactions: weeklyReport.transactions ?? null,
        itemsSold: weeklyReport.itemsSold ?? null,
      },
    },
    salesQuestion: {
      businessDate,
      ...salesAssistant,
      directReportRevenue: report.revenue ?? report.grossSales ?? null,
      ...yesterdayReconciliation,
    },
    exactDateSalesQuestion: {
      status: exactSalesAssistant.httpStatus >= 200 && exactSalesAssistant.httpStatus < 300
        && exactSalesAssistant.code === 0 && exactAssistantRevenueMatch === true
        && Object.values(exactTraceability).every(Boolean) ? "PASS" : "FAIL",
      businessDate: exactDate,
      ...exactSalesAssistant,
      directSalesDailyApi: {
        httpStatus: exactSalesDailyResult.status,
        timezone: exactSalesDaily.timezone ?? null,
        currency: exactSalesDaily.currency ?? null,
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
    forecastApi: {
      httpStatus: replenishmentResult.status,
      generatedAt: replenishment.generatedAt ?? null,
      historyDays: replenishment.historyDays ?? null,
      coverageDays: replenishment.coverageDays ?? null,
      salesHistory: replenishment.salesHistory ?? null,
      forecast: replenishment.forecast ?? null,
      inventoryHistory: replenishment.inventoryHistory ?? null,
      supplierLeadTime: replenishment.supplierLeadTime ?? null,
      productCount: Array.isArray(replenishment.products) ? replenishment.products.length : null,
      catalogueCoverage: replenishment.catalogueCoverage ?? null,
      reviewRequiredCount: replenishment.reviewRequiredCount ?? null,
      purchaseWorkflow: replenishment.purchaseWorkflow ?? null,
      sampleProducts: (replenishment.products || []).slice(0, 5).map((item) => ({
        id: item.id ?? null,
        name: item.name ?? null,
        recommendationStatus: item.recommendationStatus ?? null,
        risk: item.risk ?? null,
        forecastModel: item.forecastModel ?? null,
        forecastConfidence: item.forecastConfidence ?? null,
        dataQuality: item.dataQuality ?? null,
        reasons: item.reasons ?? item.reviewReasons ?? null,
      })),
    },
    pageErrors,
  };
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
  await browser.close();
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  runtime: results.runtime,
  salesQuestion: {
    status: results.salesQuestion.httpStatus,
    intent: results.salesQuestion.intent,
    dataAsOf: results.salesQuestion.dataAsOf,
    directReportRevenue: results.salesQuestion.directReportRevenue,
    assistantRevenueMatch: results.salesQuestion.assistantRevenueMatch,
    traceability: results.salesQuestion.traceability,
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
  forecast: {
    status: results.forecastApi.httpStatus,
    generatedAt: results.forecastApi.generatedAt,
    productCount: results.forecastApi.productCount,
    dataQuality: results.forecastApi.forecast?.status ?? results.forecastApi.forecast?.modelSelection,
    inventoryHistory: results.forecastApi.inventoryHistory,
    purchaseWorkflow: results.forecastApi.purchaseWorkflow,
  },
  pageErrorCount: results.pageErrors.length,
}, null, 2));
