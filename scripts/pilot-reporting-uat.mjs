import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}));
const base = "https://demo.orithos.com.au";
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const reportingResponses = [];
page.on("response", (response) => {
  const url = new URL(response.url());
  if (url.pathname === "/api/odoo/reporting-dashboard") {
    reportingResponses.push({ method: response.request().method(), status: response.status(), hours: url.searchParams.get("hours") });
  }
});

let sessionStatus;
let initialDashboard;
let rangeDashboard;
let reportMetrics;
let failure;
function readMetrics(data, label) {
  for (const key of ["revenue", "grossSales", "refunds", "transactions", "refundTransactions", "tax"]) {
    if (!Number.isFinite(Number(data?.[key]))) throw new Error(`${label}_MISSING_${key}`);
  }
  const expectedNet = Number(data.grossSales) - Number(data.refunds);
  if (Math.abs(Number(data.revenue) - expectedNet) > 0.02) throw new Error(`${label}_NET_TOTAL_MISMATCH`);
  if (Number(data.transactions) < 0 || Number(data.refundTransactions) < 0 || Number(data.refunds) < 0) {
    throw new Error(`${label}_NEGATIVE_COUNT_OR_REFUND`);
  }
  return {
    grossSales: data.grossSales,
    refunds: data.refunds,
    netSales: data.revenue,
    salesCount: data.transactions,
    refundCount: data.refundTransactions,
    netTax: data.tax,
    recentRefunds: data.recentSales.filter((sale) => Number(sale.amount_total) < 0).length,
  };
}
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  const session = await context.request.get(`${base}/api/odoo/session`, { headers: { Origin: base } });
  sessionStatus = await session.json().catch(() => ({}));
  if (!session.ok() || sessionStatus.autoRecoverConfigured !== true || !sessionStatus.user) {
    throw new Error("ODOO_AUTO_RECOVERY_NOT_CONFIGURED");
  }

  const initialResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/odoo/reporting-dashboard" && url.searchParams.get("hours") === "8" && response.ok();
  }, { timeout: 60000 });
  await page.goto(`${base}/reports/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const initialResponse = await initialResponsePromise;
  const initialData = await initialResponse.json();
  const initialMetrics = readMetrics(initialData, "INITIAL_REPORT");
  await page.getByRole("heading", { name: "Reporting Dashboard" }).waitFor({ timeout: 60000 });
  await page.getByRole("region", { name: "Sales summary" }).waitFor({ timeout: 30000 });
  const initialAlert = (await page.getByRole("alert").allTextContents()).map((text) => text.trim()).filter(Boolean);
  if (initialAlert.length) throw new Error(`INITIAL_REPORT_ERROR: ${initialAlert.join(" | ")}`);
  for (const label of ["Net sales", "Sales", "Refunds", "Net tax"]) await page.getByText(label, { exact: true }).waitFor({ timeout: 10000 });
  if (initialMetrics.recentRefunds > 0 && !(await page.locator("li").filter({ hasText: /Refund ·/ }).count())) {
    throw new Error("RECENT_REFUNDS_NOT_LABELED");
  }
  initialDashboard = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 1200);

  const updated = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/odoo/reporting-dashboard" && url.searchParams.get("hours") === "24" && response.ok();
  }, { timeout: 30000 });
  await page.getByLabel("Reporting period").selectOption("24");
  const rangeResponse = await updated;
  if (!rangeResponse.ok()) throw new Error(`RANGE_RELOAD_HTTP_${rangeResponse.status()}`);
  const rangeData = await rangeResponse.json();
  const rangeMetrics = readMetrics(rangeData, "RANGE_REPORT");
  await page.getByText(/Last 24 hours ·/).waitFor({ timeout: 15000 });
  rangeDashboard = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 1200);
  const rangeAlert = (await page.getByRole("alert").allTextContents()).map((text) => text.trim()).filter(Boolean);
  if (rangeAlert.length) throw new Error(`RANGE_REPORT_ERROR: ${rangeAlert.join(" | ")}`);
  reportMetrics = { last8Hours: initialMetrics, last24Hours: rangeMetrics };
} catch (error) {
  failure = error instanceof Error ? error.message : "UNEXPECTED_FAILURE";
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  deployment: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  scope: "read-only reporting dashboard UAT; no model call or business writes",
  autoRecoverConfigured: sessionStatus?.autoRecoverConfigured === true,
  reportingResponses,
  initialDashboard,
  rangeDashboard,
  reportMetrics,
  result: failure ? "FAIL" : "PASS",
  failure: failure ?? null,
};
const outputPath = path.join(root, "docs", "UAT_REPORTING_2026-10-14.json");
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, result: output.result, reportingResponses, failure: output.failure }));
if (failure) process.exitCode = 2;
