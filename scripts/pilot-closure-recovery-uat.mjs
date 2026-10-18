import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://demo.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const checks = [];
let detailRequests = 0;

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
  });
  const body = await login.json().catch(() => ({}));
  if (!login.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  await context.route("**/api/register-closures*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, data: { items: [{ id: "55", registerId: "Register 1", userId: "7", totalExpected: 120, totalReceived: 120, openedAt: "2026-10-18 09:00", closedAt: "2026-10-18 17:00" }], total: 1, page: 1, size: 20 } }),
    });
  });
  await context.route("**/api/register-closures/55*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    detailRequests += 1;
    if (detailRequests === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Injected closure detail failure" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, data: { id: 55, registerId: 1, userId: 7, totalExpected: 120, totalReceived: 120, totalTransactions: 8, totalSurcharge: 0, openedAt: "2026-10-18T09:00:00Z", closedAt: "2026-10-18T17:00:00Z", payments: [] } }),
    });
  });

  const page = await context.newPage();
  await page.goto(`${base}/reports/closures`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Register Closures", exact: true }).waitFor({ timeout: 30000 });
  await page.locator("article").filter({ hasText: "Register 1" }).first().waitFor({ timeout: 30000 });
  const refresh = page.getByRole("button", { name: "Refresh", exact: true });
  if (!(await refresh.isVisible())) throw new Error("Closure list refresh button is not visible");
  checks.push({ name: "closure list renders data and refresh control", passed: true });

  await page.goto(`${base}/reports/closures/55`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("alert").getByText("Injected closure detail failure", { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByRole("heading", { name: "Register closure #55", exact: true }).waitFor({ timeout: 30000 });
  checks.push({ name: "closure detail 503 -> Retry -> recovered", passed: detailRequests === 2 });
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: "5871dbc",
  deployment: "unverified-after-deploy",
  scope: "mocked authenticated read-only closure checks; no business writes",
  status: checks.every((check) => check.passed) ? "PASS" : "FAIL",
  checks,
  writes: 0,
};
const outputPath = path.join(root, "docs", "UAT_CLOSURE_RECOVERY_2026-10-18.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...output }));
if (output.status !== "PASS") process.exitCode = 1;
