import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { safeErrorSummary } from "./lib/safe-error-summary.mjs";
import {
  assistantReportAcceptance,
  inventorySummaryAcceptance,
  nativeOverviewAcceptance,
  productCountAcceptance,
  singleProductStockAcceptance,
  stockValueHonestyAcceptance,
} from "./ai-eval/orithos-report-assertions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(path.join(root, "pos-ui", "package.json"))("playwright");
let envFile = process.env.PILOT_ENV_FILE || path.join(root, ".env");
if (!process.env.PILOT_ENV_FILE) {
  let directory = root;
  while (!fs.existsSync(path.join(directory, ".env")) && path.dirname(directory) !== directory) {
    directory = path.dirname(directory);
  }
  envFile = path.join(directory, ".env");
}
const env = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};
const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const isSkr = new URL(base).hostname === "skr.orithos.com.au";
const username = process.env.PILOT_USERNAME
  || (isSkr ? env.ORITHOS_SKR_USER || env.SKR_USER || "shawn" : "admin");
const password = process.env.PILOT_PASSWORD
  || (isSkr ? env.ORITHOS_SKR_PASS || env.SKR_PASS : env.INITIAL_ADMIN_PASSWORD);
if (!password) throw new Error(isSkr ? "MISSING_SKR_PASSWORD" : "MISSING_ADMIN_PASSWORD");

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const runtimeVersion = await fetch(`${base}/api/public/version`, { signal: AbortSignal.timeout(15000) })
  .then(async (response) => ({ status: response.status, body: await response.json().catch(() => ({})) }));
const frontendCommit = runtimeVersion.body.frontend?.commit ?? null;
const backendCommit = runtimeVersion.body.backend?.commit ?? null;
const runtimeCommit = frontendCommit && frontendCommit === backendCommit ? backendCommit : null;
const checks = [];
const addCheck = (name, passed, evidence) => checks.push({ name, status: passed ? "PASS" : "FAIL", evidence });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

async function getJson(response, label) {
  const body = await response.json().catch(() => null);
  if (!response.ok() || !body || (body.code !== undefined && body.code !== 0)) {
    throw new Error(`${label}_HTTP_${response.status()}_CODE_${body?.code ?? "missing"}`);
  }
  return body.data ?? body;
}

async function assistant(question) {
  return getJson(await context.request.post(`${base}/api/ai/assistant`, {
    data: { question, surface: "ai-eval-readonly" },
    headers: { Origin: base },
    timeout: 120000,
  }), "ASSISTANT");
}

async function evaluatePeriodReport(label, result, period, metric) {
  const report = await getJson(await context.request.get(
    `${base}/api/reports/native-overview?from=${period.from}&to=${period.to}`,
  ), "NATIVE_OVERVIEW");
  const acceptance = assistantReportAcceptance(result, {
    ...period,
    intent: metric === "aov" ? "report_aov" : "report_sales",
    metric,
  }, report);
  addCheck(`assistant ${label} reconciles with native overview`, acceptance.passed, acceptance);
}

async function evaluateStockQuestion(label, sample, question) {
  const name = `single-product stock answer (${label}) matches the current catalogue`;
  if (!sample?.name || !Number.isFinite(Number(sample.stockQuantity))) {
    checks.push({ name, status: "BLOCKED", evidence: { sampleAvailable: false } });
    return;
  }
  try {
    const answer = await assistant(question);
    const result = singleProductStockAcceptance(answer, {
      name: sample.name,
      quantity: sample.stockQuantity,
    });
    addCheck(name, result.passed, {
      sampleNameOmitted: true,
      expectedQuantity: result.expectedQuantity,
      answerQuantity: result.answerQuantity,
      dataAsOfPresent: result.dataAsOfPresent,
      checks: result.checks,
    });
  } catch (error) {
    addCheck(name, false, safeErrorSummary(error));
  }
}

