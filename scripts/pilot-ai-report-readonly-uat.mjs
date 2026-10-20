import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const env = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};
const base = process.env.PILOT_BASE_URL || "https://demo.orithos.com.au";
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const checks = [];
const failures = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

function check(name, passed, evidence) {
  checks.push({ name, status: passed ? "PASS" : "FAIL", evidence });
  if (!passed) failures.push(name);
}

async function getJson(response, label) {
  const body = await response.json().catch(() => null);
  if (!response.ok() || !body) throw new Error(`${label}_HTTP_${response.status()}`);
  return body.data ?? body;
}

function isoDate(value) {
  const text = String(value ?? "").trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso) return iso[1];
  const localized = /^(\d{1,2})\s+([A-Za-z]{3})\.?\s+(\d{4})$/.exec(text);
  if (!localized) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(localized[2].toLowerCase());
  if (month < 0) return null;
  const day = Number(localized[1]);
  const year = Number(localized[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  if (!accessCookie || !loginBody.data?.user) throw new Error("LOGIN_SESSION_MISSING");
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie.value, user: loginBody.data.user });

  const page = await context.newPage();
  await page.goto(`${base}/overview`, { waitUntil: "networkidle", timeout: 60000 });
  const odooSession = await getJson(await context.request.get(`${base}/api/odoo/session`), "ODOO_SESSION");
  if (!odooSession.user) throw new Error("ODOO_SESSION_NOT_AVAILABLE");

  const dashboard24h = await getJson(
    await context.request.get(`${base}/api/odoo/reporting-dashboard?hours=24`), "DASHBOARD_24H",
  );
  const dashboard30d = await getJson(
    await context.request.get(`${base}/api/odoo/reporting-dashboard?hours=720`), "DASHBOARD_30D",
  );
  const timezone = dashboard30d.timezone || "Australia/Adelaide";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  async function ask(question) {
    const response = await context.request.post(`${base}/api/ai/assistant`, {
      data: { question },
      headers: { Origin: base },
      timeout: 120000,
    });
    const body = await getJson(response, "AI_REPORT");
    return body;
  }

  const todayReport = await ask("Today's sales");
  check("today uses store business date", todayReport.intent === "report_sales"
    && todayReport.slots?.from === today && todayReport.slots?.to === today,
  `timezone=${timezone}; expected=${today}; actual=${todayReport.slots?.from ?? "missing"}`);
  check("empty today agrees with 24-hour overview", dashboard24h.transactions === 0
    ? /no data found/i.test(todayReport.answer)
    : !/no data found/i.test(todayReport.answer),
  `overview24hTransactions=${dashboard24h.transactions}; assistant=${todayReport.answer}`);

  const last7 = await ask("sales last 7 days");
  check("7-day sales report returns rows", last7.intent === "report_sales"
    && Array.isArray(last7.table?.rows) && last7.table.rows.length > 0,
  `answer=${last7.answer}; rows=${last7.table?.rows?.length ?? 0}`);

  const last30 = await ask("sales last 30 days");
  check("30-day sales report returns rows", last30.intent === "report_sales"
    && Array.isArray(last30.table?.rows) && last30.table.rows.length > 0,
  `overview30dTransactions=${dashboard30d.transactions}; answer=${last30.answer}; rows=${last30.table?.rows?.length ?? 0}`);

  const compactDate = await ask("14,oct sales");
  const explicitDate = await ask("sales on 14 October 2026");
  const expectedDate = `${today.slice(0, 4)}-10-14`;
  check("day-month date uses current year", compactDate.intent === "report_sales"
    && compactDate.slots?.from === expectedDate && compactDate.slots?.to === expectedDate,
  `expected=${expectedDate}; actual=${compactDate.slots?.from ?? "missing"}`);
  check("compact and explicit dates return the same report", compactDate.answer === explicitDate.answer
    && JSON.stringify(compactDate.table?.rows ?? []) === JSON.stringify(explicitDate.table?.rows ?? []),
  `compact=${compactDate.answer}; explicit=${explicitDate.answer}`);

  const dashboardOct14 = dashboard30d.trend?.find((row) => isoDate(row.label) === expectedDate);
  const aiRows = compactDate.table?.rows ?? [];
  const aiOct14 = aiRows.find((row) => isoDate(row.date) === expectedDate);
  check("14 October reconciles with overview", Boolean(dashboardOct14 && aiOct14)
    && Math.abs(Number(aiOct14.sales) - Number(dashboardOct14.revenue)) < 0.01,
  `overview=${dashboardOct14?.revenue ?? "missing"}; assistant=${aiOct14?.sales ?? "missing"}; rows=${JSON.stringify(aiRows)}`);

  const overviewByDate = new Map((dashboard30d.trend ?? []).map((row) => [isoDate(row.label), Number(row.revenue)]));
  const dailyComparisons = (last30.table?.rows ?? []).map((row) => ({
    date: isoDate(row.date),
    assistant: Number(row.sales),
    overview: overviewByDate.get(isoDate(row.date)),
  })).filter((row) => row.date && Number.isFinite(row.overview));
  const dailyMismatches = dailyComparisons.filter((row) => Math.abs(row.assistant - row.overview) >= 0.01);
  check("AI daily sales rows reconcile with overview trend", dailyComparisons.length > 0 && dailyMismatches.length === 0,
    `compared=${dailyComparisons.length}; mismatches=${JSON.stringify(dailyMismatches)}`);

  const metrics = await getJson(
    await context.request.get(`${base}/api/ai/metrics?hours=1`), "AI_REPORT_METRICS",
  );
  const pathCounts = Object.fromEntries((metrics.byPath ?? []).map((item) => [item.path, item.requests]));
  check("report execution uses Odoo source", Number(pathCounts.odoo ?? 0) > 0,
    `requestsByPath=${JSON.stringify(pathCounts)}`);
} catch (error) {
  failures.push(error instanceof Error ? error.message : "UNEXPECTED_FAILURE");
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await context.close();
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  target: base,
  scope: "read-only AI sales report and Odoo overview reconciliation; no business writes",
  checksPassed: checks.filter((item) => item.status === "PASS").length,
  checksTotal: checks.length,
  checks,
  failures,
  result: failures.length ? "FAIL" : "PASS",
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_REPORTS_READONLY_ONLINE.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checksPassed: output.checksPassed, checksTotal: output.checksTotal, failures }));
if (failures.length) process.exitCode = 1;
