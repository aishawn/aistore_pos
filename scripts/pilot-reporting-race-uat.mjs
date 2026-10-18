import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://demo.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const requests = [];
const writes = [];
let failure = null;

function payload(hours) {
  const label = hours === 168 ? "RACE-7D" : hours === 24 ? "RACE-24H" : "RACE-8H";
  return {
    rangeHours: hours,
    from: "2026-10-11T00:00:00Z",
    to: "2026-10-18T00:00:00Z",
    company: label,
    currency: "AUD",
    timezone: "Australia/Adelaide",
    trendGranularity: "day",
    revenue: hours,
    grossSales: hours,
    refunds: 0,
    refundTransactions: 0,
    tax: 0,
    transactions: hours,
    openRegisters: 0,
    trend: [{ label: "2026-10-18T00:00:00Z", revenue: hours, transactions: hours }],
    recentSales: [],
  };
}

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  await context.route("**/api/odoo/reporting-dashboard*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const hours = Number(url.searchParams.get("hours"));
    requests.push({ hours, method: request.method() });
    if (request.method() !== "GET") {
      writes.push({ url: request.url(), method: request.method() });
      await route.continue();
      return;
    }
    if (hours === 24) await new Promise((resolve) => setTimeout(resolve, 900));
    else await new Promise((resolve) => setTimeout(resolve, 25));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload(hours)),
    });
  });

  const page = await context.newPage();
  await page.goto(`${base}/reports/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Reporting Dashboard" }).waitFor({ timeout: 30000 });
  await page.getByText("RACE-8H", { exact: true }).waitFor({ timeout: 30000 });

  await page.getByLabel("Reporting period").selectOption("24");
  await page.waitForTimeout(60);
  await page.getByLabel("Reporting period").selectOption("168");
  await page.getByText("RACE-7D", { exact: true }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1100);

  const visibleText = (await page.locator("#main-content").innerText()).replace(/\s+/g, " ");
  if (!visibleText.includes("RACE-7D")) throw new Error("LATEST_RANGE_WAS_OVERWRITTEN");
  if (visibleText.includes("RACE-24H")) throw new Error("STALE_RANGE_VISIBLE_AFTER_LATEST_RESPONSE");
  if (writes.length) throw new Error(`UNEXPECTED_WRITE_REQUESTS_${writes.length}`);
} catch (error) {
  failure = error instanceof Error ? error.message : "UNEXPECTED_FAILURE";
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  scope: "mocked authenticated read-only reporting request race; no business writes",
  requests,
  writes: writes.length,
  status: failure ? "FAIL" : "PASS",
  failure,
};
const outputPath = path.join(root, "docs", "UAT_REPORTING_RACE_2026-10-18.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...output }));
if (failure) process.exitCode = 1;
