import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
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

function payload(days) {
  return {
    company: `REPLENISHMENT-${days}D`, historyDays: 56, periodDays: 28, coverageDays: days,
    products: [{ id: days, name: `UAT Product ${days}D`, sku: `UAT-${days}`, unit: "Units", soldUnits: days, recentUnits: days, previousUnits: 0, unitsPerDay: 1, trendPercent: null, trend: "new", onHand: 0, forecastStock: 0, daysOfStock: 0, suggestedQuantity: days, reason: `Coverage ${days} days`, reasonParts: [`Coverage ${days} days`], method: "rules_v1_weighted_velocity" }],
    truncated: false, generatedAt: new Date().toISOString(),
  };
}

try {
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username: "admin", password }, headers: { Origin: base } });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  await context.route("**/api/odoo/replenishment*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const days = Number(url.searchParams.get("coverageDays"));
    requests.push({ days, method: request.method() });
    if (request.method() !== "GET") { writes.push({ method: request.method(), url: request.url() }); await route.continue(); return; }
    if (days === 7) await new Promise((resolve) => setTimeout(resolve, 900));
    else await new Promise((resolve) => setTimeout(resolve, 25));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload(days)) });
  });
  await context.route("**/api/odoo/pos-bootstrap*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ configs: [] }) }));
  const page = await context.newPage();
  await page.goto(`${base}/stock/replenishment`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Replenishment plan" }).waitFor({ timeout: 30000 });
  await page.getByText(/REPLENISHMENT-21D/).waitFor({ timeout: 30000 });
  await page.getByLabel("Coverage target").selectOption("7");
  for (let attempt = 0; attempt < 50 && !requests.some((request) => request.days === 7); attempt += 1) await page.waitForTimeout(10);
  if (!requests.some((request) => request.days === 7)) throw new Error("COVERAGE_7_REQUEST_NOT_STARTED");
  await page.getByLabel("Coverage target").selectOption("28");
  await page.getByText(/REPLENISHMENT-28D/).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1100);
  const text = (await page.locator("#main-content").innerText()).replace(/\s+/g, " ");
  if (!text.includes("REPLENISHMENT-28D")) throw new Error(`LATEST_COVERAGE_WAS_OVERWRITTEN:${text.slice(0, 900)}`);
  if (text.includes("REPLENISHMENT-7D")) throw new Error(`STALE_COVERAGE_VISIBLE:${text.slice(0, 900)}`);
  if (writes.length) throw new Error(`UNEXPECTED_WRITE_REQUESTS_${writes.length}`);
} catch (error) { failure = error instanceof Error ? error.message : "UNEXPECTED_FAILURE"; }
finally { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {}); await browser.close(); }

const output = { generatedAt: new Date().toISOString(), sourceCommit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), scope: "mocked authenticated read-only replenishment request race; no business writes", requests, writes: writes.length, status: failure ? "FAIL" : "PASS", failure };
const outputPath = path.join(root, "docs", "UAT_REPLENISHMENT_RACE_2026-10-18.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...output }));
if (failure) process.exitCode = 1;
