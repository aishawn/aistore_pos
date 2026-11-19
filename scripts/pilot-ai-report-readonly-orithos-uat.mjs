import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
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
    timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const previousDay = yesterday.toISOString().slice(0, 10);
  const period = { from: previousDay, to: today };
  const [overview, catalogue, activeCatalogue, inventorySummary, stockSamples, sales, aov, stockValue, productCount] = await Promise.all([
    getJson(await context.request.get(`${base}/api/reports/native-overview?from=${period.from}&to=${period.to}`), "NATIVE_OVERVIEW"),
    getJson(await context.request.get(`${base}/api/products?page=1&size=20`), "PRODUCTS"),
    getJson(await context.request.get(`${base}/api/products?status=ACTIVE&page=1&size=1`), "ACTIVE_PRODUCTS"),
    getJson(await context.request.get(`${base}/api/products/on-hand-summary?status=ACTIVE&inventoryLevel=on-hand`), "ON_HAND_SUMMARY"),
    getJson(await context.request.get(`${base}/api/products?status=ACTIVE&inventoryLevel=on-hand&page=1&size=1`), "ON_HAND_SAMPLE"),
    assistant("How much did we sell yesterday?"),
    assistant("What was our average sale yesterday?"),
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
  if (stockSample?.name && Number.isFinite(Number(stockSample.stockQuantity))) {
    for (const [language, question] of [
      ["English", `How much ${stockSample.name} is in stock?`],
      ["Chinese", `${stockSample.name}现在有多少库存？`],
    ]) {
      const stockAnswer = await assistant(question);
      const stockCheck = singleProductStockAcceptance(stockAnswer, {
        name: stockSample.name,
        quantity: stockSample.stockQuantity,
      });
      addCheck(`single-product stock answer (${language}) matches the current catalogue`, stockCheck.passed, {
        sampleNameOmitted: true,
        expectedQuantity: stockCheck.expectedQuantity,
        answerQuantity: stockCheck.answerQuantity,
        dataAsOfPresent: stockCheck.dataAsOfPresent,
        checks: stockCheck.checks,
      });
    }
  } else {
    addCheck("single-product stock answer (English) matches the current catalogue", false, {
      sampleAvailable: false,
    });
    addCheck("single-product stock answer (Chinese) matches the current catalogue", false, {
      sampleAvailable: false,
    });
  }
  const dailyOverview = await getJson(await context.request.get(
    `${base}/api/reports/native-overview?from=${previousDay}&to=${previousDay}`,
  ), "DAILY_NATIVE_OVERVIEW");
  const salesCheck = assistantReportAcceptance(sales, {
    ...period, from: previousDay, to: previousDay, intent: "report_sales", metric: "sales",
  }, dailyOverview);
  addCheck("assistant sales reconciles with native overview", salesCheck.passed, salesCheck);
  const aovCheck = assistantReportAcceptance(aov, {
    ...period, from: previousDay, to: previousDay, intent: "report_aov", metric: "aov",
  }, dailyOverview);
  addCheck("assistant average sale reconciles with native overview", aovCheck.passed, aovCheck);

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
  status: checks.every((check) => check.status === "PASS") && runtimeCommit === sourceCommit ? "PASS" : "BLOCKED",
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
  writes: output.writes.length,
}));
if (output.failed > 0) process.exitCode = 1;
else if (output.status !== "PASS") process.exitCode = 2;