let authenticated = false;
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username, password },
    headers: { Origin: base },
    timeout: 60000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  authenticated = true;
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  if (accessCookie && loginBody.data?.user) {
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem("sf_token", token);
      localStorage.setItem("sf_user", JSON.stringify(user));
    }, { token: accessCookie.value, user: loginBody.data.user });
  }
  addCheck("authenticated Orithos login", true, `status=${login.status()}`);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const previousDay = yesterday.toISOString().slice(0, 10);
  const period = { from: previousDay, to: today };
  const [overview, catalogue, activeCatalogue, inventorySummary, stockSamples, zeroStockSamples,
    nonzeroStockSamples, sales, salesChinese, aov, salesThisMonth, salesLastSevenDays,
    aovThisWeek, aovLastWeek, aovThisMonth, aovLastMonth, stockValue, productCount] = await Promise.all([
    getJson(await context.request.get(`${base}/api/reports/native-overview?from=${period.from}&to=${period.to}`), "NATIVE_OVERVIEW"),
    getJson(await context.request.get(`${base}/api/products?page=1&size=20`), "PRODUCTS"),
    getJson(await context.request.get(`${base}/api/products?status=ACTIVE&page=1&size=1`), "ACTIVE_PRODUCTS"),
    getJson(await context.request.get(`${base}/api/products/on-hand-summary?status=ACTIVE&inventoryLevel=on-hand`), "ON_HAND_SUMMARY"),
    getJson(await context.request.get(`${base}/api/products?status=ACTIVE&inventoryLevel=on-hand&page=1&size=1`), "ON_HAND_SAMPLE"),
    getJson(await context.request.get(`${base}/api/products?status=ACTIVE&inventoryLevel=only-zero&page=1&size=1`), "ZERO_STOCK_SAMPLE"),
    getJson(await context.request.get(`${base}/api/products?status=ACTIVE&inventoryLevel=not-zero&page=1&size=100`), "NONZERO_STOCK_SAMPLE"),
    assistant("How much did we sell yesterday?"),
    assistant("昨天营业额是多少？"),
    assistant("What was our average sale yesterday?"),
    assistant("本月营业额多少？"),
    assistant("How much did we make in the last 7 days?"),
    assistant("本周客单价多少？"),
    assistant("What was average ticket last week?"),
    assistant("What's our average sale this month?"),
    assistant("上月平均客单价是多少？"),
    assistant("Which inventory items tie up the most cash?"),
    assistant("How many products do we have?"),
  ]);

  const overviewCheck = nativeOverviewAcceptance(overview, period);
  addCheck("native overview provenance, period, timezone and revenue", overviewCheck.passed, overviewCheck.checks);
  const inventoryCheck = inventorySummaryAcceptance(inventorySummary, overview);
  addCheck("positive on-hand summary reconciles with native overview", inventoryCheck.passed, {
    filter: { status: "ACTIVE", inventoryLevel: "on-hand" },
    summary: inventorySummary,
    overview: {
      inventoryPositiveSkuCount: overview.inventoryPositiveSkuCount,
      inventoryCaseLevel: overview.inventoryCaseLevel,
      inventoryItemLevel: overview.inventoryItemLevel,
    },
    checks: inventoryCheck.checks,
  });
  const stockSample = stockSamples.items?.[0];
  await evaluateStockQuestion("English", stockSample,
    stockSample?.name ? `How much ${stockSample.name} is in stock?` : "");
  await evaluateStockQuestion("Chinese", stockSample,
    stockSample?.name ? `${stockSample.name}现在有多少库存？` : "");
  const zeroStockSample = zeroStockSamples.items?.[0];
  await evaluateStockQuestion("zero stock", zeroStockSample,
    zeroStockSample?.name ? `How much ${zeroStockSample.name} is in stock?` : "");
  const negativeStockSample = nonzeroStockSamples.items?.find((item) => Number(item.stockQuantity) < 0);
  await evaluateStockQuestion("negative stock", negativeStockSample,
    negativeStockSample?.name ? `How much ${negativeStockSample.name} is in stock?` : "");
  const dailyOverview = await getJson(await context.request.get(
    `${base}/api/reports/native-overview?from=${previousDay}&to=${previousDay}`,
  ), "DAILY_NATIVE_OVERVIEW");
  const salesCheck = assistantReportAcceptance(sales, {
    ...period, from: previousDay, to: previousDay, intent: "report_sales", metric: "sales",
  }, dailyOverview);
  addCheck("assistant sales reconciles with native overview", salesCheck.passed, salesCheck);
  const salesChineseCheck = assistantReportAcceptance(salesChinese, {
    ...period, from: previousDay, to: previousDay, intent: "report_sales", metric: "sales",
  }, dailyOverview);
  addCheck("assistant Chinese sales reconciles with native overview", salesChineseCheck.passed, salesChineseCheck);
  const aovCheck = assistantReportAcceptance(aov, {
    ...period, from: previousDay, to: previousDay, intent: "report_aov", metric: "aov",
  }, dailyOverview);
  addCheck("assistant average sale reconciles with native overview", aovCheck.passed, aovCheck);

  const todayDate = new Date(`${today}T12:00:00Z`);
  const dateText = (date) => date.toISOString().slice(0, 10);
  const currentMonth = { from: `${today.slice(0, 7)}-01`, to: today };
  const lastSevenStart = new Date(todayDate);
  lastSevenStart.setUTCDate(lastSevenStart.getUTCDate() - 6);
  const lastSevenDays = { from: dateText(lastSevenStart), to: today };
  const daysSinceMonday = (todayDate.getUTCDay() + 6) % 7;
  const thisWeekStart = new Date(todayDate);
  thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - daysSinceMonday);
  const thisWeek = { from: dateText(thisWeekStart), to: today };
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() - 1);
  const lastWeekStart = new Date(lastWeekEnd);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 6);
  const lastWeek = { from: dateText(lastWeekStart), to: dateText(lastWeekEnd) };
  const lastMonthEnd = new Date(`${currentMonth.from}T12:00:00Z`);
  lastMonthEnd.setUTCDate(0);
  const lastMonthTo = dateText(lastMonthEnd);
  const lastMonth = { from: `${lastMonthTo.slice(0, 7)}-01`, to: lastMonthTo };
  await Promise.all([
    evaluatePeriodReport("current-month Chinese sales", salesThisMonth, currentMonth, "sales"),
    evaluatePeriodReport("rolling seven-day sales", salesLastSevenDays, lastSevenDays, "sales"),
    evaluatePeriodReport("current-week Chinese average ticket", aovThisWeek, thisWeek, "aov"),
    evaluatePeriodReport("previous-week average ticket", aovLastWeek, lastWeek, "aov"),
    evaluatePeriodReport("current-month average ticket", aovThisMonth, currentMonth, "aov"),
    evaluatePeriodReport("previous-month Chinese average ticket", aovLastMonth, lastMonth, "aov"),
  ]);

  const stockValueCheck = stockValueHonestyAcceptance(stockValue);
  addCheck("stock value explains unavailable costs without inventing a total", stockValueCheck.passed, {
    checks: stockValueCheck.checks,
    answer: stockValue.answer,
  });
  const countCheck = productCountAcceptance(productCount, { ...activeCatalogue, status: "ACTIVE" });
  addCheck("product count reconciles with authenticated active catalogue", countCheck.passed, countCheck);
  addCheck("native catalogue is populated", Array.isArray(catalogue.items) && catalogue.items.length > 0
    && Number(catalogue.total) > 0, { sampleSize: catalogue.items?.length ?? 0, total: catalogue.total ?? null });

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${base}/reports/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  addCheck("Orithos reports page loads without runtime errors", page.url().startsWith(base)
    && pageErrors.length === 0, { pageErrors });
  await page.close();
} catch (error) {
  addCheck("Orithos report UAT completed", false, safeErrorSummary(error));
} finally {
  if (authenticated) await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  runtimeCommit,
  runtimeMatchesSource: runtimeCommit === sourceCommit,
  target: base,
  scope: "authenticated Orithos-native reports and assistant API reads; no business or configuration writes",
  writes: [],
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
  blocked: checks.filter((check) => check.status === "BLOCKED").length,
  status: runtimeCommit !== sourceCommit || checks.some((check) => check.status === "BLOCKED") ? "BLOCKED"
    : checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS",
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, ".local", "ai-eval", `oritos-report-readonly-${isSkr ? "skr" : "demo"}.json`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  target: base,
  runtimeCommit,
  sourceCommit,
  status: output.status,
  passed: output.passed,
  failed: output.failed,
  blocked: output.blocked,
  writes: output.writes.length,
}));
if (output.status === "FAIL") process.exitCode = 1;
else if (output.status === "BLOCKED") process.exitCode = 2;
