import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
const password = env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://demo.orithos.com.au";
const cases = [
  { path: "/orders/manual", endpoint: "/api/suppliers", label: "Manual order supplier" },
  { path: "/orders/receive/new", endpoint: "/api/suppliers", label: "Receive stock supplier" },
  { path: "/orders/return/new", endpoint: "/api/suppliers", label: "Return stock supplier" },
  { path: "/orders/credit/new", endpoint: "/api/suppliers", label: "Credit note supplier" },
  { path: "/orders/transfer/new", endpoint: "/api/outlets", label: "Stock transfer outlet" },
  { path: "/products/new", endpoint: "/api/classifications/category", label: "Create product category" },
  { path: "/customers/new", endpoint: "/api/customers/groups", label: "Create customer group" },
];

const browser = await chromium.launch({ headless: true });
const results = [];
for (const testCase of cases) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const writes = [];
  const requests = [];
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  const page = await context.newPage();
  let injected = false;
  let requestCount = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET") writes.push(`${request.method()} ${url.pathname}`);
    if (request.method() === "GET" && url.pathname === testCase.endpoint) {
      requestCount += 1;
      if (!injected) {
        injected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 50301, message: "Injected transient read failure" }),
        });
        return;
      }
    }
    await route.continue();
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) requests.push(`${request.method()} ${url.pathname}`);
  });

  try {
    await page.goto(`${base}${testCase.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const retry = page.getByRole("button", { name: "Retry", exact: true });
    await retry.waitFor({ state: "visible", timeout: 30000 });
    const retryVisible = await retry.isVisible();
    await retry.click();
    await page.waitForFunction((endpoint) => {
      return performance.getEntriesByType("resource").filter((entry) => new URL(entry.name).pathname === endpoint).length >= 2;
    }, testCase.endpoint, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(900);
    const retryGone = !(await retry.isVisible().catch(() => false));
    results.push({
      path: testCase.path,
      endpoint: testCase.endpoint,
      label: testCase.label,
      retryVisible,
      recovered: requestCount >= 2 && retryGone,
      requestCount,
      writes,
      requests,
      passed: retryVisible && requestCount >= 2 && retryGone && writes.length === 0,
    });
  } catch (error) {
    results.push({
      path: testCase.path,
      endpoint: testCase.endpoint,
      label: testCase.label,
      retryVisible: false,
      recovered: false,
      requestCount,
      writes,
      requests,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await page.close();
    await context.close();
  }
}
await browser.close();

const outputPath = path.join(root, "docs", "UAT_CREATE_FORM_RETRY_2026-10-18.json");
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: process.env.PILOT_SOURCE_COMMIT ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: process.env.PILOT_DEPLOYMENT_SHA ?? "unverified-after-deploy",
  target: base,
  scope: "read-only injected 503 recovery for create forms; no business writes",
  results,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  writes: results.flatMap((result) => result.writes),
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: output.passed, failed: output.failed, writes: output.writes.length }));
